import {
  Fragment,
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
  allocateEqualShares,
  appendExpenseIdempotently,
  canMemberViewExpense,
  getExpenseShares,
  getMemberLedgerSummary,
  isActiveExpense,
  isPositiveIntegerAmount,
  validateCustomShares,
} from "../../lib/expense-ledger";

import {
  getCurrentTripWithRecovery,
} from "../../services/current-trip";

import {
  CurrencyCode,
  Expense,
  ExpenseCategory,
  ExpenseSettings,
  ExpenseSplitMethod,
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

type ExpenseViewMode =
  | "main"
  | "add"
  | "history"
  | "settlement"
  | "settings";

type ExpenseHistoryTypeFilter = "all" | ExpenseType;
type ExpenseHistoryCurrencyFilter = "all" | "JPY" | "KRW";

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
  const [viewMode, setViewMode] =
    useState<ExpenseViewMode>("main");
  const [historyTypeFilter, setHistoryTypeFilter] =
    useState<ExpenseHistoryTypeFilter>("all");
  const [historyCurrencyFilter, setHistoryCurrencyFilter] =
    useState<ExpenseHistoryCurrencyFilter>("all");
  const [trip, setTrip] =
    useState<Trip | null>(null);

  const [expenseSettingsConfigured, setExpenseSettingsConfigured] =
    useState(false);

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
    "shared"
  );

  const [payerMemberId, setPayerMemberId] =
    useState("");
  const [personalOwnerMemberId, setPersonalOwnerMemberId] =
    useState("");

  const [
    participantMemberIds,
    setParticipantMemberIds,
  ] = useState<string[]>([]);

  const [lenderMemberId, setLenderMemberId] =
    useState("");

  const [borrowerMemberId, setBorrowerMemberId] =
    useState("");

  const [viewingMemberId, setViewingMemberId] = useState("");
  const [splitMethod, setSplitMethod] =
    useState<ExpenseSplitMethod>("equal");
  const [customShareInputs, setCustomShareInputs] =
    useState<Record<string, string>>({});
  const [editingExpenseId, setEditingExpenseId] =
    useState<string | null>(null);
  const [repaymentInputs, setRepaymentInputs] =
    useState<Record<string, string>>({});
  const [showAdvancedExpenseOptions, setShowAdvancedExpenseOptions] =
    useState(false);

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
  const effectiveMemberId =
    viewingMemberId && memberIds.includes(viewingMemberId)
      ? viewingMemberId
      : currentMemberId;

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

      setExpenseSettingsConfigured(Boolean(savedSettings));

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

      setViewingMemberId((current) =>
        memberIds.includes(current) ? current : defaultMemberId
      );

      setPayerMemberId((current) =>
        memberIds.includes(current)
          ? current
          : defaultMemberId
      );

      setPersonalOwnerMemberId((current) =>
        memberIds.includes(current) ? current : defaultMemberId
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
            : defaultMemberId
              ? [defaultMemberId]
              : [];
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
      setViewMode("main");
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

  const activeExpenses = useMemo(
    () => expenses.filter(isActiveExpense),
    [expenses]
  );

  const visibleActiveExpenses = useMemo(
    () =>
      activeExpenses.filter((expense) =>
        canMemberViewExpense(expense, effectiveMemberId)
      ),
    [activeExpenses, effectiveMemberId]
  );

  const cancelledExpenses = useMemo(
    () =>
      expenses.filter(
        (expense) =>
          !isActiveExpense(expense) &&
          canMemberViewExpense(expense, effectiveMemberId)
      ),
    [expenses, effectiveMemberId]
  );

  const memberLedgerSummary = useMemo(
    () =>
      effectiveMemberId
        ? getMemberLedgerSummary(
            activeExpenses,
            settlementPayments,
            effectiveMemberId
          )
        : null,
    [activeExpenses, settlementPayments, effectiveMemberId]
  );

  const filteredHistoryExpenses = useMemo(
    () =>
      visibleActiveExpenses.filter(
        (expense) =>
          (historyTypeFilter === "all" ||
            (expense.expenseType ?? "personal") === historyTypeFilter) &&
          (historyCurrencyFilter === "all" ||
            expense.currency === historyCurrencyFilter)
      ),
    [visibleActiveExpenses, historyTypeFilter, historyCurrencyFilter]
  );

  const recentExpenses = useMemo(
    () => visibleActiveExpenses.slice(0, 5),
    [visibleActiveExpenses]
  );

  const visibleLoanExpenses = useMemo(
    () =>
      visibleActiveExpenses.filter((expense) => expense.expenseType === "loan"),
    [visibleActiveExpenses]
  );

  // 일반 여행 지출
  const totalExpenseKrw =
    useMemo(() => {
      return activeExpenses.reduce(
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
    }, [activeExpenses]);

  // 오늘 사용한 일반 여행 지출
  // 대여금은 실제 소비가 아니므로 오늘 지출에서 제외
  const todayExpenses =
    useMemo(() => {
      const today =
        getTodayString();

      return visibleActiveExpenses.filter(
        (expense) =>
          expense.date ===
            today &&
          expense.expenseType !==
            "loan"
      );
    }, [visibleActiveExpenses]);

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
      return activeExpenses.reduce(
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
    }, [activeExpenses]);

  const cardExpenseKrw =
    useMemo(() => {
      return activeExpenses.reduce(
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
    }, [activeExpenses]);

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

      activeExpenses.forEach(
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

          const repaidKrw = settlementPayments
            .filter(
              (payment) =>
                payment.status !== "cancelled" &&
                payment.relatedExpenseId === expense.id
            )
            .reduce(
              (sum, payment) => sum + (payment.amountKrw ?? 0),
              0
            );
          const value = Math.max(
            0,
            (expense.krwAmount ?? 0) - repaidKrw
          );

          const method =
            expense.paymentMethod ??
            "cash";

          // 내가 빌려준 돈
          if (
            expense.lenderMemberId
              ? expense.lenderMemberId ===
                effectiveMemberId
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
                effectiveMemberId
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
      activeExpenses,
      effectiveMemberId,
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
    setExpenseSettingsConfigured(true);
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
      localAmount <= 0 ||
      ((currency === "JPY" || currency === "KRW") &&
        !isPositiveIntegerAmount(localAmount))
    ) {
      Alert.alert(
        "금액 확인",
        "올바른 금액을 입력해주세요."
      );

      return;
    }

    if (
      expenseType !== "personal" &&
      !isPositiveIntegerAmount(localAmount)
    ) {
      Alert.alert(
        "정산 금액 확인",
        "공동 지출과 대여는 선택한 통화의 1단위 정수 금액으로 입력해주세요."
      );
      return;
    }

    if (currency !== "KRW" && !expenseSettingsConfigured) {
      Alert.alert(
        "환율 설정 필요",
        "외화 지출을 원화 예산에 반영하려면 먼저 예산·환율 설정에서 적용 환율을 저장해주세요.",
        [
          { text: "취소", style: "cancel" },
          { text: "설정으로 이동", onPress: () => setViewMode("settings") },
        ]
      );
      return;
    }

    const participantShares =
      expenseType === "shared" && participantMemberIds.length > 0
        ? splitMethod === "equal"
          ? allocateEqualShares(localAmount, participantMemberIds)
          : participantMemberIds.map((memberId) => ({
              memberId,
              amount: parseNumericInput(customShareInputs[memberId] ?? ""),
            }))
        : undefined;

    if (
      expenseType === "shared" &&
      splitMethod === "custom" &&
      !validateCustomShares(
        localAmount,
        participantMemberIds,
        participantShares ?? []
      )
    ) {
      Alert.alert(
        "직접 분할 확인",
        "각 부담자의 금액을 1엔/1원 단위로 입력하고 합계를 총액과 같게 맞춰주세요."
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
      expenseType === "personal" &&
      (!personalOwnerMemberId || !memberIds.includes(personalOwnerMemberId))
    ) {
      Alert.alert("소유자 확인", "개인 지출의 소유자를 선택해주세요.");
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

    const now = new Date().toISOString();
    const existingExpense = editingExpenseId
      ? expenses.find((item) => item.id === editingExpenseId)
      : undefined;
    const expenseId = existingExpense?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newExpense:
      ExpenseWithSnapshot =
      {
        ...(existingExpense ?? {}),
        id: expenseId,

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

        ownerMemberId:
          expenseType === "personal"
            ? personalOwnerMemberId
            : undefined,

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

        splitMethod:
          expenseType === "shared" ? splitMethod : undefined,

        participantShares:
          expenseType === "shared" ? participantShares : undefined,

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
          existingExpense?.loanSettledAt,

        status: "active",
        createdAt: existingExpense?.createdAt ?? now,
        updatedAt: now,
        createdByMemberId:
          existingExpense?.createdByMemberId ?? effectiveMemberId ?? undefined,
        updatedByMemberId: effectiveMemberId ?? undefined,
        idempotencyKey:
          existingExpense?.idempotencyKey ?? expenseId,
        changeHistory: [
          ...(existingExpense?.changeHistory ?? []),
          {
            id: `${expenseId}:${now}`,
            changedAt: now,
            changedByMemberId: effectiveMemberId ?? undefined,
            action: existingExpense ? "updated" : "created",
            summary: existingExpense ? "지출 내용을 수정함" : "지출을 생성함",
          },
        ],
      };

    if (expenseSaveLockRef.current) {
      return;
    }

    expenseSaveLockRef.current = true;
    setSavingExpense(true);

    try {
      const current =
        await getExpenses();

      const updated = existingExpense
        ? current.map((item) => (item.id === existingExpense.id ? newExpense : item))
        : appendExpenseIdempotently(current, newExpense);

      await saveExpenses(updated);

      setAmount("");
      setMemo("");
      setEditingExpenseId(null);
      setSplitMethod("equal");
      setCustomShareInputs({});
      setShowAdvancedExpenseOptions(false);

      await loadData();
      setViewMode("main");
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
      "이 기록을 취소할까요? 취소된 기록은 아래에서 복구할 수 있습니다.",
      [
        {
          text: "취소",
          style: "cancel",
        },

        {
          text: "기록 취소",
          style:
            "destructive",

          onPress:
            async () => {
              const now = new Date().toISOString();
              const current = await getExpenses();
              await saveExpenses(
                current.map((item) =>
                  item.id === expense.id
                    ? {
                        ...item,
                        status: "cancelled" as const,
                        cancelledAt: now,
                        updatedAt: now,
                        updatedByMemberId: effectiveMemberId ?? undefined,
                        changeHistory: [
                          ...(item.changeHistory ?? []),
                          {
                            id: `${item.id}:${now}`,
                            changedAt: now,
                            changedByMemberId: effectiveMemberId ?? undefined,
                            action: "cancelled" as const,
                            summary: "지출 기록을 취소함",
                          },
                        ],
                      }
                    : item
                )
              );

              await loadData();
            },
        },
      ]
    );
  }

  function beginEditExpense(expense: ExpenseWithSnapshot) {
    setViewMode("add");
    setEditingExpenseId(expense.id);
    setAmount(formatNumericInput(String(expense.localAmount), true));
    setMemo(expense.memo ?? "");
    setCategory(expense.category);
    setCurrency(expense.currency);
    setRateInput(
      getRateDisplayValue(expense.currency, {
        ...exchangeRates,
        [expense.currency]: expense.exchangeRate,
      })
    );
    setPaymentMethod(expense.paymentMethod ?? "cash");
    setExpenseType(expense.expenseType ?? "personal");
    setPayerMemberId(expense.paidByMemberId ?? effectiveMemberId ?? "");
    setPersonalOwnerMemberId(
      expense.ownerMemberId ?? effectiveMemberId ?? ""
    );
    setParticipantMemberIds(expense.participantMemberIds ?? []);
    setLenderMemberId(expense.lenderMemberId ?? effectiveMemberId ?? "");
    setBorrowerMemberId(expense.borrowerMemberId ?? "");
    setSplitMethod(expense.splitMethod ?? "equal");
    setShowAdvancedExpenseOptions(
      expense.splitMethod === "custom" || Boolean(expense.memo?.trim())
    );
    setCustomShareInputs(
      Object.fromEntries(
        getExpenseShares(expense).map((share) => [
          share.memberId,
          formatNumericInput(String(share.amount)),
        ])
      )
    );
  }

  function openNewExpense() {
    setEditingExpenseId(null);
    setExpenseType("shared");
    setAmount("");
    setMemo("");
    setCategory("식비");
    setPersonalOwnerMemberId(effectiveMemberId ?? memberIds[0] ?? "");
    setPaymentMethod("cash");
    setSplitMethod("equal");
    setCustomShareInputs({});
    setShowAdvancedExpenseOptions(false);
    setParticipantMemberIds(
      payerMemberId ? [payerMemberId] : memberIds.slice(0, 1)
    );
    setViewMode("add");
  }

  async function restoreExpense(expense: Expense) {
    const now = new Date().toISOString();
    const current = await getExpenses();
    await saveExpenses(
      current.map((item) =>
        item.id === expense.id
          ? {
              ...item,
              status: "active" as const,
              cancelledAt: undefined,
              updatedAt: now,
              updatedByMemberId: effectiveMemberId ?? undefined,
              changeHistory: [
                ...(item.changeHistory ?? []),
                {
                  id: `${item.id}:${now}`,
                  changedAt: now,
                  changedByMemberId: effectiveMemberId ?? undefined,
                  action: "restored" as const,
                  summary: "취소한 지출 기록을 복구함",
                },
              ],
            }
          : item
      )
    );
    await loadData();
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
    const repaidLocalAmount = settlementPayments
      .filter(
        (payment) =>
          payment.status !== "cancelled" &&
          payment.relatedExpenseId === expense.id &&
          payment.currency === expense.currency
      )
      .reduce((sum, payment) => sum + (payment.localAmount ?? 0), 0);
    const remainingLocalAmount = Math.max(
      0,
      expense.localAmount - repaidLocalAmount
    );
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
          ? `${borrowerLabel} → ${lenderLabel}\n${currencySymbol(
              expense.currency
            )}${formatMoney(
              remainingLocalAmount
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
                      amountKrw: Math.round(
                        remainingLocalAmount * expense.exchangeRate
                      ),
                      currency: expense.currency,
                      localAmount: remainingLocalAmount,
                      relatedExpenseId: expense.id,
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

  async function addLoanRepayment(expense: ExpenseWithSnapshot) {
    if (
      expense.expenseType !== "loan" ||
      !expense.borrowerMemberId ||
      !expense.lenderMemberId
    ) {
      return;
    }

    const repaymentAmount = parseNumericInput(repaymentInputs[expense.id] ?? "");
    const alreadyRepaid = settlementPayments
      .filter(
        (payment) =>
          payment.status !== "cancelled" &&
          payment.relatedExpenseId === expense.id &&
          payment.currency === expense.currency
      )
      .reduce((sum, payment) => sum + (payment.localAmount ?? 0), 0);
    const remainingAmount = Math.max(0, expense.localAmount - alreadyRepaid);

    if (
      !isPositiveIntegerAmount(repaymentAmount) ||
      repaymentAmount > remainingAmount
    ) {
      Alert.alert(
        "상환 금액 확인",
        `1${expense.currency === "JPY" ? "엔" : "원"} 단위로 남은 금액 이하를 입력해주세요.\n남은 금액: ${currencySymbol(expense.currency)}${formatMoney(remainingAmount)}`
      );
      return;
    }

    const relation = getExpenseSettlementRelations(expense)[0];
    const completesLoan = repaymentAmount === remainingAmount;
    const payment: SettlementPayment = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      source: "loan",
      fromMemberId: expense.borrowerMemberId,
      toMemberId: expense.lenderMemberId,
      currency: expense.currency,
      localAmount: repaymentAmount,
      amountKrw: Math.round(repaymentAmount * expense.exchangeRate),
      relatedExpenseId: expense.id,
      date: getTodayString(),
      resolvedRelations: completesLoan && relation ? [relation] : undefined,
    };

    const current = await getSettlementPayments();
    await saveSettlementPayments([...current, payment]);
    setRepaymentInputs((values) => ({ ...values, [expense.id]: "" }));
    await loadData();
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
          activeExpenses,
          settlementPayments,
          memberDisplayOptions
        ),
      [activeExpenses, settlementPayments, memberDisplayOptions]
    );

  const visibleSettlements = useMemo(
    () =>
      settlements.filter(
        (settlement) =>
          settlement.fromMemberId === effectiveMemberId ||
          settlement.toMemberId === effectiveMemberId ||
          (!settlement.fromMemberId && !settlement.toMemberId)
      ),
    [settlements, effectiveMemberId]
  );

  const visibleSettlementPayments = useMemo(
    () =>
      settlementPayments.filter(
        (payment) =>
          payment.status !== "cancelled" &&
          (!effectiveMemberId ||
            payment.fromMemberId === effectiveMemberId ||
            payment.toMemberId === effectiveMemberId ||
            (!payment.fromMemberId && !payment.toMemberId))
      ),
    [settlementPayments, effectiveMemberId]
  );

  const resolvedSettlementRelationIds = useMemo(
    () =>
      getResolvedSettlementRelationIds(
        settlementPayments
      ),
    [settlementPayments]
  );

  const currentSettlementBreakdown = useMemo(() => {
    if (!effectiveMemberId) {
      return null;
    }

    let sharedBalance = 0;
    let loanBalance = 0;
    let completedPaymentBalance = 0;

    activeExpenses.forEach((expense) => {
      if (
        expense.expenseType === "shared" &&
        expense.paidByMemberId &&
        expense.participantMemberIds?.length
      ) {
        const ownShare = getExpenseShares(expense).find(
          (share) => share.memberId === effectiveMemberId
        );

        if (expense.paidByMemberId === effectiveMemberId) {
          sharedBalance += expense.krwAmount;
        }

        if (ownShare) {
          sharedBalance -= Math.round(
            ownShare.amount * expense.exchangeRate
          );
        }
      }

      if (
        expense.expenseType === "loan" &&
        !expense.loanSettled
      ) {
        if (expense.lenderMemberId === effectiveMemberId) {
          loanBalance += expense.krwAmount;
        }

        if (expense.borrowerMemberId === effectiveMemberId) {
          loanBalance -= expense.krwAmount;
        }
      }
    });

    settlementPayments.forEach((payment) => {
      if (payment.status === "cancelled") {
        return;
      }
      if (payment.fromMemberId === effectiveMemberId) {
        completedPaymentBalance += payment.amountKrw;
      }

      if (payment.toMemberId === effectiveMemberId) {
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
    effectiveMemberId,
    activeExpenses,
    settlementPayments,
  ]);

  const currentSettlementCount = settlements.filter(
    (settlement) =>
      settlement.fromMemberId === effectiveMemberId ||
      settlement.toMemberId === effectiveMemberId
  ).length;

  function completeSettlement(
    settlement: ExpenseSettlement
  ) {
    const actionKey =
      `final:${settlement.currency}:${settlement.fromKey}:${settlement.toKey}`;

    if (!beginSettlementMutation(actionKey)) {
      return;
    }

    try {
      Alert.alert(
        "정산 완료",
        `${settlement.fromLabel} → ${settlement.toLabel}\n${currencySymbol(settlement.currency)}${formatMoney(
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
                        Math.round(
                          settlement.amount *
                            (settlement.currency === "KRW"
                              ? 1
                              : exchangeRates[settlement.currency])
                        ),

                      currency: settlement.currency,

                      localAmount: settlement.amount,

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
      settlement.currency !== "KRW" ||
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {viewMode !== "main" ? (
          <Pressable
            onPress={() => setViewMode("main")}
            accessibilityRole="button"
            accessibilityLabel="지출 메인으로 돌아가기"
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "white",
              borderWidth: 1,
              borderColor: "#E5E7EB",
            }}
          >
            <Text style={{ color: "#111827", fontSize: 22 }}>‹</Text>
          </Pressable>
        ) : null}
        <Text
          style={{
            flex: 1,
            fontSize: viewMode === "main" ? 32 : 25,
            fontWeight: "bold",
            color: "#111827",
          }}
        >
          {viewMode === "main"
            ? "지출"
            : viewMode === "add"
              ? editingExpenseId
                ? "지출 수정"
                : "지출 추가"
              : viewMode === "history"
                ? "전체 내역"
                : viewMode === "settlement"
                  ? "정산 상세"
                  : "예산·환율 설정"}
        </Text>
        {viewMode === "main" ? (
          <Pressable
            onPress={() => setViewMode("settings")}
            accessibilityRole="button"
            style={{
              paddingHorizontal: 12,
              paddingVertical: 9,
              borderRadius: 12,
              backgroundColor: "white",
              borderWidth: 1,
              borderColor: "#E5E7EB",
            }}
          >
            <Text style={{ color: "#4B5563", fontWeight: "bold", fontSize: 13 }}>
              설정
            </Text>
          </Pressable>
        ) : null}
      </View>

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

      {viewMode === "main" ? (
        <>
          <View
            style={{
              marginTop: 20,
              padding: 18,
              borderRadius: 20,
              backgroundColor: "#111827",
            }}
          >
            <Text style={{ color: "#CBD5E1", fontSize: 13 }}>
              남은 여행 예산
            </Text>
            <Text
              style={{
                marginTop: 5,
                color: "white",
                fontSize: 30,
                fontWeight: "bold",
              }}
            >
              ₩{formatMoney(remaining)}
            </Text>
            <View
              style={{
                marginTop: 13,
                height: 8,
                borderRadius: 999,
                overflow: "hidden",
                backgroundColor: "#374151",
              }}
            >
              <View
                style={{
                  width: `${budgetNumber > 0
                    ? Math.min(100, Math.max(0, (totalExpenseKrw / budgetNumber) * 100))
                    : 0}%`,
                  height: "100%",
                  borderRadius: 999,
                  backgroundColor:
                    budgetNumber > 0 && totalExpenseKrw > budgetNumber
                      ? "#F87171"
                      : "#60A5FA",
                }}
              />
            </View>
            <View
              style={{
                marginTop: 10,
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Text style={{ color: "#CBD5E1", fontSize: 12 }}>
                사용 ₩{formatMoney(totalExpenseKrw)}
              </Text>
              <Text style={{ color: "#CBD5E1", fontSize: 12 }}>
                전체 ₩{formatMoney(budgetNumber)}
              </Text>
            </View>
            {!expenseSettingsConfigured ? (
              <Pressable
                onPress={() => setViewMode("settings")}
                style={{ marginTop: 12 }}
              >
                <Text style={{ color: "#93C5FD", fontSize: 12, fontWeight: "bold" }}>
                  예산과 외화 환율을 먼저 설정해주세요 →
                </Text>
              </Pressable>
            ) : null}
          </View>

          <View style={{ marginTop: 12, flexDirection: "row", gap: 10 }}>
            <View
              style={{
                flex: 1,
                minHeight: 112,
                padding: 14,
                borderRadius: 16,
                backgroundColor: "white",
                borderWidth: 1,
                borderColor: "#E5E7EB",
              }}
            >
              <Text style={{ color: "#6B7280", fontSize: 12 }}>오늘 지출</Text>
              <Text
                style={{ marginTop: 8, color: "#111827", fontSize: 21, fontWeight: "bold" }}
              >
                ₩{formatMoney(todayExpenseKrw)}
              </Text>
              <Text style={{ marginTop: 6, color: "#9CA3AF", fontSize: 11 }}>
                {todayExpenses.length}건 · 대여 제외
              </Text>
            </View>

            <Pressable
              onPress={() => setViewMode("settlement")}
              style={{
                flex: 1,
                minHeight: 112,
                padding: 14,
                borderRadius: 16,
                backgroundColor: "white",
                borderWidth: 1,
                borderColor: "#E5E7EB",
              }}
            >
              <Text style={{ color: "#6B7280", fontSize: 12 }}>내 공동 정산</Text>
              {memberLedgerSummary &&
              (memberLedgerSummary.receivable.JPY > 0 ||
                memberLedgerSummary.payable.JPY > 0 ||
                memberLedgerSummary.receivable.KRW > 0 ||
                memberLedgerSummary.payable.KRW > 0) ? (
                <>
                  <Text style={{ marginTop: 7, color: "#059669", fontSize: 12 }}>
                    받을 돈 ¥{formatMoney(memberLedgerSummary.receivable.JPY)} · ₩
                    {formatMoney(memberLedgerSummary.receivable.KRW)}
                  </Text>
                  <Text style={{ marginTop: 5, color: "#DC2626", fontSize: 12 }}>
                    갚을 돈 ¥{formatMoney(memberLedgerSummary.payable.JPY)} · ₩
                    {formatMoney(memberLedgerSummary.payable.KRW)}
                  </Text>
                </>
              ) : (
                <Text
                  style={{ marginTop: 12, color: "#059669", fontSize: 14, fontWeight: "bold" }}
                >
                  정산할 내역 없음
                </Text>
              )}
              <Text style={{ marginTop: "auto", color: "#2563EB", fontSize: 11 }}>
                상세 보기 →
              </Text>
            </Pressable>
          </View>

          <Pressable
            onPress={openNewExpense}
            accessibilityRole="button"
            style={{
              marginTop: 14,
              paddingVertical: 15,
              borderRadius: 15,
              alignItems: "center",
              backgroundColor: "#2563EB",
            }}
          >
            <Text style={{ color: "white", fontSize: 17, fontWeight: "bold" }}>
              + 지출 추가
            </Text>
          </Pressable>

          <View
            style={{
              marginTop: 16,
              padding: 16,
              borderRadius: 18,
              backgroundColor: "white",
              borderWidth: 1,
              borderColor: "#E5E7EB",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#111827", fontSize: 18, fontWeight: "bold" }}>
                최근 내역
              </Text>
              <Pressable onPress={() => setViewMode("history")} hitSlop={8}>
                <Text style={{ color: "#2563EB", fontSize: 13, fontWeight: "bold" }}>
                  전체 보기
                </Text>
              </Pressable>
            </View>

            {recentExpenses.length === 0 ? (
              <View style={{ paddingVertical: 18, alignItems: "center" }}>
                <Text style={{ color: "#6B7280" }}>아직 기록이 없습니다.</Text>
              </View>
            ) : (
              recentExpenses.map((expense, index) => {
                const type = expense.expenseType ?? "personal";
                const payerLabel = getExpensePartyLabel(
                  expense.paidByMemberId,
                  expense.payer,
                  memberDisplayOptions
                );
                const relatedCount =
                  type === "shared"
                    ? new Set([
                        expense.paidByMemberId,
                        ...(expense.participantMemberIds ?? []),
                      ].filter(Boolean)).size
                    : type === "loan"
                      ? 2
                      : 1;

                return (
                  <Pressable
                    key={expense.id}
                    onPress={() => beginEditExpense(expense)}
                    style={{
                      paddingTop: 13,
                      paddingBottom: 11,
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: "#F3F4F6",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#111827", fontWeight: "bold" }}>
                        {expense.memo?.trim() ||
                          (type === "loan" ? "대여" : expense.category)}
                      </Text>
                      <Text style={{ marginTop: 4, color: "#6B7280", fontSize: 12 }}>
                        {type === "shared"
                          ? `공동 · ${payerLabel} 결제 · ${relatedCount}명`
                          : type === "loan"
                            ? "대여 · 2명"
                            : "개인 지출"}
                      </Text>
                    </View>
                    <Text style={{ color: "#111827", fontWeight: "bold" }}>
                      {currencySymbol(expense.currency)}
                      {formatMoney(expense.localAmount)}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </View>
        </>
      ) : null}

      {viewMode === "settings" ? (
        <>
      {memberOptions.length > 0 ? (
        <View
          style={{
            marginTop: 16,
            padding: 14,
            borderRadius: 16,
            backgroundColor: "#EFF6FF",
            borderWidth: 1,
            borderColor: "#BFDBFE",
          }}
        >
          <Text style={{ color: "#1E3A8A", fontWeight: "bold" }}>
            가상 멤버로 보기
          </Text>
          <Text style={{ marginTop: 4, color: "#475569", fontSize: 12 }}>
            개발용 화면 전환입니다. 실제 로그인이나 서버 접근 권한이 아닙니다.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {memberOptions.map((member) => {
              const selected = effectiveMemberId === member.id;
              return (
                <Pressable
                  key={member.id}
                  onPress={() => setViewingMemberId(member.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    borderRadius: 999,
                    backgroundColor: selected ? "#2563EB" : "white",
                    borderWidth: 1,
                    borderColor: selected ? "#2563EB" : "#CBD5E1",
                  }}
                >
                  <Text style={{ color: selected ? "white" : "#334155", fontWeight: "bold" }}>
                    {member.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {memberLedgerSummary ? (
        <View
          style={{
            marginTop: 14,
            padding: 16,
            borderRadius: 16,
            backgroundColor: "white",
            borderWidth: 1,
            borderColor: "#E5E7EB",
          }}
        >
          <Text style={{ color: "#111827", fontSize: 18, fontWeight: "bold" }}>
            내 공동 정산 요약
          </Text>
          <Text style={{ marginTop: 4, color: "#6B7280", fontSize: 12 }}>
            원화와 엔화는 환율 없이 서로 합치지 않습니다.
          </Text>
          {(["JPY", "KRW"] as CurrencyCode[]).map((code) => (
            <View
              key={code}
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTopWidth: 1,
                borderTopColor: "#F3F4F6",
              }}
            >
              <Text style={{ color: "#374151", fontWeight: "bold" }}>{code}</Text>
              <Text style={{ marginTop: 5, color: "#4B5563" }}>
                실제 결제 {currencySymbol(code)}
                {formatMoney(memberLedgerSummary.paidConsumption[code])}
                {" · "}내 부담 {currencySymbol(code)}
                {formatMoney(memberLedgerSummary.consumption[code])}
              </Text>
              <Text style={{ marginTop: 4, color: "#4B5563" }}>
                받을 돈 {currencySymbol(code)}
                {formatMoney(memberLedgerSummary.receivable[code])}
                {" · "}갚을 돈 {currencySymbol(code)}
                {formatMoney(memberLedgerSummary.payable[code])}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

        </>
      ) : null}

      {/* 오늘 지출 요약 */}
      {false && (
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

      )}

      {/* 여행 자금 */}
      {viewMode === "settings" ? (
        <>
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

        </>
      ) : null}

      {/* 기록 추가 */}
      {viewMode === "add" ? (
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
                "shared" as ExpenseType,
              label:
                "공동 지출",
            },

            {
              value:
                "personal" as ExpenseType,
              label:
                "개인 지출",
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
                      payerMemberId ? [payerMemberId] : memberIds.slice(0, 1)
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

        <Text style={{ marginTop: 18, fontWeight: "bold", color: "#374151" }}>
          금액
        </Text>
        <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
          <TextInput
            value={amount}
            onChangeText={(value) => setAmount(formatNumericInput(value, true))}
            placeholder="0"
            placeholderTextColor="#9CA3AF"
            keyboardType="decimal-pad"
            autoFocus={!editingExpenseId}
            style={{
              flex: 1,
              backgroundColor: "#F9FAFB",
              color: "#111827",
              borderRadius: 12,
              padding: 14,
              fontSize: 20,
              fontWeight: "bold",
            }}
          />
          {(["JPY", "KRW"] as CurrencyCode[]).map((code) => (
            <Pressable
              key={code}
              onPress={() => {
                setCurrency(code);
                setRateInput(getRateDisplayValue(code, exchangeRates));
              }}
              style={{
                minWidth: 58,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 12,
                backgroundColor: currency === code ? "#111827" : "#F3F4F6",
              }}
            >
              <Text
                style={{
                  color: currency === code ? "white" : "#4B5563",
                  fontWeight: "bold",
                }}
              >
                {code}
              </Text>
            </Pressable>
          ))}
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

        {expenseType === "personal" ? (
          <>
            <Text style={{ marginTop: 18, fontWeight: "bold", color: "#374151" }}>
              지출 소유자
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {memberOptions.map((member) => (
                <Pressable
                  key={member.id}
                  onPress={() => setPersonalOwnerMemberId(member.id)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderRadius: 20,
                    backgroundColor:
                      personalOwnerMemberId === member.id ? "#111827" : "#F3F4F6",
                  }}
                >
                  <Text
                    style={{
                      color: personalOwnerMemberId === member.id ? "white" : "#374151",
                    }}
                  >
                    {member.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

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
                    onPress={() => {
                      setPayerMemberId(member.id);
                      setParticipantMemberIds((current) =>
                        current.includes(member.id) ? current : [member.id, ...current]
                      );
                    }}
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

            <Pressable
              onPress={() => setShowAdvancedExpenseOptions((current) => !current)}
              style={{
                marginTop: 14,
                alignSelf: "flex-start",
                paddingHorizontal: 12,
                paddingVertical: 9,
                borderRadius: 10,
                backgroundColor: "#F3F4F6",
              }}
            >
              <Text style={{ color: "#4B5563", fontWeight: "bold", fontSize: 13 }}>
                {showAdvancedExpenseOptions ? "고급 옵션 닫기" : "직접 금액 지정 · 고급 옵션"}
              </Text>
            </Pressable>

            {showAdvancedExpenseOptions ? (
              <>
            <Text
              style={{ marginTop: 18, fontWeight: "bold", color: "#374151" }}
            >
              분할 방식
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              {([
                { value: "equal" as const, label: "균등 분할" },
                { value: "custom" as const, label: "직접 금액 지정" },
              ]).map((item) => (
                <Pressable
                  key={item.value}
                  onPress={() => setSplitMethod(item.value)}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: 10,
                    borderRadius: 12,
                    backgroundColor:
                      splitMethod === item.value ? "#1D4ED8" : "#F3F4F6",
                  }}
                >
                  <Text
                    style={{
                      color: splitMethod === item.value ? "white" : "#374151",
                      fontWeight: "bold",
                    }}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {splitMethod === "custom" && (
              <View
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: "#F9FAFB",
                  gap: 8,
                }}
              >
                {participantMemberIds.map((memberId) => (
                  <View
                    key={memberId}
                    style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
                  >
                    <Text style={{ flex: 1, color: "#374151" }}>
                      {getExpensePartyLabel(memberId, undefined, memberDisplayOptions)}
                    </Text>
                    <TextInput
                      value={customShareInputs[memberId] ?? ""}
                      onChangeText={(value) =>
                        setCustomShareInputs((current) => ({
                          ...current,
                          [memberId]: formatNumericInput(value),
                        }))
                      }
                      placeholder={`금액 (${currency})`}
                      placeholderTextColor="#9CA3AF"
                      keyboardType="number-pad"
                      style={{
                        width: 145,
                        backgroundColor: "white",
                        color: "#111827",
                        borderWidth: 1,
                        borderColor: "#D1D5DB",
                        borderRadius: 10,
                        padding: 10,
                        textAlign: "right",
                      }}
                    />
                  </View>
                ))}
              </View>
            )}
              </>
            ) : null}
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
              splitMethod === "equal" &&
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

        {(expenseType !== "shared" || showAdvancedExpenseOptions) ? (
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
        ) : null}

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
              : editingExpenseId
                ? "수정 내용 저장"
                : "기록 저장"}
          </Text>
        </Pressable>

        {editingExpenseId ? (
          <Pressable
            onPress={() => {
              setEditingExpenseId(null);
              setAmount("");
              setMemo("");
              setSplitMethod("equal");
              setCustomShareInputs({});
            }}
            style={{ marginTop: 10, alignItems: "center", paddingVertical: 10 }}
          >
            <Text style={{ color: "#6B7280", fontWeight: "bold" }}>
              수정 취소
            </Text>
          </Pressable>
        ) : null}
      </View>

      ) : null}

      {/* 최종 정산 */}
      {viewMode === "settlement" ? (
        <>
      {memberLedgerSummary ? (
        <View
          style={{
            marginTop: 18,
            padding: 16,
            borderRadius: 18,
            backgroundColor: "white",
            borderWidth: 1,
            borderColor: "#E5E7EB",
          }}
        >
          <Text style={{ color: "#111827", fontSize: 18, fontWeight: "bold" }}>
            내 정산 요약
          </Text>
          {(["JPY", "KRW"] as CurrencyCode[]).map((code) => (
            <View
              key={code}
              style={{ marginTop: 11, flexDirection: "row", justifyContent: "space-between" }}
            >
              <Text style={{ color: "#6B7280", fontWeight: "bold" }}>{code}</Text>
              <Text style={{ color: "#059669" }}>
                받을 돈 {currencySymbol(code)}{formatMoney(memberLedgerSummary.receivable[code])}
              </Text>
              <Text style={{ color: "#DC2626" }}>
                갚을 돈 {currencySymbol(code)}{formatMoney(memberLedgerSummary.payable[code])}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {visibleLoanExpenses.length > 0 ? (
        <View
          style={{
            marginTop: 12,
            padding: 16,
            borderRadius: 18,
            backgroundColor: "white",
            borderWidth: 1,
            borderColor: "#E5E7EB",
          }}
        >
          <Text style={{ color: "#111827", fontSize: 18, fontWeight: "bold" }}>
            대여·상환 잔액
          </Text>
          {visibleLoanExpenses.map((expense) => {
            const repaid = settlementPayments
              .filter(
                (payment) =>
                  payment.status !== "cancelled" &&
                  payment.relatedExpenseId === expense.id &&
                  payment.currency === expense.currency
              )
              .reduce((sum, payment) => sum + (payment.localAmount ?? 0), 0);
            const lender = getExpensePartyLabel(
              expense.lenderMemberId,
              expense.lender,
              memberDisplayOptions
            );
            const borrower = getExpensePartyLabel(
              expense.borrowerMemberId,
              expense.borrower,
              memberDisplayOptions
            );

            return (
              <View
                key={expense.id}
                style={{
                  marginTop: 11,
                  paddingTop: 11,
                  borderTopWidth: 1,
                  borderTopColor: "#F3F4F6",
                }}
              >
                <Text style={{ color: "#374151", fontWeight: "bold" }}>
                  {borrower} → {lender}
                </Text>
                <Text style={{ marginTop: 4, color: "#6B7280", fontSize: 12 }}>
                  원금 {currencySymbol(expense.currency)}{formatMoney(expense.localAmount)} · 상환{" "}
                  {currencySymbol(expense.currency)}{formatMoney(repaid)} · 남음{" "}
                  {currencySymbol(expense.currency)}
                  {formatMoney(Math.max(0, expense.localAmount - repaid))}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
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

        {visibleSettlements.length ===
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
          visibleSettlements.map(
            (settlement, index) => {
              const actionKey =
                `final:${settlement.currency}:${settlement.fromKey}:${settlement.toKey}`;
              const isProcessing =
                processingSettlementAction ===
                actionKey;
              const isCurrentFrom =
                settlement.fromMemberId ===
                effectiveMemberId;
              const isCurrentTo =
                settlement.toMemberId ===
                effectiveMemberId;
              const breakdownRows =
                getSettlementBreakdownRows(
                  settlement
                );
              const hasDetailedBreakdown =
                breakdownRows.length >= 2;
              const settlementMemberIds = new Set(
                [settlement.fromMemberId, settlement.toMemberId].filter(
                  (memberId): memberId is string => Boolean(memberId)
                )
              );
              const relatedSettlementExpenses = activeExpenses.filter(
                (expense) =>
                  expense.currency === settlement.currency &&
                  getExpenseSettlementRelations(expense).some(
                    (relation) =>
                      settlementMemberIds.has(relation.fromMemberId) &&
                      settlementMemberIds.has(relation.toMemberId)
                  )
              );

              return (
                <View
                key={`${settlement.currency}-${settlement.fromKey}-${settlement.toKey}-${index}`}
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
                  {currencySymbol(settlement.currency)}
                  {formatMoney(settlement.amount)}{" "}
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
                        {currencySymbol(settlement.currency)}
                        {formatMoney(settlement.amount)}
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

                {relatedSettlementExpenses.length > 0 ? (
                  <View
                    style={{
                      marginTop: 14,
                      paddingTop: 12,
                      borderTopWidth: 1,
                      borderTopColor: "#FED7AA",
                    }}
                  >
                    <Text style={{ color: "#6B7280", fontSize: 12, fontWeight: "bold" }}>
                      관련 거래 {relatedSettlementExpenses.length}건
                    </Text>
                    {relatedSettlementExpenses.slice(0, 4).map((expense) => (
                      <Text
                        key={expense.id}
                        numberOfLines={1}
                        style={{ marginTop: 5, color: "#4B5563", fontSize: 12 }}
                      >
                        · {expense.memo?.trim() ||
                          (expense.expenseType === "loan" ? "대여" : expense.category)}{" "}
                        {currencySymbol(expense.currency)}{formatMoney(expense.localAmount)}
                      </Text>
                    ))}
                  </View>
                ) : null}

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

      {visibleSettlementPayments.length >
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

          {visibleSettlementPayments.map(
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
                effectiveMemberId &&
                  payment.fromMemberId === effectiveMemberId
              );
              const isCurrentTo = Boolean(
                effectiveMemberId &&
                  payment.toMemberId === effectiveMemberId
              );
              const isPartialRepayment = Boolean(
                payment.source === "loan" &&
                  payment.relatedExpenseId &&
                  !payment.resolvedRelations?.length
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
                    {isPartialRepayment ? "일부 상환" : "✓ 정산완료"}
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
                  {currencySymbol(payment.currency ?? "KRW")}
                  {formatMoney(payment.localAmount ?? payment.amountKrw)}
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
                      : isPartialRepayment
                        ? "상환 기록 취소"
                        : "정산 완료 취소"}
                  </Text>
                </Pressable>
              </View>
              );
            }
          )}
        </View>
      )}

        </>
      ) : null}

      {viewMode === "history" ? (
        <>
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

      <View style={{ marginTop: 12, gap: 9 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
          {([
            { value: "all" as const, label: "전체" },
            { value: "personal" as const, label: "개인" },
            { value: "shared" as const, label: "공동" },
            { value: "loan" as const, label: "대여" },
          ]).map((item) => (
            <Pressable
              key={item.value}
              onPress={() => setHistoryTypeFilter(item.value)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor:
                  historyTypeFilter === item.value ? "#2563EB" : "white",
                borderWidth: 1,
                borderColor:
                  historyTypeFilter === item.value ? "#2563EB" : "#E5E7EB",
              }}
            >
              <Text
                style={{
                  color: historyTypeFilter === item.value ? "white" : "#4B5563",
                  fontWeight: "bold",
                  fontSize: 12,
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 7 }}>
          {([
            { value: "all" as const, label: "모든 통화" },
            { value: "JPY" as const, label: "JPY" },
            { value: "KRW" as const, label: "KRW" },
          ]).map((item) => (
            <Pressable
              key={item.value}
              onPress={() => setHistoryCurrencyFilter(item.value)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor:
                  historyCurrencyFilter === item.value ? "#111827" : "#F3F4F6",
              }}
            >
              <Text
                style={{
                  color: historyCurrencyFilter === item.value ? "white" : "#4B5563",
                  fontWeight: "bold",
                  fontSize: 12,
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {filteredHistoryExpenses.length === 0 ? (
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
        filteredHistoryExpenses.map(
          (expense, expenseIndex) => {
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
              effectiveMemberId &&
                expense.borrowerMemberId === effectiveMemberId
            );
            const isCurrentLender = Boolean(
              effectiveMemberId &&
                expense.lenderMemberId === effectiveMemberId
            );
            const repaidLocalAmount = isLoan
              ? settlementPayments
                  .filter(
                    (payment) =>
                      payment.status !== "cancelled" &&
                      payment.relatedExpenseId === expense.id &&
                      payment.currency === expense.currency
                  )
                  .reduce(
                    (sum, payment) => sum + (payment.localAmount ?? 0),
                    0
                  )
              : 0;
            const remainingLoanAmount = Math.max(
              0,
              expense.localAmount - repaidLocalAmount
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
            const showDateHeader =
              expenseIndex === 0 ||
              filteredHistoryExpenses[expenseIndex - 1]?.date !== expense.date;

            return (
            <Fragment key={expense.id}>
            {showDateHeader ? (
              <Text
                style={{
                  marginTop: 18,
                  color: "#6B7280",
                  fontSize: 13,
                  fontWeight: "bold",
                }}
              >
                {formatExpenseDate(expense.date)}
              </Text>
            ) : null}
            <View
              style={{
                marginTop: 8,
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
                  onPress={() => beginEditExpense(expense)}
                  hitSlop={8}
                  style={{ marginLeft: "auto", paddingHorizontal: 5, paddingVertical: 4 }}
                >
                  <Text style={{ color: "#2563EB", fontSize: 12 }}>
                    수정
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => handleDelete(expense)}
                  hitSlop={8}
                  style={{
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
                      const participantShare = getExpenseShares(expense).find(
                        (share) => share.memberId === participant.key
                      );
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
                            {currencySymbol(expense.currency)}
                            {formatMoney(participantShare?.amount ?? 0)}
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

                  {repaidLocalAmount > 0 ? (
                    <Text style={{ marginTop: 7, color: "#4B5563" }}>
                      상환 {currencySymbol(expense.currency)}
                      {formatMoney(repaidLocalAmount)} · 남음{" "}
                      {currencySymbol(expense.currency)}
                      {formatMoney(remainingLoanAmount)}
                    </Text>
                  ) : null}

                  {!isLoanSettled && remainingLoanAmount > 0 ? (
                    <View
                      style={{
                        marginTop: 12,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <TextInput
                        value={repaymentInputs[expense.id] ?? ""}
                        onChangeText={(value) =>
                          setRepaymentInputs((current) => ({
                            ...current,
                            [expense.id]: formatNumericInput(value),
                          }))
                        }
                        placeholder={`상환액 (${expense.currency})`}
                        placeholderTextColor="#9CA3AF"
                        keyboardType="number-pad"
                        style={{
                          flex: 1,
                          backgroundColor: "#F9FAFB",
                          color: "#111827",
                          borderWidth: 1,
                          borderColor: "#D1D5DB",
                          borderRadius: 10,
                          padding: 10,
                        }}
                      />
                      <Pressable
                        onPress={() => addLoanRepayment(expense)}
                        style={{
                          paddingHorizontal: 13,
                          paddingVertical: 11,
                          borderRadius: 10,
                          backgroundColor: "#7C3AED",
                        }}
                      >
                        <Text style={{ color: "white", fontWeight: "bold" }}>
                          상환 기록
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}

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

              {expense.changeHistory?.length ? (
                <Text style={{ marginTop: 7, color: "#9CA3AF", fontSize: 11 }}>
                  변경 기록 {expense.changeHistory.length}건 ·{" "}
                  {expense.changeHistory.at(-1)?.summary}
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
            </Fragment>
            );
          }
        )
      )}

      {cancelledExpenses.length > 0 ? (
        <View
          style={{
            marginTop: 22,
            padding: 16,
            borderRadius: 16,
            backgroundColor: "#F3F4F6",
          }}
        >
          <Text style={{ color: "#374151", fontSize: 17, fontWeight: "bold" }}>
            취소한 기록
          </Text>
          {cancelledExpenses.map((expense) => (
            <View
              key={expense.id}
              style={{
                marginTop: 10,
                padding: 12,
                borderRadius: 12,
                backgroundColor: "white",
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#111827", fontWeight: "bold" }}>
                  {expense.memo?.trim() ||
                    (expense.expenseType === "loan" ? "대여 기록" : expense.category)}
                </Text>
                <Text style={{ marginTop: 3, color: "#6B7280" }}>
                  {currencySymbol(expense.currency)}{formatMoney(expense.localAmount)}
                </Text>
              </View>
              <Pressable
                onPress={() => restoreExpense(expense)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  borderRadius: 10,
                  backgroundColor: "#E0E7FF",
                }}
              >
                <Text style={{ color: "#3730A3", fontWeight: "bold" }}>
                  복구
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}
