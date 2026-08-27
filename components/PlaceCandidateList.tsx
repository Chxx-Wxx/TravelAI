import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import {
  getPlaceDistanceLabel,
  PlaceResult,
} from "../services/place";
import PlaceConfirmationModal from "./PlaceConfirmationModal";

const INITIAL_VISIBLE_RESULTS = 5;
const MAX_VISIBLE_RESULTS = 10;

type Props = {
  results: PlaceResult[];
  pendingSelection?: boolean;
  onSelect: (place: PlaceResult) => void;
  onSaveWithoutLocation?: () => void;
};

export default function PlaceCandidateList({
  results,
  pendingSelection = false,
  onSelect,
  onSaveWithoutLocation,
}: Props) {
  const [visibleCount, setVisibleCount] = useState(
    INITIAL_VISIBLE_RESULTS
  );
  const [previewPlace, setPreviewPlace] =
    useState<PlaceResult | null>(null);
  const resultKey = results
    .map((place) => place.id)
    .join("|");

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_RESULTS);
  }, [resultKey]);

  if (results.length === 0) return null;

  const maximum = Math.min(results.length, MAX_VISIBLE_RESULTS);
  const visibleResults = results.slice(0, visibleCount);
  const canShowMore = visibleCount < maximum;

  return (
    <>
      <View
        style={{
          marginTop: 10,
          marginBottom: 18,
          backgroundColor: "white",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
      {pendingSelection && (
        <View
          style={{
            padding: 14,
            backgroundColor: "#EFF6FF",
            borderBottomWidth: 1,
            borderBottomColor: "#DBEAFE",
          }}
        >
          <Text style={{ color: "#1D4ED8", fontWeight: "bold" }}>
            장소를 선택해주세요
          </Text>
          <Text style={{ marginTop: 4, color: "#6B7280", fontSize: 12 }}>
            정확한 위치를 확정하기 어려워 자동으로 연결하지 않았습니다.
          </Text>
        </View>
      )}

      {visibleResults.map((place, index) => {
        const distanceLabel = getPlaceDistanceLabel(place);
        const hasFollowingRow =
          index < visibleResults.length - 1 ||
          canShowMore ||
          Boolean(pendingSelection && onSaveWithoutLocation);

        return (
          <Pressable
            key={place.id || `${place.name}-${index}`}
            onPress={() => setPreviewPlace(place)}
            style={{
              padding: 14,
              borderBottomWidth: hasFollowingRow ? 1 : 0,
              borderBottomColor: "#E5E7EB",
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
            {place.address ? (
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
            ) : null}
            {distanceLabel ? (
              <Text
                style={{
                  marginTop: 4,
                  color: "#2563EB",
                  fontSize: 12,
                }}
              >
                {distanceLabel}
              </Text>
            ) : null}
          </Pressable>
        );
      })}

      {canShowMore && (
        <Pressable
          onPress={() => setVisibleCount(MAX_VISIBLE_RESULTS)}
          style={{
            padding: 13,
            borderBottomWidth:
              pendingSelection && onSaveWithoutLocation ? 1 : 0,
            borderBottomColor: "#E5E7EB",
            backgroundColor: "#F9FAFB",
          }}
        >
          <Text
            style={{
              textAlign: "center",
              color: "#2563EB",
              fontWeight: "bold",
            }}
          >
            더 보기 ({maximum - visibleCount}개)
          </Text>
        </Pressable>
      )}

      {pendingSelection && onSaveWithoutLocation && (
        <Pressable
          onPress={onSaveWithoutLocation}
          style={{ padding: 14, backgroundColor: "#F9FAFB" }}
        >
          <Text
            style={{
              color: "#6B7280",
              fontWeight: "bold",
              textAlign: "center",
            }}
          >
            위치 없이 저장
          </Text>
        </Pressable>
      )}
      </View>

      <PlaceConfirmationModal
        place={previewPlace}
        onCancel={() => setPreviewPlace(null)}
        onConfirm={(place) => {
          setPreviewPlace(null);
          onSelect(place);
        }}
      />
    </>
  );
}
