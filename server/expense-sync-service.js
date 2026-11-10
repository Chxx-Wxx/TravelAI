const { createHash, randomBytes } = require("crypto");

const CURRENCIES = new Set(["KRW", "JPY", "USD", "EUR"]);
const EXPENSE_TYPES = new Set(["personal", "shared", "loan"]);
const PAYMENT_SOURCES = new Set(["final", "loan"]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

class ExpenseSyncError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = "ExpenseSyncError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function fail(statusCode, code, message, details) {
  throw new ExpenseSyncError(statusCode, code, message, details);
}

function normalizeText(value, maxLength, fallback = "") {
  const normalized = String(value ?? fallback).normalize("NFC").trim();
  return normalized.slice(0, maxLength);
}

function requireUuid(value, fieldName) {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (!UUID_PATTERN.test(normalized)) {
    fail(400, "EXPENSE_INVALID_MEMBER", `${fieldName} 멤버가 올바르지 않습니다.`);
  }

  return normalized;
}

function requirePositiveInteger(value, fieldName) {
  const amount = Number(value);

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    fail(400, "EXPENSE_INVALID_AMOUNT", `${fieldName}은(는) 1 이상의 정수여야 합니다.`);
  }

  return amount;
}

function normalizeCurrency(value) {
  const currency = String(value ?? "").toUpperCase();

  if (!CURRENCIES.has(currency)) {
    fail(400, "EXPENSE_INVALID_CURRENCY", "지원하지 않는 통화입니다.");
  }

  return currency;
}

function normalizeIdempotencyKey(value) {
  const key = String(value ?? "").trim();

  if (!IDEMPOTENCY_PATTERN.test(key)) {
    fail(
      400,
      "EXPENSE_INVALID_IDEMPOTENCY_KEY",
      "idempotencyKey는 8~128자의 안전한 문자로 보내야 합니다."
    );
  }

  return key;
}

function uniqueMemberIds(values, fieldName) {
  if (!Array.isArray(values)) {
    fail(400, "EXPENSE_INVALID_MEMBERS", `${fieldName} 목록이 필요합니다.`);
  }

  const memberIds = values.map((value) => requireUuid(value, fieldName));
  return [...new Set(memberIds)];
}

function allocateEqualShares(amount, memberIds) {
  if (memberIds.length === 0) {
    fail(400, "EXPENSE_EMPTY_PARTICIPANTS", "부담자를 한 명 이상 선택해야 합니다.");
  }

  const baseAmount = Math.floor(amount / memberIds.length);
  const remainder = amount % memberIds.length;

  return memberIds.map((memberId, index) => ({
    memberId,
    amount: baseAmount + (index < remainder ? 1 : 0),
  }));
}

function normalizeShares(input, amount, memberIds, splitMethod) {
  if (splitMethod === "equal") {
    return allocateEqualShares(amount, memberIds);
  }

  if (!Array.isArray(input) || input.length !== memberIds.length) {
    fail(400, "EXPENSE_INVALID_SHARES", "부담자별 금액이 모두 필요합니다.");
  }

  const allowed = new Set(memberIds);
  const seen = new Set();
  const shares = input.map((share) => {
    const memberId = requireUuid(share?.memberId, "부담 금액");
    const shareAmount = requirePositiveInteger(share?.amount, "부담 금액");

    if (!allowed.has(memberId) || seen.has(memberId)) {
      fail(400, "EXPENSE_INVALID_SHARES", "부담자별 금액의 멤버가 일치하지 않습니다.");
    }

    seen.add(memberId);
    return { memberId, amount: shareAmount };
  });

  if (shares.reduce((sum, share) => sum + share.amount, 0) !== amount) {
    fail(400, "EXPENSE_SHARE_TOTAL_MISMATCH", "부담 금액 합계가 거래 금액과 일치해야 합니다.");
  }

  return shares;
}

function normalizeExpense(input, actorMemberId, now = new Date().toISOString()) {
  const expenseType = String(input?.expenseType ?? "personal");

  if (!EXPENSE_TYPES.has(expenseType)) {
    fail(400, "EXPENSE_INVALID_TYPE", "지원하지 않는 지출 유형입니다.");
  }

  const id = normalizeText(input?.id, 128);
  const idempotencyKey = normalizeIdempotencyKey(input?.idempotencyKey);
  const localAmount = requirePositiveInteger(input?.localAmount, "거래 금액");
  const currency = normalizeCurrency(input?.currency);
  const date = normalizeText(input?.date, 10);

  if (!id || !DATE_PATTERN.test(date)) {
    fail(400, "EXPENSE_INVALID_INPUT", "거래 ID와 YYYY-MM-DD 날짜가 필요합니다.");
  }

  const exchangeRate = currency === "KRW" ? 1 : Number(input?.exchangeRate);

  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    fail(400, "EXPENSE_INVALID_RATE", "유효한 저장 시점 환율이 필요합니다.");
  }

  const base = {
    id,
    expenseType,
    localAmount,
    currency,
    exchangeRate,
    krwAmount: Math.round(localAmount * exchangeRate),
    category: normalizeText(input?.category, 40, "기타") || "기타",
    date,
    memo: normalizeText(input?.memo, 1000),
    paymentMethod:
      input?.paymentMethod === "card" ? "card" : "cash",
    status: input?.status === "cancelled" ? "cancelled" : "active",
    createdAt: normalizeText(input?.createdAt, 40, now) || now,
    updatedAt: now,
    createdByMemberId: requireUuid(actorMemberId, "생성자"),
    updatedByMemberId: actorMemberId,
    idempotencyKey,
    changeHistory: Array.isArray(input?.changeHistory)
      ? input.changeHistory.slice(-100)
      : [],
  };

  if (expenseType === "personal") {
    return {
      ...base,
      ownerMemberId: requireUuid(input?.ownerMemberId, "지출 소유자"),
    };
  }

  if (expenseType === "loan") {
    const lenderMemberId = requireUuid(input?.lenderMemberId, "빌려준 사람");
    const borrowerMemberId = requireUuid(input?.borrowerMemberId, "빌린 사람");

    if (lenderMemberId === borrowerMemberId) {
      fail(400, "EXPENSE_SAME_LOAN_PARTY", "빌려준 사람과 빌린 사람은 달라야 합니다.");
    }

    return { ...base, lenderMemberId, borrowerMemberId };
  }

  const paidByMemberId = requireUuid(input?.paidByMemberId, "결제자");
  const participantMemberIds = uniqueMemberIds(
    input?.participantMemberIds,
    "부담자"
  );

  if (participantMemberIds.length === 0) {
    fail(400, "EXPENSE_EMPTY_PARTICIPANTS", "부담자를 한 명 이상 선택해야 합니다.");
  }

  const splitMethod = input?.splitMethod === "custom" ? "custom" : "equal";
  const participantShares = normalizeShares(
    input?.participantShares,
    localAmount,
    participantMemberIds,
    splitMethod
  );

  return {
    ...base,
    paidByMemberId,
    participantMemberIds,
    splitMethod,
    participantShares,
  };
}

function normalizePayment(input, actorMemberId, now = new Date().toISOString()) {
  const source = String(input?.source ?? "final");

  if (!PAYMENT_SOURCES.has(source)) {
    fail(400, "EXPENSE_INVALID_PAYMENT_SOURCE", "지원하지 않는 정산 유형입니다.");
  }

  const id = normalizeText(input?.id, 128);
  const idempotencyKey = normalizeIdempotencyKey(input?.idempotencyKey);
  const fromMemberId = requireUuid(input?.fromMemberId, "보내는 사람");
  const toMemberId = requireUuid(input?.toMemberId, "받는 사람");

  if (!id || fromMemberId === toMemberId) {
    fail(400, "EXPENSE_INVALID_PAYMENT", "정산 ID와 서로 다른 당사자가 필요합니다.");
  }

  const currency = normalizeCurrency(input?.currency);
  const localAmount = requirePositiveInteger(input?.localAmount, "정산 금액");
  const date = normalizeText(input?.date, 10);

  if (!DATE_PATTERN.test(date)) {
    fail(400, "EXPENSE_INVALID_PAYMENT_DATE", "정산 날짜는 YYYY-MM-DD 형식이어야 합니다.");
  }

  return {
    id,
    source,
    fromMemberId,
    toMemberId,
    currency,
    localAmount,
    amountKrw: requirePositiveInteger(input?.amountKrw, "원화 환산 금액"),
    relatedExpenseId: normalizeText(input?.relatedExpenseId, 128) || undefined,
    status: input?.status === "cancelled" ? "cancelled" : "active",
    date,
    memo: normalizeText(input?.memo, 1000),
    resolvedRelations: Array.isArray(input?.resolvedRelations)
      ? input.resolvedRelations.slice(0, 500)
      : [],
    idempotencyKey,
    createdAt: normalizeText(input?.createdAt, 40, now) || now,
    updatedAt: now,
    createdByMemberId: requireUuid(actorMemberId, "생성자"),
    updatedByMemberId: actorMemberId,
  };
}

function expensePartyIds(expense) {
  if (expense.expenseType === "personal") {
    return [expense.ownerMemberId];
  }

  if (expense.expenseType === "loan") {
    return [expense.lenderMemberId, expense.borrowerMemberId];
  }

  return [expense.paidByMemberId, ...(expense.participantMemberIds ?? [])];
}

function canMemberViewExpense(expense, memberId) {
  return expensePartyIds(expense).includes(memberId);
}

function canMemberViewPayment(payment, memberId) {
  return payment.fromMemberId === memberId || payment.toMemberId === memberId;
}

function stableHash(value) {
  const sortValue = (item) => {
    if (Array.isArray(item)) {
      return item.map(sortValue);
    }

    if (item && typeof item === "object") {
      return Object.keys(item)
        .sort()
        .reduce((result, key) => {
          result[key] = sortValue(item[key]);
          return result;
        }, {});
    }

    return item;
  };

  return createHash("sha256")
    .update(JSON.stringify(sortValue(value)))
    .digest("hex");
}

function issueSessionToken() {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  };
}

function hashSessionToken(token) {
  return createHash("sha256").update(String(token ?? "")).digest("hex");
}

function readBearerToken(header) {
  const match = /^Bearer\s+([^\s]+)$/i.exec(String(header ?? ""));
  return match?.[1] ?? null;
}

module.exports = {
  ExpenseSyncError,
  canMemberViewExpense,
  canMemberViewPayment,
  expensePartyIds,
  hashSessionToken,
  issueSessionToken,
  normalizeExpense,
  normalizePayment,
  readBearerToken,
  stableHash,
};
