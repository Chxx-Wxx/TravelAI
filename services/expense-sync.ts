import type {
  Expense,
  SettlementPayment,
} from "../types";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export type ExpenseLedgerSnapshot = {
  revision: number;
  unchanged: boolean;
  expenses: Expense[];
  payments: SettlementPayment[];
};

export class ExpenseSyncError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(
    message: string,
    options: {
      status: number;
      code?: string;
      details?: unknown;
    }
  ) {
    super(message);
    this.name = "ExpenseSyncError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

function requireApiUrl() {
  if (!API_URL) {
    throw new ExpenseSyncError(
      "EXPO_PUBLIC_API_URL이 설정되지 않았습니다.",
      { status: 0, code: "API_URL_MISSING" }
    );
  }

  return API_URL;
}

async function request<T>(
  path: string,
  accessToken: string,
  init?: RequestInit
): Promise<T> {
  if (!accessToken.trim()) {
    throw new ExpenseSyncError(
      "안전한 계정 연결이 완료되지 않았습니다.",
      { status: 401, code: "AUTH_REQUIRED" }
    );
  }

  const response = await fetch(
    `${requireApiUrl()}${path}`,
    {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...init?.headers,
      },
    }
  );
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ExpenseSyncError(
      data.message ?? "지출 원장 동기화에 실패했습니다.",
      {
        status: response.status,
        code: data.code,
        details: data.details,
      }
    );
  }

  return data as T;
}

export function fetchExpenseLedger(
  tripId: string,
  accessToken: string,
  sinceRevision?: number
) {
  const query = Number.isSafeInteger(sinceRevision)
    ? `?sinceRevision=${sinceRevision}`
    : "";

  return request<ExpenseLedgerSnapshot>(
    `/trips/${encodeURIComponent(tripId)}/expense-ledger${query}`,
    accessToken
  );
}

export function createServerExpense(
  tripId: string,
  accessToken: string,
  expense: Expense
) {
  return request<{
    expense: Expense;
    duplicated: boolean;
  }>(
    `/trips/${encodeURIComponent(tripId)}/expense-ledger/transactions`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(expense),
    }
  );
}

export function updateServerExpense(
  tripId: string,
  accessToken: string,
  expense: Expense
) {
  if (!expense.version) {
    throw new ExpenseSyncError(
      "수정할 서버 거래의 version이 없습니다.",
      { status: 0, code: "VERSION_REQUIRED" }
    );
  }

  return request<{ expense: Expense }>(
    `/trips/${encodeURIComponent(tripId)}/expense-ledger/transactions/${encodeURIComponent(expense.id)}`,
    accessToken,
    {
      method: "PUT",
      body: JSON.stringify({
        version: expense.version,
        expense,
      }),
    }
  );
}

export function changeServerExpenseStatus(
  tripId: string,
  accessToken: string,
  expense: Pick<Expense, "id" | "version">,
  action: "cancel" | "restore"
) {
  if (!expense.version) {
    throw new ExpenseSyncError(
      "변경할 서버 거래의 version이 없습니다.",
      { status: 0, code: "VERSION_REQUIRED" }
    );
  }

  return request<{ expense: Expense }>(
    `/trips/${encodeURIComponent(tripId)}/expense-ledger/transactions/${encodeURIComponent(expense.id)}/${action}`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ version: expense.version }),
    }
  );
}

export function createServerSettlementPayment(
  tripId: string,
  accessToken: string,
  payment: SettlementPayment
) {
  return request<{
    payment: SettlementPayment;
    duplicated: boolean;
  }>(
    `/trips/${encodeURIComponent(tripId)}/expense-ledger/payments`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(payment),
    }
  );
}

export function previewLocalExpenseImport(
  tripId: string,
  accessToken: string,
  input: {
    expenses: Expense[];
    payments: SettlementPayment[];
  }
) {
  return request<{
    previewId: string;
    local: { expenses: number; payments: number };
    newItems: { expenses: number; payments: number };
    existingItems: { expenses: number; payments: number };
    requiresExplicitConfirmation: true;
  }>(
    `/trips/${encodeURIComponent(tripId)}/expense-ledger/import-preview`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );
}
