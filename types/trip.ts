export interface TripMember {
  id: string;
  name: string;
}

export interface Trip {
  tripName: string;
  country: string;
  city: string;
  startDate: string;
  endDate: string;
  people: string;

  members?: TripMember[];
}

export type ScheduleCategory =
  | "관광"
  | "식사"
  | "카페"
  | "쇼핑"
  | "숙소"
  | "이동"
  | "기타";

export interface Schedule {
  id: string;
  title: string;
  location: string;
  date: string;
  time: string;

  category?: ScheduleCategory;
  durationMinutes?: number;
  memo?: string;

  latitude?: number;
  longitude?: number;
  placeId?: string;
}

export type ExpenseCategory =
  | "식비"
  | "교통"
  | "쇼핑"
  | "관광"
  | "숙소"
  | "기타";

export type CurrencyCode =
  | "KRW"
  | "JPY"
  | "USD"
  | "EUR";

export type ExpenseType =
  | "personal"
  | "shared"
  | "loan";

export interface Expense {
  id: string;

  localAmount: number;
  currency: CurrencyCode;

  exchangeRate: number;
  krwAmount: number;

  category: ExpenseCategory;
  date: string;
  memo?: string;

  expenseType?: ExpenseType;

  // 공동 지출
  payer?: string;
  participants?: string[];

  // 돈 빌려주기
  lender?: string;
  borrower?: string;
}

export interface ExpenseSettings {
  budgetKrw: number;

  defaultCurrency: CurrencyCode;

  exchangeRates: {
    KRW: number;
    JPY: number;
    USD: number;
    EUR: number;
  };
}