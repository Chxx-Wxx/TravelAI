import {
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import MapView, { Marker } from "react-native-maps";

import {
  getPlaceDistanceLabel,
  PlaceResult,
} from "../services/place";

type Props = {
  place: PlaceResult | null;
  onConfirm: (place: PlaceResult) => void;
  onCancel: () => void;
};

const PREVIEW_REGION_DELTA = 0.008;

export default function PlaceConfirmationModal({
  place,
  onConfirm,
  onCancel,
}: Props) {
  if (!place) return null;

  const coordinate = {
    latitude: place.latitude,
    longitude: place.longitude,
  };
  const distanceLabel = getPlaceDistanceLabel(place);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          paddingHorizontal: 20,
          backgroundColor: "rgba(17, 24, 39, 0.55)",
        }}
      >
        <View
          style={{
            maxHeight: "88%",
            borderRadius: 22,
            padding: 18,
            backgroundColor: "white",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{
                color: "#111827",
                fontSize: 20,
                fontWeight: "bold",
              }}
            >
              장소 확인
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="장소 확인 닫기"
              onPress={onCancel}
              hitSlop={10}
              style={{ padding: 4 }}
            >
              <Text style={{ color: "#6B7280", fontSize: 22 }}>
                ✕
              </Text>
            </Pressable>
          </View>

          <Text
            style={{
              marginTop: 16,
              color: "#111827",
              fontSize: 18,
              fontWeight: "bold",
            }}
          >
            {place.name}
          </Text>

          {place.address ? (
            <Text
              style={{
                marginTop: 6,
                color: "#6B7280",
                fontSize: 13,
                lineHeight: 19,
              }}
            >
              {place.address}
            </Text>
          ) : null}

          <View
            style={{
              height: 190,
              marginTop: 16,
              borderRadius: 16,
              overflow: "hidden",
              backgroundColor: "#E5E7EB",
            }}
          >
            <MapView
              key={place.id}
              style={{ width: "100%", height: "100%" }}
              initialRegion={{
                ...coordinate,
                latitudeDelta: PREVIEW_REGION_DELTA,
                longitudeDelta: PREVIEW_REGION_DELTA,
              }}
              rotateEnabled={false}
              pitchEnabled={false}
            >
              <Marker
                coordinate={coordinate}
                title={place.name}
                description={place.address}
              />
            </MapView>
          </View>

          <Text
            style={{
              marginTop: 8,
              color: "#9CA3AF",
              fontSize: 11,
              textAlign: "center",
            }}
          >
            지도를 움직여도 저장되는 장소 핀은 변경되지 않습니다.
          </Text>

          {distanceLabel ? (
            <Text
              style={{
                marginTop: 13,
                color: "#2563EB",
                fontSize: 13,
                fontWeight: "bold",
              }}
            >
              {distanceLabel}
            </Text>
          ) : null}

          <Pressable
            onPress={() => onConfirm(place)}
            style={{
              marginTop: 18,
              paddingVertical: 14,
              borderRadius: 13,
              alignItems: "center",
              backgroundColor: "#2563EB",
            }}
          >
            <Text style={{ color: "white", fontWeight: "bold" }}>
              이 장소 선택
            </Text>
          </Pressable>

          <Pressable
            onPress={onCancel}
            style={{
              marginTop: 9,
              paddingVertical: 13,
              borderRadius: 13,
              alignItems: "center",
              backgroundColor: "#F3F4F6",
            }}
          >
            <Text style={{ color: "#4B5563", fontWeight: "bold" }}>
              다른 장소 보기
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
