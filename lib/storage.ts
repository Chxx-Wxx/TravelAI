import AsyncStorage from "@react-native-async-storage/async-storage";

const TRIP_KEY = "@travelai_trip";
const SCHEDULE_KEY = "@travelai_schedule";
const EXPENSE_KEY = "@travelai_expenses";
const EXPENSE_SETTINGS_KEY = "@travelai_expense_settings";

// 여행
export async function saveTrip(trip: any) {
  await AsyncStorage.setItem(
    TRIP_KEY,
    JSON.stringify(trip)
  );
}

export async function getTrip() {
  const data =
    await AsyncStorage.getItem(TRIP_KEY);

  return data
    ? JSON.parse(data)
    : null;
}

export async function deleteTrip() {
  await AsyncStorage.removeItem(TRIP_KEY);
}

// 일정
export async function saveSchedules(
  schedules: any[]
) {
  await AsyncStorage.setItem(
    SCHEDULE_KEY,
    JSON.stringify(schedules)
  );
}

export async function getSchedules() {
  const data =
    await AsyncStorage.getItem(
      SCHEDULE_KEY
    );

  return data
    ? JSON.parse(data)
    : [];
}

export async function getSchedule(
  id: string
) {
  const schedules =
    await getSchedules();

  return (
    schedules.find(
      (schedule: any) =>
        schedule.id === id
    ) ?? null
  );
}

export async function updateSchedule(
  updatedSchedule: any
) {
  const schedules =
    await getSchedules();

  const updatedSchedules =
    schedules.map(
      (schedule: any) =>
        schedule.id ===
        updatedSchedule.id
          ? updatedSchedule
          : schedule
    );

  await saveSchedules(
    updatedSchedules
  );
}

export async function deleteSchedule(
  id: string
) {
  const schedules =
    await getSchedules();

  const remainingSchedules =
    schedules.filter(
      (schedule: any) =>
        schedule.id !== id
    );

  await saveSchedules(
    remainingSchedules
  );
}

// 지출
export async function saveExpenses(
  expenses: any[]
) {
  await AsyncStorage.setItem(
    EXPENSE_KEY,
    JSON.stringify(expenses)
  );
}

export async function getExpenses() {
  const data =
    await AsyncStorage.getItem(
      EXPENSE_KEY
    );

  return data
    ? JSON.parse(data)
    : [];
}

export async function deleteExpense(
  id: string
) {
  const expenses =
    await getExpenses();

  const remaining =
    expenses.filter(
      (expense: any) =>
        expense.id !== id
    );

  await saveExpenses(remaining);
}

// 지출 설정
export async function saveExpenseSettings(
  settings: any
) {
  await AsyncStorage.setItem(
    EXPENSE_SETTINGS_KEY,
    JSON.stringify(settings)
  );
}

export async function getExpenseSettings() {
  const data =
    await AsyncStorage.getItem(
      EXPENSE_SETTINGS_KEY
    );

  return data
    ? JSON.parse(data)
    : null;
}

export async function deleteExpenseSettings() {
  await AsyncStorage.removeItem(
    EXPENSE_SETTINGS_KEY
  );
}
const SETTLEMENT_PAYMENT_KEY =
  "@travelai_settlement_payments";

export async function saveSettlementPayments(
  payments: any[]
) {
  await AsyncStorage.setItem(
    SETTLEMENT_PAYMENT_KEY,
    JSON.stringify(payments)
  );
}

export async function getSettlementPayments() {
  const data =
    await AsyncStorage.getItem(
      SETTLEMENT_PAYMENT_KEY
    );

  return data
    ? JSON.parse(data)
    : [];
}

export async function deleteSettlementPayment(
  id: string
) {
  const payments =
    await getSettlementPayments();

  const remaining =
    payments.filter(
      (payment: any) =>
        payment.id !== id
    );

  await saveSettlementPayments(
    remaining
  );
}