import { useCallback, useEffect, useRef, useState } from "react";

import { hasValidScheduleLocation } from "../lib/schedule-location";
import { getCurrentTripWithRecovery } from "../services/current-trip";
import {
  PlaceResult,
  PlaceSearchReference,
  searchPlaces,
} from "../services/place";
import { fetchSchedules } from "../services/schedule";
import { getDeviceSearchLocation } from "../services/search-location";
import { getCityCoordinates } from "../services/weather";
import type { Schedule } from "../types";

export const PLACE_AUTOCOMPLETE_MIN_LENGTH = 2;
export const PLACE_AUTOCOMPLETE_DEBOUNCE_MS = 400;
export const PLACE_SEARCH_MAX_RESULTS = 10;

type Options = {
  query: string;
  enabled?: boolean;
  date?: string;
  time?: string;
  scheduleId?: string;
  existingLocation?: {
    latitude?: number;
    longitude?: number;
  } | null;
};

function timeToMinutes(value?: string) {
  const [hour, minute] = (value ?? "").split(":").map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute)
    ? hour * 60 + minute
    : 0;
}

export function usePlaceAutocomplete({
  query,
  enabled = true,
  date,
  time,
  scheduleId,
  existingLocation,
}: Options) {
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const requestVersionRef = useRef(0);
  const cacheRef = useRef(new Map<string, PlaceResult[]>());
  const inFlightRef = useRef(
    new Map<string, Promise<PlaceResult[]>>()
  );
  const contextRef = useRef<{
    key: string;
    promise: Promise<PlaceSearchReference | null>;
  } | null>(null);

  const getSearchReference = useCallback(async () => {
    const contextKey = [
      date ?? "",
      time ?? "",
      scheduleId ?? "",
      existingLocation?.latitude ?? "",
      existingLocation?.longitude ?? "",
    ].join("|");

    if (contextRef.current?.key === contextKey) {
      return contextRef.current.promise;
    }

    const promise = (async () => {
      const deviceLocation = await getDeviceSearchLocation();
      if (deviceLocation) return deviceLocation;

      if (
        existingLocation &&
        hasValidScheduleLocation(existingLocation)
      ) {
        return {
          latitude: existingLocation.latitude,
          longitude: existingLocation.longitude,
          source: "schedule" as const,
        };
      }

      const trip = await getCurrentTripWithRecovery();
      if (!trip) return null;

      if (trip.id && date) {
        try {
          const schedules: Schedule[] = await fetchSchedules(trip.id);
          const targetMinutes = timeToMinutes(time);
          const nearbySchedule = schedules
            .filter(
              (schedule) =>
                schedule.id !== scheduleId &&
                schedule.date === date &&
                hasValidScheduleLocation(schedule)
            )
            .sort(
              (first, second) =>
                Math.abs(timeToMinutes(first.time) - targetMinutes) -
                Math.abs(timeToMinutes(second.time) - targetMinutes)
            )[0];

          if (
            nearbySchedule &&
            hasValidScheduleLocation(nearbySchedule)
          ) {
            return {
              latitude: nearbySchedule.latitude,
              longitude: nearbySchedule.longitude,
              source: "schedule" as const,
            };
          }
        } catch {
          // 일정 조회 실패 시 도시 기준 또는 bias 없이 계속 검색한다.
        }
      }

      if (trip.city) {
        try {
          const city = await getCityCoordinates(trip.city, trip.country);
          return {
            latitude: city.latitude,
            longitude: city.longitude,
            source: "city" as const,
          };
        } catch {
          // 도시 좌표도 없으면 Google 관련성 순서만 사용한다.
        }
      }

      return null;
    })();

    contextRef.current = { key: contextKey, promise };
    return promise;
  }, [date, existingLocation, scheduleId, time]);

  const searchNow = useCallback(
    async (rawQuery: string) => {
      const trimmedQuery = rawQuery.trim();
      const requestVersion = ++requestVersionRef.current;

      if (!trimmedQuery) {
        setResults([]);
        setSearchedQuery("");
        setIsSearching(false);
        return [];
      }

      setIsSearching(true);

      try {
        const reference = await getSearchReference();
        const referenceKey = reference
          ? `${reference.source}:${reference.latitude.toFixed(4)},${reference.longitude.toFixed(4)}`
          : "none";
        const cacheKey = `${trimmedQuery.toLocaleLowerCase()}|${referenceKey}`;
        let nextResults = cacheRef.current.get(cacheKey);

        if (!nextResults) {
          let request = inFlightRef.current.get(cacheKey);
          if (!request) {
            request = searchPlaces(trimmedQuery, { reference });
            inFlightRef.current.set(cacheKey, request);
          }

          try {
            nextResults = await request;
            cacheRef.current.set(cacheKey, nextResults);
          } finally {
            if (inFlightRef.current.get(cacheKey) === request) {
              inFlightRef.current.delete(cacheKey);
            }
          }
        }

        const limitedResults = nextResults.slice(
          0,
          PLACE_SEARCH_MAX_RESULTS
        );

        if (requestVersion === requestVersionRef.current) {
          setResults(limitedResults);
          setSearchedQuery(trimmedQuery);
        }
        return limitedResults;
      } catch (error) {
        if (requestVersion === requestVersionRef.current) {
          setResults([]);
          setSearchedQuery(trimmedQuery);
        }
        throw error;
      } finally {
        if (requestVersion === requestVersionRef.current) {
          setIsSearching(false);
        }
      }
    },
    [getSearchReference]
  );

  const clearResults = useCallback(() => {
    requestVersionRef.current += 1;
    setResults([]);
    setSearchedQuery("");
    setIsSearching(false);
  }, []);

  const showResults = useCallback(
    (resultQuery: string, nextResults: PlaceResult[]) => {
      requestVersionRef.current += 1;
      setResults(nextResults.slice(0, PLACE_SEARCH_MAX_RESULTS));
      setSearchedQuery(resultQuery.trim());
      setIsSearching(false);
    },
    []
  );

  useEffect(() => {
    const trimmedQuery = query.trim();
    requestVersionRef.current += 1;

    if (!enabled || trimmedQuery.length < PLACE_AUTOCOMPLETE_MIN_LENGTH) {
      setResults([]);
      setSearchedQuery("");
      setIsSearching(false);
      return;
    }

    const timeout = setTimeout(() => {
      void searchNow(trimmedQuery).catch(() => {
        // 자동완성 실패는 입력과 저장 흐름을 막지 않는다.
      });
    }, PLACE_AUTOCOMPLETE_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [enabled, query, searchNow]);

  return {
    results,
    searchedQuery,
    isSearching,
    searchNow,
    clearResults,
    showResults,
  };
}
