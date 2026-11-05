import { Text, View } from "react-native";

import type {
  AiSituationRecommendation,
} from "../services/ai";

type Props = {
  recommendation: AiSituationRecommendation;
};

function DetailList({
  label,
  items,
}: {
  label: string;
  items: string[];
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <View style={{ marginTop: 10 }}>
      <Text
        style={{
          color: "#4B5563",
          fontSize: 12,
          fontWeight: "700",
        }}
      >
        {label}
      </Text>
      {items.map((item, index) => (
        <Text
          key={`${label}-${index}-${item}`}
          style={{
            marginTop: 3,
            color: "#374151",
            fontSize: 13,
            lineHeight: 19,
          }}
        >
          · {item}
        </Text>
      ))}
    </View>
  );
}

export default function AiSituationRecommendationCard({
  recommendation,
}: Props) {
  return (
    <View
      accessibilityLabel={`일정 대안 추천. ${recommendation.situationSummary}`}
      style={{ gap: 12 }}
    >
      <View
        style={{
          borderRadius: 14,
          backgroundColor: "#F8FAFC",
          padding: 13,
        }}
      >
        <Text
          style={{
            color: "#2563EB",
            fontSize: 12,
            fontWeight: "800",
          }}
        >
          현재 상황
        </Text>
        <Text
          style={{
            marginTop: 5,
            color: "#1F2937",
            fontSize: 14,
            lineHeight: 20,
          }}
        >
          {recommendation.situationSummary}
        </Text>
      </View>

      <View
        style={{
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "#BFDBFE",
          backgroundColor: "#EFF6FF",
          padding: 13,
        }}
      >
        <Text
          style={{
            color: "#1D4ED8",
            fontSize: 12,
            fontWeight: "800",
          }}
        >
          가장 추천하는 선택
        </Text>
        <Text
          style={{
            marginTop: 5,
            color: "#1E3A8A",
            fontSize: 14,
            lineHeight: 20,
            fontWeight: "600",
          }}
        >
          {recommendation.recommendationReason}
        </Text>
      </View>

      {recommendation.alternatives.map((alternative) => {
        const isRecommended =
          alternative.id === recommendation.recommendedOptionId;

        return (
          <View
            key={alternative.id}
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: isRecommended ? "#60A5FA" : "#E5E7EB",
              backgroundColor: isRecommended ? "#F8FBFF" : "#FFFFFF",
              padding: 13,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <Text
                style={{
                  flex: 1,
                  color: "#111827",
                  fontSize: 15,
                  fontWeight: "800",
                }}
              >
                {alternative.priority}. {alternative.title}
              </Text>
              {isRecommended ? (
                <View
                  style={{
                    borderRadius: 10,
                    backgroundColor: "#DBEAFE",
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                  }}
                >
                  <Text
                    style={{
                      color: "#1D4ED8",
                      fontSize: 11,
                      fontWeight: "800",
                    }}
                  >
                    추천
                  </Text>
                </View>
              ) : null}
            </View>

            <Text
              style={{
                marginTop: 7,
                color: "#4B5563",
                fontSize: 13,
                lineHeight: 19,
              }}
            >
              {alternative.reason}
            </Text>

            <DetailList label="유지" items={alternative.keep} />
            <DetailList label="변경·생략" items={alternative.change} />
            <DetailList label="장점" items={alternative.advantages} />
            <DetailList label="단점" items={alternative.disadvantages} />

            <Text
              style={{
                marginTop: 11,
                color: "#92400E",
                fontSize: 12,
                lineHeight: 17,
              }}
            >
              {alternative.routeVerification === "not_available"
                ? "이동 경로 확인 불가 · 장소 좌표나 위치 정보가 더 필요해요."
                : "이동 시간·요금 미검증 · 지도 경로에서 다시 확인해주세요."}
            </Text>
          </View>
        );
      })}

      <DetailList
        label="확인이 필요한 정보"
        items={recommendation.unverifiedInformation}
      />
      <DetailList
        label="더 정확한 추천을 위한 질문"
        items={recommendation.followUpQuestions}
      />
    </View>
  );
}
