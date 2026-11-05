import type {
  CurrencyCode,
  Expense,
  ExpenseParticipantShare,
  SettlementPayment,
} from "../types";

export type CurrencyAmount = {
  currency: CurrencyCode;
  amount: number;
};

export type PairwiseSettlement = {
  fromMemberId: string;
  toMemberId: string;
  currency: CurrencyCode;
  amount: number;
};

export type MemberLedgerSummary = {
  consumption: Record<CurrencyCode, number>;
  paidConsumption: Record<CurrencyCode, number>;
  receivable: Record<CurrencyCode, number>;
  payable: Record<CurrencyCode, number>;
  loaned: Record<CurrencyCode, number>;
  borrowed: Record<CurrencyCode, number>;
};

const CURRENCIES: CurrencyCode[] = ["KRW", "JPY", "USD", "EUR"];

function emptyCurrencyRecord(): Record<CurrencyCode, number> {
  return { KRW: 0, JPY: 0, USD: 0, EUR: 0 };
}

export function isPositiveIntegerAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function isActiveExpense(expense: Expense) {
  return expense.status !== "cancelled";
}

export function allocateEqualShares(
  totalAmount: number,
  participantMemberIds: string[]
): ExpenseParticipantShare[] {
  const participantIds = [...new Set(participantMemberIds.filter(Boolean))];

  if (!isPositiveIntegerAmount(totalAmount) || participantIds.length === 0) {
    throw new Error("INVALID_EQUAL_SPLIT");
  }

  const baseAmount = Math.floor(totalAmount / participantIds.length);
  const remainder = totalAmount % participantIds.length;

  return participantIds.map((memberId, index) => ({
    memberId,
    amount: baseAmount + (index < remainder ? 1 : 0),
  }));
}

export function validateCustomShares(
  totalAmount: number,
  participantMemberIds: string[],
  shares: ExpenseParticipantShare[]
) {
  if (!isPositiveIntegerAmount(totalAmount)) {
    return false;
  }

  const participants = [...new Set(participantMemberIds.filter(Boolean))];
  const shareIds = shares.map((share) => share.memberId);

  if (
    participants.length === 0 ||
    shareIds.length !== participants.length ||
    new Set(shareIds).size !== shareIds.length ||
    participants.some((memberId) => !shareIds.includes(memberId)) ||
    shares.some((share) => !isPositiveIntegerAmount(share.amount))
  ) {
    return false;
  }

  return shares.reduce((sum, share) => sum + share.amount, 0) === totalAmount;
}

export function getExpenseShares(expense: Expense): ExpenseParticipantShare[] {
  if (expense.expenseType !== "shared") {
    return [];
  }

  const participants = [...new Set(expense.participantMemberIds ?? [])];
  const customShares = expense.participantShares ?? [];

  if (validateCustomShares(expense.localAmount, participants, customShares)) {
    return customShares.map((share) => ({ ...share }));
  }

  if (!isPositiveIntegerAmount(expense.localAmount) || participants.length === 0) {
    return [];
  }

  return allocateEqualShares(expense.localAmount, participants);
}

export function getExpenseViewerMemberIds(expense: Expense) {
  if (expense.expenseType === "shared") {
    return [
      ...new Set(
        [expense.paidByMemberId, ...(expense.participantMemberIds ?? [])].filter(
          (memberId): memberId is string => Boolean(memberId)
        )
      ),
    ];
  }

  if (expense.expenseType === "loan") {
    return [
      ...new Set(
        [expense.lenderMemberId, expense.borrowerMemberId].filter(
          (memberId): memberId is string => Boolean(memberId)
        )
      ),
    ];
  }

  return expense.ownerMemberId ? [expense.ownerMemberId] : [];
}

export function canMemberViewExpense(expense: Expense, memberId: string | null) {
  if (!memberId) {
    return false;
  }

  const viewers = getExpenseViewerMemberIds(expense);

  // owner 정보가 없던 구형 개인 기록은 데이터 유실처럼 보이지 않도록 계속 표시한다.
  return viewers.length === 0 && expense.expenseType !== "shared" && expense.expenseType !== "loan"
    ? true
    : viewers.includes(memberId);
}

type PairBalance = {
  firstMemberId: string;
  secondMemberId: string;
  currency: CurrencyCode;
  // 양수: first -> second, 음수: second -> first
  amount: number;
};

function pairKey(firstMemberId: string, secondMemberId: string, currency: CurrencyCode) {
  return `${firstMemberId}\u0000${secondMemberId}\u0000${currency}`;
}

function addPairAmount(
  balances: Map<string, PairBalance>,
  fromMemberId: string,
  toMemberId: string,
  currency: CurrencyCode,
  amount: number
) {
  if (fromMemberId === toMemberId || !isPositiveIntegerAmount(amount)) {
    return;
  }

  const [firstMemberId, secondMemberId] = [fromMemberId, toMemberId].sort();
  const key = pairKey(firstMemberId, secondMemberId, currency);
  const balance = balances.get(key) ?? {
    firstMemberId,
    secondMemberId,
    currency,
    amount: 0,
  };

  balance.amount += fromMemberId === firstMemberId ? amount : -amount;
  balances.set(key, balance);
}

function getPaymentAmount(payment: SettlementPayment) {
  const currency = payment.currency ?? "KRW";
  const amount = payment.localAmount ?? payment.amountKrw;
  return { currency, amount };
}

export function calculatePairwiseSettlements(
  expenses: Expense[],
  payments: SettlementPayment[] = []
): PairwiseSettlement[] {
  const balances = new Map<string, PairBalance>();
  const legacyResolvedIds = new Set(
    payments
      .filter((payment) => payment.status !== "cancelled" && !payment.currency)
      .flatMap((payment) => payment.resolvedRelations ?? [])
      .map((relation) => relation.id)
  );

  expenses.filter(isActiveExpense).forEach((expense) => {
    if (expense.expenseType === "shared" && expense.paidByMemberId) {
      getExpenseShares(expense).forEach((share) => {
        const relationId = `shared:${expense.id}:${share.memberId}:${expense.paidByMemberId}`;
        if (!legacyResolvedIds.has(relationId)) {
          addPairAmount(
            balances,
            share.memberId,
            expense.paidByMemberId as string,
            expense.currency,
            share.amount
          );
        }
      });
    }

    if (
      expense.expenseType === "loan" &&
      !expense.loanSettled &&
      expense.borrowerMemberId &&
      expense.lenderMemberId
    ) {
      const relationId = `loan:${expense.id}:${expense.borrowerMemberId}:${expense.lenderMemberId}`;
      if (!legacyResolvedIds.has(relationId)) {
        addPairAmount(
          balances,
          expense.borrowerMemberId,
          expense.lenderMemberId,
          expense.currency,
          expense.localAmount
        );
      }
    }
  });

  payments
    .filter((payment) => payment.status !== "cancelled")
    .forEach((payment) => {
      if (!payment.fromMemberId || !payment.toMemberId || !payment.currency) {
        return;
      }

      const { currency, amount } = getPaymentAmount(payment);
      if (isPositiveIntegerAmount(amount)) {
        addPairAmount(
          balances,
          payment.toMemberId,
          payment.fromMemberId,
          currency,
          amount
        );
      }
    });

  return [...balances.values()]
    .filter((balance) => balance.amount !== 0)
    .map((balance) =>
      balance.amount > 0
        ? {
            fromMemberId: balance.firstMemberId,
            toMemberId: balance.secondMemberId,
            currency: balance.currency,
            amount: balance.amount,
          }
        : {
            fromMemberId: balance.secondMemberId,
            toMemberId: balance.firstMemberId,
            currency: balance.currency,
            amount: -balance.amount,
          }
    )
    .sort((a, b) =>
      `${a.currency}:${a.fromMemberId}:${a.toMemberId}`.localeCompare(
        `${b.currency}:${b.fromMemberId}:${b.toMemberId}`
      )
    );
}

export function getMemberLedgerSummary(
  expenses: Expense[],
  payments: SettlementPayment[],
  memberId: string
): MemberLedgerSummary {
  const summary: MemberLedgerSummary = {
    consumption: emptyCurrencyRecord(),
    paidConsumption: emptyCurrencyRecord(),
    receivable: emptyCurrencyRecord(),
    payable: emptyCurrencyRecord(),
    loaned: emptyCurrencyRecord(),
    borrowed: emptyCurrencyRecord(),
  };

  expenses.filter(isActiveExpense).forEach((expense) => {
    if (expense.expenseType === "shared") {
      const ownShare = getExpenseShares(expense).find(
        (share) => share.memberId === memberId
      );
      summary.consumption[expense.currency] += ownShare?.amount ?? 0;
      if (expense.paidByMemberId === memberId) {
        summary.paidConsumption[expense.currency] += expense.localAmount;
      }
    } else if (expense.expenseType === "loan") {
      if (expense.lenderMemberId === memberId) {
        summary.loaned[expense.currency] += expense.localAmount;
      }
      if (expense.borrowerMemberId === memberId) {
        summary.borrowed[expense.currency] += expense.localAmount;
      }
    } else if (expense.ownerMemberId === memberId || !expense.ownerMemberId) {
      summary.consumption[expense.currency] += expense.localAmount;
      summary.paidConsumption[expense.currency] += expense.localAmount;
    }
  });

  calculatePairwiseSettlements(expenses, payments).forEach((settlement) => {
    if (settlement.fromMemberId === memberId) {
      summary.payable[settlement.currency] += settlement.amount;
    }
    if (settlement.toMemberId === memberId) {
      summary.receivable[settlement.currency] += settlement.amount;
    }
  });

  return summary;
}

export function appendExpenseIdempotently(expenses: Expense[], expense: Expense) {
  if (
    expenses.some(
      (item) =>
        item.id === expense.id ||
        (expense.idempotencyKey && item.idempotencyKey === expense.idempotencyKey)
    )
  ) {
    return expenses;
  }

  return [...expenses, expense];
}

export function supportedLedgerCurrencies() {
  return [...CURRENCIES];
}
