import { useEffect, useRef, useState } from "react";

import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import AppButton from "../../components/AppButton";
import AppInput from "../../components/AppInput";
import {
  getExpenses,
  getSettlementPayments,
  saveTrip,
} from "../../lib/storage";
import {
  formatLocalCalendarDate,
  getCalendarDayDifference,
  parseLocalCalendarDate,
  shiftCalendarDate,
} from "../../lib/trip-date";
import { getCurrentTripWithRecovery } from "../../services/current-trip";
import { fetchSchedules } from "../../services/schedule";
import {
  fetchTripMembers,
  TripUpdateError,
  updateServerTrip,
} from "../../services/trip";
import type {
  Expense,
  Schedule,
  SettlementPayment,
  Trip,
  TripMember,
} from "../../types";

type EditableMember = {
  key: string;
  id?: string;
  displayName: string;
  role: TripMember["role"];
  status: TripMember["status"];
  userId: string | null;
};

type DateResolutionMode = "shift" | "manual";

function collectReferencedMemberIds(
  expenses: Expense[],
  payments: SettlementPayment[]
) {
  const ids = new Set<string>();
  const add = (id?: string) => {
    if (id) {
      ids.add(id);
    }
  };

  for (const expense of expenses) {
    add(expense.paidByMemberId);
    add(expense.lenderMemberId);
    add(expense.borrowerMemberId);
    expense.participantMemberIds?.forEach(add);
  }

  for (const payment of payments) {
    add(payment.fromMemberId);
    add(payment.toMemberId);

    for (const relation of payment.resolvedRelations ?? []) {
      add(relation.fromMemberId);
      add(relation.toMemberId);
    }
  }

  return ids;
}

function formatScheduleConflicts(
  schedules: Pick<Schedule, "id" | "title" | "date">[]
) {
  const preview = schedules
    .slice(0, 4)
    .map((schedule) => `${schedule.date} · ${schedule.title}`)
    .join("\n");
  const remaining = schedules.length - 4;

  return remaining > 0
    ? `${preview}\n외 ${remaining}개 일정`
    : preview;
}

export default function EditTripScreen() {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [tripName, setTripName] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [members, setMembers] = useState<EditableMember[]>([]);
  const [removedMembers, setRemovedMembers] = useState<EditableMember[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [referencedMemberIds, setReferencedMemberIds] = useState(
    new Set<string>()
  );
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [dateResolutionMode, setDateResolutionMode] =
    useState<DateResolutionMode | null>(null);
  const [scheduleDateDrafts, setScheduleDateDrafts] = useState<
    Record<string, string>
  >({});
  const [manualPickerScheduleId, setManualPickerScheduleId] = useState<
    string | null
  >(null);
  const [confirmedManualScheduleIds, setConfirmedManualScheduleIds] =
    useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const newMemberSequence = useRef(0);

  useEffect(() => {
    let active = true;

    async function loadTrip() {
      try {
        const currentTrip = await getCurrentTripWithRecovery();

        if (!currentTrip?.id) {
          throw new Error("수정할 여행을 찾을 수 없습니다.");
        }

        const [serverMembers, tripSchedules, expenses, payments] =
          await Promise.all([
            fetchTripMembers(currentTrip.id),
            fetchSchedules(currentTrip.id),
            getExpenses(currentTrip.id),
            getSettlementPayments(currentTrip.id),
          ]);
        const activeMembers = serverMembers.filter(
          (member) => member.status !== "removed"
        );

        if (activeMembers.length === 0) {
          throw new Error("여행 동행자 정보를 찾을 수 없습니다.");
        }

        const parsedStartDate = parseLocalCalendarDate(
          currentTrip.startDate
        );
        const parsedEndDate = parseLocalCalendarDate(currentTrip.endDate);

        if (!parsedStartDate || !parsedEndDate) {
          throw new Error("여행 날짜 정보를 확인할 수 없습니다.");
        }

        if (!active) {
          return;
        }

        setTrip(currentTrip);
        setTripName(currentTrip.tripName);
        setCountry(currentTrip.country);
        setCity(currentTrip.city);
        setStartDate(parsedStartDate);
        setEndDate(parsedEndDate);
        setMembers(
          activeMembers.map((member) => ({
            key: member.id,
            id: member.id,
            displayName: member.displayName,
            role: member.role,
            status: member.status,
            userId: member.userId,
          }))
        );
        setSchedules(tripSchedules);
        setReferencedMemberIds(
          collectReferencedMemberIds(expenses, payments)
        );
      } catch (error) {
        if (active) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "여행 정보를 불러오지 못했습니다."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadTrip();

    return () => {
      active = false;
    };
  }, []);

  function updateMemberName(key: string, displayName: string) {
    setMembers((current) =>
      current.map((member) =>
        member.key === key ? { ...member, displayName } : member
      )
    );
  }

  function addMember() {
    if (members.length >= 10) {
      Alert.alert(
        "인원 확인",
        "현재는 최대 10명까지 등록할 수 있습니다."
      );
      return;
    }

    const restored = removedMembers.at(-1);

    if (restored) {
      setRemovedMembers((current) => current.slice(0, -1));
      setMembers((current) => [...current, restored]);
      return;
    }

    newMemberSequence.current += 1;
    setMembers((current) => [
      ...current,
      {
        key: `new-${Date.now()}-${newMemberSequence.current}`,
        displayName: `친구 ${current.length}`,
        role: "member",
        status: "placeholder",
        userId: null,
      },
    ]);
  }

  function removeMember() {
    if (members.length <= 1) {
      return;
    }

    const candidateIndex = members.findLastIndex(
      (member) =>
        member.role !== "owner" &&
        !member.userId &&
        member.status === "placeholder" &&
        (!member.id || !referencedMemberIds.has(member.id))
    );

    if (candidateIndex === -1) {
      Alert.alert(
        "인원 변경 불가",
        "계정 또는 지출·정산 기록에 연결된 동행자는 자동으로 제외할 수 없습니다. 기존 데이터를 유지하려면 현재 인원수를 사용해주세요."
      );
      return;
    }

    const candidate = members[candidateIndex];
    setMembers((current) =>
      current.filter((_, index) => index !== candidateIndex)
    );

    if (candidate.id) {
      setRemovedMembers((current) => [...current, candidate]);
    }
  }

  function clearDateResolution() {
    setDateResolutionMode(null);
    setScheduleDateDrafts({});
    setManualPickerScheduleId(null);
    setConfirmedManualScheduleIds(new Set());
  }

  function getNextTripRange() {
    return {
      startDate: formatLocalCalendarDate(startDate),
      endDate: formatLocalCalendarDate(endDate),
    };
  }

  function getOutsideSchedules(
    start: string,
    end: string,
    drafts: Record<string, string> = scheduleDateDrafts
  ) {
    return schedules.filter((schedule) => {
      const nextDate = drafts[schedule.id] ?? schedule.date;

      return nextDate < start || nextDate > end;
    });
  }

  function beginManualDateResolution() {
    const nextRange = getNextTripRange();
    const outsideSchedules = getOutsideSchedules(
      nextRange.startDate,
      nextRange.endDate,
      {}
    );
    const drafts = Object.fromEntries(
      outsideSchedules.map((schedule) => [
        schedule.id,
        schedule.date < nextRange.startDate
          ? nextRange.startDate
          : nextRange.endDate,
      ])
    );

    setDateResolutionMode("manual");
    setScheduleDateDrafts(drafts);
    setManualPickerScheduleId(null);
    setConfirmedManualScheduleIds(new Set());
  }

  function beginShiftDateResolution() {
    if (!trip) {
      return;
    }

    const nextRange = getNextTripRange();
    const dayDifference = getCalendarDayDifference(
      trip.startDate,
      nextRange.startDate
    );

    if (dayDifference === null || dayDifference === 0) {
      Alert.alert(
        "함께 이동할 수 없음",
        "시작일 차이가 없어 일정을 함께 이동해도 기간 밖 일정이 남습니다. 일정별 날짜를 직접 지정해주세요.",
        [
          { text: "취소", style: "cancel" },
          { text: "직접 지정", onPress: beginManualDateResolution },
        ]
      );
      return;
    }

    const drafts = Object.fromEntries(
      schedules.map((schedule) => [
        schedule.id,
        shiftCalendarDate(schedule.date, dayDifference) ?? schedule.date,
      ])
    );
    const outsideAfterShift = getOutsideSchedules(
      nextRange.startDate,
      nextRange.endDate,
      drafts
    );

    if (outsideAfterShift.length > 0) {
      Alert.alert(
        "함께 이동할 수 없음",
        "새 여행 기간이 기존 기간보다 짧아 일부 일정이 범위 밖에 남습니다. 일정별 날짜를 직접 지정해주세요.",
        [
          { text: "취소", style: "cancel" },
          { text: "직접 지정", onPress: beginManualDateResolution },
        ]
      );
      return;
    }

    setDateResolutionMode("shift");
    setScheduleDateDrafts(drafts);
    setManualPickerScheduleId(null);
    setConfirmedManualScheduleIds(new Set());
  }

  function promptDateResolution() {
    Alert.alert(
      "기존 일정 날짜 조정",
      "새 여행 기간 밖의 일정이 있습니다. 일정 날짜를 함께 이동하거나 일정별로 직접 지정해주세요.",
      [
        { text: "취소", style: "cancel" },
        { text: "직접 지정", onPress: beginManualDateResolution },
        { text: "함께 이동", onPress: beginShiftDateResolution },
      ]
    );
  }

  function updateManualScheduleDate(
    scheduleId: string,
    event: DateTimePickerEvent,
    selectedDate?: Date
  ) {
    if (Platform.OS === "android") {
      setManualPickerScheduleId(null);
    }

    if (event.type === "dismissed" || !selectedDate) {
      return;
    }

    setScheduleDateDrafts((current) => ({
      ...current,
      [scheduleId]: formatLocalCalendarDate(selectedDate),
    }));
    setConfirmedManualScheduleIds((current) => {
      const next = new Set(current);
      next.add(scheduleId);
      return next;
    });
  }

  function handleStartDateChange(
    event: DateTimePickerEvent,
    selectedDate?: Date
  ) {
    if (Platform.OS === "android") {
      setShowStartPicker(false);
    }

    if (event.type === "dismissed" || !selectedDate) {
      return;
    }

    setStartDate(selectedDate);
    clearDateResolution();

    if (selectedDate > endDate) {
      setEndDate(selectedDate);
    }
  }

  function handleEndDateChange(
    event: DateTimePickerEvent,
    selectedDate?: Date
  ) {
    if (Platform.OS === "android") {
      setShowEndPicker(false);
    }

    if (event.type !== "dismissed" && selectedDate) {
      setEndDate(selectedDate);
      clearDateResolution();
    }
  }

  function getScheduleDateUpdates() {
    return schedules.flatMap((schedule) => {
      const nextDate = scheduleDateDrafts[schedule.id];

      return nextDate && nextDate !== schedule.date
        ? [
            {
              id: schedule.id,
              previousDate: schedule.date,
              date: nextDate,
            },
          ]
        : [];
    });
  }

  async function saveChanges(
    scheduleDateUpdates: ReturnType<typeof getScheduleDateUpdates>
  ) {
    if (!trip?.id || savingRef.current) {
      return;
    }

    savingRef.current = true;
    setSaving(true);

    try {
      const updatedTrip = await updateServerTrip(trip.id, {
        tripName: tripName.trim(),
        country: country.trim(),
        city: city.trim(),
        startDate: formatLocalCalendarDate(startDate),
        endDate: formatLocalCalendarDate(endDate),
        people: String(members.length),
        memberChanges: {
          updates: members
            .filter(
              (member): member is EditableMember & { id: string } =>
                Boolean(member.id)
            )
            .map((member) => ({
              id: member.id,
              displayName: member.displayName.trim(),
            })),
          additions: members
            .filter((member) => !member.id)
            .map((member) => ({
              displayName: member.displayName.trim(),
            })),
          removeIds: removedMembers.flatMap((member) =>
            member.id ? [member.id] : []
          ),
        },
        scheduleDateUpdates,
      });

      if (updatedTrip.id !== trip.id) {
        throw new Error("여행 ID가 변경되어 저장을 중단했습니다.");
      }

      await saveTrip(updatedTrip);

      Alert.alert("완료", "여행 정보가 수정되었습니다.", [
        {
          text: "확인",
          onPress: () => router.replace("/"),
        },
      ]);
    } catch (error) {
      const message =
        error instanceof TripUpdateError &&
        error.code === "TRIP_DATE_RANGE_CONFLICT" &&
        error.schedules?.length
          ? `${error.message}\n\n${formatScheduleConflicts(
              error.schedules
            )}`
          : error instanceof Error
            ? error.message
            : "여행 정보를 수정하지 못했습니다.";

      Alert.alert("여행 수정 실패", message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function handleSave() {
    if (!trip) {
      return;
    }

    if (!tripName.trim() || !country.trim() || !city.trim()) {
      Alert.alert(
        "입력 확인",
        "여행 이름, 국가, 도시를 모두 입력해주세요."
      );
      return;
    }

    if (endDate < startDate) {
      Alert.alert(
        "날짜 확인",
        "종료일은 시작일보다 빠를 수 없습니다."
      );
      return;
    }

    if (members.some((member) => !member.displayName.trim())) {
      Alert.alert(
        "동행자 확인",
        "모든 동행자의 이름을 입력해주세요."
      );
      return;
    }

    const nextStartDate = formatLocalCalendarDate(startDate);
    const nextEndDate = formatLocalCalendarDate(endDate);
    const originalOutsideSchedules = getOutsideSchedules(
      nextStartDate,
      nextEndDate,
      {}
    );

    if (originalOutsideSchedules.length > 0 && !dateResolutionMode) {
      promptDateResolution();
      return;
    }

    if (
      dateResolutionMode === "manual" &&
      Object.keys(scheduleDateDrafts).some(
        (scheduleId) => !confirmedManualScheduleIds.has(scheduleId)
      )
    ) {
      Alert.alert(
        "일정 날짜 선택 필요",
        "영향을 받는 각 일정의 새 날짜를 확인해주세요."
      );
      return;
    }

    const unresolvedSchedules = getOutsideSchedules(
      nextStartDate,
      nextEndDate
    );

    if (unresolvedSchedules.length > 0) {
      Alert.alert(
        "일정 날짜 확인",
        `아직 새 여행 기간 밖에 있는 일정이 있습니다. 표시된 일정 날짜를 다시 선택해주세요.\n\n${formatScheduleConflicts(
          unresolvedSchedules
        )}`
      );
      return;
    }

    const scheduleDateUpdates = getScheduleDateUpdates();
    const locationChanged =
      country.trim() !== trip.country || city.trim() !== trip.city;

    if (scheduleDateUpdates.length > 0) {
      const preview = scheduleDateUpdates
        .slice(0, 5)
        .map((update) => {
          const schedule = schedules.find((item) => item.id === update.id);

          return `${schedule?.title ?? "일정"}: ${update.previousDate} → ${update.date}`;
        })
        .join("\n");
      const remaining = scheduleDateUpdates.length - 5;
      const locationNotice = locationChanged
        ? "\n\n기존 일정의 장소와 좌표는 변경되지 않습니다."
        : "";

      Alert.alert(
        "여행과 일정 변경 확인",
        `변경 전: ${trip.startDate} ~ ${trip.endDate}\n변경 후: ${nextStartDate} ~ ${nextEndDate}\n영향 일정: ${scheduleDateUpdates.length}개\n\n${preview}${
          remaining > 0 ? `\n외 ${remaining}개 일정` : ""
        }${locationNotice}`,
        [
          { text: "취소", style: "cancel" },
          {
            text: "함께 저장",
            onPress: () => void saveChanges(scheduleDateUpdates),
          },
        ]
      );
      return;
    }

    if (locationChanged && schedules.length > 0) {
      Alert.alert(
        "국가·도시 변경",
        "홈과 날씨 기준 도시는 새 값으로 바뀝니다. 기존 일정의 장소, 주소, 좌표는 변경되지 않습니다.",
        [
          { text: "취소", style: "cancel" },
          {
            text: "변경",
            onPress: () => void saveChanges([]),
          },
        ]
      );
      return;
    }

    void saveChanges([]);
  }

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#F5F7FB",
        }}
      >
        <ActivityIndicator color="#2563EB" />
      </View>
    );
  }

  if (loadError || !trip) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          padding: 24,
          backgroundColor: "#F5F7FB",
        }}
      >
        <Text style={{ color: "#B91C1C", fontSize: 16 }}>
          {loadError ?? "수정할 여행을 찾을 수 없습니다."}
        </Text>
        <View style={{ marginTop: 20 }}>
          <AppButton title="돌아가기" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const scheduleDatePreview = schedules.filter((schedule) => {
    const nextDate = scheduleDateDrafts[schedule.id];

    return nextDate && nextDate !== schedule.date;
  });

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: "#F5F7FB" }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 70,
          paddingBottom: 70,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 28,
          }}
        >
          <Text
            style={{
              fontSize: 30,
              fontWeight: "bold",
              color: "#111827",
            }}
          >
            여행 수정
          </Text>
          <Pressable onPress={() => router.back()}>
            <Text
              style={{
                color: "#4B5563",
                fontSize: 16,
                fontWeight: "bold",
              }}
            >
              취소
            </Text>
          </Pressable>
        </View>

        <AppInput
          placeholder="여행 이름"
          value={tripName}
          onChangeText={setTripName}
        />
        <AppInput
          placeholder="국가"
          value={country}
          onChangeText={setCountry}
        />
        <AppInput
          placeholder="도시"
          value={city}
          onChangeText={setCity}
        />

        <Text
          style={{
            marginTop: 8,
            marginBottom: 8,
            color: "#374151",
            fontSize: 16,
            fontWeight: "bold",
          }}
        >
          여행 시작일
        </Text>
        <Pressable
          onPress={() => setShowStartPicker(true)}
          style={{
            backgroundColor: "white",
            borderRadius: 12,
            padding: 15,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: "#111827", fontSize: 16 }}>
            {formatLocalCalendarDate(startDate)}
          </Text>
        </Pressable>
        {showStartPicker ? (
          <DateTimePicker
            value={startDate}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            themeVariant="light"
            textColor="#111827"
            onChange={handleStartDateChange}
          />
        ) : null}
        {Platform.OS === "ios" && showStartPicker ? (
          <Pressable
            onPress={() => setShowStartPicker(false)}
            style={{ alignSelf: "flex-end", marginBottom: 15 }}
          >
            <Text style={{ color: "#2563EB", fontWeight: "bold" }}>
              시작일 선택 완료
            </Text>
          </Pressable>
        ) : null}

        <Text
          style={{
            marginTop: 8,
            marginBottom: 8,
            color: "#374151",
            fontSize: 16,
            fontWeight: "bold",
          }}
        >
          여행 종료일
        </Text>
        <Pressable
          onPress={() => setShowEndPicker(true)}
          style={{
            backgroundColor: "white",
            borderRadius: 12,
            padding: 15,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: "#111827", fontSize: 16 }}>
            {formatLocalCalendarDate(endDate)}
          </Text>
        </Pressable>
        {showEndPicker ? (
          <DateTimePicker
            value={endDate}
            mode="date"
            minimumDate={startDate}
            display={Platform.OS === "ios" ? "spinner" : "default"}
            themeVariant="light"
            textColor="#111827"
            onChange={handleEndDateChange}
          />
        ) : null}
        {Platform.OS === "ios" && showEndPicker ? (
          <Pressable
            onPress={() => setShowEndPicker(false)}
            style={{ alignSelf: "flex-end", marginBottom: 15 }}
          >
            <Text style={{ color: "#2563EB", fontWeight: "bold" }}>
              종료일 선택 완료
            </Text>
          </Pressable>
        ) : null}

        {dateResolutionMode ? (
          <View
            style={{
              marginTop: 18,
              backgroundColor: "#EFF6FF",
              borderWidth: 1,
              borderColor: "#BFDBFE",
              borderRadius: 8,
              padding: 16,
            }}
          >
            <Text
              style={{
                color: "#111827",
                fontSize: 17,
                fontWeight: "bold",
              }}
            >
              기존 일정 날짜 조정
            </Text>
            <Text
              style={{ marginTop: 10, color: "#4B5563", fontSize: 14 }}
            >
              변경 전 {trip.startDate} ~ {trip.endDate}
            </Text>
            <Text
              style={{ marginTop: 4, color: "#1D4ED8", fontSize: 14 }}
            >
              변경 후 {formatLocalCalendarDate(startDate)} ~{" "}
              {formatLocalCalendarDate(endDate)}
            </Text>

            <View
              style={{
                flexDirection: "row",
                marginTop: 14,
                gap: 8,
              }}
            >
              <Pressable
                onPress={beginShiftDateResolution}
                style={{
                  flex: 1,
                  paddingVertical: 11,
                  alignItems: "center",
                  borderRadius: 8,
                  backgroundColor:
                    dateResolutionMode === "shift" ? "#2563EB" : "white",
                }}
              >
                <Text
                  style={{
                    color:
                      dateResolutionMode === "shift" ? "white" : "#1D4ED8",
                    fontWeight: "bold",
                  }}
                >
                  함께 이동
                </Text>
              </Pressable>
              <Pressable
                onPress={beginManualDateResolution}
                style={{
                  flex: 1,
                  paddingVertical: 11,
                  alignItems: "center",
                  borderRadius: 8,
                  backgroundColor:
                    dateResolutionMode === "manual" ? "#2563EB" : "white",
                }}
              >
                <Text
                  style={{
                    color:
                      dateResolutionMode === "manual" ? "white" : "#1D4ED8",
                    fontWeight: "bold",
                  }}
                >
                  직접 지정
                </Text>
              </Pressable>
            </View>

            <Text
              style={{
                marginTop: 16,
                marginBottom: 8,
                color: "#374151",
                fontSize: 14,
                fontWeight: "bold",
              }}
            >
              영향을 받는 일정 {scheduleDatePreview.length}개
            </Text>

            {scheduleDatePreview.map((schedule) => {
              const nextDate = scheduleDateDrafts[schedule.id];
              const pickerDate = parseLocalCalendarDate(nextDate);
              const pickerOpen =
                dateResolutionMode === "manual" &&
                manualPickerScheduleId === schedule.id;

              return (
                <View
                  key={schedule.id}
                  style={{
                    marginTop: 8,
                    padding: 12,
                    borderRadius: 8,
                    backgroundColor: "white",
                  }}
                >
                  <Text
                    style={{
                      color: "#111827",
                      fontSize: 15,
                      fontWeight: "bold",
                    }}
                  >
                    {schedule.title}
                  </Text>
                  <Pressable
                    disabled={dateResolutionMode !== "manual"}
                    onPress={() => setManualPickerScheduleId(schedule.id)}
                    style={{ paddingTop: 8, paddingBottom: 4 }}
                  >
                    <Text
                      style={{
                        color:
                          dateResolutionMode === "manual"
                            ? "#1D4ED8"
                            : "#4B5563",
                        fontSize: 14,
                        fontWeight: "bold",
                      }}
                    >
                      {schedule.date} → {nextDate}
                    </Text>
                    {dateResolutionMode === "manual" ? (
                      <Text
                        style={{
                          marginTop: 4,
                          color: confirmedManualScheduleIds.has(schedule.id)
                            ? "#047857"
                            : "#B45309",
                          fontSize: 12,
                          fontWeight: "bold",
                        }}
                      >
                        {confirmedManualScheduleIds.has(schedule.id)
                          ? "날짜 확인 완료"
                          : "눌러서 새 날짜 확인"}
                      </Text>
                    ) : null}
                  </Pressable>

                  {pickerOpen && pickerDate ? (
                    <>
                      <DateTimePicker
                        value={pickerDate}
                        mode="date"
                        minimumDate={startDate}
                        maximumDate={endDate}
                        display={Platform.OS === "ios" ? "spinner" : "default"}
                        themeVariant="light"
                        textColor="#111827"
                        onChange={(event, selectedDate) =>
                          updateManualScheduleDate(
                            schedule.id,
                            event,
                            selectedDate
                          )
                        }
                      />
                      {Platform.OS === "ios" ? (
                        <Pressable
                          onPress={() => {
                            setConfirmedManualScheduleIds((current) => {
                              const next = new Set(current);
                              next.add(schedule.id);
                              return next;
                            });
                            setManualPickerScheduleId(null);
                          }}
                          style={{ alignSelf: "flex-end", paddingVertical: 8 }}
                        >
                          <Text
                            style={{ color: "#2563EB", fontWeight: "bold" }}
                          >
                            날짜 선택 완료
                          </Text>
                        </Pressable>
                      ) : null}
                    </>
                  ) : null}
                </View>
              );
            })}

            <Pressable
              onPress={clearDateResolution}
              style={{ alignSelf: "center", marginTop: 14, padding: 8 }}
            >
              <Text style={{ color: "#6B7280", fontWeight: "bold" }}>
                일정 날짜 조정 취소
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View
          style={{
            marginTop: 18,
            backgroundColor: "white",
            borderRadius: 8,
            padding: 18,
          }}
        >
          <Text
            style={{ color: "#111827", fontSize: 18, fontWeight: "bold" }}
          >
            여행 인원
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: 16,
            }}
          >
            <Pressable
              accessibilityLabel="여행 인원 줄이기"
              onPress={removeMember}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: "#F3F4F6",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{ color: "#374151", fontSize: 24, fontWeight: "bold" }}
              >
                −
              </Text>
            </Pressable>
            <Text
              style={{
                marginHorizontal: 22,
                color: "#111827",
                fontSize: 22,
                fontWeight: "bold",
              }}
            >
              {members.length}명
            </Text>
            <Pressable
              accessibilityLabel="여행 인원 늘리기"
              onPress={addMember}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: "#2563EB",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{ color: "white", fontSize: 24, fontWeight: "bold" }}
              >
                +
              </Text>
            </Pressable>
          </View>
        </View>

        <View
          style={{
            marginTop: 18,
            backgroundColor: "white",
            borderRadius: 8,
            padding: 18,
          }}
        >
          <Text
            style={{ color: "#111827", fontSize: 18, fontWeight: "bold" }}
          >
            동행자
          </Text>
          <Text
            style={{
              marginTop: 5,
              marginBottom: 14,
              color: "#6B7280",
              fontSize: 13,
            }}
          >
            기존 멤버 ID와 지출·정산 연결은 그대로 유지됩니다.
          </Text>
          {members.map((member, index) => (
            <View key={member.key} style={{ marginBottom: 12 }}>
              <Text
                style={{
                  marginBottom: 6,
                  color: "#6B7280",
                  fontSize: 13,
                  fontWeight: "bold",
                }}
              >
                {member.role === "owner" ? "여행 만든 사람" : `동행자 ${index}`}
              </Text>
              <TextInput
                value={member.displayName}
                onChangeText={(text) => updateMemberName(member.key, text)}
                placeholder="동행자 이름"
                placeholderTextColor="#9CA3AF"
                style={{
                  backgroundColor: "#F9FAFB",
                  color: "#111827",
                  borderRadius: 12,
                  padding: 14,
                  fontSize: 16,
                }}
              />
            </View>
          ))}
        </View>

        <View style={{ marginTop: 22 }}>
          <AppButton
            title={
              saving
                ? "저장 중..."
                : dateResolutionMode
                  ? "여행과 일정 함께 저장"
                  : "변경 사항 저장"
            }
            onPress={handleSave}
            disabled={saving}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
