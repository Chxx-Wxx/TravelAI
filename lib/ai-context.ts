import type {
  Expense,
  ExpenseSettings,
} from "../types";

export type AiBudgetSummary = {
  budgetKrw: number | null;
  totalSpentKrw: number;
  remainingBudgetKrw: number | null;
};

function toFiniteNumber(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const numberValue =
    typeof value === "string"
      ? Number(value.replace(/,/g, ""))
      : Number(value);

  return Number.isFinite(numberValue)
    ? numberValue
    : null;
}

function getExpenseKrwAmount(
  expense: Expense,
  settings: ExpenseSettings | null
) {
  const storedAmount = toFiniteNumber(
    expense.krwAmount
  );

  if (storedAmount !== null) {
    return Math.max(0, Math.round(storedAmount));
  }

  const localAmount = toFiniteNumber(
    expense.localAmount
  );

  if (localAmount === null) {
    return 0;
  }

  const storedRate = toFiniteNumber(
    expense.exchangeRate
  );
  const rate =
    storedRate !== null && storedRate > 0
      ? storedRate
      : expense.currency === "KRW"
        ? 1
        : settings?.exchangeRates?.[expense.currency] ?? 0;

  return Math.max(
    0,
    Math.round(localAmount * rate)
  );
}

export function buildAiBudgetSummary(
  expenses: Expense[],
  settings: ExpenseSettings | null
): AiBudgetSummary {
  const totalSpentKrw = expenses.reduce(
    (sum, expense) =>
      expense.expenseType === "loan"
        ? sum
        : sum + getExpenseKrwAmount(expense, settings),
    0
  );
  const storedBudget = toFiniteNumber(
    settings?.budgetKrw
  );
  const budgetKrw =
    storedBudget !== null && storedBudget >= 0
      ? Math.round(storedBudget)
      : null;

  return {
    budgetKrw,
    totalSpentKrw,
    remainingBudgetKrw:
      budgetKrw === null
        ? null
        : budgetKrw - totalSpentKrw,
  };
}
