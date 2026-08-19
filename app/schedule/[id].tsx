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

import {
  getTrip,
} from "../../lib/storage";

import {
  PlaceResult,
  searchPlaces,
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
    placeResults,
    setPlaceResults,
  ] =
    useState<PlaceResult[]>([]);

  const [
    searchingPlace,
    setSearchingPlace,
  ] =
    useState(false);

  const [
    selectedPlace,
    setSelectedPlace,
  ] =
    useState(false);

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
          Boolean(
            schedule.latitude !=
              null &&
              schedule.longitude !=
                null
          )
        );

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

    // 장소명을 직접 수정하면
    // 기존 좌표가 틀릴 수 있으므로 초기화
    setAddress("");
    setLatitude(undefined);
    setLongitude(undefined);
    setPlaceId(undefined);
    setSelectedPlace(false);
    setPlaceResults([]);
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
      setSearchingPlace(true);

      const trip =
        await getTrip();

      const query =
        trip?.city
          ? `${location.trim()} ${trip.city}`
          : location.trim();

      const results =
        await searchPlaces(
          query
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

      setPlaceResults(
        results
      );
    } catch (error) {
      console.error(
        "장소 검색 실패:",
        error
      );

      Alert.alert(
        "장소 검색 실패",
        "장소를 검색하지 못했습니다."
      );
    } finally {
      setSearchingPlace(false);
    }
  }

  function handleSelectPlace(
    place: PlaceResult
  ) {
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

    setPlaceResults([]);
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

  async function handleUpdate() {
    if (!id) {
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
      await getTrip();

    if (!trip) {
      Alert.alert(
        "여행 정보 없음",
        "먼저 여행을 생성해주세요."
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

    try {
      await updateServerSchedule(
        id,
        {
          tripId: trip.id,
          title:
            title.trim(),

          location:
            location.trim(),

          address:
            address ||
            undefined,

          latitude,

          longitude,

          placeId,

          category,

          durationMinutes,

          date:
            formatDate(
              date
            ),

          time:
            formatTime(
              time
            ),

          memo:
            memo.trim(),
        }
      );
      if (!trip.id) {
  Alert.alert(
    "여행 정보 오류",
    "여행 ID가 없습니다."
  );

  return;
}

      Alert.alert(
        "완료",
        "일정이 수정되었습니다.",
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
              검색
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

      {placeResults.length >
        0 && (
        <View
          style={{
            marginTop: 10,
            marginBottom: 18,
            backgroundColor:
              "white",
            borderRadius: 14,
            overflow:
              "hidden",
          }}
        >
          {placeResults.map(
            (
              place,
              index
            ) => (
              <Pressable
                key={
                  place.id ||
                  `${place.name}-${index}`
                }
                onPress={() =>
                  handleSelectPlace(
                    place
                  )
                }
                style={{
                  padding: 14,

                  borderBottomWidth:
                    index <
                    placeResults.length -
                      1
                      ? 1
                      : 0,

                  borderBottomColor:
                    "#E5E7EB",
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "bold",
                    color: "#111827",
                  }}
                >
                  {place.name}
                </Text>

                <Text
                  style={{
                    marginTop: 5,
                    color: "#6B7280",
                    fontSize: 13,
                  }}
                >
                  {place.address}
                </Text>
              </Pressable>
            )
          )}
        </View>
      )}

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
          title="수정 내용 저장"
          onPress={
            handleUpdate
          }
        />
      </View>
    </ScrollView>
  );
}