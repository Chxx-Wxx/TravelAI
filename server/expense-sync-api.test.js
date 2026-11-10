const test = require("node:test");
const assert = require("node:assert/strict");

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "";

const { app } = require("./server");

async function jsonRequest(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = await response.json();
  return { response, data };
}

async function register(baseUrl, displayName) {
  const result = await jsonRequest(baseUrl, "/auth/device-sessions", {
    method: "POST",
    body: JSON.stringify({ displayName }),
  });
  assert.equal(result.response.status, 201);
  assert.ok(result.data.accessToken);
  return result.data;
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

function expenseInput(overrides = {}) {
  return {
    id: `expense-${crypto.randomUUID()}`,
    idempotencyKey: `request:${crypto.randomUUID()}`,
    expenseType: "shared",
    localAmount: 3000,
    currency: "JPY",
    exchangeRate: 9,
    category: "교통",
    date: "2026-11-10",
    memo: "택시",
    paymentMethod: "card",
    splitMethod: "equal",
    ...overrides,
  };
}

test("보호된 지출 원장은 멤버 권한, 가시성, 중복과 버전 충돌을 검증한다", async (t) => {
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const [a, b, c, d, outsider] = await Promise.all([
    register(baseUrl, "A"),
    register(baseUrl, "B"),
    register(baseUrl, "C"),
    register(baseUrl, "D"),
    register(baseUrl, "외부인"),
  ]);

  const createTrip = await jsonRequest(baseUrl, "/trips", {
    method: "POST",
    body: JSON.stringify({
      tripName: "4인 테스트 여행",
      country: "일본",
      city: "도쿄",
      startDate: "2026-11-10",
      endDate: "2026-11-13",
      people: "4",
      ownerUserId: a.user.id,
      members: [{ name: "A" }, { name: "B" }, { name: "C" }, { name: "D" }],
    }),
  });
  assert.equal(createTrip.response.status, 201);
  const trip = createTrip.data.trip;
  const [memberA, memberB, memberC, memberD] = trip.tripMembers;

  for (const [session, member] of [[b, memberB], [c, memberC], [d, memberD]]) {
    const claim = await jsonRequest(
      baseUrl,
      `/trips/${trip.id}/members/${member.id}/claim`,
      {
        method: "POST",
        body: JSON.stringify({ userId: session.user.id }),
      }
    );
    assert.equal(claim.response.status, 200);
  }

  const legacyClaimIsNotEnough = await jsonRequest(
    baseUrl,
    `/trips/${trip.id}/expense-ledger`,
    { headers: auth(b.accessToken) }
  );
  assert.equal(legacyClaimIsNotEnough.response.status, 403);

  for (const [session, member] of [
    [a, memberA],
    [b, memberB],
    [c, memberC],
    [d, memberD],
  ]) {
    app.locals.expenseSyncTestState.grantAccess(
      trip.id,
      member.id,
      session.user.id
    );
  }

  const unauthenticated = await jsonRequest(
    baseUrl,
    `/trips/${trip.id}/expense-ledger`
  );
  assert.equal(unauthenticated.response.status, 401);

  const unrelatedUser = await jsonRequest(
    baseUrl,
    `/trips/${trip.id}/expense-ledger`,
    { headers: auth(outsider.accessToken) }
  );
  assert.equal(unrelatedUser.response.status, 403);

  const input = expenseInput({
    paidByMemberId: memberA.id,
    participantMemberIds: [memberA.id, memberB.id, memberC.id],
  });
  const created = await jsonRequest(
    baseUrl,
    `/trips/${trip.id}/expense-ledger/transactions`,
    {
      method: "POST",
      headers: auth(a.accessToken),
      body: JSON.stringify(input),
    }
  );
  assert.equal(created.response.status, 201);
  assert.deepEqual(
    created.data.expense.participantShares.map((share) => share.amount),
    [1000, 1000, 1000]
  );
  assert.equal(created.data.expense.krwAmount, 27000);
  assert.equal(created.data.expense.version, 1);

  const duplicate = await jsonRequest(
    baseUrl,
    `/trips/${trip.id}/expense-ledger/transactions`,
    {
      method: "POST",
      headers: auth(a.accessToken),
      body: JSON.stringify(input),
    }
  );
  assert.equal(duplicate.response.status, 200);
  assert.equal(duplicate.data.duplicated, true);

  const visibleToB = await jsonRequest(
    baseUrl,
    `/trips/${trip.id}/expense-ledger`,
    { headers: auth(b.accessToken) }
  );
  assert.equal(visibleToB.data.expenses.length, 1);

  const hiddenFromD = await jsonRequest(
    baseUrl,
    `/trips/${trip.id}/expense-ledger`,
    { headers: auth(d.accessToken) }
  );
  assert.equal(hiddenFromD.data.expenses.length, 0);

  const updatedInput = {
    ...created.data.expense,
    localAmount: 4000,
    idempotencyKey: input.idempotencyKey,
  };
  const updated = await jsonRequest(
    baseUrl,
    `/trips/${trip.id}/expense-ledger/transactions/${input.id}`,
    {
      method: "PUT",
      headers: auth(b.accessToken),
      body: JSON.stringify({ version: 1, expense: updatedInput }),
    }
  );
  assert.equal(updated.response.status, 200);
  assert.equal(updated.data.expense.version, 2);
  assert.deepEqual(
    updated.data.expense.participantShares.map((share) => share.amount),
    [1334, 1333, 1333]
  );

  const staleUpdate = await jsonRequest(
    baseUrl,
    `/trips/${trip.id}/expense-ledger/transactions/${input.id}`,
    {
      method: "PUT",
      headers: auth(a.accessToken),
      body: JSON.stringify({ version: 1, expense: updatedInput }),
    }
  );
  assert.equal(staleUpdate.response.status, 409);
  assert.equal(staleUpdate.data.code, "EXPENSE_VERSION_CONFLICT");

  const cancelled = await jsonRequest(
    baseUrl,
    `/trips/${trip.id}/expense-ledger/transactions/${input.id}/cancel`,
    {
      method: "POST",
      headers: auth(c.accessToken),
      body: JSON.stringify({ version: 2 }),
    }
  );
  assert.equal(cancelled.response.status, 200);
  assert.equal(cancelled.data.expense.status, "cancelled");

  const restored = await jsonRequest(
    baseUrl,
    `/trips/${trip.id}/expense-ledger/transactions/${input.id}/restore`,
    {
      method: "POST",
      headers: auth(a.accessToken),
      body: JSON.stringify({ version: 3 }),
    }
  );
  assert.equal(restored.response.status, 200);
  assert.equal(restored.data.expense.status, "active");
});

test("대여·부분상환과 가져오기 미리보기는 원본을 자동 변경하지 않는다", async (t) => {
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const owner = await register(baseUrl, "대여자");
  const borrower = await register(baseUrl, "차용자");
  const createTrip = await jsonRequest(baseUrl, "/trips", {
    method: "POST",
    body: JSON.stringify({
      tripName: "대여 테스트",
      country: "일본",
      city: "도쿄",
      startDate: "2026-11-10",
      endDate: "2026-11-11",
      people: "2",
      ownerUserId: owner.user.id,
      members: [{ name: "대여자" }, { name: "차용자" }],
    }),
  });
  const trip = createTrip.data.trip;
  const [lenderMember, borrowerMember] = trip.tripMembers;
  await jsonRequest(baseUrl, `/trips/${trip.id}/members/${borrowerMember.id}/claim`, {
    method: "POST",
    body: JSON.stringify({ userId: borrower.user.id }),
  });
  app.locals.expenseSyncTestState.grantAccess(
    trip.id,
    lenderMember.id,
    owner.user.id
  );
  app.locals.expenseSyncTestState.grantAccess(
    trip.id,
    borrowerMember.id,
    borrower.user.id
  );

  const loan = expenseInput({
    expenseType: "loan",
    localAmount: 2000,
    lenderMemberId: lenderMember.id,
    borrowerMemberId: borrowerMember.id,
  });
  const createdLoan = await jsonRequest(baseUrl, `/trips/${trip.id}/expense-ledger/transactions`, {
    method: "POST",
    headers: auth(owner.accessToken),
    body: JSON.stringify(loan),
  });
  assert.equal(createdLoan.response.status, 201);

  const payment = {
    id: `payment-${crypto.randomUUID()}`,
    idempotencyKey: `payment:${crypto.randomUUID()}`,
    source: "loan",
    fromMemberId: borrowerMember.id,
    toMemberId: lenderMember.id,
    currency: "JPY",
    localAmount: 500,
    amountKrw: 4500,
    relatedExpenseId: loan.id,
    date: "2026-11-10",
    memo: "부분 상환",
  };
  const createdPayment = await jsonRequest(baseUrl, `/trips/${trip.id}/expense-ledger/payments`, {
    method: "POST",
    headers: auth(borrower.accessToken),
    body: JSON.stringify(payment),
  });
  assert.equal(createdPayment.response.status, 201);

  const cancelledPayment = await jsonRequest(
    baseUrl,
    `/trips/${trip.id}/expense-ledger/payments/${payment.id}/cancel`,
    {
      method: "POST",
      headers: auth(owner.accessToken),
      body: JSON.stringify({ version: 1 }),
    }
  );
  assert.equal(cancelledPayment.response.status, 200);
  assert.equal(cancelledPayment.data.payment.status, "cancelled");

  const restoredPayment = await jsonRequest(
    baseUrl,
    `/trips/${trip.id}/expense-ledger/payments/${payment.id}/restore`,
    {
      method: "POST",
      headers: auth(borrower.accessToken),
      body: JSON.stringify({ version: 2 }),
    }
  );
  assert.equal(restoredPayment.response.status, 200);
  assert.equal(restoredPayment.data.payment.status, "active");

  const previewExpense = expenseInput({
    expenseType: "personal",
    ownerMemberId: lenderMember.id,
    localAmount: 1000,
  });
  const beforePreview = await jsonRequest(baseUrl, `/trips/${trip.id}/expense-ledger`, {
    headers: auth(owner.accessToken),
  });
  const preview = await jsonRequest(baseUrl, `/trips/${trip.id}/expense-ledger/import-preview`, {
    method: "POST",
    headers: auth(owner.accessToken),
    body: JSON.stringify({ expenses: [previewExpense], payments: [] }),
  });
  assert.equal(preview.response.status, 200);
  assert.equal(preview.data.requiresExplicitConfirmation, true);
  assert.equal(preview.data.newItems.expenses, 1);

  const afterPreview = await jsonRequest(baseUrl, `/trips/${trip.id}/expense-ledger`, {
    headers: auth(owner.accessToken),
  });
  assert.equal(afterPreview.data.expenses.length, beforePreview.data.expenses.length);
  assert.equal(afterPreview.data.revision, beforePreview.data.revision);
});
