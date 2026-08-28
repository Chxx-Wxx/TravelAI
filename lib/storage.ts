import AsyncStorage from "@react-native-async-storage/async-storage";

const TRIP_KEY = "@travelai_trip";
const SCHEDULE_KEY = "@travelai_schedule";
const EXPENSE_KEY = "@travelai_expenses";
const EXPENSE_SETTINGS_KEY = "@travelai_expense_settings";
const PACKING_KEY = "@travelai_packing_items";
const CURRENT_MEMBER_IDS_KEY =
  "@travelai_current_member_ids";
const USER_ID_KEY =
  "@travelai_user_id";
const SETTLEMENT_PAYMENT_KEY =
  "@travelai_settlement_payments";

type TripScopedEnvelope<T> = {
  version: 1;
  byTrip: Record<string, T>;
};

const TRIP_SCOPED_KEYS = [
  SCHEDULE_KEY,
  EXPENSE_KEY,
  EXPENSE_SETTINGS_KEY,
  SETTLEMENT_PAYMENT_KEY,
  PACKING_KEY,
];

const RECOVERABLE_TRIP_SCOPED_KEYS = [
  EXPENSE_KEY,
  EXPENSE_SETTINGS_KEY,
  SETTLEMENT_PAYMENT_KEY,
  PACKING_KEY,
];

function isTripScopedEnvelope<T>(
  value: unknown
): value is TripScopedEnvelope<T> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const candidate = value as {
    version?: unknown;
    byTrip?: unknown;
  };

  return (
    candidate.version === 1 &&
    Boolean(candidate.byTrip) &&
    typeof candidate.byTrip === "object" &&
    !Array.isArray(candidate.byTrip)
  );
}

async function resolveTripId(
  tripId?: string
) {
  if (tripId) {
    return tripId;
  }

  const data = await AsyncStorage.getItem(
    TRIP_KEY
  );

  if (!data) {
    return null;
  }

  try {
    const trip = JSON.parse(data);
    return typeof trip?.id === "string"
      ? trip.id
      : null;
  } catch {
    return null;
  }
}

async function getTripScopedValue<T>(
  key: string,
  fallback: T,
  tripId?: string
): Promise<T> {
  const resolvedTripId =
    await resolveTripId(tripId);

  if (!resolvedTripId) {
    return fallback;
  }

  const data = await AsyncStorage.getItem(key);

  if (!data) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(data);

    if (isTripScopedEnvelope<T>(parsed)) {
      return resolvedTripId in parsed.byTrip
        ? parsed.byTrip[resolvedTripId]
        : fallback;
    }

    const migrated: TripScopedEnvelope<T> = {
      version: 1,
      byTrip: {
        [resolvedTripId]: parsed as T,
      },
    };

    await AsyncStorage.setItem(
      key,
      JSON.stringify(migrated)
    );

    return parsed as T;
  } catch {
    return fallback;
  }
}

async function saveTripScopedValue<T>(
  key: string,
  value: T,
  tripId?: string
) {
  const resolvedTripId =
    await resolveTripId(tripId);

  if (!resolvedTripId) {
    return;
  }

  const data = await AsyncStorage.getItem(key);
  let envelope: TripScopedEnvelope<T> = {
    version: 1,
    byTrip: {},
  };

  if (data) {
    try {
      const parsed = JSON.parse(data);

      if (isTripScopedEnvelope<T>(parsed)) {
        envelope = {
          version: 1,
          byTrip: {
            ...parsed.byTrip,
          },
        };
      }
    } catch {
      // 손상된 기존 값은 현재 여행의 새 값으로 교체한다.
    }
  }

  envelope.byTrip[resolvedTripId] = value;

  await AsyncStorage.setItem(
    key,
    JSON.stringify(envelope)
  );
}

async function deleteTripScopedValue(
  key: string,
  tripId: string
) {
  const data = await AsyncStorage.getItem(key);

  if (!data) {
    return;
  }

  try {
    const parsed = JSON.parse(data);

    if (!isTripScopedEnvelope(parsed)) {
      // 구형 전역 값은 당시 current trip 하나에 속한 데이터다.
      await AsyncStorage.removeItem(key);
      return;
    }

    if (!(tripId in parsed.byTrip)) {
      return;
    }

    delete parsed.byTrip[tripId];

    await AsyncStorage.setItem(
      key,
      JSON.stringify(parsed)
    );
  } catch {
    await AsyncStorage.removeItem(key);
  }
}

async function moveTripScopedValue(
  key: string,
  sourceTripId: string,
  targetTripId: string
) {
  const data = await AsyncStorage.getItem(key);

  if (!data) {
    return;
  }

  try {
    const parsed = JSON.parse(data);

    if (!isTripScopedEnvelope(parsed)) {
      await AsyncStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          byTrip: {
            [targetTripId]: parsed,
          },
        })
      );
      return;
    }

    if (!(sourceTripId in parsed.byTrip)) {
      return;
    }

    if (!(targetTripId in parsed.byTrip)) {
      parsed.byTrip[targetTripId] =
        parsed.byTrip[sourceTripId];
    }

    delete parsed.byTrip[sourceTripId];

    await AsyncStorage.setItem(
      key,
      JSON.stringify(parsed)
    );
  } catch {
    // 손상된 캐시는 복구 이동 대상에서 제외한다.
  }
}

export async function getStoredUserId() {
  return AsyncStorage.getItem(
    USER_ID_KEY
  );
}

export async function saveUserId(
  userId: string
) {
  await AsyncStorage.setItem(
    USER_ID_KEY,
    userId
  );
}

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
  schedules: any[],
  tripId?: string
) {
  await saveTripScopedValue(
    SCHEDULE_KEY,
    schedules,
    tripId
  );
}

export async function getSchedules(
  tripId?: string
) {
  return getTripScopedValue<any[]>(
    SCHEDULE_KEY,
    [],
    tripId
  );
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
  expenses: any[],
  tripId?: string
) {
  await saveTripScopedValue(
    EXPENSE_KEY,
    expenses,
    tripId
  );
}

export async function getExpenses(
  tripId?: string
) {
  return getTripScopedValue<any[]>(
    EXPENSE_KEY,
    [],
    tripId
  );
}

export async function deleteExpense(
  id: string,
  tripId?: string
) {
  const expenses =
    await getExpenses(tripId);

  const remaining =
    expenses.filter(
      (expense: any) =>
        expense.id !== id
    );

  await saveExpenses(
    remaining,
    tripId
  );
}

// 지출 설정
export async function saveExpenseSettings(
  settings: any,
  tripId?: string
) {
  await saveTripScopedValue(
    EXPENSE_SETTINGS_KEY,
    settings,
    tripId
  );
}

export async function getExpenseSettings(
  tripId?: string
) {
  return getTripScopedValue<any | null>(
    EXPENSE_SETTINGS_KEY,
    null,
    tripId
  );
}

export async function deleteExpenseSettings(
  tripId?: string
) {
  const resolvedTripId =
    await resolveTripId(tripId);

  if (resolvedTripId) {
    await deleteTripScopedValue(
      EXPENSE_SETTINGS_KEY,
      resolvedTripId
    );
  }
}

export async function saveSettlementPayments(
  payments: any[],
  tripId?: string
) {
  await saveTripScopedValue(
    SETTLEMENT_PAYMENT_KEY,
    payments,
    tripId
  );
}

export async function getSettlementPayments(
  tripId?: string
) {
  return getTripScopedValue<any[]>(
    SETTLEMENT_PAYMENT_KEY,
    [],
    tripId
  );
}

export async function deleteSettlementPayment(
  id: string,
  tripId?: string
) {
  const payments =
    await getSettlementPayments(
      tripId
    );

  const remaining =
    payments.filter(
      (payment: any) =>
        payment.id !== id
    );

  await saveSettlementPayments(
    remaining,
    tripId
  );
}
// 준비물 체크리스트

export async function savePackingItems(
  items: any[],
  tripId?: string
) {
  await saveTripScopedValue(
    PACKING_KEY,
    items,
    tripId
  );
}

export async function getPackingItems(
  tripId?: string
) {
  return getTripScopedValue<any[]>(
    PACKING_KEY,
    [],
    tripId
  );
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

export async function clearPackingItems(
  tripId?: string
) {
  const resolvedTripId =
    await resolveTripId(tripId);

  if (resolvedTripId) {
    await deleteTripScopedValue(
      PACKING_KEY,
      resolvedTripId
    );
  }
}

export async function deleteTripLocalData(
  tripId: string
) {
  await Promise.all(
    TRIP_SCOPED_KEYS.map(
      (key) =>
        deleteTripScopedValue(
          key,
          tripId
        )
    )
  );

  await deleteCurrentMemberId(tripId);

  const currentTrip = await getTrip();

  if (currentTrip?.id === tripId) {
    await AsyncStorage.removeItem(
      TRIP_KEY
    );
  }
}

export async function moveTripLocalData(
  sourceTripId: string,
  targetTripId: string
) {
  if (sourceTripId === targetTripId) {
    return;
  }

  await Promise.all([
    ...RECOVERABLE_TRIP_SCOPED_KEYS.map(
      (key) =>
        moveTripScopedValue(
          key,
          sourceTripId,
          targetTripId
        )
    ),
    deleteTripScopedValue(
      SCHEDULE_KEY,
      sourceTripId
    ),
  ]);
}
