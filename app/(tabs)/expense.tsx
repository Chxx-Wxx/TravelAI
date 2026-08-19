import {
  useCallback,
  useMemo,
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

import { useFocusEffect } from "expo-router";

import {
  deleteExpense,
  getExpenseSettings,
  getExpenses,
  getTrip,
  saveExpenseSettings,
  saveExpenses,
} from "../../lib/storage";

import {
  CurrencyCode,
  Expense,
  ExpenseCategory,
  ExpenseSettings,
  ExpenseType,
  Trip,
} from "../../types";

const categories: ExpenseCategory[] = [
  "식비",
  "교통",
  "쇼핑",
  "관광",
  "숙소",
  "기타",
];

const currencies: CurrencyCode[] = [
  "JPY",
  "KRW",
  "USD",
  "EUR",
];

const defaultRates = {
  KRW: 1,
  JPY: 9,
  USD: 1400,
  EUR: 1600,
};

export default function ExpenseScreen() {
  const [trip, setTrip] =
    useState<Trip | null>(null);

  const [expenses, setExpenses] =
    useState<Expense[]>([]);

  const [budget, setBudget] =
    useState("");

  const [amount, setAmount] =
    useState("");

  const [memo, setMemo] =
    useState("");

  const [category, setCategory] =
    useState<ExpenseCategory>("식비");

  const [currency, setCurrency] =
    useState<CurrencyCode>("JPY");

  const [exchangeRates, setExchangeRates] =
    useState(defaultRates);

  const [rateInput, setRateInput] =
    useState("900");

  const [expenseType, setExpenseType] =
    useState<ExpenseType>("personal");

  const [payer, setPayer] =
    useState("나");

  const [participants, setParticipants] =
    useState<string[]>(["나"]);

  const [lender, setLender] =
    useState("나");

  const [borrower, setBorrower] =
    useState("");

  function getTripMembers(
    tripData: Trip | null
  ) {
    if (!tripData) {
      return ["나"];
    }

    if (
      tripData.members &&
      tripData.members.length > 0
    ) {
      return tripData.members.map(
        (member) => member.name
      );
    }

    const peopleCount =
      Number(tripData.people) || 1;

    const names = ["나"];

    for (
      let i = 1;
      i < peopleCount;
      i++
    ) {
      names.push(`친구 ${i}`);
    }

    return names;
  }

  const memberNames =
    useMemo(() => {
      return getTripMembers(trip);
    }, [trip]);

  function getDefaultCurrency(
    country?: string
  ): CurrencyCode {
    const value =
      country?.toLowerCase() ?? "";

    if (
      value.includes("일본") ||
      value.includes("japan")
    ) {
      return "JPY";
    }

    if (
      value.includes("한국") ||
      value.includes("korea")
    ) {
      return "KRW";
    }

    if (
      value.includes("미국") ||
      value.includes("usa") ||
      value.includes("united states")
    ) {
      return "USD";
    }

    return "JPY";
  }

  function getRateDisplayValue(
    selectedCurrency: CurrencyCode,
    rates: typeof defaultRates
  ) {
    if (selectedCurrency === "JPY") {
      return String(
        Math.round(rates.JPY * 100)
      );
    }

    return String(
      Math.round(
        rates[selectedCurrency]
      )
    );
  }

  const loadData = useCallback(
    async () => {
      const tripData =
        await getTrip();

      const expenseData =
        await getExpenses();

      const savedSettings =
        await getExpenseSettings();

      setTrip(tripData);

      const members =
        getTripMembers(tripData);

      setPayer((current) =>
        members.includes(current)
          ? current
          : members[0]
      );

      setLender((current) =>
        members.includes(current)
          ? current
          : members[0]
      );

      setBorrower((current) => {
        if (
          current &&
          members.includes(current)
        ) {
          return current;
        }

        return (
          members.find(
            (name) =>
              name !== members[0]
          ) ?? members[0]
        );
      });

      setParticipants((current) => {
        const valid =
          current.filter(
            (name) =>
              members.includes(name)
          );

        return valid.length > 0
          ? valid
          : members;
      });

      const sorted = [
        ...expenseData,
      ].sort((a, b) =>
        `${b.date}`.localeCompare(
          `${a.date}`
        )
      );

      setExpenses(sorted);

      if (savedSettings) {
        setBudget(
          savedSettings.budgetKrw
            ? String(
                savedSettings.budgetKrw
              )
            : ""
        );

        setCurrency(
          savedSettings.defaultCurrency
        );

        setExchangeRates(
          savedSettings.exchangeRates
        );

        setRateInput(
          getRateDisplayValue(
            savedSettings.defaultCurrency,
            savedSettings.exchangeRates
          )
        );
      } else {
        const defaultCurrency =
          getDefaultCurrency(
            tripData?.country
          );

        setCurrency(
          defaultCurrency
        );

        setRateInput(
          getRateDisplayValue(
            defaultCurrency,
            defaultRates
          )
        );
      }
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // 돈 빌려주기는 실제 여행 지출에서 제외
  const totalExpenseKrw =
    useMemo(() => {
      return expenses.reduce(
        (sum, expense) => {
          if (
            expense.expenseType ===
            "loan"
          ) {
            return sum;
          }

          return (
            sum +
            (expense.krwAmount ?? 0)
          );
        },
        0
      );
    }, [expenses]);

  const budgetNumber =
    Number(
      budget.replace(/,/g, "")
    ) || 0;

  const remaining =
    budgetNumber -
    totalExpenseKrw;

  function formatMoney(
    value: number
  ) {
    return Math.round(
      value
    ).toLocaleString();
  }

  function currencySymbol(
    code: CurrencyCode
  ) {
    if (code === "JPY") {
      return "¥";
    }

    if (code === "USD") {
      return "$";
    }

    if (code === "EUR") {
      return "€";
    }

    return "₩";
  }

  function getTodayString() {
    const now = new Date();

    const year =
      now.getFullYear();

    const month = String(
      now.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
      now.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function calculateRate(
    selectedCurrency: CurrencyCode
  ) {
    if (
      selectedCurrency === "KRW"
    ) {
      return 1;
    }

    const input =
      Number(
        rateInput.replace(
          /,/g,
          ""
        )
      );

    if (!input) {
      return 0;
    }

    if (
      selectedCurrency === "JPY"
    ) {
      return input / 100;
    }

    return input;
  }

  async function saveSettings(
    newCurrency = currency,
    newRates = exchangeRates
  ) {
    const settings: ExpenseSettings = {
      budgetKrw:
        Number(
          budget.replace(
            /,/g,
            ""
          )
        ) || 0,

      defaultCurrency:
        newCurrency,

      exchangeRates:
        newRates,
    };

    await saveExpenseSettings(
      settings
    );
  }

  async function handleBudgetSave() {
    await saveSettings();

    Alert.alert(
      "저장 완료",
      "여행 예산이 저장되었습니다."
    );
  }

  async function handleCurrencyChange(
    selectedCurrency: CurrencyCode
  ) {
    setCurrency(
      selectedCurrency
    );

    setRateInput(
      getRateDisplayValue(
        selectedCurrency,
        exchangeRates
      )
    );

    await saveSettings(
      selectedCurrency,
      exchangeRates
    );
  }

  async function handleRateSave() {
    const calculatedRate =
      calculateRate(currency);

    if (
      !calculatedRate ||
      calculatedRate <= 0
    ) {
      Alert.alert(
        "환율 확인",
        "올바른 환율을 입력해주세요."
      );

      return;
    }

    const newRates = {
      ...exchangeRates,
      [currency]:
        calculatedRate,
    };

    setExchangeRates(
      newRates
    );

    await saveSettings(
      currency,
      newRates
    );

    Alert.alert(
      "환율 저장",
      "현재 환율을 저장했습니다."
    );
  }

  const previewKrw =
    useMemo(() => {
      const localAmount =
        Number(
          amount.replace(
            /,/g,
            ""
          )
        );

      const rate =
        calculateRate(currency);

      if (
        !localAmount ||
        !rate
      ) {
        return 0;
      }

      return (
        localAmount *
        rate
      );
    }, [
      amount,
      currency,
      rateInput,
    ]);

  const perPersonLocal =
    useMemo(() => {
      if (
        expenseType !== "shared"
      ) {
        return 0;
      }

      const localAmount =
        Number(
          amount.replace(
            /,/g,
            ""
          )
        );

      if (
        !localAmount ||
        participants.length === 0
      ) {
        return 0;
      }

      return (
        localAmount /
        participants.length
      );
    }, [
      amount,
      participants,
      expenseType,
    ]);

  function toggleParticipant(
    name: string
  ) {
    setParticipants(
      (current) => {
        if (
          current.includes(name)
        ) {
          if (
            current.length === 1
          ) {
            return current;
          }

          return current.filter(
            (item) =>
              item !== name
          );
        }

        return [
          ...current,
          name,
        ];
      }
    );
  }

  async function handleAddExpense() {
    const localAmount =
      Number(
        amount.replace(
          /,/g,
          ""
        )
      );

    if (
      !localAmount ||
      localAmount <= 0
    ) {
      Alert.alert(
        "금액 확인",
        "올바른 금액을 입력해주세요."
      );

      return;
    }

    const rate =
      calculateRate(currency);

    if (
      !rate ||
      rate <= 0
    ) {
      Alert.alert(
        "환율 확인",
        "먼저 환율을 확인해주세요."
      );

      return;
    }

    if (
      expenseType === "shared" &&
      participants.length === 0
    ) {
      Alert.alert(
        "참여자 확인",
        "공동 지출 참여자를 선택해주세요."
      );

      return;
    }

    if (
      expenseType === "loan" &&
      lender === borrower
    ) {
      Alert.alert(
        "대여 정보 확인",
        "빌려준 사람과 빌린 사람은 달라야 합니다."
      );

      return;
    }

    const krwAmount =
      Math.round(
        localAmount * rate
      );

    const newExpense: Expense = {
      id:
        Date.now().toString(),

      localAmount,

      currency,

      exchangeRate: rate,

      krwAmount,

      category,

      date:
        getTodayString(),

      memo:
        memo.trim(),

      expenseType,

      payer:
        expenseType ===
        "shared"
          ? payer
          : undefined,

      participants:
        expenseType ===
        "shared"
          ? participants
          : undefined,

      lender:
        expenseType ===
        "loan"
          ? lender
          : undefined,

      borrower:
        expenseType ===
        "loan"
          ? borrower
          : undefined,
    };

    const current =
      await getExpenses();

    await saveExpenses([
      ...current,
      newExpense,
    ]);

    setAmount("");
    setMemo("");

    await loadData();
  }

  function handleDelete(
    expense: Expense
  ) {
    Alert.alert(
      "기록 삭제",
      `${currencySymbol(
        expense.currency
      )}${formatMoney(
        expense.localAmount
      )} 기록을 삭제할까요?`,
      [
        {
          text: "취소",
          style: "cancel",
        },

        {
          text: "삭제",
          style: "destructive",

          onPress:
            async () => {
              await deleteExpense(
                expense.id
              );

              await loadData();
            },
        },
      ]
    );
  }

  function rateLabel() {
    if (currency === "JPY") {
      return "100 JPY = 몇 원?";
    }

    if (currency === "USD") {
      return "1 USD = 몇 원?";
    }

    if (currency === "EUR") {
      return "1 EUR = 몇 원?";
    }

    return "KRW";
  }

  // 공동 지출 + 빌려준 돈을 모두 합친 최종 정산
  const settlements =
    useMemo(() => {
      const balances: Record<
        string,
        number
      > = {};

      memberNames.forEach(
        (name) => {
          balances[name] = 0;
        }
      );

      expenses.forEach(
        (expense) => {
          // 공동지출
          if (
            expense.expenseType ===
              "shared" &&
            expense.payer &&
            expense.participants &&
            expense.participants
              .length > 0
          ) {
            const share =
              expense.krwAmount /
              expense.participants
                .length;

            if (
              balances[
                expense.payer
              ] === undefined
            ) {
              balances[
                expense.payer
              ] = 0;
            }

            balances[
              expense.payer
            ] +=
              expense.krwAmount;

            expense.participants.forEach(
              (name) => {
                if (
                  balances[name] ===
                  undefined
                ) {
                  balances[name] = 0;
                }

                balances[name] -=
                  share;
              }
            );
          }

          // 빌려준 돈
          if (
            expense.expenseType ===
              "loan" &&
            expense.lender &&
            expense.borrower
          ) {
            if (
              balances[
                expense.lender
              ] === undefined
            ) {
              balances[
                expense.lender
              ] = 0;
            }

            if (
              balances[
                expense.borrower
              ] === undefined
            ) {
              balances[
                expense.borrower
              ] = 0;
            }

            // lender는 받을 돈 증가
            balances[
              expense.lender
            ] +=
              expense.krwAmount;

            // borrower는 갚을 돈 증가
            balances[
              expense.borrower
            ] -=
              expense.krwAmount;
          }
        }
      );

      const creditors =
        Object.entries(
          balances
        )
          .filter(
            ([, balance]) =>
              balance > 1
          )
          .map(
            ([
              name,
              balance,
            ]) => ({
              name,
              amount:
                balance,
            })
          );

      const debtors =
        Object.entries(
          balances
        )
          .filter(
            ([, balance]) =>
              balance < -1
          )
          .map(
            ([
              name,
              balance,
            ]) => ({
              name,
              amount:
                -balance,
            })
          );

      const result: {
        from: string;
        to: string;
        amount: number;
      }[] = [];

      let creditorIndex = 0;
      let debtorIndex = 0;

      while (
        creditorIndex <
          creditors.length &&
        debtorIndex <
          debtors.length
      ) {
        const creditor =
          creditors[
            creditorIndex
          ];

        const debtor =
          debtors[
            debtorIndex
          ];

        const payment =
          Math.min(
            creditor.amount,
            debtor.amount
          );

        if (
          payment > 1
        ) {
          result.push({
            from:
              debtor.name,

            to:
              creditor.name,

            amount:
              payment,
          });
        }

        creditor.amount -=
          payment;

        debtor.amount -=
          payment;

        if (
          creditor.amount < 1
        ) {
          creditorIndex++;
        }

        if (
          debtor.amount < 1
        ) {
          debtorIndex++;
        }
      }

      return result;
    }, [
      expenses,
      memberNames,
    ]);

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor:
          "#F5F7FB",
      }}
      contentContainerStyle={{
        paddingTop: 70,
        paddingHorizontal: 20,
        paddingBottom: 120,
      }}
    >
      <Text
        style={{
          fontSize: 32,
          fontWeight: "bold",
          color: "#111827",
        }}
      >
        지출
      </Text>

      {trip && (
        <Text
          style={{
            marginTop: 8,
            color: "#6B7280",
          }}
        >
          {trip.tripName}
        </Text>
      )}

      {/* 예산 */}
      <View
        style={{
          marginTop: 24,
          backgroundColor:
            "white",
          borderRadius: 18,
          padding: 18,
        }}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: "bold",
            color: "#374151",
          }}
        >
          여행 총예산 (원화)
        </Text>

        <TextInput
          value={budget}
          onChangeText={setBudget}
          placeholder="예: 1000000"
          placeholderTextColor="#9CA3AF"
          keyboardType="numeric"
          style={{
            marginTop: 10,
            backgroundColor:
              "#F9FAFB",
            color: "#111827",
            borderRadius: 12,
            padding: 14,
            fontSize: 18,
          }}
        />

        <Pressable
          onPress={
            handleBudgetSave
          }
          style={{
            marginTop: 10,
            backgroundColor:
              "#111827",
            borderRadius: 10,
            paddingVertical: 10,
            alignItems:
              "center",
          }}
        >
          <Text
            style={{
              color: "white",
              fontWeight: "bold",
            }}
          >
            예산 저장
          </Text>
        </Pressable>

        <View
          style={{
            flexDirection: "row",
            gap: 10,
            marginTop: 18,
          }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor:
                "#EFF6FF",
              borderRadius: 14,
              padding: 14,
            }}
          >
            <Text
              style={{
                color: "#6B7280",
                fontSize: 13,
              }}
            >
              총 지출
            </Text>

            <Text
              style={{
                marginTop: 5,
                fontSize: 19,
                fontWeight: "bold",
                color: "#2563EB",
              }}
            >
              ₩
              {formatMoney(
                totalExpenseKrw
              )}
            </Text>
          </View>

          <View
            style={{
              flex: 1,
              backgroundColor:
                "#ECFDF5",
              borderRadius: 14,
              padding: 14,
            }}
          >
            <Text
              style={{
                color: "#6B7280",
                fontSize: 13,
              }}
            >
              남은 예산
            </Text>

            <Text
              style={{
                marginTop: 5,
                fontSize: 19,
                fontWeight: "bold",
                color:
                  remaining < 0
                    ? "#DC2626"
                    : "#059669",
              }}
            >
              ₩
              {formatMoney(
                remaining
              )}
            </Text>
          </View>
        </View>
      </View>

      {/* 환율 */}
      <View
        style={{
          marginTop: 22,
          backgroundColor:
            "white",
          borderRadius: 18,
          padding: 18,
        }}
      >
        <Text
          style={{
            fontSize: 20,
            fontWeight: "bold",
            color: "#111827",
          }}
        >
          결제 통화 / 환율
        </Text>

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 14,
          }}
        >
          {currencies.map(
            (item) => (
              <Pressable
                key={item}
                onPress={() =>
                  handleCurrencyChange(
                    item
                  )
                }
                style={{
                  paddingHorizontal: 15,
                  paddingVertical: 10,
                  borderRadius: 20,

                  backgroundColor:
                    currency ===
                    item
                      ? "#3B82F6"
                      : "#F3F4F6",
                }}
              >
                <Text
                  style={{
                    color:
                      currency ===
                      item
                        ? "white"
                        : "#374151",

                    fontWeight:
                      "bold",
                  }}
                >
                  {item}
                </Text>
              </Pressable>
            )
          )}
        </View>

        {currency !== "KRW" && (
          <>
            <Text
              style={{
                marginTop: 16,
                color: "#6B7280",
              }}
            >
              {rateLabel()}
            </Text>

            <TextInput
              value={rateInput}
              onChangeText={
                setRateInput
              }
              placeholder="환율"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
              style={{
                marginTop: 8,
                backgroundColor:
                  "#F9FAFB",
                color: "#111827",
                borderRadius: 12,
                padding: 14,
              }}
            />

            <Pressable
              onPress={
                handleRateSave
              }
              style={{
                marginTop: 10,
                backgroundColor:
                  "#111827",
                borderRadius: 10,
                paddingVertical: 10,
                alignItems:
                  "center",
              }}
            >
              <Text
                style={{
                  color: "white",
                  fontWeight: "bold",
                }}
              >
                환율 저장
              </Text>
            </Pressable>
          </>
        )}
      </View>

      {/* 지출 추가 */}
      <View
        style={{
          marginTop: 22,
          backgroundColor:
            "white",
          borderRadius: 18,
          padding: 18,
        }}
      >
        <Text
          style={{
            fontSize: 20,
            fontWeight: "bold",
            color: "#111827",
          }}
        >
          기록 추가
        </Text>

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 16,
          }}
        >
          {[
            {
              value:
                "personal" as ExpenseType,
              label:
                "개인 지출",
            },
            {
              value:
                "shared" as ExpenseType,
              label:
                "공동 지출",
            },
            {
              value:
                "loan" as ExpenseType,
              label:
                "돈 빌려주기",
            },
          ].map((item) => (
            <Pressable
              key={item.value}
              onPress={() => {
                setExpenseType(
                  item.value
                );

                if (
                  item.value ===
                  "shared"
                ) {
                  setParticipants(
                    memberNames
                  );
                }
              }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 11,
                borderRadius: 12,

                backgroundColor:
                  expenseType ===
                  item.value
                    ? "#3B82F6"
                    : "#F3F4F6",
              }}
            >
              <Text
                style={{
                  color:
                    expenseType ===
                    item.value
                      ? "white"
                      : "#374151",

                  fontWeight: "bold",
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* 공동 지출 */}
        {expenseType ===
          "shared" && (
          <>
            <Text
              style={{
                marginTop: 18,
                fontWeight: "bold",
                color: "#374151",
              }}
            >
              누가 계산했나요?
            </Text>

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 10,
              }}
            >
              {memberNames.map(
                (name) => (
                  <Pressable
                    key={name}
                    onPress={() =>
                      setPayer(name)
                    }
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 9,
                      borderRadius: 20,

                      backgroundColor:
                        payer ===
                        name
                          ? "#111827"
                          : "#F3F4F6",
                    }}
                  >
                    <Text
                      style={{
                        color:
                          payer ===
                          name
                            ? "white"
                            : "#374151",

                        fontWeight:
                          "bold",
                      }}
                    >
                      {name}
                    </Text>
                  </Pressable>
                )
              )}
            </View>

            <Text
              style={{
                marginTop: 18,
                fontWeight: "bold",
                color: "#374151",
              }}
            >
              같이 쓴 사람
            </Text>

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 10,
              }}
            >
              {memberNames.map(
                (name) => {
                  const selected =
                    participants.includes(
                      name
                    );

                  return (
                    <Pressable
                      key={name}
                      onPress={() =>
                        toggleParticipant(
                          name
                        )
                      }
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 9,
                        borderRadius: 20,

                        backgroundColor:
                          selected
                            ? "#3B82F6"
                            : "#F3F4F6",
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
                        {selected
                          ? "✓ "
                          : ""}
                        {name}
                      </Text>
                    </Pressable>
                  );
                }
              )}
            </View>
          </>
        )}

        {/* 돈 빌려주기 */}
        {expenseType ===
          "loan" && (
          <>
            <Text
              style={{
                marginTop: 18,
                fontWeight: "bold",
                color: "#374151",
              }}
            >
              빌려준 사람
            </Text>

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 10,
              }}
            >
              {memberNames.map(
                (name) => (
                  <Pressable
                    key={name}
                    onPress={() =>
                      setLender(name)
                    }
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 9,
                      borderRadius: 20,

                      backgroundColor:
                        lender ===
                        name
                          ? "#059669"
                          : "#F3F4F6",
                    }}
                  >
                    <Text
                      style={{
                        color:
                          lender ===
                          name
                            ? "white"
                            : "#374151",

                        fontWeight:
                          "bold",
                      }}
                    >
                      {name}
                    </Text>
                  </Pressable>
                )
              )}
            </View>

            <Text
              style={{
                marginTop: 18,
                fontWeight: "bold",
                color: "#374151",
              }}
            >
              빌린 사람
            </Text>

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 10,
              }}
            >
              {memberNames.map(
                (name) => (
                  <Pressable
                    key={name}
                    onPress={() =>
                      setBorrower(
                        name
                      )
                    }
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 9,
                      borderRadius: 20,

                      backgroundColor:
                        borrower ===
                        name
                          ? "#DC2626"
                          : "#F3F4F6",
                    }}
                  >
                    <Text
                      style={{
                        color:
                          borrower ===
                          name
                            ? "white"
                            : "#374151",

                        fontWeight:
                          "bold",
                      }}
                    >
                      {name}
                    </Text>
                  </Pressable>
                )
              )}
            </View>
          </>
        )}

        <TextInput
          value={amount}
          onChangeText={setAmount}
          placeholder={`금액 (${currency})`}
          placeholderTextColor="#9CA3AF"
          keyboardType="numeric"
          style={{
            marginTop: 18,
            backgroundColor:
              "#F9FAFB",
            color: "#111827",
            borderRadius: 12,
            padding: 14,
            fontSize: 17,
          }}
        />

        {previewKrw > 0 && (
          <View
            style={{
              marginTop: 10,
              backgroundColor:
                "#EFF6FF",
              borderRadius: 12,
              padding: 12,
            }}
          >
            <Text
              style={{
                color: "#2563EB",
                fontWeight: "bold",
              }}
            >
              {currencySymbol(
                currency
              )}
              {formatMoney(
                Number(amount)
              )}{" "}
              ≈ ₩
              {formatMoney(
                previewKrw
              )}
            </Text>

            {expenseType ===
              "shared" &&
              perPersonLocal >
                0 && (
                <Text
                  style={{
                    marginTop: 6,
                    color: "#374151",
                  }}
                >
                  {
                    participants.length
                  }
                  명 균등 분할 → 1인당 약{" "}
                  {currencySymbol(
                    currency
                  )}
                  {formatMoney(
                    perPersonLocal
                  )}
                </Text>
              )}

            {expenseType ===
              "loan" && (
              <Text
                style={{
                  marginTop: 6,
                  color: "#374151",
                }}
              >
                {borrower} →{" "}
                {lender}에게 갚을 금액으로
                기록됩니다.
              </Text>
            )}
          </View>
        )}

        {expenseType !==
          "loan" && (
          <>
            <Text
              style={{
                marginTop: 18,
                fontWeight: "bold",
                color: "#374151",
              }}
            >
              카테고리
            </Text>

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 10,
              }}
            >
              {categories.map(
                (item) => (
                  <Pressable
                    key={item}
                    onPress={() =>
                      setCategory(
                        item
                      )
                    }
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 9,
                      borderRadius: 20,

                      backgroundColor:
                        category ===
                        item
                          ? "#3B82F6"
                          : "#F3F4F6",
                    }}
                  >
                    <Text
                      style={{
                        color:
                          category ===
                          item
                            ? "white"
                            : "#374151",

                        fontWeight:
                          "bold",
                      }}
                    >
                      {item}
                    </Text>
                  </Pressable>
                )
              )}
            </View>
          </>
        )}

        <TextInput
          value={memo}
          onChangeText={setMemo}
          placeholder={
            expenseType === "loan"
              ? "메모 (예: 현금 부족)"
              : "메모 (예: 라멘)"
          }
          placeholderTextColor="#9CA3AF"
          style={{
            marginTop: 16,
            backgroundColor:
              "#F9FAFB",
            color: "#111827",
            borderRadius: 12,
            padding: 14,
          }}
        />

        <Pressable
          onPress={
            handleAddExpense
          }
          style={{
            marginTop: 16,
            backgroundColor:
              "#3B82F6",
            borderRadius: 12,
            paddingVertical: 14,
            alignItems:
              "center",
          }}
        >
          <Text
            style={{
              color: "white",
              fontWeight: "bold",
            }}
          >
            {expenseType ===
            "loan"
              ? "빌려준 돈 저장"
              : "지출 저장"}
          </Text>
        </Pressable>
      </View>

      {/* 최종 정산 */}
      <View
        style={{
          marginTop: 22,
          backgroundColor:
            "white",
          borderRadius: 18,
          padding: 18,
        }}
      >
        <Text
          style={{
            fontSize: 20,
            fontWeight: "bold",
            color: "#111827",
          }}
        >
          최종 정산
        </Text>

        <Text
          style={{
            marginTop: 6,
            color: "#6B7280",
            fontSize: 13,
          }}
        >
          공동 지출과 빌려준 돈을 합산해서 계산합니다.
        </Text>

        {settlements.length ===
        0 ? (
          <Text
            style={{
              marginTop: 12,
              color: "#6B7280",
            }}
          >
            현재 정산할 금액이 없습니다.
          </Text>
        ) : (
          settlements.map(
            (
              settlement,
              index
            ) => (
              <View
                key={`${settlement.from}-${settlement.to}-${index}`}
                style={{
                  marginTop: 12,
                  backgroundColor:
                    "#F9FAFB",
                  borderRadius: 12,
                  padding: 14,
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight:
                      "bold",
                    color:
                      "#111827",
                  }}
                >
                  {settlement.from} →{" "}
                  {settlement.to}
                </Text>

                <Text
                  style={{
                    marginTop: 5,
                    color:
                      "#2563EB",
                    fontSize: 18,
                    fontWeight:
                      "bold",
                  }}
                >
                  ₩
                  {formatMoney(
                    settlement.amount
                  )}
                </Text>
              </View>
            )
          )
        )}
      </View>

      {/* 기록 내역 */}
      <Text
        style={{
          marginTop: 28,
          fontSize: 20,
          fontWeight: "bold",
          color: "#111827",
        }}
      >
        기록 내역
      </Text>

      {expenses.length === 0 ? (
        <View
          style={{
            marginTop: 14,
            backgroundColor:
              "white",
            borderRadius: 16,
            padding: 18,
          }}
        >
          <Text
            style={{
              color: "#6B7280",
            }}
          >
            아직 기록이 없습니다.
          </Text>
        </View>
      ) : (
        expenses.map(
          (expense) => (
            <View
              key={expense.id}
              style={{
                marginTop: 12,
                backgroundColor:
                  "white",
                borderRadius: 16,
                padding: 16,
              }}
            >
              {expense.expenseType ===
              "loan" ? (
                <>
                  <Text
                    style={{
                      fontSize: 17,
                      fontWeight:
                        "bold",
                      color:
                        "#7C3AED",
                    }}
                  >
                    💸 돈 빌려주기
                  </Text>

                  <Text
                    style={{
                      marginTop: 8,
                      color:
                        "#111827",
                      fontWeight:
                        "bold",
                    }}
                  >
                    {expense.lender} →{" "}
                    {expense.borrower}
                  </Text>
                </>
              ) : (
                <Text
                  style={{
                    fontSize: 17,
                    fontWeight:
                      "bold",
                    color:
                      "#111827",
                  }}
                >
                  {expense.category}
                </Text>
              )}

              <Text
                style={{
                  marginTop: 6,
                  color: "#6B7280",
                }}
              >
                {expense.date}
              </Text>

              {expense.expenseType ===
                "shared" && (
                <Text
                  style={{
                    marginTop: 6,
                    color:
                      "#7C3AED",
                    fontWeight:
                      "bold",
                  }}
                >
                  공동지출 ·{" "}
                  {expense.payer} 결제 ·{" "}
                  {expense
                    .participants
                    ?.length ?? 0}
                  명
                </Text>
              )}

              <View
                style={{
                  marginTop: 10,
                }}
              >
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight:
                      "bold",
                  }}
                >
                  {currencySymbol(
                    expense.currency
                  )}
                  {formatMoney(
                    expense.localAmount
                  )}
                </Text>

                <Text
                  style={{
                    marginTop: 4,
                    color:
                      "#6B7280",
                  }}
                >
                  ≈ ₩
                  {formatMoney(
                    expense.krwAmount
                  )}
                </Text>
              </View>

              {expense.memo?.trim() ? (
                <Text
                  style={{
                    marginTop: 10,
                    color: "#4B5563",
                  }}
                >
                  📝 {expense.memo}
                </Text>
              ) : null}

              <Pressable
                onPress={() =>
                  handleDelete(
                    expense
                  )
                }
                style={{
                  marginTop: 12,
                  backgroundColor:
                    "#FEECEC",
                  borderRadius: 10,
                  paddingVertical: 9,
                  alignItems:
                    "center",
                }}
              >
                <Text
                  style={{
                    color: "#DC2626",
                    fontWeight:
                      "bold",
                  }}
                >
                  삭제
                </Text>
              </Pressable>
            </View>
          )
        )
      )}
    </ScrollView>
  );
}