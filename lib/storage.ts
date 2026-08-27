import AsyncStorage from "@react-native-async-storage/async-storage";

const TRIP_KEY = "@travelai_trip";
const SCHEDULE_KEY = "@travelai_schedule";
const EXPENSE_KEY = "@travelai_expenses";
const EXPENSE_SETTINGS_KEY = "@travelai_expense_settings";
const PACKING_KEY = "@travelai_packing_items";
const CURRENT_MEMBER_IDS_KEY =
  "@travelai_current_member_ids";

async function getCurrentMemberIds(): Promise<Record<string, string>> {
  const data = await AsyncStorage.getItem(
    CURRENT_MEMBER_IDS_KEY
  );

  if (!data) {
    return {};
  }

  try {
    const parsed = JSON.parse(data);
    return parsed && typeof parsed === "object"
      ? parsed
      : {};
  } catch {
    return {};
  }
}

export async function getCurrentMemberId(
  tripId: string
) {
  const ids = await getCurrentMemberIds();
  return ids[tripId] ?? null;
}

export async function saveCurrentMemberId(
  tripId: string,
  memberId: string
) {
  const ids = await getCurrentMemberIds();
  ids[tripId] = memberId;

  await AsyncStorage.setItem(
    CURRENT_MEMBER_IDS_KEY,
    JSON.stringify(ids)
  );
}

export async function deleteCurrentMemberId(
  tripId: string
) {
  const ids = await getCurrentMemberIds();

  if (!(tripId in ids)) {
    return;
  }

  delete ids[tripId];
  await AsyncStorage.setItem(
    CURRENT_MEMBER_IDS_KEY,
    JSON.stringify(ids)
  );
}

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
  const trip = await getTrip();
  await AsyncStorage.removeItem(TRIP_KEY);

  if (trip?.id) {
    await deleteCurrentMemberId(trip.id);
  }
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
          ? {
              ...schedule,
              ...updatedSchedule,
            }
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
// 준비물 체크리스트

export async function savePackingItems(
  items: any[]
) {
  await AsyncStorage.setItem(
    PACKING_KEY,
    JSON.stringify(items)
  );
}

export async function getPackingItems() {
  const data =
    await AsyncStorage.getItem(
      PACKING_KEY
    );

  return data
    ? JSON.parse(data)
    : [];
}

export async function addPackingItem(
  item: any
) {
  const items =
    await getPackingItems();

  await savePackingItems([
    ...items,
    item,
  ]);
}

export async function updatePackingItem(
  updatedItem: any
) {
  const items =
    await getPackingItems();

  const updatedItems =
    items.map(
      (item: any) =>
        item.id ===
        updatedItem.id
          ? {
              ...item,
              ...updatedItem,
            }
          : item
    );

  await savePackingItems(
    updatedItems
  );
}

export async function deletePackingItem(
  id: string
) {
  const items =
    await getPackingItems();

  const remaining =
    items.filter(
      (item: any) =>
        item.id !== id
    );

  await savePackingItems(
    remaining
  );
}

export async function clearPackingItems() {
  await AsyncStorage.removeItem(
    PACKING_KEY
  );
}
