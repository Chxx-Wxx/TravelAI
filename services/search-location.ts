import * as Location from "expo-location";

import type {
  PlaceSearchReference,
} from "./place";

const LAST_LOCATION_MAX_AGE_MS =
  5 * 60 * 1000;

let deviceLocationPromise:
  Promise<PlaceSearchReference | null> | null =
  null;

async function loadDeviceLocation(): Promise<PlaceSearchReference | null> {
  try {
    let permission =
      await Location.getForegroundPermissionsAsync();

    if (!permission.granted) {
      if (!permission.canAskAgain) {
        return null;
      }

      permission =
        await Location.requestForegroundPermissionsAsync();
    }

    if (!permission.granted) {
      return null;
    }

    const lastKnown =
      await Location.getLastKnownPositionAsync({
        maxAge: LAST_LOCATION_MAX_AGE_MS,
        requiredAccuracy: 2000,
      });

    const position =
      lastKnown ??
      (await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }));

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      source: "current_location",
    };
  } catch (error) {
    console.warn(
      "현재 위치를 가져오지 못해 여행 맥락 위치를 사용합니다.",
      error
    );
    return null;
  }
}

export function getDeviceSearchLocation() {
  if (!deviceLocationPromise) {
    deviceLocationPromise =
      loadDeviceLocation();
  }

  return deviceLocationPromise;
}
