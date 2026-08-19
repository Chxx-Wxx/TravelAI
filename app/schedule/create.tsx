import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";

import { router } from "expo-router";

import {
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
  Schedule,
  ScheduleCategory,
} from "../../types";

import {
  PlaceResult,
  searchPlaces,
} from "../../services/place";

import {
  createSchedule,
} from "../../services/schedule";

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

export default function CreateScheduleScreen() {
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
    useState<
      number | undefined
    >(undefined);

  const [
    longitude,
    setLongitude,
  ] =
    useState<
      number | undefined
    >(undefined);

  const [
    placeId,
    setPlaceId,
  ] =
    useState<
      string | undefined
    >(undefined);

  const [
    placeResults,
    setPlaceResults,
  ] =
    useState<PlaceResult[]>(
      []
    );

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

  function parseDateString(
    value: string
  ) {
    const trimmed =
      value.trim();

    const [
      year,
      month,
      day,
    ] =
      trimmed
        .split("-")
        .map(Number);

    if (
      !year ||
      !month ||
      !day
    ) {
      return null;
    }

    const parsed =
      new Date(
        year,
        month - 1,
        day
      );

    parsed.setHours(
      0,
      0,
      0,
      0
    );

    return parsed;
  }

  async function handlePlaceSearch() {
    const query =
      location.trim();

    if (!query) {
      Alert.alert(
        "장소 검색",
        "검색할 장소를 입력해주세요."
      );

      return;
    }

    try {
      setSearchingPlace(
        true
      );

      setSelectedPlace(
        false
      );

      setPlaceResults(
        []
      );

      const trip =
        await getTrip();

      const fullQuery =
        trip?.city
          ? `${query} ${trip.city}`
          : query;

      const results =
        await searchPlaces(
          fullQuery
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
        "장소 검색 중 문제가 발생했습니다. 백엔드와 ngrok 연결을 확인해주세요."
      );
    } finally {
      setSearchingPlace(
        false
      );
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

    setSelectedPlace(
      true
    );

    setPlaceResults(
      []
    );
  }

  function handleLocationChange(
    text: string
  ) {
    setLocation(text);

    setSelectedPlace(
      false
    );

    setAddress("");

    setLatitude(
      undefined
    );

    setLongitude(
      undefined
    );

    setPlaceId(
      undefined
    );

    setPlaceResults(
      []
    );
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

  async function handleSave() {
    if (
      !title.trim() ||
      !location.trim()
    ) {
      Alert.alert(
        "알림",
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

    if (!trip.id) {
      Alert.alert(
        "여행 정보 오류",
        "여행 ID가 없습니다. 여행을 다시 생성해주세요."
      );

      return;
    }

    const tripStart =
      parseDateString(
        trip.startDate
      );

    const tripEnd =
      parseDateString(
        trip.endDate
      );

    if (
      !tripStart ||
      !tripEnd
    ) {
      Alert.alert(
        "여행 날짜 오류",
        "여행 시작일 또는 종료일을 확인해주세요."
      );

      return;
    }

    const selectedDateObject =
      new Date(date);

    selectedDateObject.setHours(
      0,
      0,
      0,
      0
    );

    if (
      selectedDateObject <
        tripStart ||
      selectedDateObject >
        tripEnd
    ) {
      Alert.alert(
        "여행 기간 확인",
        `일정은 ${trip.startDate}부터 ${trip.endDate} 사이에만 추가할 수 있습니다.`
      );

      return;
    }

    const newSchedule: Schedule = {
      id:
        Date.now().toString(),

      tripId:
        trip.id,

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

      date:
        formatDate(
          date
        ),

      time:
        formatTime(
          time
        ),

      category,

      durationMinutes,

      memo:
        memo.trim(),
    };

    try {
      await createSchedule({
        tripId:
          trip.id,

        title:
          newSchedule.title,

        location:
          newSchedule.location,

        address:
          newSchedule.address,

        latitude:
          newSchedule.latitude,

        longitude:
          newSchedule.longitude,

        placeId:
          newSchedule.placeId,

        category:
          newSchedule.category,

        durationMinutes:
          newSchedule.durationMinutes,

        date:
          newSchedule.date,

        time:
          newSchedule.time,

        memo:
          newSchedule.memo,
      });

      Alert.alert(
        "완료",
        selectedPlace
          ? "장소 위치와 함께 일정이 저장되었습니다."
          : "일정이 저장되었습니다. 장소는 직접 입력된 값으로 저장되었습니다.",
        [
          {
            text: "확인",

            onPress: () =>
              router.replace(
                "/schedule"
              ),
          },
        ]
      );
    } catch (error) {
      console.error(
        "일정 저장 실패:",
        error
      );

      Alert.alert(
        "일정 저장 실패",
        "서버에 일정을 저장하지 못했습니다."
      );
    }
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
        일정 추가
      </Text>

      <AppInput
        placeholder="일정 이름 (예: 센소지 관광)"
        value={title}
        onChangeText={
          setTitle
        }
      />

      <Text
        style={{
          fontSize: 16,
          fontWeight: "bold",
          marginBottom: 8,
          color: "#374151",
        }}
      >
        장소 검색
      </Text>

      <View
        style={{
          flexDirection:
            "row",
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
                    lineHeight: 18,
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
          fontSize: 16,
          fontWeight: "bold",
          marginTop: 20,
          marginBottom: 10,
          color: "#374151",
        }}
      >
        장소 종류
      </Text>

      <View
        style={{
          flexDirection:
            "row",
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
          flexDirection:
            "row",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 22,
        }}
      >
        {durations.map(
          (minutes) => {
            const selected =
              durationMinutes ===
              minutes;

            return (
              <Pressable
                key={
                  minutes
                }
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
                  {minutes < 60
                    ? `${minutes}분`
                    : minutes %
                          60 ===
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
            );
          }
        )}
      </View>

      <Text
        style={{
          fontSize: 15,
          fontWeight: "bold",
          marginBottom: 8,
          color: "#374151",
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
            fontSize: 16,
            color: "#111827",
          }}
        >
          📅 {formatDate(
            date
          )}
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

      {Platform.OS ===
        "ios" &&
        showDatePicker && (
          <Pressable
            onPress={() =>
              setShowDatePicker(
                false
              )
            }
            style={{
              alignSelf:
                "flex-end",
              marginBottom: 15,
            }}
          >
            <Text
              style={{
                color: "#2563EB",
                fontWeight: "bold",
              }}
            >
              날짜 선택 완료
            </Text>
          </Pressable>
        )}

      <Text
        style={{
          fontSize: 15,
          fontWeight: "bold",
          marginBottom: 8,
          color: "#374151",
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
            fontSize: 16,
            color: "#111827",
          }}
        >
          🕐 {formatTime(
            time
          )}
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

      {Platform.OS ===
        "ios" &&
        showTimePicker && (
          <Pressable
            onPress={() =>
              setShowTimePicker(
                false
              )
            }
            style={{
              alignSelf:
                "flex-end",
              marginBottom: 15,
            }}
          >
            <Text
              style={{
                color: "#2563EB",
                fontWeight: "bold",
              }}
            >
              시간 선택 완료
            </Text>
          </Pressable>
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
        placeholder="예: 입장권 미리 구매, 사진 찍기"
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
          title="일정 저장"
          onPress={
            handleSave
          }
        />
      </View>
    </ScrollView>
  );
}