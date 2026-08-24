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
  deleteSettlementPayment,
  getExpenseSettings,
  getExpenses,
  getSettlementPayments,
  getTrip,
  saveExpenseSettings,
  saveExpenses,
  saveSettlementPayments,
} from "../../lib/storage";

import {
  CurrencyCode,
  Expense,
  ExpenseCategory,
  ExpenseSettings,
  ExpenseType,
  PaymentMethod,
  SettlementPayment,
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

  const [
    settlementPayments,
    setSettlementPayments,
  ] = useState<SettlementPayment[]>([]);

  const [budget, setBudget] =
    useState("");

  const [cashBudget, setCashBudget] =
    useState("");

  const [cardBudget, setCardBudget] =
    useState("");

  const [amount, setAmount] =
    useState("");

  const [memo, setMemo] =
    useState("");

  const [category, setCategory] =
    useState<ExpenseCategory>("식비");

  const [currency, setCurrency] =
    useState<CurrencyCode>("JPY");

  const [
    paymentMethod,
    setPaymentMethod,
  ] = useState<PaymentMethod>("cash");

  const [
    exchangeRates,
    setExchangeRates,
  ] = useState(defaultRates);

  const [rateInput, setRateInput] =
    useState("900");

  const [
    expenseType,
    setExpenseType,
  ] = useState<ExpenseType>(
    "personal"
  );

  const [payer, setPayer] =
    useState("나");

  const [
    participants,
    setParticipants,
  ] = useState<string[]>(["나"]);

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

  // ★ 핵심
  // 여행의 첫 번째 멤버를 현재 사용자로 취급
  const currentUserName =
    memberNames[0] ?? "나";

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
      value.includes(
        "united states"
      )
    ) {
      return "USD";
    }

    return "JPY";
  }

  function getRateDisplayValue(
    selectedCurrency: CurrencyCode,
    rates: typeof defaultRates
  ) {
    if (
      selectedCurrency === "JPY"
    ) {
      return String(
        Math.round(
          rates.JPY * 100
        )
      );
    }

    return String(
      Math.round(
        rates[selectedCurrency]
      )
    );
  }

  const loadData =
    useCallback(async () => {
      const tripData =
        await getTrip();

      const expenseData =
        await getExpenses();

      const paymentData =
        await getSettlementPayments();

      const savedSettings =
        await getExpenseSettings();

      setTrip(tripData);

      setExpenses(
        [...expenseData].sort(
          (a, b) =>
            `${b.date}`.localeCompare(
              `${a.date}`
            )
        )
      );

      setSettlementPayments(
        paymentData
      );

      const members =
        getTripMembers(tripData);

      const me =
        members[0] ?? "나";

      setPayer((current) =>
        members.includes(current)
          ? current
          : me
      );

      setLender((current) =>
        members.includes(current)
          ? current
          : me
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
            (name) => name !== me
          ) ?? me
        );
      });

      setParticipants(
        (current) => {
          const valid =
            current.filter(
              (name) =>
                members.includes(name)
            );

          return valid.length > 0
            ? valid
            : members;
        }
      );

      if (savedSettings) {
        setBudget(
          String(
            savedSettings.budgetKrw ??
              0
          )
        );

        setCashBudget(
          String(
            savedSettings.cashBudgetKrw ??
              0
          )
        );

        setCardBudget(
          String(
            savedSettings.cardBudgetKrw ??
              0
          )
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
    }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

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

    const value =
      Number(
        rateInput.replace(
          /,/g,
          ""
        )
      );

    if (!value) {
      return 0;
    }

    if (
      selectedCurrency === "JPY"
    ) {
      return value / 100;
    }

    return value;
  }

  const budgetNumber =
    Number(
      budget.replace(/,/g, "")
    ) || 0;

  const cashBudgetNumber =
    Number(
      cashBudget.replace(/,/g, "")
    ) || 0;

  const cardBudgetNumber =
    Number(
      cardBudget.replace(/,/g, "")
    ) || 0;

  // 일반 여행 지출
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
            (expense.krwAmount ??
              0)
          );
        },
        0
      );
    }, [expenses]);

  // 오늘 사용한 일반 여행 지출
  // 대여금은 실제 소비가 아니므로 오늘 지출에서 제외
  const todayExpenses =
    useMemo(() => {
      const today =
        getTodayString();

      return expenses.filter(
        (expense) =>
          expense.date ===
            today &&
          expense.expenseType !==
            "loan"
      );
    }, [expenses]);

  const todayExpenseKrw =
    useMemo(() => {
      return todayExpenses.reduce(
        (sum, expense) =>
          sum +
          (expense.krwAmount ??
            0),
        0
      );
    }, [todayExpenses]);

  const todayCashExpenseKrw =
    useMemo(() => {
      return todayExpenses.reduce(
        (sum, expense) => {
          if (
            expense.paymentMethod !==
            "cash"
          ) {
            return sum;
          }

          return (
            sum +
            (expense.krwAmount ??
              0)
          );
        },
        0
      );
    }, [todayExpenses]);

  const todayCardExpenseKrw =
    useMemo(() => {
      return todayExpenses.reduce(
        (sum, expense) => {
          if (
            expense.paymentMethod !==
            "card"
          ) {
            return sum;
          }

          return (
            sum +
            (expense.krwAmount ??
              0)
          );
        },
        0
      );
    }, [todayExpenses]);

  const cashExpenseKrw =
    useMemo(() => {
      return expenses.reduce(
        (sum, expense) => {
          if (
            expense.expenseType ===
            "loan"
          ) {
            return sum;
          }

          if (
            expense.paymentMethod !==
            "cash"
          ) {
            return sum;
          }

          return (
            sum +
            (expense.krwAmount ??
              0)
          );
        },
        0
      );
    }, [expenses]);

  const cardExpenseKrw =
    useMemo(() => {
      return expenses.reduce(
        (sum, expense) => {
          if (
            expense.expenseType ===
            "loan"
          ) {
            return sum;
          }

          if (
            expense.paymentMethod !==
            "card"
          ) {
            return sum;
          }

          return (
            sum +
            (expense.krwAmount ??
              0)
          );
        },
        0
      );
    }, [expenses]);

  const remaining =
    budgetNumber -
    totalExpenseKrw;

  const baseCashRemaining =
    cashBudgetNumber -
    cashExpenseKrw;

  const baseCardRemaining =
    cardBudgetNumber -
    cardExpenseKrw;

  // ★ 대여금 계산
  const loanSummary =
    useMemo(() => {
      let borrowedCash = 0;
      let borrowedCard = 0;

      let lentCash = 0;
      let lentCard = 0;

      expenses.forEach(
        (expense) => {
          if (
            expense.expenseType !==
            "loan"
          ) {
            return;
          }

          // 정산된 대여금은
          // 현재 보유금에 더 이상 영향 없음
          if (
            expense.loanSettled
          ) {
            return;
          }

          const value =
            expense.krwAmount ?? 0;

          const method =
            expense.paymentMethod ??
            "cash";

          // 내가 빌려준 돈
          if (
            expense.lender ===
            currentUserName
          ) {
            if (
              method === "cash"
            ) {
              lentCash += value;
            } else {
              lentCard += value;
            }
          }

          // 내가 빌린 돈
          if (
            expense.borrower ===
            currentUserName
          ) {
            if (
              method === "cash"
            ) {
              borrowedCash +=
                value;
            } else {
              borrowedCard +=
                value;
            }
          }
        }
      );

      return {
        borrowedCash,
        borrowedCard,

        lentCash,
        lentCard,

        borrowedTotal:
          borrowedCash +
          borrowedCard,

        lentTotal:
          lentCash +
          lentCard,
      };
    }, [
      expenses,
      currentUserName,
    ]);

  // 실제 현재 가지고 있는 돈
  const actualCashRemaining =
    baseCashRemaining +
    loanSummary.borrowedCash -
    loanSummary.lentCash;

  const actualCardRemaining =
    baseCardRemaining +
    loanSummary.borrowedCard -
    loanSummary.lentCard;

  const actualTotalRemaining =
    actualCashRemaining +
    actualCardRemaining;

  async function saveSettings(
    newCurrency =
      currency,

    newRates =
      exchangeRates
  ) {
    const settings: ExpenseSettings =
      {
        budgetKrw:
          budgetNumber,

        cashBudgetKrw:
          cashBudgetNumber,

        cardBudgetKrw:
          cardBudgetNumber,

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
    if (
      cashBudgetNumber +
        cardBudgetNumber !==
      budgetNumber
    ) {
      Alert.alert(
        "예산 확인",
        `현금 + 카드 금액이 총예산과 다릅니다.\n\n총예산: ₩${formatMoney(
          budgetNumber
        )}\n현금+카드: ₩${formatMoney(
          cashBudgetNumber +
            cardBudgetNumber
        )}`
      );

      return;
    }

    await saveSettings();

    Alert.alert(
      "저장 완료",
      "여행 자금을 저장했습니다."
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
      "완료",
      "환율을 저장했습니다."
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
        localAmount * rate
      );
    }, [
      amount,
      currency,
      rateInput,
    ]);

  const perPersonLocal =
    useMemo(() => {
      if (
        expenseType !==
        "shared"
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
        participants.length ===
          0
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
            current.length ===
            1
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
      rate <= 0
    ) {
      Alert.alert(
        "환율 확인",
        "환율을 확인해주세요."
      );

      return;
    }

    if (
      expenseType ===
        "shared" &&
      participants.length ===
        0
    ) {
      Alert.alert(
        "참여자 확인",
        "공동 지출 참여자를 선택해주세요."
      );

      return;
    }

    if (
      expenseType ===
        "loan" &&
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

    const newExpense: Expense =
      {
        id:
          Date.now().toString(),

        localAmount,

        currency,

        exchangeRate:
          rate,

        krwAmount,

        category,

        date:
          getTodayString(),

        memo:
          memo.trim(),

        expenseType,

        paymentMethod,

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

        loanSettled:
          expenseType ===
          "loan"
            ? false
            : undefined,

        loanSettledAt:
          undefined,
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
      "이 기록을 삭제할까요?",
      [
        {
          text: "취소",
          style: "cancel",
        },

        {
          text: "삭제",
          style:
            "destructive",

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

  async function toggleLoanSettlement(
    expense: Expense
  ) {
    if (
      expense.expenseType !==
      "loan"
    ) {
      return;
    }

    const nextSettled =
      !expense.loanSettled;

    Alert.alert(
      nextSettled
        ? "정산 완료"
        : "정산 완료 취소",

      nextSettled
        ? `${expense.borrower} → ${expense.lender}\n₩${formatMoney(
            expense.krwAmount
          )}\n\n실제로 갚은 것이 맞나요?`
        : "이 대여금을 다시 미정산 상태로 바꿀까요?",

      [
        {
          text: "취소",
          style: "cancel",
        },

        {
          text:
            nextSettled
              ? "정산 완료"
              : "미정산으로 변경",

          onPress:
            async () => {
              const current =
                await getExpenses();

              const updated =
                current.map(
                  (
                    item: Expense
                  ) =>
                    item.id ===
                    expense.id
                      ? {
                          ...item,

                          loanSettled:
                            nextSettled,

                          loanSettledAt:
                            nextSettled
                              ? getTodayString()
                              : undefined,
                        }
                      : item
                );

              await saveExpenses(
                updated
              );

              await loadData();
            },
        },
      ]
    );
  }

  function rateLabel() {
    if (
      currency === "JPY"
    ) {
      return "100 JPY = 몇 원?";
    }

    if (
      currency === "USD"
    ) {
      return "1 USD = 몇 원?";
    }

    if (
      currency === "EUR"
    ) {
      return "1 EUR = 몇 원?";
    }

    return "";
  }

  // 공동지출 + 미정산 대여금
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
              expense
                .participants
                .length;

            balances[
              expense.payer
            ] =
              (balances[
                expense.payer
              ] ?? 0) +
              expense.krwAmount;

            expense.participants.forEach(
              (name) => {
                balances[name] =
                  (balances[
                    name
                  ] ?? 0) -
                  share;
              }
            );
          }

          if (
            expense.expenseType ===
              "loan" &&
            !expense.loanSettled &&
            expense.lender &&
            expense.borrower
          ) {
            balances[
              expense.lender
            ] =
              (balances[
                expense.lender
              ] ?? 0) +
              expense.krwAmount;

            balances[
              expense.borrower
            ] =
              (balances[
                expense.borrower
              ] ?? 0) -
              expense.krwAmount;
          }
        }
      );

      settlementPayments.forEach(
        (payment) => {
          balances[
            payment.from
          ] =
            (balances[
              payment.from
            ] ?? 0) +
            payment.amountKrw;

          balances[
            payment.to
          ] =
            (balances[
              payment.to
            ] ?? 0) -
            payment.amountKrw;
        }
      );

      const creditors =
        Object.entries(
          balances
        )
          .filter(
            ([, value]) =>
              value > 1
          )
          .map(
            ([name, value]) => ({
              name,
              amount:
                value,
            })
          );

      const debtors =
        Object.entries(
          balances
        )
          .filter(
            ([, value]) =>
              value < -1
          )
          .map(
            ([name, value]) => ({
              name,
              amount:
                -value,
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
          creditor.amount <
          1
        ) {
          creditorIndex++;
        }

        if (
          debtor.amount <
          1
        ) {
          debtorIndex++;
        }
      }

      return result;
    }, [
      expenses,
      settlementPayments,
      memberNames,
    ]);

  async function completeSettlement(
    from: string,
    to: string,
    amountKrw: number
  ) {
    Alert.alert(
      "정산 완료",
      `${from} → ${to}\n₩${formatMoney(
        amountKrw
      )}\n\n실제로 송금이 완료됐나요?`,
      [
        {
          text: "취소",
          style: "cancel",
        },

        {
          text: "완료",

          onPress:
            async () => {
              const newPayment: SettlementPayment =
                {
                  id:
                    Date.now().toString(),

                  from,

                  to,

                  amountKrw,

                  date:
                    getTodayString(),
                };

              const current =
                await getSettlementPayments();

              await saveSettlementPayments(
                [
                  ...current,
                  newPayment,
                ]
              );

              await loadData();
            },
        },
      ]
    );
  }

  async function cancelSettlement(
    payment: SettlementPayment
  ) {
    Alert.alert(
      "정산 완료 취소",
      "이 정산 완료 기록을 취소할까요?",
      [
        {
          text: "취소",
          style: "cancel",
        },

        {
          text:
            "완료 취소",

          onPress:
            async () => {
              await deleteSettlementPayment(
                payment.id
              );

              await loadData();
            },
        },
      ]
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

      {/* 오늘 지출 요약 */}
      <View
        style={{
          marginTop: 24,
          backgroundColor:
            "white",
          borderRadius: 18,
          padding: 18,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent:
              "space-between",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontSize: 20,
              fontWeight: "bold",
              color: "#111827",
            }}
          >
            오늘 지출
          </Text>

          <Text
            style={{
              fontSize: 13,
              color: "#6B7280",
            }}
          >
            {todayExpenses.length}건
          </Text>
        </View>

        <Text
          style={{
            marginTop: 14,
            fontSize: 28,
            fontWeight: "bold",
            color: "#111827",
          }}
        >
          ₩
          {formatMoney(
            todayExpenseKrw
          )}
        </Text>

        <Text
          style={{
            marginTop: 5,
            color: "#6B7280",
            fontSize: 13,
          }}
        >
          오늘 기록된 일반 여행 지출 기준
        </Text>

        <View
          style={{
            marginTop: 16,
            flexDirection: "row",
            gap: 10,
          }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor:
                "#ECFDF5",
              borderRadius: 12,
              padding: 12,
            }}
          >
            <Text
              style={{
                color: "#6B7280",
                fontSize: 12,
              }}
            >
              💵 현금
            </Text>

            <Text
              style={{
                marginTop: 5,
                color: "#059669",
                fontWeight: "bold",
                fontSize: 16,
              }}
            >
              ₩
              {formatMoney(
                todayCashExpenseKrw
              )}
            </Text>
          </View>

          <View
            style={{
              flex: 1,
              backgroundColor:
                "#F5F3FF",
              borderRadius: 12,
              padding: 12,
            }}
          >
            <Text
              style={{
                color: "#6B7280",
                fontSize: 12,
              }}
            >
              💳 카드
            </Text>

            <Text
              style={{
                marginTop: 5,
                color: "#7C3AED",
                fontWeight: "bold",
                fontSize: 16,
              }}
            >
              ₩
              {formatMoney(
                todayCardExpenseKrw
              )}
            </Text>
          </View>
        </View>
      </View>

      {/* 여행 자금 */}
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
            fontSize: 20,
            fontWeight: "bold",
            color: "#111827",
          }}
        >
          여행 자금
        </Text>

        <Text
          style={{
            marginTop: 14,
            color: "#374151",
            fontWeight: "bold",
          }}
        >
          총 여행 예산
        </Text>

        <TextInput
          value={budget}
          onChangeText={setBudget}
          placeholder="예: 2000000"
          placeholderTextColor="#9CA3AF"
          keyboardType="numeric"
          style={{
            marginTop: 7,
            backgroundColor:
              "#F9FAFB",
            color: "#111827",
            borderRadius: 12,
            padding: 14,
          }}
        />

        <Text
          style={{
            marginTop: 14,
            color: "#374151",
            fontWeight: "bold",
          }}
        >
          현금으로 준비한 금액
        </Text>

        <TextInput
          value={cashBudget}
          onChangeText={
            setCashBudget
          }
          placeholder="예: 200000"
          placeholderTextColor="#9CA3AF"
          keyboardType="numeric"
          style={{
            marginTop: 7,
            backgroundColor:
              "#F9FAFB",
            color: "#111827",
            borderRadius: 12,
            padding: 14,
          }}
        />

        <Text
          style={{
            marginTop: 14,
            color: "#374151",
            fontWeight: "bold",
          }}
        >
          카드에 사용할 금액
        </Text>

        <TextInput
          value={cardBudget}
          onChangeText={
            setCardBudget
          }
          placeholder="예: 1800000"
          placeholderTextColor="#9CA3AF"
          keyboardType="numeric"
          style={{
            marginTop: 7,
            backgroundColor:
              "#F9FAFB",
            color: "#111827",
            borderRadius: 12,
            padding: 14,
          }}
        />

        <Pressable
          onPress={
            handleBudgetSave
          }
          style={{
            marginTop: 14,
            backgroundColor:
              "#64748B",
            paddingVertical: 12,
            borderRadius: 11,
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
            여행 자금 저장
          </Text>
        </Pressable>

        <View
          style={{
            marginTop: 18,
            gap: 10,
          }}
        >
          <View
            style={{
              backgroundColor:
                "#EFF6FF",
              borderRadius: 14,
              padding: 14,
            }}
          >
            <Text
              style={{
                color:
                  "#6B7280",
              }}
            >
              전체 남은 예산
            </Text>

            <Text
              style={{
                marginTop: 4,
                fontSize: 22,
                fontWeight: "bold",
                color: "#2563EB",
              }}
            >
              ₩
              {formatMoney(
                remaining
              )}
            </Text>
          </View>

          <View
            style={{
              flexDirection: "row",
              gap: 10,
            }}
          >
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
                  color:
                    "#6B7280",
                }}
              >
                현금 잔액
              </Text>

              <Text
                style={{
                  marginTop: 4,
                  fontSize: 18,
                  fontWeight:
                    "bold",

                  color:
                    actualCashRemaining <
                    0
                      ? "#DC2626"
                      : "#059669",
                }}
              >
                ₩
                {formatMoney(
                  actualCashRemaining
                )}
              </Text>
            </View>

            <View
              style={{
                flex: 1,
                backgroundColor:
                  "#F5F3FF",
                borderRadius: 14,
                padding: 14,
              }}
            >
              <Text
                style={{
                  color:
                    "#6B7280",
                }}
              >
                카드 잔액
              </Text>

              <Text
                style={{
                  marginTop: 4,
                  fontSize: 18,
                  fontWeight:
                    "bold",

                  color:
                    actualCardRemaining <
                    0
                      ? "#DC2626"
                      : "#7C3AED",
                }}
              >
                ₩
                {formatMoney(
                  actualCardRemaining
                )}
              </Text>
            </View>
          </View>

          {(loanSummary.borrowedTotal >
            0 ||
            loanSummary.lentTotal >
              0) && (
            <View
              style={{
                backgroundColor:
                  "#F8F7FF",
                borderRadius: 14,
                padding: 14,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "bold",
                  color: "#374151",
                }}
              >
                대여금 현황
              </Text>

              {loanSummary.borrowedTotal >
                0 && (
                <View
                  style={{
                    marginTop: 10,
                    flexDirection:
                      "row",
                    justifyContent:
                      "space-between",
                  }}
                >
                  <Text
                    style={{
                      color:
                        "#6B7280",
                    }}
                  >
                    빌린 돈
                  </Text>

                  <Text
                    style={{
                      color:
                        "#7C6FB0",
                      fontWeight:
                        "bold",
                    }}
                  >
                    +₩
                    {formatMoney(
                      loanSummary.borrowedTotal
                    )}
                  </Text>
                </View>
              )}

              {loanSummary.lentTotal >
                0 && (
                <View
                  style={{
                    marginTop: 10,
                    flexDirection:
                      "row",
                    justifyContent:
                      "space-between",
                  }}
                >
                  <Text
                    style={{
                      color:
                        "#6B7280",
                    }}
                  >
                    빌려준 돈
                  </Text>

                  <Text
                    style={{
                      color:
                        "#7C6FB0",
                      fontWeight:
                        "bold",
                    }}
                  >
                    -₩
                    {formatMoney(
                      loanSummary.lentTotal
                    )}
                  </Text>
                </View>
              )}

              <View
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTopWidth: 1,
                  borderTopColor:
                    "#E5E7EB",
                }}
              >
                <Text
                  style={{
                    color:
                      "#6B7280",
                    fontSize: 12,
                  }}
                >
                  현재 실제 보유자금
                </Text>

                <Text
                  style={{
                    marginTop: 3,
                    fontSize: 19,
                    fontWeight: "bold",
                    color: "#374151",
                  }}
                >
                  ₩
                  {formatMoney(
                    actualTotalRemaining
                  )}
                </Text>
              </View>
            </View>
          )}
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

        {currency !==
          "KRW" && (
          <>
            <Text
              style={{
                marginTop: 15,
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
                marginTop: 7,
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
                  "#64748B",
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

      {/* 기록 추가 */}
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
            marginTop: 15,
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
          ].map(
            (item) => (
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
                  paddingVertical: 10,
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

                    fontWeight:
                      "bold",
                  }}
                >
                  {item.label}
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
          {expenseType === "loan"
            ? "돈을 주고받은 방법"
            : "결제수단"}
        </Text>

        <View
          style={{
            flexDirection: "row",
            gap: 8,
            marginTop: 9,
          }}
        >
          <Pressable
            onPress={() =>
              setPaymentMethod(
                "cash"
              )
            }
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: 11,
              borderRadius: 12,

              backgroundColor:
                paymentMethod ===
                "cash"
                  ? "#059669"
                  : "#F3F4F6",
            }}
          >
            <Text
              style={{
                color:
                  paymentMethod ===
                  "cash"
                    ? "white"
                    : "#374151",

                fontWeight:
                  "bold",
              }}
            >
              💵 현금
            </Text>
          </Pressable>

          <Pressable
            onPress={() =>
              setPaymentMethod(
                "card"
              )
            }
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: 11,
              borderRadius: 12,

              backgroundColor:
                paymentMethod ===
                "card"
                  ? "#7C3AED"
                  : "#F3F4F6",
            }}
          >
            <Text
              style={{
                color:
                  paymentMethod ===
                  "card"
                    ? "white"
                    : "#374151",

                fontWeight:
                  "bold",
              }}
            >
              💳 카드
            </Text>
          </Pressable>
        </View>

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
              결제자
            </Text>

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 8,
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
                      padding: 10,
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
              참여자
            </Text>

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 8,
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
                        padding: 10,
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
                marginTop: 8,
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
                      padding: 10,
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
                marginTop: 8,
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
                      padding: 10,
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
          onChangeText={
            setAmount
          }
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
              padding: 12,
              borderRadius: 12,
              backgroundColor:
                "#EFF6FF",
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
                    marginTop: 5,
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
                marginTop: 8,
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
                      padding: 10,
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
            expenseType ===
            "loan"
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
            paddingVertical: 14,
            borderRadius: 12,
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
            기록 저장
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

        {settlements.length ===
        0 ? (
          <Text
            style={{
              marginTop: 12,
              color: "#059669",
            }}
          >
            현재 미정산 금액이 없습니다.
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
                    "#FEF2F2",
                  borderRadius: 12,
                  padding: 14,
                }}
              >
                <Text
                  style={{
                    color:
                      "#DC2626",
                    fontWeight:
                      "bold",
                  }}
                >
                  ● 미정산
                </Text>

                <Text
                  style={{
                    marginTop: 7,
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
                    fontSize: 19,
                    color:
                      "#DC2626",
                    fontWeight:
                      "bold",
                  }}
                >
                  ₩
                  {formatMoney(
                    settlement.amount
                  )}
                </Text>

                <Pressable
                  onPress={() =>
                    completeSettlement(
                      settlement.from,
                      settlement.to,
                      settlement.amount
                    )
                  }
                  style={{
                    marginTop: 10,
                    backgroundColor:
                      "#64748B",
                    paddingVertical: 10,
                    borderRadius: 10,
                    alignItems:
                      "center",
                  }}
                >
                  <Text
                    style={{
                      color: "white",
                      fontWeight:
                        "bold",
                    }}
                  >
                    정산 완료
                  </Text>
                </Pressable>
              </View>
            )
          )
        )}
      </View>

      {settlementPayments.length >
        0 && (
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
            정산 완료 내역
          </Text>

          {settlementPayments.map(
            (payment) => (
              <View
                key={payment.id}
                style={{
                  marginTop: 12,
                  backgroundColor:
                    "#ECFDF5",
                  borderRadius: 12,
                  padding: 14,
                }}
              >
                <Text
                  style={{
                    color:
                      "#059669",
                    fontWeight:
                      "bold",
                  }}
                >
                  ✅ 정산 완료
                </Text>

                <Text
                  style={{
                    marginTop: 7,
                    fontWeight:
                      "bold",
                  }}
                >
                  {payment.from} →{" "}
                  {payment.to}
                </Text>

                <Text
                  style={{
                    marginTop: 5,
                    color:
                      "#059669",
                    fontWeight:
                      "bold",
                  }}
                >
                  ₩
                  {formatMoney(
                    payment.amountKrw
                  )}
                </Text>

                <Pressable
                  onPress={() =>
                    cancelSettlement(
                      payment
                    )
                  }
                  style={{
                    marginTop: 9,
                    backgroundColor:
                      "#F3F4F6",
                    borderRadius: 8,
                    paddingVertical: 8,
                    alignItems:
                      "center",
                  }}
                >
                  <Text>
                    정산 완료 취소
                  </Text>
                </Pressable>
              </View>
            )
          )}
        </View>
      )}

      <Text
        style={{
          marginTop: 28,
          fontSize: 20,
          fontWeight: "bold",
          color: "#111827",
        }}
      >
        전체 기록
      </Text>

      {expenses.length === 0 ? (
        <View
          style={{
            marginTop: 12,
            padding: 18,
            borderRadius: 16,
            backgroundColor:
              "white",
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
                padding: 16,
                backgroundColor:
                  "white",
                borderRadius: 16,
              }}
            >
              {expense.expenseType ===
              "loan" ? (
                <>
                  <Text
                    style={{
                      fontWeight:
                        "bold",
                      fontSize: 17,
                      color:
                        "#7C3AED",
                    }}
                  >
                    💸 돈 빌려주기
                  </Text>

                  <Text
                    style={{
                      marginTop: 8,
                      fontWeight:
                        "bold",
                    }}
                  >
                    {expense.borrower} →{" "}
                    {expense.lender}
                  </Text>

                  <Text
                    style={{
                      marginTop: 6,
                      color:
                        "#6B7280",
                    }}
                  >
                    {expense.paymentMethod ===
                    "cash"
                      ? "💵 현금"
                      : "💳 카드"}
                  </Text>

                  <Pressable
                    onPress={() =>
                      toggleLoanSettlement(
                        expense
                      )
                    }
                    style={{
                      marginTop: 12,
                      paddingVertical: 11,
                      borderRadius: 10,
                      alignItems:
                        "center",

                      backgroundColor:
                        expense.loanSettled
                          ? "#ECFDF5"
                          : "#FEE2E2",
                    }}
                  >
                    <Text
                      style={{
                        fontWeight:
                          "bold",

                        color:
                          expense.loanSettled
                            ? "#059669"
                            : "#DC2626",
                      }}
                    >
                      {expense.loanSettled
                        ? "✅ 정산 완료"
                        : "● 미정산"}
                    </Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text
                    style={{
                      fontWeight:
                        "bold",
                      fontSize: 17,
                    }}
                  >
                    {expense.category}
                  </Text>

                  <Text
                    style={{
                      marginTop: 6,
                      color:
                        "#6B7280",
                    }}
                  >
                    {expense.paymentMethod ===
                    "cash"
                      ? "💵 현금"
                      : "💳 카드"}
                  </Text>
                </>
              )}

              <Text
                style={{
                  marginTop: 10,
                  fontSize: 18,
                  fontWeight: "bold",
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
                  marginTop: 3,
                  color: "#6B7280",
                }}
              >
                ≈ ₩
                {formatMoney(
                  expense.krwAmount
                )}
              </Text>

              {expense.memo?.trim() ? (
                <Text
                  style={{
                    marginTop: 8,
                    color: "#4B5563",
                  }}
                >
                  📝 {expense.memo}
                </Text>
              ) : null}

              <Text
                style={{
                  marginTop: 6,
                  color: "#9CA3AF",
                  fontSize: 12,
                }}
              >
                {expense.date}
              </Text>

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
                  paddingVertical: 8,
                  borderRadius: 9,
                  alignItems:
                    "center",
                }}
              >
                <Text
                  style={{
                    color:
                      "#DC2626",
                    fontWeight:
                      "bold",
                  }}
                >
                  기록 삭제
                </Text>
              </Pressable>
            </View>
          )
        )
      )}
    </ScrollView>
  );
}