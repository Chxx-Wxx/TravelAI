import type {
  CurrencyCode,
  Expense,
  ExpenseSettlementRelation,
  SettlementPayment,
  Trip,
} from "../types";
import {
  calculatePairwiseSettlements,
  getExpenseShares,
  isActiveExpense,
} from "./expense-ledger";

export type ExpenseMemberOption = {
  id: string;
  displayName: string;
  label: string;
  userId: string | null;
};

export type ExpenseSettlement = {
  fromKey: string;
  toKey: string;
  fromMemberId?: string;
  toMemberId?: string;
  fromLegacyName?: string;
  toLegacyName?: string;
  fromLabel: string;
  toLabel: string;
  amount: number;
  currency: CurrencyCode;
};

export type ExpenseSettlementStatus = {
  totalRelations: number;
  resolvedRelations: number;
  status: "unsettled" | "partial" | "settled";
};

const MEMBER_KEY_PREFIX = "member:";
const LEGACY_KEY_PREFIX = "legacy:";

export function getExpenseMemberOptions(
  trip: Trip | null,
  currentUserId?: string | null,
  includeRemoved = false
): ExpenseMemberOption[] {
  const members = (trip?.tripMembers ?? []).filter(
    (member) =>
      includeRemoved || member.status !== "removed"
  );
  const nameCounts = members.reduce<
    Record<string, number>
  >((counts, member) => {
    counts[member.displayName] =
      (counts[member.displayName] ?? 0) + 1;
    return counts;
  }, {});
  const nameIndexes: Record<string, number> = {};

  return members.map((member) => {
    nameIndexes[member.displayName] =
      (nameIndexes[member.displayName] ?? 0) + 1;

    const isCurrentUser = Boolean(
      currentUserId &&
        member.userId === currentUserId
    );
    const duplicateSuffix =
      nameCounts[member.displayName] > 1
        ? ` (${nameIndexes[member.displayName]})`
        : "";

    return {
      id: member.id,
      displayName: member.displayName,
      label: isCurrentUser
        ? "나"
        : `${member.displayName}${duplicateSuffix}`,
      userId: member.userId,
    };
  });
}

export function getExpensePartyLabel(
  memberId: string | undefined,
  legacyName: string | undefined,
  members: ExpenseMemberOption[]
) {
  if (memberId) {
    return (
      members.find((member) => member.id === memberId)
        ?.label ?? "알 수 없는 멤버"
    );
  }

  return legacyName ?? "알 수 없는 멤버";
}

export function getExpenseSettlementRelations(
  expense: Expense
): ExpenseSettlementRelation[] {
  if (!isActiveExpense(expense)) {
    return [];
  }

  if (
    expense.expenseType === "shared" &&
    expense.paidByMemberId &&
    expense.participantMemberIds?.length
  ) {
    return getExpenseShares(expense)
      .filter((share) => share.memberId !== expense.paidByMemberId)
      .map((share) => ({
        id: `shared:${expense.id}:${share.memberId}:${expense.paidByMemberId}`,
        expenseId: expense.id,
        kind: "shared" as const,
        fromMemberId: share.memberId,
        toMemberId: expense.paidByMemberId as string,
        amountKrw: Math.round(share.amount * (expense.exchangeRate ?? 1)),
        currency: expense.currency,
        localAmount: share.amount,
      }));
  }

  if (
    expense.expenseType === "loan" &&
    expense.lenderMemberId &&
    expense.borrowerMemberId &&
    expense.lenderMemberId !== expense.borrowerMemberId
  ) {
    return [
      {
        id: `loan:${expense.id}:${expense.borrowerMemberId}:${expense.lenderMemberId}`,
        expenseId: expense.id,
        kind: "loan",
        fromMemberId: expense.borrowerMemberId,
        toMemberId: expense.lenderMemberId,
        amountKrw: expense.krwAmount ?? 0,
        currency: expense.currency,
        localAmount: expense.localAmount,
      },
    ];
  }

  return [];
}

export function getResolvedSettlementRelationIds(
  payments: SettlementPayment[]
) {
  return new Set(
    payments.filter((payment) => payment.status !== "cancelled").flatMap((payment) =>
      (payment.resolvedRelations ?? []).map(
        (relation) => relation.id
      )
    )
  );
}

export function getExpenseSettlementStatus(
  expense: Expense,
  payments: SettlementPayment[]
): ExpenseSettlementStatus {
  const relations =
    getExpenseSettlementRelations(expense);

  if (relations.length === 0) {
    const isLegacyLoanSettled = Boolean(
      expense.expenseType === "loan" &&
        expense.loanSettled
    );

    return {
      totalRelations:
        expense.expenseType === "loan" ? 1 : 0,
      resolvedRelations:
        isLegacyLoanSettled ? 1 : 0,
      status: isLegacyLoanSettled
        ? "settled"
        : "unsettled",
    };
  }

  if (
    expense.expenseType === "loan" &&
    expense.loanSettled
  ) {
    return {
      totalRelations: relations.length,
      resolvedRelations: relations.length,
      status: "settled",
    };
  }

  const resolvedIds =
    getResolvedSettlementRelationIds(payments);
  const resolvedRelations = relations.filter((relation) => {
    if (resolvedIds.has(relation.id)) {
      return true;
    }

    if (expense.expenseType !== "loan") {
      return false;
    }

    const repaid = payments
      .filter(
        (payment) =>
          payment.status !== "cancelled" &&
          payment.relatedExpenseId === expense.id &&
          payment.currency === expense.currency
      )
      .reduce(
        (sum, payment) => sum + (payment.localAmount ?? 0),
        0
      );

    return repaid >= expense.localAmount;
  }).length;

  const hasPartialLoanRepayment =
    expense.expenseType === "loan" &&
    payments.some(
      (payment) =>
        payment.status !== "cancelled" &&
        payment.relatedExpenseId === expense.id &&
        payment.currency === expense.currency &&
        (payment.localAmount ?? 0) > 0
    );

  return {
    totalRelations: relations.length,
    resolvedRelations,
    status:
      resolvedRelations === 0 && !hasPartialLoanRepayment
        ? "unsettled"
        : resolvedRelations === relations.length
          ? "settled"
          : "partial",
  };
}

export function getRelationsResolvedBySettlement(
  expenses: Expense[],
  payments: SettlementPayment[],
  settlement: ExpenseSettlement
) {
  if (
    !settlement.fromMemberId ||
    !settlement.toMemberId
  ) {
    return [];
  }

  const resolvedIds =
    getResolvedSettlementRelationIds(payments);
  const settlementMemberIds = new Set([
    settlement.fromMemberId,
    settlement.toMemberId,
  ]);

  return expenses.flatMap((expense) => {
    if (
      expense.expenseType === "loan" &&
      expense.loanSettled
    ) {
      return [];
    }

    return getExpenseSettlementRelations(expense).filter(
      (relation) =>
        !resolvedIds.has(relation.id) &&
        settlementMemberIds.has(relation.fromMemberId) &&
        settlementMemberIds.has(relation.toMemberId) &&
        (relation.currency ?? "KRW") === settlement.currency
    );
  });
}

function memberKey(memberId: string) {
  return `${MEMBER_KEY_PREFIX}${memberId}`;
}

function legacyKey(name: string) {
  return `${LEGACY_KEY_PREFIX}${name}`;
}

function addBalance(
  balances: Record<string, number>,
  key: string,
  amount: number
) {
  balances[key] = (balances[key] ?? 0) + amount;
}

function partyFromKey(
  key: string,
  members: ExpenseMemberOption[]
) {
  if (key.startsWith(MEMBER_KEY_PREFIX)) {
    const memberId = key.slice(MEMBER_KEY_PREFIX.length);
    return {
      memberId,
      label: getExpensePartyLabel(
        memberId,
        undefined,
        members
      ),
    };
  }

  const legacyName = key.slice(LEGACY_KEY_PREFIX.length);
  return {
    legacyName,
    label: legacyName,
  };
}

export function calculateExpenseSettlements(
  expenses: Expense[],
  payments: SettlementPayment[],
  members: ExpenseMemberOption[]
): ExpenseSettlement[] {
  const memberSettlements = calculatePairwiseSettlements(expenses, payments).map(
    (settlement) => ({
      fromKey: memberKey(settlement.fromMemberId),
      toKey: memberKey(settlement.toMemberId),
      fromMemberId: settlement.fromMemberId,
      toMemberId: settlement.toMemberId,
      fromLabel: getExpensePartyLabel(settlement.fromMemberId, undefined, members),
      toLabel: getExpensePartyLabel(settlement.toMemberId, undefined, members),
      amount: settlement.amount,
      currency: settlement.currency,
    })
  );

  // 이름 기반 구형 데이터는 identity를 안전하게 추론할 수 없어 기존 KRW ledger로만 유지한다.
  const legacyBalances: Record<string, number> = {};
  expenses.filter(isActiveExpense).forEach((expense) => {
    if (expense.expenseType === "shared" && !expense.paidByMemberId && expense.payer) {
      const participants = [...new Set(expense.participants ?? [])];
      if (participants.length > 0) {
        addBalance(legacyBalances, legacyKey(expense.payer), expense.krwAmount ?? 0);
        participants.forEach((name) =>
          addBalance(legacyBalances, legacyKey(name), -(expense.krwAmount ?? 0) / participants.length)
        );
      }
    }

    if (
      expense.expenseType === "loan" &&
      !expense.lenderMemberId &&
      !expense.borrowerMemberId &&
      expense.lender &&
      expense.borrower &&
      !expense.loanSettled
    ) {
      addBalance(
        legacyBalances,
        legacyKey(expense.lender),
        expense.krwAmount ?? 0
      );
      addBalance(
        legacyBalances,
        legacyKey(expense.borrower),
        -(expense.krwAmount ?? 0)
      );
    }
  });

  payments
    .filter(
      (payment) =>
        payment.status !== "cancelled" &&
        !payment.fromMemberId &&
        !payment.toMemberId &&
        payment.from &&
        payment.to
    )
    .forEach((payment) => {
      addBalance(legacyBalances, legacyKey(payment.from as string), payment.amountKrw);
      addBalance(legacyBalances, legacyKey(payment.to as string), -payment.amountKrw);
    });

  const legacyCreditors = Object.entries(legacyBalances)
    .filter(([, value]) => value > 1)
    .map(([key, amount]) => ({ key, amount }));
  const legacyDebtors = Object.entries(legacyBalances)
    .filter(([, value]) => value < -1)
    .map(([key, amount]) => ({ key, amount: -amount }));
  const legacySettlements: ExpenseSettlement[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < legacyCreditors.length && debtorIndex < legacyDebtors.length) {
    const creditor = legacyCreditors[creditorIndex];
    const debtor = legacyDebtors[debtorIndex];
    const amount = Math.min(creditor.amount, debtor.amount);
    const from = partyFromKey(debtor.key, members);
    const to = partyFromKey(creditor.key, members);
    legacySettlements.push({
      fromKey: debtor.key,
      toKey: creditor.key,
      fromLegacyName: from.legacyName,
      toLegacyName: to.legacyName,
      fromLabel: from.label,
      toLabel: to.label,
      amount,
      currency: "KRW",
    });
    creditor.amount -= amount;
    debtor.amount -= amount;
    if (creditor.amount < 1) creditorIndex += 1;
    if (debtor.amount < 1) debtorIndex += 1;
  }

  return [...memberSettlements, ...legacySettlements];
}
