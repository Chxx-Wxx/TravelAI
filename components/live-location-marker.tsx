import React, {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  View,
} from "react-native";
import {
  Circle,
  Marker,
  type MapMarker,
} from "react-native-maps";

import {
  getLocationAnimationDuration,
  shouldAnimateLocationSample,
  type LocationSample,
} from "../lib/live-location";
import {
  LiveUserLocation,
} from "../hooks/use-live-location";

type LiveLocationMarkerProps = {
  location: LiveUserLocation;
  headingAnimation: Animated.Value;
  headingAvailable: boolean;
};

function toLocationSample(location: LiveUserLocation): LocationSample {
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy,
    speed: location.speed,
    timestamp: location.timestamp,
  };
}

function LiveLocationMarkerComponent({
  location,
  headingAnimation,
  headingAvailable,
}: LiveLocationMarkerProps) {
  const markerRef = useRef<MapMarker | null>(null);
  const [initialCoordinate] = useState(
    () => ({
      latitude: location.latitude,
      longitude: location.longitude,
    })
  );
  const previousLocationRef = useRef(location);
  const animationEndsAtRef = useRef(0);
  const pendingAnimationTimerRef = useRef<
    ReturnType<typeof setTimeout> | null
  >(null);
  const rotation = useMemo(
    () =>
      headingAnimation.interpolate({
        inputRange: [0, 360],
        outputRange: ["0deg", "360deg"],
        extrapolate: "extend",
      }),
    [headingAnimation]
  );

  useEffect(() => {
    const previousLocation = previousLocationRef.current;

    if (previousLocation.timestamp === location.timestamp) {
      return;
    }

    const applyLocation = () => {
      const previousSample = toLocationSample(previousLocation);
      const nextSample = toLocationSample(location);
      const duration = shouldAnimateLocationSample(
        previousSample,
        nextSample
      )
        ? getLocationAnimationDuration(
            previousLocation.timestamp,
            location.timestamp
          )
        : 0;
      const coordinate = {
        latitude: location.latitude,
        longitude: location.longitude,
      };

      if (duration > 0) {
        markerRef.current?.animateMarkerToCoordinate(
          coordinate,
          duration
        );
        animationEndsAtRef.current = Date.now() + duration;
      } else {
        markerRef.current?.setCoordinates(coordinate);
        animationEndsAtRef.current = 0;
      }

      previousLocationRef.current = location;
    };
    const remainingAnimationTime =
      animationEndsAtRef.current - Date.now();

    if (remainingAnimationTime > 0) {
      pendingAnimationTimerRef.current = setTimeout(
        applyLocation,
        remainingAnimationTime + 16
      );
    } else {
      applyLocation();
    }

    return () => {
      if (pendingAnimationTimerRef.current !== null) {
        clearTimeout(pendingAnimationTimerRef.current);
        pendingAnimationTimerRef.current = null;
      }
    };
  }, [location]);

  return (
    <>
      {location.accuracy !== null && location.accuracy > 0 ? (
        <Circle
          center={{
            latitude: location.latitude,
            longitude: location.longitude,
          }}
          radius={Math.min(Math.max(location.accuracy, 5), 200)}
          fillColor="rgba(37, 99, 235, 0.10)"
          strokeColor="rgba(37, 99, 235, 0.28)"
          strokeWidth={1}
        />
      ) : null}

      <Marker
        ref={markerRef}
        identifier="current-user-location"
        coordinate={initialCoordinate}
        anchor={{ x: 0.5, y: 0.5 }}
        centerOffset={{ x: 0, y: 0 }}
        zIndex={1000}
      >
        <View
          pointerEvents="none"
          style={{
            width: 48,
            height: 48,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {headingAvailable ? (
            <Animated.View
              style={{
                position: "absolute",
                width: 48,
                height: 48,
                alignItems: "center",
                transform: [{ rotate: rotation }],
              }}
            >
              <View
                style={{
                  width: 0,
                  height: 0,
                  borderLeftWidth: 7,
                  borderRightWidth: 7,
                  borderBottomWidth: 18,
                  borderLeftColor: "transparent",
                  borderRightColor: "transparent",
                  borderBottomColor: "#2563EB",
                }}
              />
            </Animated.View>
          ) : null}

          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: "#2563EB",
              borderWidth: 3,
              borderColor: "white",
              shadowColor: "#111827",
              shadowOpacity: 0.24,
              shadowRadius: 3,
              shadowOffset: {
                width: 0,
                height: 1,
              },
              elevation: 4,
            }}
          />
        </View>
      </Marker>
    </>
  );
}

export const LiveLocationMarker = memo(LiveLocationMarkerComponent);
