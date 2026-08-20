import {
    useCallback,
    useState,
} from "react";

import {
    Alert,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";

import {
    router,
    useFocusEffect,
} from "expo-router";

import {
    addPackingItem,
    deletePackingItem,
    getPackingItems,
    updatePackingItem,
} from "../../lib/storage";

import {
    PackingItem,
} from "../../types";

export default function PackingScreen() {
  const [
    items,
    setItems,
  ] = useState<PackingItem[]>([]);

  const [
    input,
    setInput,
  ] = useState("");

  const loadItems =
    useCallback(
      async () => {
        try {
          const data =
            await getPackingItems();

          setItems(data);
        } catch (error) {
          console.error(
            "준비물 불러오기 실패:",
            error
          );
        }
      },
      []
    );

  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [loadItems])
  );

  async function handleAdd() {
    const name =
      input.trim();

    if (!name) {
      return;
    }

    const newItem: PackingItem = {
      id:
        Date.now().toString(),

      name,

      checked: false,
    };

    try {
      await addPackingItem(
        newItem
      );

      setInput("");

      await loadItems();
    } catch (error) {
      console.error(
        "준비물 추가 실패:",
        error
      );

      Alert.alert(
        "오류",
        "준비물을 추가하지 못했습니다."
      );
    }
  }

  async function handleToggle(
    item: PackingItem
  ) {
    try {
      await updatePackingItem({
        ...item,
        checked:
          !item.checked,
      });

      await loadItems();
    } catch (error) {
      console.error(
        "준비물 상태 변경 실패:",
        error
      );
    }
  }

  function handleDelete(
    item: PackingItem
  ) {
    Alert.alert(
      "준비물 삭제",
      `"${item.name}"을 삭제할까요?`,
      [
        {
          text: "취소",
          style: "cancel",
        },
        {
          text: "삭제",
          style: "destructive",

          onPress: async () => {
            try {
              await deletePackingItem(
                item.id
              );

              await loadItems();
            } catch (error) {
              console.error(
                "준비물 삭제 실패:",
                error
              );
            }
          },
        },
      ]
    );
  }

  // 미완료 항목을 위,
  // 완료 항목을 아래로 자동 정렬
  const sortedItems = [
    ...items,
  ].sort((a, b) => {
    if (
      a.checked ===
      b.checked
    ) {
      return 0;
    }

    return a.checked
      ? 1
      : -1;
  });

  const uncheckedCount =
    sortedItems.filter(
      (item) =>
        !item.checked
    ).length;

  const checkedCount =
    sortedItems.filter(
      (item) =>
        item.checked
    ).length;

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor:
          "#F5F7FB",
      }}
      contentContainerStyle={{
        paddingTop: 65,
        paddingHorizontal: 20,
        paddingBottom: 80,
      }}
      keyboardShouldPersistTaps="handled"
    >
      {/* 상단 */}

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 26,
        }}
      >
        <Pressable
          onPress={() =>
            router.back()
          }
          style={{
            paddingVertical: 5,
            paddingRight: 12,
          }}
        >
          <Text
            style={{
              fontSize: 30,
              color: "#111827",
            }}
          >
            ‹
          </Text>
        </Pressable>

        <View>
          <Text
            style={{
              fontSize: 30,
              fontWeight: "bold",
              color: "#111827",
            }}
          >
            🎒 준비물
          </Text>

          <Text
            style={{
              marginTop: 3,
              fontSize: 14,
              color: "#6B7280",
            }}
          >
            필요한 것만 간단히 적어두세요.
          </Text>
        </View>
      </View>

      {/* 준비물 입력 */}

      <View
        style={{
          flexDirection: "row",
          gap: 8,
          marginBottom: 20,
        }}
      >
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="예: 여권, 충전기, 우산"
          placeholderTextColor="#9CA3AF"
          returnKeyType="done"
          onSubmitEditing={
            handleAdd
          }
          style={{
            flex: 1,
            backgroundColor: "white",
            borderRadius: 14,
            paddingHorizontal: 15,
            paddingVertical: 14,
            fontSize: 16,
            color: "#111827",
          }}
        />

        <Pressable
          onPress={handleAdd}
          style={{
            backgroundColor: "#3B82F6",
            borderRadius: 14,
            paddingHorizontal: 18,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: "white",
              fontSize: 16,
              fontWeight: "bold",
            }}
          >
            추가
          </Text>
        </Pressable>
      </View>

      {/* 준비물 목록 */}

      {sortedItems.length === 0 ? (
        <View
          style={{
            backgroundColor: "white",
            borderRadius: 16,
            paddingVertical: 38,
            paddingHorizontal: 20,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: 32,
            }}
          >
            🧳
          </Text>

          <Text
            style={{
              marginTop: 10,
              fontSize: 16,
              fontWeight: "bold",
              color: "#374151",
            }}
          >
            아직 적어둔 준비물이 없습니다
          </Text>
        </View>
      ) : (
        <View
          style={{
            backgroundColor: "white",
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          {sortedItems.map(
            (
              item,
              index
            ) => {
              // 미완료와 완료가 모두 있을 때만
              // 첫 번째 완료 항목 위에 구분선 표시
              const showDivider =
                uncheckedCount > 0 &&
                checkedCount > 0 &&
                index ===
                  uncheckedCount;

              return (
                <View
                  key={item.id}
                >
                  {showDivider && (
                    <View
                      style={{
                        height: 1,
                        backgroundColor:
                          "#D1D5DB",
                        marginHorizontal: 16,
                        marginVertical: 5,
                      }}
                    />
                  )}

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 16,
                      paddingVertical: 15,

                      borderBottomWidth:
                        index ===
                        sortedItems.length -
                          1
                          ? 0
                          : 1,

                      borderBottomColor:
                        "#F3F4F6",
                    }}
                  >
                    <Pressable
                      onPress={() =>
                        handleToggle(
                          item
                        )
                      }
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        flex: 1,
                      }}
                    >
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 6,

                          borderWidth:
                            item.checked
                              ? 0
                              : 2,

                          borderColor:
                            "#CBD5E1",

                          backgroundColor:
                            item.checked
                              ? "#3B82F6"
                              : "white",

                          justifyContent:
                            "center",

                          alignItems:
                            "center",
                        }}
                      >
                        {item.checked && (
                          <Text
                            style={{
                              color: "white",
                              fontWeight: "bold",
                              fontSize: 15,
                            }}
                          >
                            ✓
                          </Text>
                        )}
                      </View>

                      <Text
                        style={{
                          marginLeft: 13,
                          fontSize: 16,

                          color:
                            item.checked
                              ? "#9CA3AF"
                              : "#111827",

                          textDecorationLine:
                            item.checked
                              ? "line-through"
                              : "none",
                        }}
                      >
                        {item.name}
                      </Text>
                    </Pressable>

                    <Pressable
                      onPress={() =>
                        handleDelete(
                          item
                        )
                      }
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 5,
                      }}
                    >
                      <Text
                        style={{
                          color: "#EF4444",
                          fontSize: 13,
                          fontWeight: "bold",
                        }}
                      >
                        삭제
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            }
          )}
        </View>
      )}
    </ScrollView>
  );
}