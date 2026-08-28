import { useState } from "react";

import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";

import { router } from "expo-router";

import AppButton from "../../components/AppButton";
import AppInput from "../../components/AppInput";

import {
  saveCurrentMemberId,
  saveTrip,
} from "../../lib/storage";

import {
  createTrip,
} from "../../services/trip";

import {
  getCurrentUser,
} from "../../services/current-user";

import {
  LegacyTripMember,
  Trip,
} from "../../types";

export default function CreateTripScreen() {
  const [
    tripName,
    setTripName,
  ] = useState("");

  const [
    country,
    setCountry,
  ] = useState("");

  const [
    city,
    setCity,
  ] = useState("");

  const [
    startDate,
    setStartDate,
  ] =
    useState(
      new Date()
    );

  const tomorrow =
    new Date();

  tomorrow.setDate(
    tomorrow.getDate() + 1
  );

  const [
    endDate,
    setEndDate,
  ] =
    useState(
      tomorrow
    );

  const [
    showStartPicker,
    setShowStartPicker,
  ] =
    useState(false);

  const [
    showEndPicker,
    setShowEndPicker,
  ] =
    useState(false);

  const [
    peopleCount,
    setPeopleCount,
  ] =
    useState(2);

  const [
    memberNames,
    setMemberNames,
  ] =
    useState<string[]>(
      [
        "",
        "친구 1",
      ]
    );

  function formatDate(
    value: Date
  ) {
    const year =
      value.getFullYear();

    const month =
      String(
        value.getMonth() + 1
      ).padStart(
        2,
        "0"
      );

    const day =
      String(
        value.getDate()
      ).padStart(
        2,
        "0"
      );

    return `${year}-${month}-${day}`;
  }

  function updatePeopleCount(
    nextCount: number
  ) {
    if (
      nextCount < 1
    ) {
      return;
    }

    if (
      nextCount > 10
    ) {
      Alert.alert(
        "인원 확인",
        "현재는 최대 10명까지 등록할 수 있습니다."
      );

      return;
    }

    setPeopleCount(
      nextCount
    );

    setMemberNames(
      (current) => {
        if (
          nextCount >
          current.length
        ) {
          const newNames =
            [
              ...current,
            ];

          for (
            let i =
              current.length;
            i <
            nextCount;
            i++
          ) {
            newNames.push(
              `친구 ${i}`
            );
          }

          return newNames;
        }

        return current.slice(
          0,
          nextCount
        );
      }
    );
  }

  function updateMemberName(
    index: number,
    name: string
  ) {
    setMemberNames(
      (current) => {
        const updated =
          [
            ...current,
          ];

        updated[index] =
          name;

        return updated;
      }
    );
  }

  function handleStartDateChange(
    event:
      DateTimePickerEvent,
    selectedDate?: Date
  ) {
    if (
      Platform.OS ===
      "android"
    ) {
      setShowStartPicker(
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
      setStartDate(
        selectedDate
      );

      if (
        selectedDate >
        endDate
      ) {
        setEndDate(
          selectedDate
        );
      }
    }
  }

  function handleEndDateChange(
    event:
      DateTimePickerEvent,
    selectedDate?: Date
  ) {
    if (
      Platform.OS ===
      "android"
    ) {
      setShowEndPicker(
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
      setEndDate(
        selectedDate
      );
    }
  }

  async function handleSave() {
    if (
      !tripName.trim() ||
      !country.trim() ||
      !city.trim()
    ) {
      Alert.alert(
        "입력 확인",
        "여행 이름, 국가, 도시를 모두 입력해주세요."
      );

      return;
    }

    if (
      endDate <
      startDate
    ) {
      Alert.alert(
        "날짜 확인",
        "종료일은 시작일보다 빠를 수 없습니다."
      );

      return;
    }

    const hasEmptyMember =
      memberNames.some(
        (name) =>
          !name.trim()
      );

    if (
      hasEmptyMember
    ) {
      Alert.alert(
        "동행자 확인",
        "모든 동행자의 이름을 입력해주세요."
      );

      return;
    }

    const members:
      LegacyTripMember[] =
        memberNames.map(
          (name) => ({
            name:
              name.trim(),
          })
        );

    const trip: Trip = {
      tripName:
        tripName.trim(),

      country:
        country.trim(),

      city:
        city.trim(),

      startDate:
        formatDate(
          startDate
        ),

      endDate:
        formatDate(
          endDate
        ),

      people:
        peopleCount.toString(),

      members,
    };

    try {
      const currentUser =
        await getCurrentUser();

      // 1. Express 서버에 여행 저장
      const savedTrip =
        await createTrip(
          {
            ...trip,
            ownerUserId:
              currentUser.id,
          }
        );

      // 2. 서버에서 생성된 id까지 포함해서
      // 기존 화면들이 쓰는 AsyncStorage에도 저장
      await saveTrip(
        savedTrip
      );

      const owner =
        savedTrip.tripMembers?.find(
          (member) =>
            member.userId ===
              currentUser.id &&
            member.role === "owner" &&
            member.status !== "removed"
        );

      if (savedTrip.id && owner) {
        await saveCurrentMemberId(
          savedTrip.id,
          owner.id
        );
      }

      Alert.alert(
        "완료",
        "여행이 저장되었습니다.",
        [
          {
            text:
              "확인",

            onPress:
              () =>
                router.replace(
                  "/"
                ),
          },
        ]
      );
    } catch (error) {
      console.error(
        "여행 저장 실패:",
        error
      );

      Alert.alert(
        "여행 저장 실패",
        "서버에 여행을 저장하지 못했습니다. 백엔드와 ngrok 연결을 확인해주세요."
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
    >
      <Text
        style={{
          fontSize: 32,
          fontWeight:
            "bold",
          color:
            "#111827",
          marginBottom: 30,
        }}
      >
        ✈️ 여행 만들기
      </Text>

      <AppInput
        placeholder="여행 이름 (예: 도쿄 여행)"
        value={tripName}
        onChangeText={
          setTripName
        }
      />

      <AppInput
        placeholder="국가 (예: 일본)"
        value={country}
        onChangeText={
          setCountry
        }
      />

      <AppInput
        placeholder="도시 (예: 도쿄)"
        value={city}
        onChangeText={
          setCity
        }
      />

      <Text
        style={{
          marginTop: 8,
          marginBottom: 8,
          fontSize: 16,
          fontWeight:
            "bold",
          color:
            "#374151",
        }}
      >
        여행 시작일
      </Text>

      <Pressable
        onPress={() =>
          setShowStartPicker(
            true
          )
        }
        style={{
          backgroundColor:
            "white",
          borderRadius: 12,
          padding: 15,
          marginBottom: 12,
        }}
      >
        <Text
          style={{
            color:
              "#111827",
            fontSize: 16,
          }}
        >
          📅{" "}
          {formatDate(
            startDate
          )}
        </Text>
      </Pressable>

      {showStartPicker && (
        <DateTimePicker
          value={
            startDate
          }
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
            handleStartDateChange
          }
        />
      )}

      {Platform.OS ===
        "ios" &&
        showStartPicker && (
          <Pressable
            onPress={() =>
              setShowStartPicker(
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
                color:
                  "#2563EB",
                fontWeight:
                  "bold",
              }}
            >
              시작일 선택 완료
            </Text>
          </Pressable>
        )}

      <Text
        style={{
          marginTop: 8,
          marginBottom: 8,
          fontSize: 16,
          fontWeight:
            "bold",
          color:
            "#374151",
        }}
      >
        여행 종료일
      </Text>

      <Pressable
        onPress={() =>
          setShowEndPicker(
            true
          )
        }
        style={{
          backgroundColor:
            "white",
          borderRadius: 12,
          padding: 15,
          marginBottom: 12,
        }}
      >
        <Text
          style={{
            color:
              "#111827",
            fontSize: 16,
          }}
        >
          📅{" "}
          {formatDate(
            endDate
          )}
        </Text>
      </Pressable>

      {showEndPicker && (
        <DateTimePicker
          value={
            endDate
          }
          mode="date"
          minimumDate={
            startDate
          }
          display={
            Platform.OS ===
            "ios"
              ? "spinner"
              : "default"
          }
          themeVariant="light"
          textColor="#111827"
          onChange={
            handleEndDateChange
          }
        />
      )}

      {Platform.OS ===
        "ios" &&
        showEndPicker && (
          <Pressable
            onPress={() =>
              setShowEndPicker(
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
                color:
                  "#2563EB",
                fontWeight:
                  "bold",
              }}
            >
              종료일 선택 완료
            </Text>
          </Pressable>
        )}

      <View
        style={{
          marginTop: 18,
          backgroundColor:
            "white",
          borderRadius: 16,
          padding: 18,
        }}
      >
        <Text
          style={{
            fontSize: 18,
            fontWeight:
              "bold",
            color:
              "#111827",
          }}
        >
          여행 인원
        </Text>

        <View
          style={{
            flexDirection:
              "row",
            alignItems:
              "center",
            marginTop: 16,
          }}
        >
          <Pressable
            onPress={() =>
              updatePeopleCount(
                peopleCount -
                  1
              )
            }
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor:
                "#F3F4F6",
              justifyContent:
                "center",
              alignItems:
                "center",
            }}
          >
            <Text
              style={{
                fontSize: 24,
                fontWeight:
                  "bold",
                color:
                  "#374151",
              }}
            >
              −
            </Text>
          </Pressable>

          <Text
            style={{
              marginHorizontal: 22,
              fontSize: 22,
              fontWeight:
                "bold",
              color:
                "#111827",
            }}
          >
            {peopleCount}명
          </Text>

          <Pressable
            onPress={() =>
              updatePeopleCount(
                peopleCount +
                  1
              )
            }
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor:
                "#3B82F6",
              justifyContent:
                "center",
              alignItems:
                "center",
            }}
          >
            <Text
              style={{
                fontSize: 24,
                fontWeight:
                  "bold",
                color:
                  "white",
              }}
            >
              +
            </Text>
          </Pressable>
        </View>
      </View>

      <View
        style={{
          marginTop: 18,
          backgroundColor:
            "white",
          borderRadius: 16,
          padding: 18,
        }}
      >
        <Text
          style={{
            fontSize: 18,
            fontWeight:
              "bold",
            color:
              "#111827",
          }}
        >
          동행자
        </Text>

        <Text
          style={{
            marginTop: 5,
            marginBottom: 14,
            color:
              "#6B7280",
            fontSize: 13,
          }}
        >
          지출 정산에서 이 이름을 그대로 사용합니다.
        </Text>

        {memberNames.map(
          (
            name,
            index
          ) => (
            <View
              key={
                index
              }
              style={{
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  marginBottom: 6,
                  color:
                    "#6B7280",
                  fontSize: 13,
                  fontWeight:
                    "bold",
                }}
              >
                {index ===
                0
                  ? "나"
                  : `동행자 ${index}`}
              </Text>

              <TextInput
                value={
                  name
                }
                onChangeText={(
                  text
                ) =>
                  updateMemberName(
                    index,
                    text
                  )
                }
                placeholder={
                  index ===
                  0
                    ? "내 이름"
                    : `동행자 ${index} 이름`
                }
                placeholderTextColor="#9CA3AF"
                style={{
                  backgroundColor:
                    "#F9FAFB",
                  color:
                    "#111827",
                  borderRadius: 12,
                  padding: 14,
                  fontSize: 16,
                }}
              />
            </View>
          )
        )}
      </View>

      <View
        style={{
          marginTop: 22,
        }}
      >
        <AppButton
          title="여행 저장"
          onPress={
            handleSave
          }
        />
      </View>
    </ScrollView>
  );
}
