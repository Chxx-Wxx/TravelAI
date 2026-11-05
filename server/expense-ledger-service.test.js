const test = require("node:test");
const assert = require("node:assert/strict");

const ledgerModule = import("../lib/expense-ledger.ts");

function expense(overrides = {}) {
  return {
    id: overrides.id ?? `e-${Math.random()}`,
    localAmount: 12000,
    currency: "JPY",
    exchangeRate: 9,
    krwAmount: 108000,
    category: "식비",
    date: "2026-11-05",
    expenseType: "shared",
    paidByMemberId: "A",
    participantMemberIds: ["A", "B", "C", "D"],
    ...overrides,
  };
}

test("4명이 12,000엔을 정확히 균등 분할한다", async () => {
  const { getExpenseShares, calculatePairwiseSettlements } = await ledgerModule;
  const item = expense();
  assert.deepEqual(getExpenseShares(item).map((share) => share.amount), [3000, 3000, 3000, 3000]);
  assert.deepEqual(calculatePairwiseSettlements([item]), [
    { fromMemberId: "B", toMemberId: "A", currency: "JPY", amount: 3000 },
    { fromMemberId: "C", toMemberId: "A", currency: "JPY", amount: 3000 },
    { fromMemberId: "D", toMemberId: "A", currency: "JPY", amount: 3000 },
  ]);
});

test("3명만 참가하면 제외된 멤버에게 채무가 생기지 않는다", async () => {
  const { calculatePairwiseSettlements } = await ledgerModule;
  const result = calculatePairwiseSettlements([
    expense({ localAmount: 3000, participantMemberIds: ["A", "B", "C"] }),
  ]);
  assert.deepEqual(result.map((item) => item.fromMemberId), ["B", "C"]);
  assert.ok(result.every((item) => item.amount === 1000));
});

test("결제자가 부담자이면 자기 몫에 채무를 만들지 않는다", async () => {
  const { calculatePairwiseSettlements } = await ledgerModule;
  const result = calculatePairwiseSettlements([
    expense({ localAmount: 9000, participantMemberIds: ["A", "B", "C"] }),
  ]);
  assert.equal(result.length, 2);
  assert.ok(result.every((item) => item.amount === 3000));
});

test("결제자가 부담자가 아니어도 선택 부담자만 정확히 나눈다", async () => {
  const { calculatePairwiseSettlements } = await ledgerModule;
  assert.deepEqual(
    calculatePairwiseSettlements([
      expense({ localAmount: 8000, participantMemberIds: ["B", "C"] }),
    ]),
    [
      { fromMemberId: "B", toMemberId: "A", currency: "JPY", amount: 4000 },
      { fromMemberId: "C", toMemberId: "A", currency: "JPY", amount: 4000 },
    ]
  );
});

test("개인 지출은 정산 대상이 아니고 소유자만 볼 수 있다", async () => {
  const { calculatePairwiseSettlements, canMemberViewExpense } = await ledgerModule;
  const item = expense({ expenseType: "personal", ownerMemberId: "C", paidByMemberId: undefined, participantMemberIds: undefined, localAmount: 5000 });
  assert.deepEqual(calculatePairwiseSettlements([item]), []);
  assert.equal(canMemberViewExpense(item, "C"), true);
  assert.equal(canMemberViewExpense(item, "A"), false);
});

test("대여는 차용자에서 대여자 방향 채무 한 건이다", async () => {
  const { calculatePairwiseSettlements } = await ledgerModule;
  assert.deepEqual(
    calculatePairwiseSettlements([
      expense({ expenseType: "loan", lenderMemberId: "A", borrowerMemberId: "B", paidByMemberId: undefined, participantMemberIds: undefined, localAmount: 3000 }),
    ]),
    [{ fromMemberId: "B", toMemberId: "A", currency: "JPY", amount: 3000 }]
  );
});

test("일부 상환과 전액 상환을 거래 통화로 반영한다", async () => {
  const { calculatePairwiseSettlements } = await ledgerModule;
  const loan = expense({ id: "loan", expenseType: "loan", lenderMemberId: "A", borrowerMemberId: "B", paidByMemberId: undefined, participantMemberIds: undefined, localAmount: 3000 });
  const partial = { id: "p1", source: "loan", fromMemberId: "B", toMemberId: "A", currency: "JPY", localAmount: 1000, amountKrw: 9000, relatedExpenseId: "loan", date: "2026-11-05" };
  assert.equal(calculatePairwiseSettlements([loan], [partial])[0].amount, 2000);
  assert.deepEqual(calculatePairwiseSettlements([loan], [{ ...partial, localAmount: 3000 }]), []);
});

test("양방향 대여는 같은 당사자 쌍 안에서만 상계한다", async () => {
  const { calculatePairwiseSettlements } = await ledgerModule;
  const result = calculatePairwiseSettlements([
    expense({ expenseType: "loan", lenderMemberId: "A", borrowerMemberId: "B", paidByMemberId: undefined, participantMemberIds: undefined, localAmount: 3000 }),
    expense({ expenseType: "loan", lenderMemberId: "B", borrowerMemberId: "A", paidByMemberId: undefined, participantMemberIds: undefined, localAmount: 1000 }),
  ]);
  assert.deepEqual(result, [{ fromMemberId: "B", toMemberId: "A", currency: "JPY", amount: 2000 }]);
});

test("제3자 경유 최적화를 하지 않는다", async () => {
  const { calculatePairwiseSettlements } = await ledgerModule;
  const result = calculatePairwiseSettlements([
    expense({ localAmount: 2000, participantMemberIds: ["A", "B"] }),
    expense({ paidByMemberId: "B", localAmount: 2000, participantMemberIds: ["B", "C"] }),
  ]);
  assert.deepEqual(result, [
    { fromMemberId: "B", toMemberId: "A", currency: "JPY", amount: 1000 },
    { fromMemberId: "C", toMemberId: "B", currency: "JPY", amount: 1000 },
  ]);
});

test("나누어떨어지지 않는 1엔은 선택 순서대로 결정적으로 배분한다", async () => {
  const { allocateEqualShares } = await ledgerModule;
  assert.deepEqual(allocateEqualShares(10000, ["A", "B", "C"]).map((share) => share.amount), [3334, 3333, 3333]);
});

test("직접 금액 지정 합계와 멤버 구성을 검증한다", async () => {
  const { validateCustomShares } = await ledgerModule;
  assert.equal(validateCustomShares(10000, ["A", "B", "C"], [
    { memberId: "A", amount: 5000 }, { memberId: "B", amount: 3000 }, { memberId: "C", amount: 2000 },
  ]), true);
  assert.equal(validateCustomShares(10000, ["A", "B", "C"], [
    { memberId: "A", amount: 5000 }, { memberId: "B", amount: 3000 }, { memberId: "C", amount: 1000 },
  ]), false);
});

test("KRW와 JPY는 환율 없이 서로 상계하지 않는다", async () => {
  const { calculatePairwiseSettlements } = await ledgerModule;
  const result = calculatePairwiseSettlements([
    expense({ currency: "JPY", localAmount: 2000, participantMemberIds: ["A", "B"] }),
    expense({ currency: "KRW", localAmount: 20000, participantMemberIds: ["A", "B"] }),
  ]);
  assert.deepEqual(result.map(({ currency, amount }) => ({ currency, amount })), [
    { currency: "JPY", amount: 1000 }, { currency: "KRW", amount: 10000 },
  ]);
});

test("수정된 거래 배열만으로 정산을 다시 계산한다", async () => {
  const { calculatePairwiseSettlements } = await ledgerModule;
  const original = expense({ id: "same", localAmount: 3000, participantMemberIds: ["A", "B", "C"] });
  const updated = { ...original, localAmount: 6000 };
  assert.equal(calculatePairwiseSettlements([original])[0].amount, 1000);
  assert.equal(calculatePairwiseSettlements([updated])[0].amount, 2000);
});

test("취소 거래는 계산하지 않고 복구하면 다시 계산한다", async () => {
  const { calculatePairwiseSettlements } = await ledgerModule;
  const cancelled = expense({ status: "cancelled" });
  assert.deepEqual(calculatePairwiseSettlements([cancelled]), []);
  assert.equal(calculatePairwiseSettlements([{ ...cancelled, status: "active" }]).length, 3);
});

test("열람자는 결제자와 부담자의 합집합이며 관련 없는 멤버는 제외한다", async () => {
  const { getExpenseViewerMemberIds, canMemberViewExpense } = await ledgerModule;
  const item = expense({ participantMemberIds: ["B", "C"] });
  assert.deepEqual(getExpenseViewerMemberIds(item), ["A", "B", "C"]);
  assert.equal(canMemberViewExpense(item, "D"), false);
});

test("닉네임이 바뀌어도 memberId 원장은 유지된다", async () => {
  const { calculatePairwiseSettlements } = await ledgerModule;
  const result = calculatePairwiseSettlements([expense()]);
  assert.equal(result[0].toMemberId, "A");
});

test("구형 개인 기록은 소유자 필드가 없어도 숨기지 않는다", async () => {
  const { canMemberViewExpense } = await ledgerModule;
  const legacy = expense({ expenseType: undefined, paidByMemberId: undefined, participantMemberIds: undefined, ownerMemberId: undefined });
  assert.equal(canMemberViewExpense(legacy, "D"), true);
});

test("동일 idempotencyKey 요청은 중복 저장하지 않는다", async () => {
  const { appendExpenseIdempotently } = await ledgerModule;
  const first = expense({ id: "one", idempotencyKey: "request-1" });
  const duplicate = expense({ id: "two", idempotencyKey: "request-1" });
  assert.equal(appendExpenseIdempotently([first], duplicate).length, 1);
});

test("0, 음수, 소수 최소단위와 잘못된 참가자를 거부한다", async () => {
  const { isPositiveIntegerAmount, validateCustomShares } = await ledgerModule;
  assert.equal(isPositiveIntegerAmount(0), false);
  assert.equal(isPositiveIntegerAmount(-1), false);
  assert.equal(isPositiveIntegerAmount(1.5), false);
  assert.equal(validateCustomShares(1000, ["A", "B"], [{ memberId: "A", amount: 1000 }]), false);
});

test("소비·결제·대여·채권채무 요약을 중복 합산하지 않는다", async () => {
  const { getMemberLedgerSummary } = await ledgerModule;
  const shared = expense({ localAmount: 4000, participantMemberIds: ["A", "B"] });
  const loan = expense({ expenseType: "loan", lenderMemberId: "A", borrowerMemberId: "B", paidByMemberId: undefined, participantMemberIds: undefined, localAmount: 3000 });
  const summary = getMemberLedgerSummary([shared, loan], [], "A");
  assert.equal(summary.consumption.JPY, 2000);
  assert.equal(summary.paidConsumption.JPY, 4000);
  assert.equal(summary.loaned.JPY, 3000);
  assert.equal(summary.receivable.JPY, 5000);
});

