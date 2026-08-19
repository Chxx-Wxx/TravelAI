export interface TripMember {
  id: string;
  name: string;
}

export interface Trip {
  id?: string;
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
  address?: string;
  date: string;
  time: string;
  tripId?: string;

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

export type PaymentMethod =
  | "cash"
  | "card";

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

  // 실제 어떤 수단으로 지불했는지
  paymentMethod?: PaymentMethod;

  // 공동 지출
  payer?: string;
  participants?: string[];

  // 돈 빌려주기
  lender?: string;
  borrower?: string;
  
  // 대여금 개별 정산 상태
  loanSettled?: boolean;
  loanSettledAt?: string;
}

export interface ExpenseSettings {
  // 여행 전체 예산
  budgetKrw: number;

  // 출발 시 보유 자금
  cashBudgetKrw: number;
  cardBudgetKrw: number;

  defaultCurrency: CurrencyCode;

  exchangeRates: {
    KRW: number;
    JPY: number;
    USD: number;
    EUR: number;
  };
}

// 실제로 사람끼리 돈을 주고받아서
// 정산이 끝났다는 기록
export interface SettlementPayment {
  id: string;

  from: string;
  to: string;

  amountKrw: number;

  date: string;

  memo?: string;
}