import {
  useFocusEffect,
} from "expo-router";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import MapView, {
  Marker,
  Polyline,
} from "react-native-maps";

import {
  getTrip,
} from "../../lib/storage";

import {
  hasValidScheduleLocation,
} from "../../lib/schedule-location";

import {
  getInitialTripDate,
  isDateWithinTrip,
} from "../../lib/trip-date";

import {
  ComputedRoute,
  computeRoute,
  RouteCoordinate,
} from "../../services/route";

import {
  fetchSchedules,
} from "../../services/schedule";

import {
  Schedule,
  Trip,
} from "../../types";

type RouteSegmentStatus =
  | "loading"
  | "success"
  | "error"
  | "unavailable";

type RouteSegment = {
  key: string;
  fromScheduleId: string;
  toScheduleId: string;
  status: RouteSegmentStatus;
  origin?: RouteCoordinate;
  destination?: RouteCoordinate;
  route?: ComputedRoute;
};

type RouteSnapshot = {
  date: string | null;
  scheduleSignature: string | null;
  segments: RouteSegment[];
};

type ScheduleMarker = {
  schedule: Schedule;
  displayOrder: number;
};

function createRouteSegments(
  schedules: Schedule[]
): RouteSegment[] {
  return schedules
    .slice(0, -1)
    .map((schedule, index) => {
      const nextSchedule =
        schedules[index + 1];

      if (
        !hasValidScheduleLocation(schedule) ||
        !hasValidScheduleLocation(nextSchedule)
      ) {
        return {
          key: `${index}:${schedule.id}:${nextSchedule.id}`,
          fromScheduleId: schedule.id,
          toScheduleId: nextSchedule.id,
          status: "unavailable",
        };
      }

      return {
        key: `${index}:${schedule.id}:${nextSchedule.id}`,
        fromScheduleId: schedule.id,
        toScheduleId: nextSchedule.id,
        status: "loading",
        origin: {
          latitude: schedule.latitude,
          longitude: schedule.longitude,
        },
        destination: {
          latitude: nextSchedule.latitude,
          longitude: nextSchedule.longitude,
        },
      };
    });
}

function createScheduleRouteSignature(
  schedules: Schedule[]
) {
  return schedules
    .map((schedule, index) => {
      if (!hasValidScheduleLocation(schedule)) {
        return `${index}:${schedule.id}:unlinked`;
      }

      return [
        index,
        schedule.id,
        schedule.latitude,
        schedule.longitude,
      ].join(":");
    })
    .join("|");
}

function isValidRouteCoordinate(
  value: unknown
) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const coordinate = value as Partial<RouteCoordinate>;

  return (
    typeof coordinate.latitude === "number" &&
    Number.isFinite(coordinate.latitude) &&
    coordinate.latitude >= -90 &&
    coordinate.latitude <= 90 &&
    typeof coordinate.longitude === "number" &&
    Number.isFinite(coordinate.longitude) &&
    coordinate.longitude >= -180 &&
    coordinate.longitude <= 180
  );
}

const MAX_RENDERABLE_ROUTE_COORDINATES = 2_000;

function isRenderableRouteGeometry(
  value: unknown
): value is RouteCoordinate[] {
  return (
    Array.isArray(value) &&
    value.length > 1 &&
    value.length <= MAX_RENDERABLE_ROUTE_COORDINATES &&
    value.every(isValidRouteCoordinate)
  );
}

function logRouteDiagnostics(
  date: string,
  segments: RouteSegment[]
) {
  if (!__DEV__) {
    return;
  }

  const totalCoordinates = segments.reduce(
    (total, segment) =>
      total + (segment.route?.coordinates.length ?? 0),
    0
  );
  const successCount = segments.filter(
    (segment) => segment.status === "success"
  ).length;
  const unavailableCount = segments.filter(
    (segment) => segment.status === "unavailable"
  ).length;
  const errorCount = segments.filter(
    (segment) => segment.status === "error"
  ).length;

  console.info(
    `[Map route] day=${date} segments=${segments.length} success=${successCount} unavailable=${unavailableCount} error=${errorCount} coordinates=${totalCoordinates}`
  );
}

export default function MapScreen() {
  const mapRef =
    useRef<MapView | null>(
      null
    );

  const [
    trip,
    setTrip,
  ] =
    useState<Trip | null>(
      null
    );

  const [
    schedules,
    setSchedules,
  ] =
    useState<Schedule[]>(
      []
    );

  const [
    selectedDate,
    setSelectedDate,
  ] =
    useState<
      string | null
    >(null);

  const selectedDateRef =
    useRef<string | null>(null);

  const [
    renderedMapDate,
    setRenderedMapDate,
  ] = useState<string | null>(null);

  const [mapGeneration, setMapGeneration] =
    useState(0);

  const [readyMapInstanceKey, setReadyMapInstanceKey] =
    useState<string | null>(null);

  const [routeSnapshot, setRouteSnapshot] =
    useState<RouteSnapshot>({
      date: null,
      scheduleSignature: null,
      segments: [],
    });

  const routeRequestVersionRef =
    useRef(0);

  const initializedTripIdRef =
    useRef<string | null>(null);

  const renderedMapDateRef =
    useRef<string | null>(null);
  const pendingMapDateRef =
    useRef<string | null>(null);
  const mapReadyRef = useRef(false);
  const mapTransitionInFlightRef =
    useRef(false);
  const mapGenerationRef = useRef(0);
  const mapTransitionFrameRef =
    useRef<ReturnType<typeof requestAnimationFrame> | null>(
      null
    );
  const activeMapInstanceKeyRef =
    useRef<string | null>(null);

  const beginMapTransition = useCallback(
    (date: string) => {
      const generation = mapGenerationRef.current + 1;

      mapGenerationRef.current = generation;
      mapTransitionInFlightRef.current = true;
      mapReadyRef.current = false;
      renderedMapDateRef.current = date;
      pendingMapDateRef.current = null;
      setReadyMapInstanceKey(null);
      setRenderedMapDate(date);
      setMapGeneration(generation);
    },
    []
  );

  const requestMapDate = useCallback(
    (date: string) => {
      pendingMapDateRef.current = date;

      if (mapTransitionInFlightRef.current) {
        return;
      }

      if (
        mapReadyRef.current &&
        renderedMapDateRef.current === date
      ) {
        pendingMapDateRef.current = null;
        return;
      }

      beginMapTransition(date);
    },
    [beginMapTransition]
  );

  const resetMapTransition = useCallback(() => {
    if (mapTransitionFrameRef.current !== null) {
      cancelAnimationFrame(mapTransitionFrameRef.current);
      mapTransitionFrameRef.current = null;
    }

    pendingMapDateRef.current = null;
    mapTransitionInFlightRef.current = false;
    mapReadyRef.current = false;
    renderedMapDateRef.current = null;
    activeMapInstanceKeyRef.current = null;

    const generation = mapGenerationRef.current + 1;
    mapGenerationRef.current = generation;
    setRenderedMapDate(null);
    setReadyMapInstanceKey(null);
    setMapGeneration(generation);
    setRouteSnapshot({
      date: null,
      scheduleSignature: null,
      segments: [],
    });
  }, []);

  // 여행 / 일정 불러오기
  const loadData =
    useCallback(
      async () => {
        try {
          const tripData =
            await getTrip();

          setTrip(
            tripData
          );

          if (
            !tripData?.id
          ) {
            initializedTripIdRef.current = null;
            selectedDateRef.current = null;
            resetMapTransition();

            setSchedules(
              []
            );

            setSelectedDate(
              null
            );

            return;
          }

          const tripChanged =
            initializedTripIdRef.current !== tripData.id;
          const initialSelectedDate =
            getInitialTripDate(tripData);
          const currentSelectedDate =
            selectedDateRef.current;
          const nextSelectedDate =
            tripChanged ||
            !currentSelectedDate ||
            !isDateWithinTrip(
              currentSelectedDate,
              tripData
            )
              ? initialSelectedDate
              : currentSelectedDate;

          initializedTripIdRef.current = tripData.id;

          if (tripChanged) {
            setSchedules([]);
            resetMapTransition();
          }

          selectedDateRef.current = nextSelectedDate;
          setSelectedDate(nextSelectedDate);

          if (
            nextSelectedDate &&
            renderedMapDateRef.current !== nextSelectedDate
          ) {
            requestMapDate(nextSelectedDate);
          }

          const scheduleData =
            await fetchSchedules(
              tripData.id
            );

          const sorted = [
            ...scheduleData,
          ].sort(
            (
              a,
              b
            ) =>
              `${a.date} ${a.time}`.localeCompare(
                `${b.date} ${b.time}`
              )
          );

          setSchedules(
            sorted
          );
        } catch (error) {
          console.error(
            "지도 데이터 불러오기 실패:",
            error
          );

          setSchedules(
            []
          );
        }
      },
      [requestMapDate, resetMapTransition]
    );

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // 일정이 있는 날짜
  const dates =
    useMemo(() => {
      return [
        ...new Set(
          schedules.map(
            (
              schedule
            ) =>
              schedule.date
          )
        ),
      ];
    }, [schedules]);

  // 선택 날짜 일정
  const selectedSchedules =
    useMemo(() => {
      if (
        !selectedDate
      ) {
        return [];
      }

      return schedules.filter(
        (
          schedule
        ) =>
          schedule.date ===
          selectedDate
      );
    }, [
      schedules,
      selectedDate,
    ]);

  const renderedMapSchedules =
    useMemo(() => {
      if (!renderedMapDate) {
        return [];
      }

      return schedules.filter(
        (schedule) =>
          schedule.date === renderedMapDate
      );
    }, [renderedMapDate, schedules]);

  const scheduleRouteSignature = useMemo(
    () => createScheduleRouteSignature(selectedSchedules),
    [selectedSchedules]
  );

  const renderedScheduleRouteSignature = useMemo(
    () => createScheduleRouteSignature(renderedMapSchedules),
    [renderedMapSchedules]
  );

  const initialSelectedRouteSegments = useMemo(
    () => createRouteSegments(selectedSchedules),
    [selectedSchedules]
  );

  const initialRenderedRouteSegments = useMemo(
    () => createRouteSegments(renderedMapSchedules),
    [renderedMapSchedules]
  );

  const routeSegments =
    routeSnapshot.date === selectedDate &&
    routeSnapshot.scheduleSignature ===
      scheduleRouteSignature
      ? routeSnapshot.segments
      : initialSelectedRouteSegments;

  const mapRouteSegments =
    routeSnapshot.date === renderedMapDate &&
    routeSnapshot.scheduleSignature ===
      renderedScheduleRouteSignature
      ? routeSnapshot.segments
      : initialRenderedRouteSegments;

  // 전체 일정 순번을 보존한 지도 marker
  const scheduleMarkers =
    useMemo(() => {
      return renderedMapSchedules.reduce<ScheduleMarker[]>(
        (markers, schedule, index) => {
          if (hasValidScheduleLocation(schedule)) {
            markers.push({
              schedule,
              displayOrder: index + 1,
            });
          }

          return markers;
        },
        []
      );
    }, [
      renderedMapSchedules,
    ]);

  // 여행 몇 일차인지 계산
  function calculateDayNumber(
    date: string
  ) {
    if (!trip) {
      return null;
    }

    const [
      startYear,
      startMonth,
      startDay,
    ] =
      trip.startDate
        .split("-")
        .map(Number);

    const [
      year,
      month,
      day,
    ] =
      date
        .split("-")
        .map(Number);

    const start =
      new Date(
        startYear,
        startMonth - 1,
        startDay
      );

    const target =
      new Date(
        year,
        month - 1,
        day
      );

    const difference =
      target.getTime() -
      start.getTime();

    return (
      Math.floor(
        difference /
          (
            1000 *
            60 *
            60 *
            24
          )
      ) + 1
    );
  }

  // 체류시간 표시
  function formatDuration(
    minutes?: number
  ) {
    if (!minutes) {
      return null;
    }

    if (
      minutes < 60
    ) {
      return `${minutes}분`;
    }

    const hours =
      Math.floor(
        minutes / 60
      );

    const remainingMinutes =
      minutes % 60;

    if (
      remainingMinutes ===
      0
    ) {
      return `${hours}시간`;
    }

    return `${hours}시간 ${remainingMinutes}분`;
  }

  function formatRouteDistance(
    distanceMeters: number
  ) {
    if (distanceMeters < 1000) {
      return `${Math.round(distanceMeters)}m`;
    }

    const kilometers = Number(
      (distanceMeters / 1000).toFixed(1)
    );

    return `${kilometers}km`;
  }

  function formatRouteDuration(
    durationSeconds: number
  ) {
    const totalMinutes = Math.round(
      durationSeconds / 60
    );

    if (totalMinutes < 1) {
      return "1분 미만";
    }

    if (totalMinutes < 60) {
      return `${totalMinutes}분`;
    }

    const hours = Math.floor(
      totalMinutes / 60
    );
    const minutes = totalMinutes % 60;

    return minutes === 0
      ? `${hours}시간`
      : `${hours}시간 ${minutes}분`;
  }

  // 일정 좌표에 맞춰 지도 조정
  const focusSchedules = useCallback(
    (schedulesToFocus: Schedule[]) => {
      const coordinates =
      schedulesToFocus
        .filter(
          hasValidScheduleLocation
        )
        .map(
          (
            schedule
          ) => ({
            latitude:
              schedule.latitude as number,

            longitude:
              schedule.longitude as number,
          })
        );

      if (
        coordinates.length ===
        0
      ) {
        return;
      }

      if (
        coordinates.length ===
        1
      ) {
        mapRef.current?.animateToRegion(
          {
            latitude:
              coordinates[0]
                .latitude,

            longitude:
              coordinates[0]
                .longitude,

            latitudeDelta:
              0.03,

            longitudeDelta:
              0.03,
          },
          500
        );

        return;
      }

      mapRef.current?.fitToCoordinates(
        coordinates,
        {
          edgePadding: {
            top: 80,
            right: 55,
            bottom: 80,
            left: 55,
          },

          animated: true,
        }
      );
    },
    []
  );

  useEffect(() => {
    const requestVersion =
      routeRequestVersionRef.current + 1;
    routeRequestVersionRef.current =
      requestVersion;

    const initialSegments = initialRenderedRouteSegments;

    if (!trip?.id || !renderedMapDate) {
      return;
    }

    const computableSegments =
      initialSegments.filter(
        (segment) =>
          segment.status === "loading"
      );

    if (computableSegments.length === 0) {
      logRouteDiagnostics(
        renderedMapDate,
        initialSegments
      );
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();

    void (async () => {
      const results =
        await Promise.allSettled(
          computableSegments.map(
            async (segment) => ({
              key: segment.key,
              route: await computeRoute({
                tripId: trip.id as string,
                date: renderedMapDate,
                origin:
                  segment.origin as RouteCoordinate,
                destination:
                  segment.destination as RouteCoordinate,
                travelMode: "WALK",
              }, abortController.signal),
            })
          )
        );

      if (
        cancelled ||
        routeRequestVersionRef.current !==
          requestVersion
      ) {
        return;
      }

      const resolvedSegments = new Map<
        string,
        RouteSegment
      >();

      results.forEach((result, index) => {
        const segment =
          computableSegments[index];

        if (result.status === "fulfilled") {
          resolvedSegments.set(segment.key, {
            ...segment,
            status: "success",
            route: result.value.route,
          });
        } else {
          resolvedSegments.set(segment.key, {
            ...segment,
            status: "error",
          });
        }
      });

      const nextSegments =
        initialSegments.map(
          (segment) =>
            resolvedSegments.get(
              segment.key
            ) ?? segment
        );

      setRouteSnapshot({
        date: renderedMapDate,
        scheduleSignature:
          renderedScheduleRouteSignature,
        segments: nextSegments,
      });

      logRouteDiagnostics(
        renderedMapDate,
        nextSegments
      );
    })();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [
    renderedMapDate,
    initialRenderedRouteSegments,
    renderedScheduleRouteSignature,
    trip?.id,
  ]);

  function handleSelectDate(
    date: string
  ) {
    selectedDateRef.current = date;
    setSelectedDate(date);
    requestMapDate(date);
  }

  const mapInstanceKey = [
    "map",
    mapGeneration,
    renderedMapDate ?? "none",
    renderedScheduleRouteSignature,
  ].join(":");

  const handleMapRef = useCallback(
    (instance: MapView | null) => {
      mapRef.current = instance;

      if (!instance) {
        return;
      }

      activeMapInstanceKeyRef.current = mapInstanceKey;
      mapReadyRef.current = false;

      if (renderedMapDate) {
        mapTransitionInFlightRef.current = true;
      }
    },
    [mapInstanceKey, renderedMapDate]
  );

  const handleMapReady = useCallback(
    (
      date: string | null,
      generation: number,
      instanceKey: string,
      schedulesToFocus: Schedule[]
    ) => {
      if (
        !date ||
        generation !== mapGenerationRef.current ||
        date !== renderedMapDateRef.current ||
        instanceKey !== activeMapInstanceKeyRef.current
      ) {
        return;
      }

      mapReadyRef.current = true;
      setReadyMapInstanceKey(instanceKey);
      focusSchedules(schedulesToFocus);

      if (mapTransitionFrameRef.current !== null) {
        cancelAnimationFrame(mapTransitionFrameRef.current);
      }

      mapTransitionFrameRef.current = requestAnimationFrame(
        () => {
          mapTransitionFrameRef.current = null;

          if (
            generation !== mapGenerationRef.current ||
            date !== renderedMapDateRef.current ||
            instanceKey !== activeMapInstanceKeyRef.current
          ) {
            return;
          }

          mapTransitionInFlightRef.current = false;

          const pendingDate = pendingMapDateRef.current;

          if (!pendingDate || pendingDate === date) {
            pendingMapDateRef.current = null;
            return;
          }

          pendingMapDateRef.current = null;
          beginMapTransition(pendingDate);
        }
      );
    },
    [beginMapTransition, focusSchedules]
  );

  useEffect(() => {
    return () => {
      if (mapTransitionFrameRef.current !== null) {
        cancelAnimationFrame(mapTransitionFrameRef.current);
        mapTransitionFrameRef.current = null;
      }
    };
  }, []);

  const selectedDayNumber =
    selectedDate
      ? calculateDayNumber(
          selectedDate
        )
      : null;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor:
          "#F5F7FB",
      }}
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: 70,
          paddingHorizontal: 20,
          paddingBottom: 120,
        }}
      >
        {/* 제목 */}

        <Text
          style={{
            fontSize: 32,
            fontWeight: "bold",
            color: "#111827",
          }}
        >
          🗺️ 지도
        </Text>

        <Text
          style={{
            marginTop: 7,
            color: "#6B7280",
            fontSize: 15,
          }}
        >
          {trip
            ? `${trip.tripName}의 이동 경로를 확인하세요.`
            : "여행 일정을 지도에서 확인하세요."}
        </Text>

        {/* 날짜 선택 */}

        {dates.length >
          0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={
              false
            }
            style={{
              marginHorizontal:
                -20,
              marginTop: 24,
            }}
            contentContainerStyle={{
              paddingHorizontal: 20,
              gap: 8,
            }}
          >
            {dates.map(
              (
                date
              ) => {
                const selected =
                  date ===
                  selectedDate;

                const dayNumber =
                  calculateDayNumber(
                    date
                  );

                return (
                  <Pressable
                    key={
                      date
                    }
                    onPress={() =>
                      handleSelectDate(
                        date
                      )
                    }
                    style={{
                      backgroundColor:
                        selected
                          ? "#3B82F6"
                          : "white",

                      borderRadius: 14,

                      paddingHorizontal: 16,

                      paddingVertical: 11,
                    }}
                  >
                    <Text
                      style={{
                        fontWeight:
                          "bold",

                        color:
                          selected
                            ? "white"
                            : "#111827",
                      }}
                    >
                      {dayNumber
                        ? `${dayNumber}일차`
                        : date}
                    </Text>

                    <Text
                      style={{
                        marginTop: 3,
                        fontSize: 12,

                        color:
                          selected
                            ? "#DBEAFE"
                            : "#6B7280",
                      }}
                    >
                      {date.slice(
                        5
                      )}
                    </Text>
                  </Pressable>
                );
              }
            )}
          </ScrollView>
        )}

        {/* 선택 날짜 요약 */}

        {selectedDate && (
          <View
            style={{
              marginTop: 18,
              flexDirection: "row",
              alignItems: "center",
              justifyContent:
                "space-between",
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: "bold",
                color: "#111827",
              }}
            >
              {selectedDayNumber
                ? `${selectedDayNumber}일차`
                : "선택 날짜"}
              {" · "}
              {selectedDate}
            </Text>

            <Text
              style={{
                fontSize: 13,
                color: "#6B7280",
              }}
            >
              {
                selectedSchedules.length
              }
              개 일정
            </Text>
          </View>
        )}

        {/* 지도 */}

        <View
          style={{
            height: 390,
            marginTop: 14,
            borderRadius: 20,
            overflow: "hidden",
            backgroundColor:
              "#E5E7EB",
          }}
        >
          <MapView
            key={mapInstanceKey}
            ref={handleMapRef}
            style={{
              width: "100%",
              height: "100%",
            }}
            initialRegion={{
              latitude:
                35.6762,

              longitude:
                139.6503,

              latitudeDelta:
                0.15,

              longitudeDelta:
                0.15,
            }}
            onMapReady={() => {
              handleMapReady(
                renderedMapDate,
                mapGeneration,
                mapInstanceKey,
                renderedMapSchedules
              );
            }}
          >
            {(readyMapInstanceKey === mapInstanceKey
              ? mapRouteSegments
              : []
            ).map((segment) => {
              const coordinates =
                segment.route?.coordinates;

              if (
                routeSnapshot.date !== renderedMapDate ||
                routeSnapshot.scheduleSignature !==
                  renderedScheduleRouteSignature ||
                segment.status !== "success" ||
                !isRenderableRouteGeometry(coordinates)
              ) {
                return null;
              }

              return (
                <Polyline
                  key={`${mapInstanceKey}:${segment.key}`}
                  coordinates={coordinates}
                  strokeColor="#2563EB"
                  strokeWidth={5}
                />
              );
            })}

            {scheduleMarkers.map(
              ({ schedule, displayOrder }) => (
                <Marker
                  key={
                    schedule.id
                  }
                  coordinate={{
                    latitude:
                      schedule.latitude as number,

                    longitude:
                      schedule.longitude as number,
                  }}
                  title={`${displayOrder}. ${schedule.title}`}
                  description={
                    schedule.location
                  }
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,

                      backgroundColor:
                        "#3B82F6",

                      borderWidth: 3,

                      borderColor:
                        "white",

                      justifyContent:
                        "center",

                      alignItems:
                        "center",
                    }}
                  >
                    <Text
                      style={{
                        color: "white",
                        fontWeight:
                          "bold",
                        fontSize: 15,
                      }}
                    >
                      {displayOrder}
                    </Text>
                  </View>
                </Marker>
              )
            )}
          </MapView>
        </View>

        {/* 좌표 없음 안내 */}

          {selectedSchedules.length >
          0 &&
          !selectedSchedules.some(
            hasValidScheduleLocation
          ) && (
            <Text
              style={{
                marginTop: 10,
                paddingHorizontal: 4,
                color: "#9CA3AF",
                fontSize: 12,
              }}
            >
              아직 지도 위치가 연결된 일정이 없습니다.
            </Text>
          )}

        {/* 이동 순서 */}

        <View
          style={{
            marginTop: 30,
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
            오늘의 이동 순서
          </Text>

          {selectedSchedules.length >
            1 && (
            <View
              style={{
                backgroundColor:
                  "#EFF6FF",
                borderRadius: 20,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text
                style={{
                  color: "#3B82F6",
                  fontSize: 11,
                  fontWeight: "bold",
                }}
              >
                자동 최적화 예정
              </Text>
            </View>
          )}
        </View>

        {selectedSchedules.length ===
        0 ? (
          <View
            style={{
              marginTop: 14,
              padding: 20,
              backgroundColor:
                "white",
              borderRadius: 16,
            }}
          >
            <Text
              style={{
                color: "#6B7280",
              }}
            >
              이 날짜에는 아직 일정이 없습니다.
            </Text>
          </View>
        ) : (
          selectedSchedules.map(
            (
              schedule,
              index
            ) => {
              const hasCoordinates =
                hasValidScheduleLocation(
                  schedule
                );

              const duration =
                formatDuration(
                  schedule.durationMinutes
                );

              const nextSchedule =
                selectedSchedules[index + 1];
              const nextHasCoordinates =
                nextSchedule
                  ? hasValidScheduleLocation(
                      nextSchedule
                    )
                  : false;
              const routeSegment =
                routeSegments[index];

              let routeLabel: string | null =
                null;

              if (nextSchedule) {
                if (
                  !hasCoordinates ||
                  !nextHasCoordinates
                ) {
                  routeLabel =
                    "위치 미등록 일정 구간";
                } else if (
                  routeSegment?.status ===
                    "success" &&
                  routeSegment.route
                ) {
                  routeLabel = `도보 ${formatRouteDuration(
                    routeSegment.route
                      .durationSeconds
                  )} · ${formatRouteDistance(
                    routeSegment.route
                      .distanceMeters
                  )}`;
                } else if (
                  routeSegment?.status === "error"
                ) {
                  routeLabel =
                    "경로 정보를 불러올 수 없음";
                } else {
                  routeLabel =
                    "경로 계산 중...";
                }
              }

              return (
                <View
                  key={
                    schedule.id
                  }
                >
                  <Pressable
                    onPress={() => {
                      if (
                        !hasCoordinates ||
                        !mapReadyRef.current ||
                        selectedDate !==
                          renderedMapDateRef.current
                      ) {
                        return;
                      }

                      mapRef.current?.animateToRegion(
                        {
                          latitude:
                            schedule.latitude as number,

                          longitude:
                            schedule.longitude as number,

                          latitudeDelta:
                            0.02,

                          longitudeDelta:
                            0.02,
                        },
                        400
                      );
                    }}
                    style={{
                      flexDirection:
                        "row",
                      marginTop: 14,
                      alignItems:
                        "flex-start",
                    }}
                  >
                    {/* 순서 번호 */}

                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor:
                          hasCoordinates
                            ? "#3B82F6"
                            : "#CBD5E1",
                        justifyContent:
                          "center",
                        alignItems:
                          "center",
                        marginTop: 5,
                      }}
                    >
                      <Text
                        style={{
                          color: "white",
                          fontWeight:
                            "bold",
                        }}
                      >
                        {index + 1}
                      </Text>
                    </View>

                    {/* 일정 카드 */}

                    <View
                      style={{
                        flex: 1,
                        marginLeft: 12,
                        backgroundColor:
                          "white",
                        borderRadius: 16,
                        padding: 16,
                      }}
                    >
                    {/* 시간 */}

                    <Text
                      style={{
                        fontSize: 13,
                        color: "#3B82F6",
                        fontWeight:
                          "bold",
                      }}
                    >
                      {schedule.time}
                    </Text>

                    {/* 일정 이름 */}

                    <Text
                      style={{
                        marginTop: 4,
                        fontSize: 18,
                        fontWeight:
                          "bold",
                        color: "#111827",
                      }}
                    >
                      {schedule.title}
                    </Text>

                    {/* 장소 */}

                    <Text
                      style={{
                        marginTop: 7,
                        color: "#4B5563",
                        fontSize: 14,
                      }}
                    >
                      📍 {schedule.location}
                    </Text>

                    {/* 실제 주소 */}

                    {schedule.address ? (
                      <Text
                        numberOfLines={
                          2
                        }
                        style={{
                          marginTop: 5,
                          color: "#9CA3AF",
                          fontSize: 12,
                          lineHeight: 18,
                        }}
                      >
                        {schedule.address}
                      </Text>
                    ) : null}

                    {/* 카테고리 / 체류시간 */}

                    {(schedule.category ||
                      duration) && (
                      <View
                        style={{
                          marginTop: 10,
                          flexDirection:
                            "row",
                          flexWrap:
                            "wrap",
                          gap: 6,
                        }}
                      >
                        {schedule.category && (
                          <View
                            style={{
                              backgroundColor:
                                "#EFF6FF",

                              borderRadius: 8,

                              paddingHorizontal: 8,

                              paddingVertical: 4,
                            }}
                          >
                            <Text
                              style={{
                                color:
                                  "#2563EB",

                                fontSize: 11,

                                fontWeight:
                                  "bold",
                              }}
                            >
                              {
                                schedule.category
                              }
                            </Text>
                          </View>
                        )}

                        {duration && (
                          <View
                            style={{
                              backgroundColor:
                                "#F3F4F6",

                              borderRadius: 8,

                              paddingHorizontal: 8,

                              paddingVertical: 4,
                            }}
                          >
                            <Text
                              style={{
                                color:
                                  "#6B7280",

                                fontSize: 11,

                                fontWeight:
                                  "bold",
                              }}
                            >
                              ⏱ {duration}
                            </Text>
                          </View>
                        )}
                      </View>
                    )}

                    {/* 지도 상태 */}

                    {!hasCoordinates && (
                      <Text
                        style={{
                          marginTop: 9,
                          fontSize: 11,
                          color: "#9CA3AF",
                        }}
                      >
                        지도 위치 미등록
                      </Text>
                    )}
                    </View>
                  </Pressable>

                  {routeLabel && (
                    <View
                      style={{
                        marginLeft: 17,
                        paddingTop: 8,
                        paddingBottom: 2,
                        flexDirection: "row",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          color:
                            routeSegment?.status ===
                            "error"
                              ? "#DC2626"
                              : routeSegment?.status ===
                                  "success"
                                ? "#2563EB"
                                : "#9CA3AF",
                          fontSize: 14,
                          fontWeight: "bold",
                        }}
                      >
                        ↓
                      </Text>

                      <Text
                        style={{
                          marginLeft: 8,
                          color:
                            routeSegment?.status ===
                            "error"
                              ? "#DC2626"
                              : routeSegment?.status ===
                                  "success"
                                ? "#2563EB"
                                : "#6B7280",
                          fontSize: 12,
                          fontWeight: "bold",
                        }}
                      >
                        {routeLabel}
                      </Text>
                    </View>
                  )}
                </View>
              );
            }
          )
        )}
      </ScrollView>
    </View>
  );
}
