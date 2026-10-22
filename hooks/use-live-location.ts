import * as Location from "expo-location";
import { useFocusEffect } from "expo-router";
import {
  Animated,
  Easing,
} from "react-native";
import {
  useCallback,
  useRef,
  useState,
} from "react";

import {
  evaluateLocationSample,
  getHeadingDeadband,
  getShortestHeadingTarget,
  normalizeHeading,
  type LocationSample,
} from "../lib/live-location";

export type LiveLocationStatus =
  | "idle"
  | "requesting"
  | "active"
  | "denied"
  | "services-disabled"
  | "error";

export type LiveUserLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  timestamp: number;
  receivedAt: number;
};

export type LiveLocationQualityIssue =
  | "low-accuracy"
  | "unstable"
  | null;

const HEADING_UPDATE_INTERVAL_MS = 90;
const HEADING_ANIMATION_DURATION_MS = 150;

function getSensorHeading(
  value: Location.LocationHeadingObject
) {
  if (value.accuracy <= 0) {
    return null;
  }

  return (
    normalizeHeading(value.trueHeading) ??
    normalizeHeading(value.magHeading)
  );
}

export function useLiveLocation(enabled: boolean) {
  const [location, setLocation] =
    useState<LiveUserLocation | null>(null);
  const [status, setStatus] =
    useState<LiveLocationStatus>("idle");
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [retryVersion, setRetryVersion] = useState(0);
  const [headingAvailable, setHeadingAvailable] =
    useState(false);
  const [qualityIssue, setQualityIssue] =
    useState<LiveLocationQualityIssue>(null);
  const headingAnimation = useRef(new Animated.Value(0)).current;

  const sessionVersionRef = useRef(0);
  const requestedPermissionRef = useRef(false);
  const forcePermissionRequestRef = useRef(false);
  const sensorHeadingRef = useRef<number | null>(null);
  const headingAvailableRef = useRef(false);
  const headingTargetRef = useRef<number | null>(null);
  const lastHeadingUpdateTimeRef = useRef(0);
  const acceptedLocationRef = useRef<LocationSample | null>(null);

  const retry = useCallback(() => {
    forcePermissionRequestRef.current = true;
    setStatus("requesting");
    setRetryVersion((value) => value + 1);
  }, []);

  useFocusEffect(
    useCallback(() => {
      const sessionVersion = sessionVersionRef.current + 1;
      sessionVersionRef.current = sessionVersion;

      if (!enabled) {
        acceptedLocationRef.current = null;
        sensorHeadingRef.current = null;
        headingTargetRef.current = null;
        lastHeadingUpdateTimeRef.current = 0;
        headingAvailableRef.current = false;
        headingAnimation.stopAnimation();
        setLocation(null);
        setQualityIssue(null);
        setHeadingAvailable(false);
        setStatus("idle");
        return undefined;
      }

      let positionSubscription: Location.LocationSubscription | null =
        null;
      let headingSubscription: Location.LocationSubscription | null =
        null;
      let positionSubscriptionFailed = false;
      let cancelled = false;

      const isCurrentSession = () =>
        !cancelled &&
        sessionVersionRef.current === sessionVersion;

      const showHeading = () => {
        if (headingAvailableRef.current) {
          return;
        }

        headingAvailableRef.current = true;
        setHeadingAvailable(true);
      };

      const hideHeading = () => {
        if (!headingAvailableRef.current) {
          return;
        }

        headingAvailableRef.current = false;
        setHeadingAvailable(false);
      };

      const commitAnimatedHeading = (
        value: number | null,
        accuracy: number
      ) => {
        const normalizedHeading = normalizeHeading(value);

        if (normalizedHeading === null || !isCurrentSession()) {
          return;
        }

        const now = Date.now();
        const currentTarget = headingTargetRef.current;

        if (currentTarget === null) {
          headingTargetRef.current = normalizedHeading;
          lastHeadingUpdateTimeRef.current = now;
          headingAnimation.setValue(normalizedHeading);
          showHeading();
          return;
        }

        const nextTarget =
          getShortestHeadingTarget(
            currentTarget,
            normalizedHeading
          );

        if (
          (now - lastHeadingUpdateTimeRef.current <
            HEADING_UPDATE_INTERVAL_MS ||
            Math.abs(nextTarget - currentTarget) <
              getHeadingDeadband(accuracy))
        ) {
          return;
        }

        headingTargetRef.current = nextTarget;
        lastHeadingUpdateTimeRef.current = now;
        showHeading();
        headingAnimation.stopAnimation();
        Animated.timing(headingAnimation, {
          toValue: nextTarget,
          duration: HEADING_ANIMATION_DURATION_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      };

      const commitPosition = (value: Location.LocationObject) => {
        if (!isCurrentSession()) {
          return;
        }

        const receivedAt = Date.now();
        const evaluation = evaluateLocationSample(
          {
            latitude: value.coords.latitude,
            longitude: value.coords.longitude,
            accuracy: value.coords.accuracy,
            speed: value.coords.speed,
            timestamp: value.timestamp,
          },
          acceptedLocationRef.current,
          receivedAt
        );

        if (!evaluation.accepted) {
          if (evaluation.reason === "inaccurate") {
            setQualityIssue("low-accuracy");
          } else if (
            evaluation.reason === "stale" ||
            evaluation.reason === "implausible-jump"
          ) {
            setQualityIssue("unstable");
          }
          return;
        }

        acceptedLocationRef.current = evaluation.sample;
        setQualityIssue(null);
        setLocation({
          ...evaluation.sample,
          receivedAt,
        });
        setStatus("active");

        if (sensorHeadingRef.current === null) {
          commitAnimatedHeading(value.coords.heading, 1);
        }
      };

      const commitHeading = (
        value: Location.LocationHeadingObject
      ) => {
        if (!isCurrentSession()) {
          return;
        }

        const nextHeading = getSensorHeading(value);

        if (nextHeading === null) {
          sensorHeadingRef.current = null;
          hideHeading();
          return;
        }

        sensorHeadingRef.current = nextHeading;
        commitAnimatedHeading(nextHeading, value.accuracy);
      };

      const start = async () => {
        setStatus("requesting");
        setLocation(null);
        setQualityIssue(null);
        headingAvailableRef.current = false;
        setHeadingAvailable(false);
        sensorHeadingRef.current = null;
        headingTargetRef.current = null;
        lastHeadingUpdateTimeRef.current = 0;
        acceptedLocationRef.current = null;
        headingAnimation.stopAnimation();

        try {
          let permission =
            await Location.getForegroundPermissionsAsync();

          const shouldRequestPermission =
            permission.status !== Location.PermissionStatus.GRANTED &&
            permission.canAskAgain &&
            (!requestedPermissionRef.current ||
              forcePermissionRequestRef.current);

          forcePermissionRequestRef.current = false;

          if (shouldRequestPermission) {
            requestedPermissionRef.current = true;
            permission =
              await Location.requestForegroundPermissionsAsync();
          }

          if (!isCurrentSession()) {
            return;
          }

          setCanAskAgain(permission.canAskAgain);

          if (permission.status !== Location.PermissionStatus.GRANTED) {
            setLocation(null);
            setStatus("denied");
            return;
          }

          const servicesEnabled =
            await Location.hasServicesEnabledAsync();

          if (!isCurrentSession()) {
            return;
          }

          if (!servicesEnabled) {
            setLocation(null);
            setStatus("services-disabled");
            return;
          }

          const lastKnown =
            await Location.getLastKnownPositionAsync({
              maxAge: 10_000,
              requiredAccuracy: 100,
            });

          if (lastKnown) {
            commitPosition(lastKnown);
          }

          const nextPositionSubscription =
            await Location.watchPositionAsync(
              {
                accuracy: Location.Accuracy.High,
                timeInterval: 1_000,
                distanceInterval: 1,
              },
              commitPosition,
              () => {
                if (isCurrentSession()) {
                  positionSubscriptionFailed = true;
                  positionSubscription?.remove();
                  positionSubscription = null;
                  headingSubscription?.remove();
                  headingSubscription = null;
                  sensorHeadingRef.current = null;
                  hideHeading();
                  setLocation(null);
                  setQualityIssue(null);
                  setStatus("error");
                }
              }
            );

          if (!isCurrentSession() || positionSubscriptionFailed) {
            nextPositionSubscription.remove();
            return;
          }

          positionSubscription = nextPositionSubscription;

          try {
            const nextHeadingSubscription =
              await Location.watchHeadingAsync(
                commitHeading,
                () => {
                  if (!isCurrentSession()) {
                    return;
                  }

                  sensorHeadingRef.current = null;
                  hideHeading();
                }
              );

            if (!isCurrentSession()) {
              nextHeadingSubscription.remove();
              return;
            }

            headingSubscription = nextHeadingSubscription;
          } catch {
            if (!isCurrentSession()) {
              return;
            }

            sensorHeadingRef.current = null;
            hideHeading();
          }
        } catch {
          if (isCurrentSession()) {
            setStatus("error");
          }
        }
      };

      void start();

      return () => {
        cancelled = true;
        sessionVersionRef.current += 1;
        positionSubscription?.remove();
        headingSubscription?.remove();
        sensorHeadingRef.current = null;
        acceptedLocationRef.current = null;
        headingAnimation.stopAnimation();
        hideHeading();
        setLocation(null);
        setQualityIssue(null);
        setStatus("idle");
      };
    }, [enabled, headingAnimation, retryVersion])
  );

  return {
    location: enabled ? location : null,
    status: enabled ? status : "idle",
    qualityIssue: enabled ? qualityIssue : null,
    headingAnimation,
    headingAvailable: enabled && headingAvailable,
    canAskAgain,
    retry,
  };
}
