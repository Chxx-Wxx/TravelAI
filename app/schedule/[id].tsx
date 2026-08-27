import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";

import {
  router,
  useLocalSearchParams,
} from "expo-router";

import {
  useEffect,
  useState,
} from "react";

import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import AppButton from "../../components/AppButton";
import AppInput from "../../components/AppInput";
import PlaceCandidateList from "../../components/PlaceCandidateList";

import {
  usePlaceAutocomplete,
} from "../../hooks/use-place-autocomplete";

import {
  hasValidScheduleLocation,
} from "../../lib/schedule-location";

import {
  getCurrentTripWithRecovery,
} from "../../services/current-trip";

import {
  arePlaceNamesEquivalent,
  findConfidentPlaceMatch,
  PlaceResult,
} from "../../services/place";

import {
  fetchSchedule,
  updateServerSchedule,
} from "../../services/schedule";

import {
  ScheduleCategory,
} from "../../types";

const categories: ScheduleCategory[] = [
  "관광",
  "식사",
  "카페",
  "쇼핑",
  "숙소",
  "이동",
  "기타",
];

const durations = [
  30,
  60,
  90,
  120,
  180,
];

type StoredPlaceLink = {
  id?: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
};

export default function EditScheduleScreen() {
  const { id } =
    useLocalSearchParams<{
      id: string;
    }>();

  const [title, setTitle] =
    useState("");

  const [location, setLocation] =
    useState("");

  const [address, setAddress] =
    useState("");

  const [
    latitude,
    setLatitude,
  ] =
    useState<number | undefined>(
      undefined
    );

  const [
    longitude,
    setLongitude,
  ] =
    useState<number | undefined>(
      undefined
    );

  const [
    placeId,
    setPlaceId,
  ] =
    useState<string | undefined>(
      undefined
    );

  const [
    selectedPlace,
    setSelectedPlace,
  ] =
    useState(false);

  const [
    pendingPlaceSelection,
    setPendingPlaceSelection,
  ] = useState(false);

  const [saving, setSaving] =
    useState(false);

  const [
    originalPlace,
    setOriginalPlace,
  ] = useState<StoredPlaceLink | null>(
    null
  );

  const [
    locationEdited,
    setLocationEdited,
  ] = useState(false);

  const [
    category,
    setCategory,
  ] =
    useState<ScheduleCategory>(
      "관광"
    );

  const [
    durationMinutes,
    setDurationMinutes,
  ] =
    useState(60);

  const [memo, setMemo] =
    useState("");

  const [date, setDate] =
    useState(new Date());

  const [time, setTime] =
    useState(new Date());

  const [
    showDatePicker,
    setShowDatePicker,
  ] =
    useState(false);

  const [
    showTimePicker,
    setShowTimePicker,
  ] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const matchesOriginalPlace =
    Boolean(
      originalPlace &&
        arePlaceNamesEquivalent(
          location,
          originalPlace.name
        )
    );

  const {
    results: placeResults,
    isSearching:
      searchingPlace,
    searchNow:
      searchPlacesNow,
    clearResults:
      clearPlaceResults,
    showResults:
      showPlaceResults,
  } = usePlaceAutocomplete({
    query: location,
    date: formatDate(date),
    time: formatTime(time),
    scheduleId: id,
    existingLocation: originalPlace,
    enabled:
      !loading &&
      locationEdited &&
      !matchesOriginalPlace &&
      !selectedPlace &&
      !pendingPlaceSelection &&
      !saving,
  });

  function formatDate(
    value: Date
  ) {
    const year =
      value.getFullYear();

    const month =
      String(
        value.getMonth() + 1
      ).padStart(2, "0");

    const day =
      String(
        value.getDate()
      ).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function formatTime(
    value: Date
  ) {
    const hour =
      String(
        value.getHours()
      ).padStart(2, "0");

    const minute =
      String(
        value.getMinutes()
      ).padStart(2, "0");

    return `${hour}:${minute}`;
  }

  function parseDate(
    value: string
  ) {
    const [
      year,
      month,
      day,
    ] =
      value
        .split("-")
        .map(Number);

    const result =
      new Date(
        year,
        month - 1,
        day
      );

    result.setHours(
      0,
      0,
      0,
      0
    );

    return result;
  }

  function parseTime(
    value: string
  ) {
    const [
      hour,
      minute,
    ] =
      value
        .split(":")
        .map(Number);

    const result =
      new Date();

    result.setHours(
      hour,
      minute,
      0,
      0
    );

    return result;
  }

  useEffect(() => {
    async function loadSchedule() {
      if (!id) {
        setLoading(false);
        return;
      }

      try {
        const schedule =
          await fetchSchedule(
            id
          );

        setTitle(
          schedule.title
        );

        setLocation(
          schedule.location
        );

        setAddress(
          schedule.address ?? ""
        );

        setLatitude(
          schedule.latitude ??
            undefined
        );

        setLongitude(
          schedule.longitude ??
            undefined
        );

        setPlaceId(
          schedule.placeId ??
            undefined
        );

        setSelectedPlace(
          hasValidScheduleLocation(
            schedule
          )
        );

        setOriginalPlace(
          hasValidScheduleLocation(
            schedule
          )
            ? {
                id:
                  schedule.placeId ??
                  undefined,
                name:
                  schedule.location,
                address:
                  schedule.address ?? "",
                latitude:
                  schedule.latitude,
                longitude:
                  schedule.longitude,
              }
            : null
        );

        setLocationEdited(false);

        setCategory(
          schedule.category ??
            "관광"
        );

        setDurationMinutes(
          schedule.durationMinutes ??
            60
        );

        setMemo(
          schedule.memo ?? ""
        );

        setDate(
          parseDate(
            schedule.date
          )
        );

        setTime(
          parseTime(
            schedule.time
          )
        );
      } catch (error) {
        console.error(
          "일정 조회 실패:",
          error
        );

        Alert.alert(
          "오류",
          "일정을 찾을 수 없습니다.",
          [
            {
              text: "확인",

              onPress: () =>
                router.back(),
            },
          ]
        );
      } finally {
        setLoading(false);
      }
    }

    loadSchedule();
  }, [id]);

  function handleLocationChange(
    text: string
  ) {
    setLocation(text);
    setLocationEdited(true);
    clearPlaceResults();
    setPendingPlaceSelection(false);

    if (
      originalPlace &&
      arePlaceNamesEquivalent(
        text,
        originalPlace.name
      )
    ) {
      setAddress(
        originalPlace.address
      );
      setLatitude(
        originalPlace.latitude
      );
      setLongitude(
        originalPlace.longitude
      );
      setPlaceId(
        originalPlace.id
      );
      setSelectedPlace(true);
      return;
    }

    // 장소명을 직접 수정하면
    // 기존 좌표가 틀릴 수 있으므로 초기화
    setAddress("");
    setLatitude(undefined);
    setLongitude(undefined);
    setPlaceId(undefined);
    setSelectedPlace(false);
  }

  async function handlePlaceSearch() {
    if (!location.trim()) {
      Alert.alert(
        "장소 검색",
        "검색할 장소를 입력해주세요."
      );

      return;
    }

    try {
      setPendingPlaceSelection(false);
      clearPlaceResults();

      const results =
        await searchPlacesNow(
          location.trim()
        );

      if (
        results.length === 0
      ) {
        Alert.alert(
          "검색 결과 없음",
          "검색된 장소가 없습니다."
        );

        return;
      }

    } catch (error) {
      console.error(
        "장소 검색 실패:",
        error
      );

      Alert.alert(
        "장소 검색 실패",
        "장소를 검색하지 못했습니다."
      );
    }
  }

  function handleSelectPlace(
    place: PlaceResult
  ) {
    const shouldSave =
      pendingPlaceSelection;

    setLocation(
      place.name
    );

    setAddress(
      place.address
    );

    setLatitude(
      place.latitude
    );

    setLongitude(
      place.longitude
    );

    setPlaceId(
      place.id
    );

    setSelectedPlace(true);
    setLocationEdited(false);
    setPendingPlaceSelection(false);

    clearPlaceResults();

    if (shouldSave) {
      void handleUpdate(place);
    }
  }

  function handleDateChange(
    event: DateTimePickerEvent,
    selectedDate?: Date
  ) {
    if (
      Platform.OS ===
      "android"
    ) {
      setShowDatePicker(
        false
      );
    }

    if (
      event.type ===
      "dismissed"
    ) {
      return;
    }

    if (selectedDate) {
      setDate(
        selectedDate
      );
    }
  }

  function handleTimeChange(
    event: DateTimePickerEvent,
    selectedTime?: Date
  ) {
    if (
      Platform.OS ===
      "android"
    ) {
      setShowTimePicker(
        false
      );
    }

    if (
      event.type ===
      "dismissed"
    ) {
      return;
    }

    if (selectedTime) {
      setTime(
        selectedTime
      );
    }
  }

  async function persistUpdate(
    tripId: string,
    linkedPlace: StoredPlaceLink | null
  ) {
    if (!id) {
      return;
    }

    setSaving(true);

    try {
      await updateServerSchedule(
        id,
        {
          tripId,
          title:
            title.trim(),
          location:
            linkedPlace?.name ??
            location.trim(),
          address:
            linkedPlace?.address ||
            undefined,
          latitude:
            linkedPlace?.latitude,
          longitude:
            linkedPlace?.longitude,
          placeId:
            linkedPlace?.id,
          category,
          durationMinutes,
          date:
            formatDate(date),
          time:
            formatTime(time),
          memo:
            memo.trim(),
        }
      );

      Alert.alert(
        "완료",
        linkedPlace
          ? "일정과 장소 위치가 수정되었습니다."
          : "일정이 위치 미연결 상태로 수정되었습니다.",
        [
          {
            text: "확인",
            onPress: () =>
              router.back(),
          },
        ]
      );
    } catch (error) {
      console.error(
        "일정 수정 실패:",
        error
      );

      Alert.alert(
        "수정 실패",
        "일정을 수정하지 못했습니다."
      );
    } finally {
      setSaving(false);
    }
  }

  function offerUpdateWithoutLocation(
    message: string
  ) {
    Alert.alert(
      "위치 연결 안 함",
      message,
      [
        {
          text: "취소",
          style: "cancel",
        },
        {
          text: "위치 없이 저장",
          onPress: () =>
            void handleUpdate(null),
        },
      ]
    );
  }

  async function handleUpdate(
    placeOverride?: PlaceResult | null
  ) {
    if (!id) {
      return;
    }

    if (saving) {
      return;
    }

    if (
      !title.trim() ||
      !location.trim()
    ) {
      Alert.alert(
        "입력 확인",
        "일정 이름과 장소를 입력해주세요."
      );

      return;
    }

    const trip =
  await getCurrentTripWithRecovery();

if (!trip) {
  Alert.alert(
    "여행 정보 없음",
    "먼저 여행을 생성해주세요."
  );

  return;
}

if (!trip.id) {
  Alert.alert(
    "여행 정보 오류",
    "여행 ID가 없습니다."
  );

  return;
}

const tripStart =
  parseDate(
    trip.startDate
  );

    const tripEnd =
      parseDate(
        trip.endDate
      );

    const selectedDate =
      new Date(date);

    selectedDate.setHours(
      0,
      0,
      0,
      0
    );

    if (
      selectedDate <
        tripStart ||
      selectedDate >
        tripEnd
    ) {
      Alert.alert(
        "여행 기간 확인",
        `일정은 ${trip.startDate}부터 ${trip.endDate} 사이에만 설정할 수 있습니다.`
      );

      return;
    }

    if (placeOverride !== undefined) {
      await persistUpdate(
        trip.id,
        placeOverride
      );
      return;
    }

    if (
      matchesOriginalPlace &&
      originalPlace
    ) {
      await persistUpdate(
        trip.id,
        originalPlace
      );
      return;
    }

    const currentLocation = {
      latitude,
      longitude,
    };

    if (
      selectedPlace &&
      hasValidScheduleLocation(
        currentLocation
      )
    ) {
      await persistUpdate(
        trip.id,
        {
          id: placeId,
          name: location.trim(),
          address,
          latitude:
            currentLocation.latitude,
          longitude:
            currentLocation.longitude,
        }
      );
      return;
    }

    setSaving(true);

    const query = location.trim();

    try {
      const results =
        await searchPlacesNow(
          query
        );
      const confidentPlace =
        findConfidentPlaceMatch(
          query,
          results
        );

      if (confidentPlace) {
        await persistUpdate(
          trip.id,
          confidentPlace
        );
        return;
      }

      if (results.length > 0) {
        showPlaceResults(query, results);
        setPendingPlaceSelection(true);
        setSaving(false);
        return;
      }

      setSaving(false);
      offerUpdateWithoutLocation(
        "정확한 장소를 찾지 못했습니다. 입력한 장소명만 저장할 수 있습니다."
      );
    } catch (error) {
      console.error(
        "저장 전 장소 검색 실패:",
        error
      );

      setSaving(false);
      offerUpdateWithoutLocation(
        "장소 검색에 실패했습니다. 입력한 장소명만 저장할 수 있습니다."
      );
    }
  }

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent:
            "center",
          alignItems:
            "center",
          backgroundColor:
            "#F5F7FB",
        }}
      >
        <Text>
          서버에서 일정을 불러오는 중...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor:
          "#F5F7FB",
      }}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 70,
        paddingBottom: 70,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <Text
        style={{
          fontSize: 32,
          fontWeight: "bold",
          marginBottom: 30,
          color: "#111827",
        }}
      >
        일정 수정
      </Text>

      <AppInput
        placeholder="일정 이름"
        value={title}
        onChangeText={
          setTitle
        }
      />

      <Text
        style={{
          fontSize: 16,
          fontWeight: "bold",
          color: "#374151",
          marginBottom: 8,
        }}
      >
        장소
      </Text>

      <View
        style={{
          flexDirection: "row",
          gap: 8,
        }}
      >
        <TextInput
          value={location}
          onChangeText={
            handleLocationChange
          }
          placeholder="예: 센소지"
          placeholderTextColor="#9CA3AF"
          returnKeyType="search"
          onSubmitEditing={
            handlePlaceSearch
          }
          style={{
            flex: 1,
            backgroundColor:
              "white",
            color: "#111827",
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 13,
            fontSize: 16,
          }}
        />

        <Pressable
          onPress={
            handlePlaceSearch
          }
          disabled={
            searchingPlace
          }
          style={{
            paddingHorizontal: 18,
            borderRadius: 12,
            justifyContent:
              "center",

            backgroundColor:
              searchingPlace
                ? "#CBD5E1"
                : "#3B82F6",
          }}
        >
          {searchingPlace ? (
            <ActivityIndicator
              color="white"
            />
          ) : (
            <Text
              style={{
                color: "white",
                fontWeight: "bold",
              }}
            >
              {selectedPlace
                ? "다시 검색"
                : "위치 연결"}
            </Text>
          )}
        </Pressable>
      </View>

      {selectedPlace && (
        <View
          style={{
            marginTop: 10,
            padding: 12,
            borderRadius: 12,
            backgroundColor:
              "#ECFDF5",
          }}
        >
          <Text
            style={{
              color: "#059669",
              fontWeight: "bold",
            }}
          >
            ✓ 지도 위치 연결됨
          </Text>

          {address ? (
            <Text
              style={{
                marginTop: 5,
                color: "#4B5563",
                fontSize: 13,
                lineHeight: 18,
              }}
            >
              {address}
            </Text>
          ) : null}
        </View>
      )}

      {!selectedPlace && (
        <View
          style={{
            marginTop: 10,
            padding: 12,
            borderRadius: 12,
            backgroundColor:
              "#F3F4F6",
          }}
        >
          <Text
            style={{
              color: "#6B7280",
              fontWeight: "bold",
              fontSize: 13,
            }}
          >
            위치 미연결
          </Text>

          <Text
            style={{
              marginTop: 4,
              color: "#9CA3AF",
              fontSize: 12,
              lineHeight: 17,
            }}
          >
            장소를 검색해 선택하면 지도와 일정 날씨를 사용할 수 있습니다.
          </Text>
        </View>
      )}

      <PlaceCandidateList
        results={placeResults}
        pendingSelection={pendingPlaceSelection}
        onSelect={handleSelectPlace}
        onSaveWithoutLocation={() => void handleUpdate(null)}
      />

      <Text
        style={{
          marginTop: 20,
          fontSize: 16,
          fontWeight: "bold",
          color: "#374151",
          marginBottom: 10,
        }}
      >
        장소 종류
      </Text>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 22,
        }}
      >
        {categories.map(
          (item) => {
            const selected =
              category === item;

            return (
              <Pressable
                key={item}
                onPress={() =>
                  setCategory(
                    item
                  )
                }
                style={{
                  paddingHorizontal: 15,
                  paddingVertical: 10,
                  borderRadius: 20,

                  backgroundColor:
                    selected
                      ? "#3B82F6"
                      : "white",
                }}
              >
                <Text
                  style={{
                    color:
                      selected
                        ? "white"
                        : "#374151",

                    fontWeight:
                      "bold",
                  }}
                >
                  {item}
                </Text>
              </Pressable>
            );
          }
        )}
      </View>

      <Text
        style={{
          fontSize: 16,
          fontWeight: "bold",
          marginBottom: 10,
          color: "#374151",
        }}
      >
        예상 소요시간
      </Text>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 22,
        }}
      >
        {durations.map(
          (minutes) => (
            <Pressable
              key={minutes}
              onPress={() =>
                setDurationMinutes(
                  minutes
                )
              }
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 20,

                backgroundColor:
                  durationMinutes ===
                  minutes
                    ? "#3B82F6"
                    : "white",
              }}
            >
              <Text
                style={{
                  color:
                    durationMinutes ===
                    minutes
                      ? "white"
                      : "#374151",

                  fontWeight: "bold",
                }}
              >
                {minutes < 60
                  ? `${minutes}분`
                  : minutes % 60 ===
                    0
                  ? `${
                      minutes /
                      60
                    }시간`
                  : `${Math.floor(
                      minutes /
                        60
                    )}시간 ${
                      minutes %
                      60
                    }분`}
              </Text>
            </Pressable>
          )
        )}
      </View>

      <Text
        style={{
          fontSize: 15,
          fontWeight: "bold",
          color: "#374151",
          marginBottom: 8,
        }}
      >
        날짜
      </Text>

      <Pressable
        onPress={() =>
          setShowDatePicker(
            true
          )
        }
        style={{
          backgroundColor:
            "white",
          borderRadius: 12,
          padding: 15,
          marginBottom: 15,
        }}
      >
        <Text
          style={{
            color: "#111827",
            fontSize: 16,
          }}
        >
          📅 {formatDate(date)}
        </Text>
      </Pressable>

      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          display={
            Platform.OS ===
            "ios"
              ? "spinner"
              : "default"
          }
          themeVariant="light"
          textColor="#111827"
          onChange={
            handleDateChange
          }
        />
      )}

      <Text
        style={{
          fontSize: 15,
          fontWeight: "bold",
          color: "#374151",
          marginBottom: 8,
        }}
      >
        시간
      </Text>

      <Pressable
        onPress={() =>
          setShowTimePicker(
            true
          )
        }
        style={{
          backgroundColor:
            "white",
          borderRadius: 12,
          padding: 15,
          marginBottom: 15,
        }}
      >
        <Text
          style={{
            color: "#111827",
            fontSize: 16,
          }}
        >
          🕐 {formatTime(time)}
        </Text>
      </Pressable>

      {showTimePicker && (
        <DateTimePicker
          value={time}
          mode="time"
          is24Hour={true}
          display={
            Platform.OS ===
            "ios"
              ? "spinner"
              : "default"
          }
          themeVariant="light"
          textColor="#111827"
          onChange={
            handleTimeChange
          }
        />
      )}

      <Text
        style={{
          fontSize: 16,
          fontWeight: "bold",
          marginTop: 5,
          marginBottom: 8,
          color: "#374151",
        }}
      >
        메모
      </Text>

      <AppInput
        placeholder="예: 입장권 미리 구매"
        value={memo}
        onChangeText={
          setMemo
        }
      />

      <View
        style={{
          marginTop: 10,
        }}
      >
        <AppButton
          title={
            saving
              ? "위치 확인 중..."
              : "수정 내용 저장"
          }
          onPress={() =>
            void handleUpdate()
          }
        />
      </View>
    </ScrollView>
  );
}
