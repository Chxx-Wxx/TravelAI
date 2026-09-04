import {
  useCallback,
  useMemo,
  useRef,
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
  getStoredUserId,
  saveExpenseSettings,
  saveExpenses,
  saveSettlementPayments,
} from "../../lib/storage";

import {
  calculateExpenseSettlements,
  getExpenseMemberOptions,
  getExpensePartyLabel,
  getExpenseSettlementRelations,
  getExpenseSettlementStatus,
  getRelationsResolvedBySettlement,
  getResolvedSettlementRelationIds,
  type ExpenseSettlement,
} from "../../lib/expense-member";

import {
  getCurrentTripWithRecovery,
} from "../../services/current-trip";

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

type ExchangeRates =
  ExpenseSettings["exchangeRates"];

type ExpenseWithSnapshot =
  Expense & {
    exchangeRate: number;
    krwAmount: number;
  };

function formatNumericInput(
  value: string,
  allowDecimal = false
) {
  const withoutCommas =
    value.replace(/,/g, "");

  const sanitized =
    allowDecimal
      ? withoutCommas.replace(
          /[^\d.]/g,
          ""
        )
      : withoutCommas.replace(
          /\D/g,
          ""
        );

  if (!sanitized) {
    return "";
  }

  const decimalIndex =
    sanitized.indexOf(".");

  const integerPart =
    (
      decimalIndex >= 0
        ? sanitized.slice(
            0,
            decimalIndex
          )
        : sanitized
    ).replace(
      /^0+(?=\d)/,
      ""
    ) || "0";

  const formattedInteger =
    integerPart.replace(
      /\B(?=(\d{3})+(?!\d))/g,
      ","
    );

  if (
    !allowDecimal ||
    decimalIndex < 0
  ) {
    return formattedInteger;
  }

  const decimalPart =
    sanitized
      .slice(
        decimalIndex + 1
      )
      .replace(/\./g, "");

  return `${formattedInteger}.${decimalPart}`;
}

function parseNumericInput(
  value: string
) {
  return (
    Number(
      value.replace(/,/g, "")
    ) || 0
  );
}

function calculateRate(
  selectedCurrency: CurrencyCode,
  rateInput: string
) {
  if (
    selectedCurrency === "KRW"
  ) {
    return 1;
  }

  const value =
    parseNumericInput(
      rateInput
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

function parseStoredNumber(
  value: unknown
) {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === "string"
  ) {
    const parsed =
      Number(
        value.replace(/,/g, "")
      );

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function hasExpenseSnapshot(
  expense: Expense
): expense is ExpenseWithSnapshot {
  return (
    typeof expense.exchangeRate ===
      "number" &&
    Number.isFinite(
      expense.exchangeRate
    ) &&
    expense.exchangeRate > 0 &&
    typeof expense.krwAmount ===
      "number" &&
    Number.isFinite(
      expense.krwAmount
    )
  );
}

function migrateLegacyExpenseSnapshot(
  expense: Expense,
  rates: ExchangeRates
): {
  expense: ExpenseWithSnapshot;
  migrated: boolean;
} {
  // 두 스냅샷 값이 이미 있으면 현재 환율로 다시 계산하지 않는다.
  if (
    hasExpenseSnapshot(
      expense
    )
  ) {
    return {
      expense,
      migrated: false,
    };
  }

  const storedExchangeRate =
    parseStoredNumber(
      expense.exchangeRate
    );

  const storedKrwAmount =
    parseStoredNumber(
      expense.krwAmount
    );

  // 구형 JSON에 숫자가 문자열로 저장된 경우에도
  // 기존 스냅샷 값을 현재 환율보다 우선한다.
  if (
    storedExchangeRate !== null &&
    storedExchangeRate > 0 &&
    storedKrwAmount !== null
  ) {
    return {
      expense: {
        ...expense,
        exchangeRate:
          storedExchangeRate,
        krwAmount:
          Math.round(
            storedKrwAmount
          ),
      },
      migrated: true,
    };
  }

  let exchangeRate: number;

  if (
    storedExchangeRate !== null &&
    storedExchangeRate > 0
  ) {
    exchangeRate =
      storedExchangeRate;
  } else if (
    storedKrwAmount !== null &&
    typeof expense.localAmount ===
      "number" &&
    Number.isFinite(
      expense.localAmount
    ) &&
    expense.localAmount > 0
  ) {
    exchangeRate =
      storedKrwAmount /
      expense.localAmount;
  } else {
    exchangeRate =
      expense.currency ===
      "KRW"
        ? 1
        : rates[
            expense.currency
          ] ?? 1;
  }

  const krwAmount =
    storedKrwAmount !== null
      ? Math.round(
          storedKrwAmount
        )
      : Math.round(
          (
            expense.localAmount ??
            0
          ) * exchangeRate
        );

  return {
    expense: {
      ...expense,
      exchangeRate,
      krwAmount,
    },
    migrated: true,
  };
}

async function getExpensesWithSnapshots(
  rates: ExchangeRates
) {
  const storedExpenses:
    Expense[] =
    await getExpenses();

  const migrationResults =
    storedExpenses.map(
      (expense) =>
        migrateLegacyExpenseSnapshot(
          expense,
          rates
        )
    );

  const expenses =
    migrationResults.map(
      (result) =>
        result.expense
    );

  if (
    migrationResults.some(
      (result) =>
        result.migrated
    )
  ) {
    await saveExpenses(
      expenses
    );
  }

  return expenses;
}

export default function ExpenseScreen() {
  const [trip, setTrip] =
    useState<Trip | null>(null);

  const [currentUserId, setCurrentUserId] =
    useState<string | null>(null);

  const [expenses, setExpenses] =
    useState<
      ExpenseWithSnapshot[]
    >([]);

  const [
    settlementPayments,
    setSettlementPayments,
  ] = useState<SettlementPayment[]>([]);

  const expenseSaveLockRef = useRef(false);
  const [savingExpense, setSavingExpense] =
    useState(false);

  const settlementMutationLockRef =
    useRef<string | null>(null);

  const [
    processingSettlementAction,
    setProcessingSettlementAction,
  ] = useState<string | null>(null);

  function beginSettlementMutation(
    actionKey: string
  ) {
    if (settlementMutationLockRef.current) {
      return false;
    }

    settlementMutationLockRef.current =
      actionKey;
    setProcessingSettlementAction(
      actionKey
    );

    return true;
  }

  function finishSettlementMutation(
    actionKey: string
  ) {
    if (
      settlementMutationLockRef.current !==
      actionKey
    ) {
      return;
    }

    settlementMutationLockRef.current = null;
    setProcessingSettlementAction(null);
  }

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

  const [payerMemberId, setPayerMemberId] =
    useState("");

  const [
    participantMemberIds,
    setParticipantMemberIds,
  ] = useState<string[]>([]);

  const [lenderMemberId, setLenderMemberId] =
    useState("");

  const [borrowerMemberId, setBorrowerMemberId] =
    useState("");

  const memberOptions =
    useMemo(() => {
      return getExpenseMemberOptions(
        trip,
        currentUserId
      );
    }, [trip, currentUserId]);

  const memberDisplayOptions =
    useMemo(() => {
      return getExpenseMemberOptions(
        trip,
        currentUserId,
        true
      );
    }, [trip, currentUserId]);

  const memberIds = useMemo(
    () => memberOptions.map((member) => member.id),
    [memberOptions]
  );

  const currentMember = useMemo(
    () =>
      currentUserId
        ? memberOptions.find(
            (member) =>
              member.userId === currentUserId
          ) ?? null
        : null,
    [memberOptions, currentUserId]
  );

  const currentMemberId = currentMember?.id ?? null;

  // 구형 이름 기반 대여금은 이름이 유일할 때만 현재 사용자와 연결해
  // 표시한다. 저장 데이터 자체를 memberId로 변환하지 않는다.
  const legacyCurrentUserName =
    currentMember &&
    memberOptions.filter(
      (member) =>
        member.displayName === currentMember.displayName
    ).length === 1
      ? currentMember.displayName
      : null;

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
    rates: ExchangeRates
  ) {
    const rateValue =
      selectedCurrency === "JPY"
        ? rates.JPY * 100
        : rates[
            selectedCurrency
          ];

    return formatNumericInput(
      String(rateValue),
      true
    );
  }

  const loadData =
    useCallback(async () => {
      const tripData =
        await getCurrentTripWithRecovery();

      const storedCurrentUserId =
        await getStoredUserId();

      const paymentData =
        await getSettlementPayments();

      const savedSettings =
        await getExpenseSettings();

      const effectiveRates:
        ExchangeRates = {
          ...defaultRates,
          ...(savedSettings
            ?.exchangeRates ?? {}),
        };

      const normalizedExpenses:
        ExpenseWithSnapshot[] =
        await getExpensesWithSnapshots(
          effectiveRates
        );

      setTrip(tripData);
      setCurrentUserId(storedCurrentUserId);

      setExpenses(
        [...normalizedExpenses].sort(
          (a, b) =>
            `${b.date}`.localeCompare(
              `${a.date}`
            )
        )
      );

      setSettlementPayments(
        paymentData
      );

      const members = getExpenseMemberOptions(
        tripData,
        storedCurrentUserId
      );
      const memberIds = members.map(
        (member) => member.id
      );
      const me =
        storedCurrentUserId
          ? members.find(
              (member) =>
                member.userId === storedCurrentUserId
            )?.id ?? ""
          : "";
      const defaultMemberId =
        me || memberIds[0] || "";

      setPayerMemberId((current) =>
        memberIds.includes(current)
          ? current
          : defaultMemberId
      );

      setLenderMemberId((current) =>
        memberIds.includes(current)
          ? current
          : defaultMemberId
      );

      setBorrowerMemberId((current) => {
        if (
          current &&
          memberIds.includes(current)
        ) {
          return current;
        }

        return (
          memberIds.find(
            (memberId) =>
              memberId !== defaultMemberId
          ) ?? defaultMemberId
        );
      });

      setParticipantMemberIds(
        (current) => {
          const valid =
            current.filter(
              (memberId) =>
                memberIds.includes(memberId)
            );

          return valid.length > 0
            ? valid
            : memberIds;
        }
      );

      if (savedSettings) {
        setBudget(
          formatNumericInput(
            String(
              savedSettings.budgetKrw ??
                0
            )
          )
        );

        setCashBudget(
          formatNumericInput(
            String(
              savedSettings.cashBudgetKrw ??
                0
            )
          )
        );

        setCardBudget(
          formatNumericInput(
            String(
              savedSettings.cardBudgetKrw ??
                0
            )
          )
        );

        setCurrency(
          savedSettings.defaultCurrency
        );

        setExchangeRates(
          effectiveRates
        );

        setRateInput(
          getRateDisplayValue(
            savedSettings.defaultCurrency,
            effectiveRates
          )
        );
      } else {
        const defaultCurrency =
          getDefaultCurrency(
            tripData?.country
          );

        setBudget("");
        setCashBudget("");
        setCardBudget("");

        setCurrency(
          defaultCurrency
        );

        setExchangeRates(
          defaultRates
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

  const budgetNumber =
    parseNumericInput(
      budget
    );

  const cashBudgetNumber =
    parseNumericInput(
      cashBudget
    );

  const cardBudgetNumber =
    parseNumericInput(
      cardBudget
    );

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
            getExpenseSettlementStatus(
              expense,
              settlementPayments
            ).status === "settled"
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
            expense.lenderMemberId
              ? expense.lenderMemberId ===
                currentMemberId
              : Boolean(
                  legacyCurrentUserName &&
                    expense.lender ===
                      legacyCurrentUserName
                )
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
            expense.borrowerMemberId
              ? expense.borrowerMemberId ===
                currentMemberId
              : Boolean(
                  legacyCurrentUserName &&
                    expense.borrower ===
                      legacyCurrentUserName
                )
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
      currentMemberId,
      legacyCurrentUserName,
      settlementPayments,
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
      calculateRate(
        currency,
        rateInput
      );

    if (
      calculatedRate <= 0
    ) {
      Alert.alert(
        "환율 확인",
        "올바른 환율을 입력해주세요."
      );

      return;
    }

    try {
      // 환율을 바꾸기 전에 구형 기록을 이전 환율로 먼저 고정한다.
      const frozenExpenses =
        await getExpensesWithSnapshots(
          exchangeRates
        );

      setExpenses(
        [...frozenExpenses].sort(
          (a, b) =>
            `${b.date}`.localeCompare(
              `${a.date}`
            )
        )
      );

      const newRates = {
        ...exchangeRates,

        [currency]:
          calculatedRate,
      };

      await saveSettings(
        currency,
        newRates
      );

      setExchangeRates(
        newRates
      );

      Alert.alert(
        "완료",
        "환율을 저장했습니다."
      );
    } catch (error) {
      console.error(
        "환율 저장 실패:",
        error
      );

      Alert.alert(
        "환율 저장 실패",
        "기존 지출 기록을 보존하지 못해 환율을 변경하지 않았습니다. 다시 시도해주세요."
      );
    }
  }

  const previewKrw =
    useMemo(() => {
      const localAmount =
        parseNumericInput(
          amount
        );

      const rate =
        calculateRate(
          currency,
          rateInput
        );

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
        parseNumericInput(
          amount
        );

      if (
        !localAmount ||
        participantMemberIds.length ===
          0
      ) {
        return 0;
      }

      return (
        localAmount /
        participantMemberIds.length
      );
    }, [
      amount,
      participantMemberIds,
      expenseType,
    ]);

  function toggleParticipant(
    memberId: string
  ) {
    setParticipantMemberIds(
      (current) => {
        if (
          current.includes(memberId)
        ) {
          if (
            current.length ===
            1
          ) {
            return current;
          }

          return current.filter(
            (item) =>
              item !== memberId
          );
        }

        return [
          ...current,
          memberId,
        ];
      }
    );
  }

  async function handleAddExpense() {
    const localAmount =
      parseNumericInput(
        amount
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
      calculateRate(
        currency,
        rateInput
      );

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
      (
        !payerMemberId ||
        participantMemberIds.length === 0 ||
        !memberIds.includes(payerMemberId) ||
        participantMemberIds.some(
          (memberId) =>
            !memberIds.includes(memberId)
        )
      )
    ) {
      Alert.alert(
        "참여자 확인",
        "현재 여행의 결제자와 공동 지출 참여자를 선택해주세요."
      );

      return;
    }

    if (
      expenseType === "loan" &&
      (
        !lenderMemberId ||
        !borrowerMemberId ||
        !memberIds.includes(lenderMemberId) ||
        !memberIds.includes(borrowerMemberId)
      )
    ) {
      Alert.alert(
        "대여 정보 확인",
        "현재 여행의 빌려준 사람과 빌린 사람을 선택해주세요."
      );

      return;
    }

    if (
      expenseType === "loan" &&
      lenderMemberId === borrowerMemberId
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

    const newExpense:
      ExpenseWithSnapshot =
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

        paidByMemberId:
          expenseType ===
          "shared"
            ? payerMemberId
            : undefined,

        participantMemberIds:
          expenseType ===
          "shared"
            ? participantMemberIds
            : undefined,

        lenderMemberId:
          expenseType ===
          "loan"
            ? lenderMemberId
            : undefined,

        borrowerMemberId:
          expenseType ===
          "loan"
            ? borrowerMemberId
            : undefined,

        loanSettled:
          expenseType ===
          "loan"
            ? false
            : undefined,

        loanSettledAt:
          undefined,
      };

    if (expenseSaveLockRef.current) {
      return;
    }

    expenseSaveLockRef.current = true;
    setSavingExpense(true);

    try {
      const current =
        await getExpenses();

      await saveExpenses([
        ...current,
        newExpense,
      ]);

      setAmount("");
      setMemo("");

      await loadData();
    } finally {
      expenseSaveLockRef.current = false;
      setSavingExpense(false);
    }
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

  function toggleLoanSettlement(
    expense: ExpenseWithSnapshot
  ) {
    if (
      expense.expenseType !==
      "loan"
    ) {
      return;
    }

    const borrowerLabel = getExpensePartyLabel(
      expense.borrowerMemberId,
      expense.borrower,
      memberDisplayOptions
    );
    const lenderLabel = getExpensePartyLabel(
      expense.lenderMemberId,
      expense.lender,
      memberDisplayOptions
    );
    const relation =
      getExpenseSettlementRelations(expense)[0];
    const relationPayment = relation
      ? settlementPayments.find((payment) =>
          payment.resolvedRelations?.some(
            (item) => item.id === relation.id
          )
        )
      : undefined;
    const directLoanPayment =
      relationPayment?.source === "loan"
        ? relationPayment
        : undefined;
    const isCompleting =
      !expense.loanSettled &&
      !directLoanPayment &&
      !relationPayment;

    if (
      !expense.loanSettled &&
      relationPayment &&
      !directLoanPayment
    ) {
      Alert.alert(
        "최종 정산에 포함된 기록",
        "이 대여 기록은 최종 정산 완료 내역에서 취소할 수 있습니다."
      );
      return;
    }

    const actionKey = `loan:${expense.id}`;

    if (!beginSettlementMutation(actionKey)) {
      return;
    }

    try {
      Alert.alert(
        isCompleting
          ? "정산 완료"
          : "정산 완료 취소",

        isCompleting
          ? `${borrowerLabel} → ${lenderLabel}\n₩${formatMoney(
              expense.krwAmount
            )}\n\n실제로 갚은 것이 맞나요?`
          : "이 대여금을 다시 미정산 상태로 바꿀까요?",

        [
          {
            text: "취소",
            style: "cancel",
            onPress: () =>
              finishSettlementMutation(
                actionKey
              ),
          },

          {
            text:
              isCompleting
                ? "정산 완료"
                : "미정산으로 변경",

            onPress:
              async () => {
                try {
                  if (expense.loanSettled) {
                    const current =
                      await getExpenses();
                    const updated = current.map(
                      (item: Expense) =>
                        item.id === expense.id
                          ? {
                              ...item,
                              loanSettled: false,
                              loanSettledAt: undefined,
                            }
                          : item
                    );

                    await saveExpenses(updated);
                  } else if (directLoanPayment) {
                    await deleteSettlementPayment(
                      directLoanPayment.id
                    );
                  } else if (relation) {
                    const current =
                      await getSettlementPayments();
                    const newPayment: SettlementPayment = {
                      id: Date.now().toString(),
                      source: "loan",
                      fromMemberId: relation.fromMemberId,
                      toMemberId: relation.toMemberId,
                      amountKrw: relation.amountKrw,
                      date: getTodayString(),
                      resolvedRelations: [relation],
                    };

                    await saveSettlementPayments([
                      ...current,
                      newPayment,
                    ]);
                  } else {
                    // 이름 기반 legacy 대여는 기존 필드를 그대로 사용한다.
                    const current =
                      await getExpenses();
                    const updated = current.map(
                      (item: Expense) =>
                        item.id === expense.id
                          ? {
                              ...item,
                              loanSettled: true,
                              loanSettledAt: getTodayString(),
                            }
                          : item
                    );

                    await saveExpenses(updated);
                  }

                  await loadData();
                } finally {
                  finishSettlementMutation(
                    actionKey
                  );
                }
              },
          },
        ],
        {
          cancelable: false,
        }
      );
    } catch (error) {
      finishSettlementMutation(actionKey);
      throw error;
    }
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
    useMemo(
      () =>
        calculateExpenseSettlements(
          expenses,
          settlementPayments,
          memberDisplayOptions
        ),
      [expenses, settlementPayments, memberDisplayOptions]
    );

  const resolvedSettlementRelationIds = useMemo(
    () =>
      getResolvedSettlementRelationIds(
        settlementPayments
      ),
    [settlementPayments]
  );

  const currentSettlementBreakdown = useMemo(() => {
    if (!currentMemberId) {
      return null;
    }

    let sharedBalance = 0;
    let loanBalance = 0;
    let completedPaymentBalance = 0;

    expenses.forEach((expense) => {
      if (
        expense.expenseType === "shared" &&
        expense.paidByMemberId &&
        expense.participantMemberIds?.length
      ) {
        const uniqueParticipants = [
          ...new Set(expense.participantMemberIds),
        ];
        const share =
          expense.krwAmount /
          uniqueParticipants.length;

        if (expense.paidByMemberId === currentMemberId) {
          sharedBalance += expense.krwAmount;
        }

        if (uniqueParticipants.includes(currentMemberId)) {
          sharedBalance -= share;
        }
      }

      if (
        expense.expenseType === "loan" &&
        !expense.loanSettled
      ) {
        if (expense.lenderMemberId === currentMemberId) {
          loanBalance += expense.krwAmount;
        }

        if (expense.borrowerMemberId === currentMemberId) {
          loanBalance -= expense.krwAmount;
        }
      }
    });

    settlementPayments.forEach((payment) => {
      if (payment.fromMemberId === currentMemberId) {
        completedPaymentBalance += payment.amountKrw;
      }

      if (payment.toMemberId === currentMemberId) {
        completedPaymentBalance -= payment.amountKrw;
      }
    });

    return {
      sharedBalance,
      loanBalance,
      completedPaymentBalance,
      total:
        sharedBalance +
        loanBalance +
        completedPaymentBalance,
    };
  }, [
    currentMemberId,
    expenses,
    settlementPayments,
  ]);

  const currentSettlementCount = settlements.filter(
    (settlement) =>
      settlement.fromMemberId === currentMemberId ||
      settlement.toMemberId === currentMemberId
  ).length;

  function completeSettlement(
    settlement: ExpenseSettlement
  ) {
    const actionKey =
      `final:${settlement.fromKey}:${settlement.toKey}`;

    if (!beginSettlementMutation(actionKey)) {
      return;
    }

    try {
      Alert.alert(
        "정산 완료",
        `${settlement.fromLabel} → ${settlement.toLabel}\n₩${formatMoney(
          settlement.amount
        )}\n\n실제로 송금이 완료됐나요?`,
        [
          {
            text: "취소",
            style: "cancel",
            onPress: () =>
              finishSettlementMutation(
                actionKey
              ),
          },

          {
            text: "완료",

            onPress:
              async () => {
                try {
                  const resolvedRelations =
                    getRelationsResolvedBySettlement(
                      expenses,
                      settlementPayments,
                      settlement
                    );
                  const newPayment: SettlementPayment =
                    {
                      id:
                        Date.now().toString(),

                      source: "final",

                      fromMemberId:
                        settlement.fromMemberId,

                      toMemberId:
                        settlement.toMemberId,

                      from:
                        settlement.fromLegacyName,

                      to:
                        settlement.toLegacyName,

                      amountKrw:
                        settlement.amount,

                      date:
                        getTodayString(),

                      resolvedRelations,
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
                } finally {
                  finishSettlementMutation(
                    actionKey
                  );
                }
              },
          },
        ],
        {
          cancelable: false,
        }
      );
    } catch (error) {
      finishSettlementMutation(actionKey);
      throw error;
    }
  }

  function cancelSettlement(
    payment: SettlementPayment
  ) {
    const actionKey = `payment:${payment.id}`;

    if (!beginSettlementMutation(actionKey)) {
      return;
    }

    try {
      Alert.alert(
        "정산 완료 취소",
        "이 정산 완료 기록을 취소할까요?",
        [
          {
            text: "취소",
            style: "cancel",
            onPress: () =>
              finishSettlementMutation(
                actionKey
              ),
          },

          {
            text:
              "완료 취소",

            onPress:
              async () => {
                try {
                  await deleteSettlementPayment(
                    payment.id
                  );

                  await loadData();
                } finally {
                  finishSettlementMutation(
                    actionKey
                  );
                }
              },
          },
        ],
        {
          cancelable: false,
        }
      );
    } catch (error) {
      finishSettlementMutation(actionKey);
      throw error;
    }
  }

  function formatExpenseDate(date: string) {
    return date.replace(/-/g, ".");
  }

  function paymentMethodLabel(
    method?: PaymentMethod
  ) {
    return method === "card" ? "카드" : "현금";
  }

  function formatSignedWon(value: number) {
    const rounded = Math.round(value);
    return rounded < 0
      ? `-₩${formatMoney(Math.abs(rounded))}`
      : `₩${formatMoney(rounded)}`;
  }

  function getSharedParticipantLabels(
    expense: ExpenseWithSnapshot
  ) {
    if (expense.participantMemberIds) {
      return [
        ...new Set(expense.participantMemberIds),
      ].map(
        (memberId) => ({
          key: memberId,
          label: getExpensePartyLabel(
            memberId,
            undefined,
            memberDisplayOptions
          ),
        })
      );
    }

    return [
      ...new Set(expense.participants ?? []),
    ].map(
      (name, index) => ({
        key: `legacy-${index}-${name}`,
        label: name,
      })
    );
  }

  function getSettlementBreakdownRows(
    settlement: ExpenseSettlement
  ) {
    if (
      !currentSettlementBreakdown ||
      currentSettlementCount !== 1
    ) {
      return [];
    }

    const direction =
      settlement.fromMemberId === currentMemberId
        ? -1
        : settlement.toMemberId === currentMemberId
          ? 1
          : 0;

    if (
      direction === 0 ||
      Math.abs(
        Math.abs(currentSettlementBreakdown.total) -
          settlement.amount
      ) > 1
    ) {
      return [];
    }

    return [
      {
        key: "loan",
        label:
          currentSettlementBreakdown.loanBalance < 0
            ? "빌린 돈"
            : "빌려준 돈",
        value:
          currentSettlementBreakdown.loanBalance * direction,
      },
      {
        key: "shared",
        label:
          currentSettlementBreakdown.sharedBalance < 0
            ? "공동지출 보낼 돈"
            : "공동지출 받을 돈",
        value:
          currentSettlementBreakdown.sharedBalance * direction,
      },
      {
        key: "completed",
        label: "정산 완료 반영",
        value:
          currentSettlementBreakdown.completedPaymentBalance *
          direction,
      },
    ].filter((row) => Math.abs(row.value) > 1);
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
          onChangeText={(
            value
          ) =>
            setBudget(
              formatNumericInput(
                value
              )
            )
          }
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
          onChangeText={(
            value
          ) =>
            setCashBudget(
              formatNumericInput(
                value
              )
            )
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
          onChangeText={(
            value
          ) =>
            setCardBudget(
              formatNumericInput(
                value
              )
            )
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
              onChangeText={(
                value
              ) =>
                setRateInput(
                  formatNumericInput(
                    value,
                    true
                  )
                )
              }
              placeholder="환율"
              placeholderTextColor="#9CA3AF"
              keyboardType="decimal-pad"
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
                    setParticipantMemberIds(
                      memberIds
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
              {memberOptions.map(
                (member) => (
                  <Pressable
                    key={member.id}
                    onPress={() =>
                      setPayerMemberId(member.id)
                    }
                    style={{
                      padding: 10,
                      borderRadius: 20,

                      backgroundColor:
                        payerMemberId ===
                        member.id
                          ? "#111827"
                          : "#F3F4F6",
                    }}
                  >
                    <Text
                      style={{
                        color:
                          payerMemberId ===
                          member.id
                            ? "white"
                            : "#374151",
                      }}
                    >
                      {member.label}
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
              {memberOptions.map(
                (member) => {
                  const selected =
                    participantMemberIds.includes(
                      member.id
                    );

                  return (
                    <Pressable
                      key={member.id}
                      onPress={() =>
                        toggleParticipant(
                          member.id
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
                        {member.label}
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
              {memberOptions.map(
                (member) => (
                  <Pressable
                    key={member.id}
                    onPress={() =>
                      setLenderMemberId(member.id)
                    }
                    style={{
                      padding: 10,
                      borderRadius: 20,

                      backgroundColor:
                        lenderMemberId ===
                        member.id
                          ? "#059669"
                          : "#F3F4F6",
                    }}
                  >
                    <Text
                      style={{
                        color:
                          lenderMemberId ===
                          member.id
                            ? "white"
                            : "#374151",
                      }}
                    >
                      {member.label}
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
              {memberOptions.map(
                (member) => (
                  <Pressable
                    key={member.id}
                    onPress={() =>
                      setBorrowerMemberId(
                        member.id
                      )
                    }
                    style={{
                      padding: 10,
                      borderRadius: 20,

                      backgroundColor:
                        borrowerMemberId ===
                        member.id
                          ? "#DC2626"
                          : "#F3F4F6",
                    }}
                  >
                    <Text
                      style={{
                        color:
                          borrowerMemberId ===
                          member.id
                            ? "white"
                            : "#374151",
                      }}
                    >
                      {member.label}
                    </Text>
                  </Pressable>
                )
              )}
            </View>
          </>
        )}

        <TextInput
          value={amount}
          onChangeText={(
            value
          ) =>
            setAmount(
              formatNumericInput(
                value,
                true
              )
            )
          }
          placeholder={`금액 (${currency})`}
          placeholderTextColor="#9CA3AF"
          keyboardType="decimal-pad"
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
              {formatNumericInput(
                String(
                  parseNumericInput(
                    amount
                  )
                ),
                true
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
                    participantMemberIds.length
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
          disabled={
            savingExpense
          }
          onPress={
            handleAddExpense
          }
          style={{
            marginTop: 16,
            backgroundColor:
              savingExpense
                ? "#93C5FD"
                : "#3B82F6",
            paddingVertical: 14,
            borderRadius: 12,
            alignItems:
              "center",
            opacity:
              savingExpense
                ? 0.7
                : 1,
          }}
        >
          <Text
            style={{
              color: "white",
              fontWeight: "bold",
            }}
          >
            {savingExpense
              ? "저장 중..."
              : "기록 저장"}
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
            (settlement, index) => {
              const actionKey =
                `final:${settlement.fromKey}:${settlement.toKey}`;
              const isProcessing =
                processingSettlementAction ===
                actionKey;
              const isCurrentFrom =
                settlement.fromMemberId ===
                currentMemberId;
              const isCurrentTo =
                settlement.toMemberId ===
                currentMemberId;
              const breakdownRows =
                getSettlementBreakdownRows(
                  settlement
                );
              const hasDetailedBreakdown =
                breakdownRows.length >= 2;

              return (
                <View
                key={`${settlement.fromKey}-${settlement.toKey}-${index}`}
                style={{
                  marginTop: 12,
                  backgroundColor: "#FFF7ED",
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: "#FED7AA",
                }}
              >
                <View
                  style={{
                    alignSelf: "flex-start",
                    paddingHorizontal: 9,
                    paddingVertical: 5,
                    borderRadius: 999,
                    backgroundColor: "#FFEDD5",
                  }}
                >
                  <Text
                    style={{
                      color: "#C2410C",
                      fontSize: 12,
                      fontWeight: "bold",
                    }}
                  >
                    ● 미정산
                  </Text>
                </View>

                <Text
                  style={{
                    marginTop: 14,
                    color: "#374151",
                    fontSize: 15,
                  }}
                >
                  {isCurrentFrom
                    ? `내가 ${settlement.toLabel}에게`
                    : isCurrentTo
                      ? `${settlement.fromLabel}에게`
                      : `${settlement.fromLabel} → ${settlement.toLabel}`}
                </Text>

                <Text
                  style={{
                    marginTop: 4,
                    fontSize: 27,
                    color: "#C2410C",
                    fontWeight: "bold",
                  }}
                >
                  ₩{formatMoney(settlement.amount)}{" "}
                  <Text style={{ fontSize: 17 }}>
                    {isCurrentTo
                      ? "받으면 끝"
                      : isCurrentFrom
                        ? "보내면 끝"
                        : "보내면 정산"}
                  </Text>
                </Text>

                {hasDetailedBreakdown ? (
                  <View
                    style={{
                      marginTop: 16,
                      paddingTop: 12,
                      borderTopWidth: 1,
                      borderTopColor: "#FED7AA",
                    }}
                  >
                    {breakdownRows.map((row) => (
                      <View
                        key={row.key}
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: 12,
                          marginTop: 7,
                        }}
                      >
                        <Text
                          style={{
                            flex: 1,
                            color: "#6B7280",
                          }}
                        >
                          {row.label}
                        </Text>
                        <Text
                          style={{
                            color: "#374151",
                            fontWeight: "bold",
                          }}
                        >
                          {formatSignedWon(row.value)}
                        </Text>
                      </View>
                    ))}

                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 12,
                        marginTop: 12,
                        paddingTop: 11,
                        borderTopWidth: 1,
                        borderTopColor: "#FED7AA",
                      }}
                    >
                      <Text
                        style={{
                          flex: 1,
                          color: "#111827",
                          fontWeight: "bold",
                        }}
                      >
                        최종
                      </Text>
                      <Text
                        style={{
                          color: "#C2410C",
                          fontWeight: "bold",
                        }}
                      >
                        ₩{formatMoney(settlement.amount)}
                      </Text>
                    </View>
                  </View>
                ) : breakdownRows.length === 1 ? (
                  <Text
                    style={{
                      marginTop: 14,
                      color: "#6B7280",
                      fontSize: 13,
                    }}
                  >
                    {breakdownRows[0].label} ·{" "}
                    {formatSignedWon(breakdownRows[0].value)}
                  </Text>
                ) : (
                  <Text
                    style={{
                      marginTop: 10,
                      color: "#6B7280",
                      fontSize: 13,
                    }}
                  >
                    공동지출과 대여 내역을 모두 합산한 금액입니다.
                  </Text>
                )}

                <Pressable
                  disabled={
                    processingSettlementAction !==
                    null
                  }
                  onPress={() =>
                    completeSettlement(
                      settlement
                    )
                  }
                  style={{
                    marginTop: 16,
                    backgroundColor: isProcessing
                      ? "#9CA3AF"
                      : "#C2410C",
                    paddingVertical: 12,
                    borderRadius: 12,
                    alignItems:
                      "center",
                    opacity:
                      processingSettlementAction &&
                      !isProcessing
                        ? 0.55
                        : 1,
                  }}
                >
                  <Text
                    style={{
                      color: "white",
                      fontWeight:
                        "bold",
                    }}
                  >
                    {isProcessing
                      ? "처리 중..."
                      : "정산 완료"}
                  </Text>
                </Pressable>
                </View>
              );
            }
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
            (payment) => {
              const actionKey =
                `payment:${payment.id}`;
              const isProcessing =
                processingSettlementAction ===
                actionKey;
              const fromLabel = getExpensePartyLabel(
                payment.fromMemberId,
                payment.from,
                memberDisplayOptions
              );
              const toLabel = getExpensePartyLabel(
                payment.toMemberId,
                payment.to,
                memberDisplayOptions
              );
              const isCurrentFrom = Boolean(
                currentMemberId &&
                  payment.fromMemberId === currentMemberId
              );
              const isCurrentTo = Boolean(
                currentMemberId &&
                  payment.toMemberId === currentMemberId
              );

              return (
              <View
                key={payment.id}
                style={{
                  marginTop: 12,
                  backgroundColor: "#F0FDF4",
                  borderRadius: 14,
                  padding: 15,
                  borderWidth: 1,
                  borderColor: "#BBF7D0",
                }}
              >
                <View
                  style={{
                    alignSelf: "flex-start",
                    paddingHorizontal: 9,
                    paddingVertical: 5,
                    borderRadius: 999,
                    backgroundColor: "#DCFCE7",
                  }}
                >
                  <Text
                    style={{
                      color: "#15803D",
                      fontSize: 12,
                      fontWeight: "bold",
                    }}
                  >
                    ✓ 정산완료
                  </Text>
                </View>

                <Text
                  style={{
                    marginTop: 12,
                    color: "#111827",
                    fontSize: 16,
                    fontWeight: "bold",
                  }}
                >
                  {isCurrentFrom
                    ? `${toLabel}에게 보냄`
                    : isCurrentTo
                      ? `${fromLabel}에게 받음`
                      : `${fromLabel} → ${toLabel}`}
                </Text>

                <Text
                  style={{
                    marginTop: 5,
                    color: "#15803D",
                    fontSize: 21,
                    fontWeight: "bold",
                  }}
                >
                  ₩{formatMoney(payment.amountKrw)}
                </Text>

                <Text
                  style={{
                    marginTop: 8,
                    color: "#9CA3AF",
                    fontSize: 12,
                  }}
                >
                  {formatExpenseDate(payment.date)}
                </Text>

                <Pressable
                  disabled={
                    processingSettlementAction !==
                    null
                  }
                  onPress={() =>
                    cancelSettlement(
                      payment
                    )
                  }
                  style={{
                    alignSelf: "flex-end",
                    marginTop: 6,
                    paddingHorizontal: 4,
                    paddingVertical: 4,
                    opacity:
                      processingSettlementAction &&
                      !isProcessing
                        ? 0.45
                        : 1,
                  }}
                >
                  <Text
                    style={{
                      color: "#6B7280",
                      fontSize: 12,
                    }}
                  >
                    {isProcessing
                      ? "처리 중..."
                      : "정산 완료 취소"}
                  </Text>
                </Pressable>
              </View>
              );
            }
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
          (expense) => {
            const isShared =
              expense.expenseType === "shared";
            const isLoan =
              expense.expenseType === "loan";
            const settlementStatus =
              getExpenseSettlementStatus(
                expense,
                settlementPayments
              );
            const expenseRelations =
              getExpenseSettlementRelations(expense);
            const isLoanSettled =
              isLoan &&
              settlementStatus.status === "settled";
            const loanRelationPayment =
              isLoan && expenseRelations[0]
                ? settlementPayments.find((payment) =>
                    payment.resolvedRelations?.some(
                      (relation) =>
                        relation.id ===
                        expenseRelations[0].id
                    )
                  )
                : undefined;
            const isLoanResolvedByFinal = Boolean(
              isLoanSettled &&
                !expense.loanSettled &&
                loanRelationPayment &&
                loanRelationPayment.source !== "loan"
            );
            const loanActionKey =
              `loan:${expense.id}`;
            const isProcessingLoanSettlement =
              processingSettlementAction ===
              loanActionKey;
            const participants = isShared
              ? getSharedParticipantLabels(expense)
              : [];
            const payerLabel = getExpensePartyLabel(
              expense.paidByMemberId,
              expense.payer,
              memberDisplayOptions
            );
            const lenderLabel = getExpensePartyLabel(
              expense.lenderMemberId,
              expense.lender,
              memberDisplayOptions
            );
            const borrowerLabel = getExpensePartyLabel(
              expense.borrowerMemberId,
              expense.borrower,
              memberDisplayOptions
            );
            const isCurrentBorrower = Boolean(
              currentMemberId &&
                expense.borrowerMemberId === currentMemberId
            );
            const isCurrentLender = Boolean(
              currentMemberId &&
                expense.lenderMemberId === currentMemberId
            );
            const loanBadge = isCurrentBorrower
              ? "빌린 돈"
              : isCurrentLender
                ? "빌려준 돈"
                : "대여";
            const loanTitle = isCurrentBorrower
              ? `${lenderLabel}에게 빌림`
              : isCurrentLender
                ? `${borrowerLabel}에게 빌려줌`
                : `${lenderLabel}이 ${borrowerLabel}에게 빌려줌`;
            const loanMeaning = isCurrentBorrower
              ? "내가 갚아야 할 돈"
              : isCurrentLender
                ? "내가 받을 돈"
                : `${borrowerLabel}이 갚아야 할 돈`;

            return (
            <View
              key={expense.id}
              style={{
                marginTop: 12,
                padding: 17,
                backgroundColor: "white",
                borderRadius: 18,
                borderWidth: 1,
                borderColor: "#E5E7EB",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 7,
                }}
              >
                <View
                  style={{
                    paddingHorizontal: 9,
                    paddingVertical: 5,
                    borderRadius: 999,
                    backgroundColor: isLoan
                      ? "#F3E8FF"
                      : isShared
                        ? "#DBEAFE"
                        : "#F3F4F6",
                  }}
                >
                  <Text
                    style={{
                      color: isLoan
                        ? "#7E22CE"
                        : isShared
                          ? "#1D4ED8"
                          : "#4B5563",
                      fontSize: 12,
                      fontWeight: "bold",
                    }}
                  >
                    {isLoan
                      ? loanBadge
                      : isShared
                        ? "공동지출"
                        : "개인지출"}
                  </Text>
                </View>

                {isLoan ? (
                  <View
                    style={{
                      paddingHorizontal: 9,
                      paddingVertical: 5,
                      borderRadius: 999,
                      backgroundColor: isLoanSettled
                        ? "#DCFCE7"
                        : "#FEE2E2",
                    }}
                  >
                    <Text
                      style={{
                        color: isLoanSettled
                          ? "#15803D"
                          : "#DC2626",
                        fontSize: 12,
                        fontWeight: "bold",
                      }}
                    >
                      {isLoanSettled
                        ? "✓ 정산완료"
                        : "● 미정산"}
                    </Text>
                  </View>
                ) : isShared ? (
                  <View
                    style={{
                      paddingHorizontal: 9,
                      paddingVertical: 5,
                      borderRadius: 999,
                      backgroundColor:
                        settlementStatus.status === "settled"
                          ? "#DCFCE7"
                          : settlementStatus.status === "partial"
                            ? "#E0E7FF"
                            : "#FEF3C7",
                    }}
                  >
                    <Text
                      style={{
                        color:
                          settlementStatus.status === "settled"
                            ? "#15803D"
                            : settlementStatus.status === "partial"
                              ? "#4338CA"
                              : "#92400E",
                        fontSize: 12,
                        fontWeight: "bold",
                      }}
                    >
                      {settlementStatus.status === "settled"
                        ? "✓ 정산완료"
                        : settlementStatus.status === "partial"
                          ? "일부 정산"
                          : "정산 대상"}
                    </Text>
                  </View>
                ) : null}

                <Pressable
                  onPress={() => handleDelete(expense)}
                  hitSlop={8}
                  style={{
                    marginLeft: "auto",
                    paddingHorizontal: 5,
                    paddingVertical: 4,
                  }}
                >
                  <Text
                    style={{
                      color: "#9CA3AF",
                      fontSize: 12,
                    }}
                  >
                    삭제
                  </Text>
                </Pressable>
              </View>

              {isShared ? (
                <>
                  <Text
                    style={{
                      marginTop: 14,
                      color: "#111827",
                      fontSize: 18,
                      fontWeight: "bold",
                    }}
                  >
                    {expense.category}
                  </Text>

                  <Text
                    style={{
                      marginTop: 15,
                      color: "#6B7280",
                      fontSize: 13,
                    }}
                  >
                    총 결제
                  </Text>

                  <Text
                    style={{
                      marginTop: 2,
                      color: "#111827",
                      fontSize: 25,
                      fontWeight: "bold",
                    }}
                  >
                    {currencySymbol(expense.currency)}
                    {formatNumericInput(
                      String(expense.localAmount),
                      true
                    )}
                  </Text>

                  <View
                    style={{
                      marginTop: 12,
                      flexDirection: "row",
                      alignItems: "flex-start",
                      gap: 12,
                    }}
                  >
                    <Text
                      style={{
                        color: "#6B7280",
                        fontSize: 13,
                      }}
                    >
                      결제자
                    </Text>
                    <Text
                      style={{
                        flex: 1,
                        color: "#111827",
                        fontWeight: "bold",
                      }}
                    >
                      {payerLabel}
                    </Text>
                  </View>

                  <View
                    style={{
                      marginTop: 14,
                      paddingTop: 12,
                      borderTopWidth: 1,
                      borderTopColor: "#E5E7EB",
                    }}
                  >
                    {participants.map((participant) => {
                      const relation = expenseRelations.find(
                        (item) =>
                          item.fromMemberId === participant.key
                      );
                      const isResolved = Boolean(
                        relation &&
                          resolvedSettlementRelationIds.has(
                            relation.id
                          )
                      );
                      const isPayerShare =
                        participant.key ===
                        expense.paidByMemberId;

                      return (
                        <View
                          key={participant.key}
                          style={{
                            flexDirection: "row",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: 12,
                            marginTop: 7,
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text
                              numberOfLines={2}
                              style={{
                                color: "#374151",
                              }}
                            >
                              {participant.label}
                            </Text>
                            {isResolved || isPayerShare ? (
                              <Text
                                style={{
                                  marginTop: 2,
                                  color: isResolved
                                    ? "#15803D"
                                    : "#9CA3AF",
                                  fontSize: 11,
                                }}
                              >
                                {isResolved
                                  ? "✓ 정산완료"
                                  : "본인 부담"}
                              </Text>
                            ) : null}
                          </View>
                          <Text
                            style={{
                              color: "#111827",
                              fontWeight: "bold",
                            }}
                          >
                            {participants.length > 0 &&
                            expense.krwAmount % participants.length !== 0
                              ? "약 "
                              : ""}
                            ₩{formatMoney(
                              participants.length > 0
                                ? expense.krwAmount /
                                    participants.length
                                : 0
                            )}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </>
              ) : isLoan ? (
                <>
                  <Text
                    style={{
                      marginTop: 14,
                      color: "#111827",
                      fontSize: 18,
                      fontWeight: "bold",
                    }}
                  >
                    {loanTitle}
                  </Text>

                  <Text
                    style={{
                      marginTop: 12,
                      color: "#111827",
                      fontSize: 25,
                      fontWeight: "bold",
                    }}
                  >
                    {currencySymbol(expense.currency)}
                    {formatNumericInput(
                      String(expense.localAmount),
                      true
                    )}
                  </Text>

                  <Text
                    style={{
                      marginTop: 6,
                      color: isCurrentBorrower
                        ? "#DC2626"
                        : isCurrentLender
                          ? "#059669"
                          : "#6B7280",
                      fontWeight: "bold",
                    }}
                  >
                    {loanMeaning}
                  </Text>

                  {isLoanResolvedByFinal ? (
                    <View
                      style={{
                        marginTop: 14,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: 10,
                        backgroundColor: "#F0FDF4",
                        borderWidth: 1,
                        borderColor: "#BBF7D0",
                      }}
                    >
                      <Text
                        style={{
                          color: "#15803D",
                          textAlign: "center",
                          fontWeight: "bold",
                        }}
                      >
                        최종 정산에 포함된 기록입니다
                      </Text>
                    </View>
                  ) : (
                    <Pressable
                      disabled={
                        processingSettlementAction !==
                        null
                      }
                      onPress={() =>
                        toggleLoanSettlement(expense)
                      }
                      style={{
                        marginTop: 14,
                        paddingVertical: 10,
                        borderRadius: 10,
                        alignItems: "center",
                        backgroundColor: isLoanSettled
                          ? "#F0FDF4"
                          : "#FEF2F2",
                        borderWidth: 1,
                        borderColor: isLoanSettled
                          ? "#BBF7D0"
                          : "#FECACA",
                        opacity:
                          processingSettlementAction &&
                          !isProcessingLoanSettlement
                            ? 0.55
                            : 1,
                      }}
                    >
                      <Text
                        style={{
                          color: isLoanSettled
                            ? "#15803D"
                            : "#DC2626",
                          fontWeight: "bold",
                        }}
                      >
                        {isProcessingLoanSettlement
                          ? "처리 중..."
                          : isLoanSettled
                            ? "정산 완료 취소"
                            : "대여금 정산 완료"}
                      </Text>
                    </Pressable>
                  )}
                </>
              ) : (
                <>
                  <Text
                    style={{
                      marginTop: 14,
                      color: "#111827",
                      fontSize: 18,
                      fontWeight: "bold",
                    }}
                  >
                    {expense.category}
                  </Text>

                  <Text
                    style={{
                      marginTop: 12,
                      color: "#111827",
                      fontSize: 25,
                      fontWeight: "bold",
                    }}
                  >
                    {currencySymbol(expense.currency)}
                    {formatNumericInput(
                      String(expense.localAmount),
                      true
                    )}
                  </Text>
                </>
              )}

              {expense.currency !== "KRW" ? (
                <View
                  style={{
                    marginTop: 12,
                    padding: 10,
                    borderRadius: 10,
                    backgroundColor: "#F9FAFB",
                  }}
                >
                  <Text
                    style={{
                      color: "#6B7280",
                      fontSize: 12,
                    }}
                  >
                    저장 당시 환산 ₩{formatMoney(expense.krwAmount)}
                    {" · "}1 {expense.currency} ={" "}
                    {formatNumericInput(
                      String(expense.exchangeRate),
                      true
                    )} KRW
                  </Text>
                </View>
              ) : null}

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
                  marginTop: 13,
                  paddingTop: 12,
                  borderTopWidth: 1,
                  borderTopColor: "#F3F4F6",
                  color: "#9CA3AF",
                  fontSize: 12,
                }}
              >
                {formatExpenseDate(expense.date)} ·{" "}
                {paymentMethodLabel(expense.paymentMethod)}
                {isShared
                  ? ` · ${participants.length}명`
                  : ""}
              </Text>
            </View>
            );
          }
        )
      )}
    </ScrollView>
  );
}
