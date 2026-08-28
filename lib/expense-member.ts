import type {
  Expense,
  ExpenseSettlementRelation,
  SettlementPayment,
  Trip,
} from "../types";

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
  if (
    expense.expenseType === "shared" &&
    expense.paidByMemberId &&
    expense.participantMemberIds?.length
  ) {
    const participants = [
      ...new Set(expense.participantMemberIds),
    ];
    const share =
      (expense.krwAmount ?? 0) / participants.length;

    return participants
      .filter(
        (memberId) =>
          memberId !== expense.paidByMemberId
      )
      .map((memberId) => ({
        id: `shared:${expense.id}:${memberId}:${expense.paidByMemberId}`,
        expenseId: expense.id,
        kind: "shared" as const,
        fromMemberId: memberId,
        toMemberId: expense.paidByMemberId as string,
        amountKrw: share,
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
      },
    ];
  }

  return [];
}

export function getResolvedSettlementRelationIds(
  payments: SettlementPayment[]
) {
  return new Set(
    payments.flatMap((payment) =>
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
  const resolvedRelations = relations.filter(
    (relation) => resolvedIds.has(relation.id)
  ).length;

  return {
    totalRelations: relations.length,
    resolvedRelations,
    status:
      resolvedRelations === 0
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
        settlementMemberIds.has(relation.toMemberId)
    );
  });
}

function memberKey(memberId: string) {
  return `${MEMBER_KEY_PREFIX}${memberId}`;
}

function legacyKey(name: string) {
  return `${LEGACY_KEY_PREFIX}${name}`;
}

function partyKey(
  memberId?: string,
  legacyName?: string
) {
  if (memberId) {
    return memberKey(memberId);
  }

  if (legacyName) {
    return legacyKey(legacyName);
  }

  return null;
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
  const balances: Record<string, number> = {};

  members.forEach((member) => {
    balances[memberKey(member.id)] = 0;
  });

  expenses.forEach((expense) => {
    if (expense.expenseType === "shared") {
      const payerKey = partyKey(
        expense.paidByMemberId,
        expense.payer
      );
      const participantKeys = expense.participantMemberIds
        ? [
            ...new Set(
              expense.participantMemberIds.map(memberKey)
            ),
          ]
        : [
            ...new Set(
              (expense.participants ?? []).map(legacyKey)
            ),
          ];

      if (payerKey && participantKeys.length > 0) {
        const share =
          (expense.krwAmount ?? 0) /
          participantKeys.length;

        addBalance(
          balances,
          payerKey,
          expense.krwAmount ?? 0
        );
        participantKeys.forEach((key) => {
          addBalance(balances, key, -share);
        });
      }
    }

    if (
      expense.expenseType === "loan" &&
      !expense.loanSettled
    ) {
      const lenderKey = partyKey(
        expense.lenderMemberId,
        expense.lender
      );
      const borrowerKey = partyKey(
        expense.borrowerMemberId,
        expense.borrower
      );

      if (lenderKey && borrowerKey) {
        addBalance(
          balances,
          lenderKey,
          expense.krwAmount ?? 0
        );
        addBalance(
          balances,
          borrowerKey,
          -(expense.krwAmount ?? 0)
        );
      }
    }
  });

  payments.forEach((payment) => {
    const fromKey = partyKey(
      payment.fromMemberId,
      payment.from
    );
    const toKey = partyKey(
      payment.toMemberId,
      payment.to
    );

    if (fromKey && toKey) {
      addBalance(balances, fromKey, payment.amountKrw);
      addBalance(balances, toKey, -payment.amountKrw);
    }
  });

  const creditors = Object.entries(balances)
    .filter(([, value]) => value > 1)
    .map(([key, value]) => ({ key, amount: value }));
  const debtors = Object.entries(balances)
    .filter(([, value]) => value < -1)
    .map(([key, value]) => ({ key, amount: -value }));
  const result: ExpenseSettlement[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (
    creditorIndex < creditors.length &&
    debtorIndex < debtors.length
  ) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = Math.min(
      creditor.amount,
      debtor.amount
    );

    if (amount > 1) {
      const from = partyFromKey(debtor.key, members);
      const to = partyFromKey(creditor.key, members);

      result.push({
        fromKey: debtor.key,
        toKey: creditor.key,
        fromMemberId: from.memberId,
        toMemberId: to.memberId,
        fromLegacyName: from.legacyName,
        toLegacyName: to.legacyName,
        fromLabel: from.label,
        toLabel: to.label,
        amount,
      });
    }

    creditor.amount -= amount;
    debtor.amount -= amount;

    if (creditor.amount < 1) {
      creditorIndex += 1;
    }

    if (debtor.amount < 1) {
      debtorIndex += 1;
    }
  }

  return result;
}
