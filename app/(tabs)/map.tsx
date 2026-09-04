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
  createScheduleDepartureTime,
  getTransitTimeAvailability,
  TransitTimeAvailability,
} from "../../lib/schedule-time";

import {
  localizeTransitLineName,
} from "../../lib/transit-line-name";

import {
  recommendRouteMode,
} from "../../lib/route-recommendation";

import {
  ComputedRoute,
  computeRoute,
  RouteCoordinate,
  RouteRequestError,
  ROUTE_TRAVEL_MODES,
  RouteTravelMode,
  TransitVehicleType,
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
  | "no-route"
  | "fallback-unavailable"
  | "time-unavailable"
  | "unavailable";

type RouteModeAvailability =
  | "loading"
  | "available"
  | "unavailable";

type RouteModeAvailabilityByMode = Record<
  RouteTravelMode,
  RouteModeAvailability
>;

type RouteSegment = {
  key: string;
  fromScheduleId: string;
  toScheduleId: string;
  status: RouteSegmentStatus;
  travelMode: RouteTravelMode;
  departureTime?: string;
  timeAvailability?: TransitTimeAvailability;
  origin?: RouteCoordinate;
  destination?: RouteCoordinate;
  route?: ComputedRoute;
  modeAvailability?: RouteModeAvailabilityByMode;
  recommendedMode?: RouteTravelMode;
  routeIdentity?: string;
};

type RouteSnapshot = {
  date: string | null;
  scheduleSignature: string | null;
  segments: RouteSegment[];
};

type RouteRequestControl = {
  controller: AbortController;
  requestSignature: string;
  version: number;
  userSelectionVersion: number;
};

type RouteAutoState = {
  routeIdentity: string;
  availability: RouteModeAvailabilityByMode;
  routes: Partial<Record<RouteTravelMode, ComputedRoute>>;
  segments: Record<RouteTravelMode, RouteSegment>;
  manuallySelectedMode?: RouteTravelMode;
  recommendedMode?: RouteTravelMode;
};

type RouteModeBySegment = Record<
  string,
  RouteTravelMode
>;

type ScheduleMarker = {
  schedule: Schedule;
  displayOrder: number;
};

const ROUTE_MODE_UI = {
  WALK: {
    icon: "🚶",
    label: "도보",
    color: "#2563EB",
    selectedBackground: "#DBEAFE",
  },
  TRANSIT: {
    icon: "🚇",
    label: "대중교통",
    color: "#7C3AED",
    selectedBackground: "#EDE9FE",
  },
} satisfies Record<
  RouteTravelMode,
  {
    icon: string;
    label: string;
    color: string;
    selectedBackground: string;
  }
>;

const TRANSIT_VEHICLE_LABELS = {
  BUS: "버스",
  SUBWAY: "지하철",
  TRAIN: "전철",
  TRAM: "노면전차",
  FERRY: "페리",
  OTHER: "기타",
} satisfies Record<TransitVehicleType, string>;

const MAX_VISIBLE_TRANSIT_LINE_NAMES = 3;

function createRouteSegmentKey(
  schedule: Schedule,
  nextSchedule: Schedule
) {
  return `${schedule.id}:${nextSchedule.id}`;
}

function createRouteSegments(
  schedules: Schedule[],
  modeBySegment: RouteModeBySegment
): RouteSegment[] {
  return schedules
    .slice(0, -1)
    .map((schedule, index) => {
      const nextSchedule = schedules[index + 1];
      const key = createRouteSegmentKey(
        schedule,
        nextSchedule
      );
      const travelMode = modeBySegment[key] ?? "WALK";
      const segment = createRouteSegment(
        schedule,
        nextSchedule,
        travelMode
      );
      const transitSegment = createRouteSegment(
        schedule,
        nextSchedule,
        "TRANSIT"
      );

      return {
        ...segment,
        modeAvailability: {
          WALK:
            segment.status === "unavailable"
              ? "unavailable"
              : "loading",
          TRANSIT:
            transitSegment.status === "loading"
              ? "loading"
              : "unavailable",
        },
      };
    });
}

function createRouteSegment(
  schedule: Schedule,
  nextSchedule: Schedule,
  travelMode: RouteTravelMode
): RouteSegment {
  const key = createRouteSegmentKey(
    schedule,
    nextSchedule
  );

  if (
    !hasValidScheduleLocation(schedule) ||
    !hasValidScheduleLocation(nextSchedule)
  ) {
    return {
      key,
      fromScheduleId: schedule.id,
      toScheduleId: nextSchedule.id,
      status: "unavailable",
      travelMode,
    };
  }

  const departureTime =
    travelMode === "TRANSIT"
      ? createScheduleDepartureTime(schedule) ?? undefined
      : undefined;
  const timeAvailability =
    travelMode === "TRANSIT"
      ? getTransitTimeAvailability(departureTime ?? null)
      : undefined;

  return {
    key,
    fromScheduleId: schedule.id,
    toScheduleId: nextSchedule.id,
    status:
      travelMode === "TRANSIT" &&
      timeAvailability !== "available"
        ? "time-unavailable"
        : "loading",
    travelMode,
    departureTime,
    timeAvailability,
    origin: {
      latitude: schedule.latitude,
      longitude: schedule.longitude,
    },
    destination: {
      latitude: nextSchedule.latitude,
      longitude: nextSchedule.longitude,
    },
  };
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

function createSegmentRequestSignature(
  segment: RouteSegment
) {
  return [
    segment.key,
    segment.travelMode,
    segment.departureTime ?? "static",
    segment.timeAvailability ?? "available",
    segment.origin?.latitude ?? "unlinked",
    segment.origin?.longitude ?? "unlinked",
    segment.destination?.latitude ?? "unlinked",
    segment.destination?.longitude ?? "unlinked",
  ].join("|");
}

function createRouteResultKey(
  tripId: string,
  country: string,
  date: string,
  segment: RouteSegment
) {
  return [
    tripId,
    country,
    date,
    createSegmentRequestSignature(segment),
  ].join("|");
}

function createSegmentRouteIdentity(
  tripId: string,
  country: string,
  date: string,
  walkSegment: RouteSegment,
  transitSegment: RouteSegment
) {
  return [
    tripId,
    country,
    date,
    walkSegment.key,
    walkSegment.origin?.latitude ?? "unlinked",
    walkSegment.origin?.longitude ?? "unlinked",
    walkSegment.destination?.latitude ?? "unlinked",
    walkSegment.destination?.longitude ?? "unlinked",
    transitSegment.departureTime ?? "no-departure",
    transitSegment.timeAvailability ?? "available",
  ].join("|");
}

function reconcileRouteSegments(
  desiredSegments: RouteSegment[],
  currentSegments: RouteSegment[]
) {
  const currentByKey = new Map(
    currentSegments.map((segment) => [
      segment.key,
      segment,
    ])
  );

  return desiredSegments.map((desiredSegment) => {
    const currentSegment = currentByKey.get(
      desiredSegment.key
    );

    return currentSegment &&
      createSegmentRequestSignature(currentSegment) ===
        createSegmentRequestSignature(desiredSegment)
      ? currentSegment
      : desiredSegment;
  });
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
  const noRouteCount = segments.filter(
    (segment) => segment.status === "no-route"
  ).length;

  console.info(
    `[Map route] day=${date} segments=${segments.length} success=${successCount} unavailable=${unavailableCount} noRoute=${noRouteCount} error=${errorCount} coordinates=${totalCoordinates}`
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

  const routeSnapshotRef = useRef<RouteSnapshot>({
    date: null,
    scheduleSignature: null,
    segments: [],
  });

  const [
    routeModeBySegment,
    setRouteModeBySegment,
  ] = useState<RouteModeBySegment>({});
  const routeModeBySegmentRef =
    useRef<RouteModeBySegment>({});

  const routeRequestVersionRef = useRef(0);
  const routeRequestContextRef =
    useRef<string | null>(null);
  const routeRequestControlsRef = useRef(
    new Map<string, RouteRequestControl>()
  );
  const routeResultsRef = useRef(
    new Map<string, ComputedRoute>()
  );
  const routeUnavailableResultsRef = useRef(
    new Set<string>()
  );
  const routeAutoStatesRef = useRef(
    new Map<string, RouteAutoState>()
  );
  const routeUserSelectionVersionsRef = useRef(
    new Map<string, number>()
  );

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

  const replaceRouteSnapshot = useCallback(
    (nextSnapshot: RouteSnapshot) => {
      routeSnapshotRef.current = nextSnapshot;
      setRouteSnapshot(nextSnapshot);
    },
    []
  );

  const abortAllRouteRequests = useCallback(() => {
    routeRequestControlsRef.current.forEach(
      ({ controller }) => controller.abort()
    );
    routeRequestControlsRef.current.clear();
    routeRequestContextRef.current = null;
  }, []);

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
    abortAllRouteRequests();
    routeResultsRef.current.clear();
    routeUnavailableResultsRef.current.clear();
    routeAutoStatesRef.current.clear();
    routeUserSelectionVersionsRef.current.clear();
    replaceRouteSnapshot({
      date: null,
      scheduleSignature: null,
      segments: [],
    });
  }, [abortAllRouteRequests, replaceRouteSnapshot]);

  useEffect(() => {
    return () => {
      abortAllRouteRequests();
    };
  }, [abortAllRouteRequests]);

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
            routeModeBySegmentRef.current = {};
            setRouteModeBySegment({});
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
            routeModeBySegmentRef.current = {};
            setRouteModeBySegment({});
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
    () =>
      createRouteSegments(
        selectedSchedules,
        routeModeBySegment
      ),
    [routeModeBySegment, selectedSchedules]
  );

  const initialRenderedRouteSegments = useMemo(
    () =>
      createRouteSegments(
        renderedMapSchedules,
        routeModeBySegment
      ),
    [renderedMapSchedules, routeModeBySegment]
  );

  const routeSegments = useMemo(
    () =>
      routeSnapshot.date === selectedDate &&
      routeSnapshot.scheduleSignature ===
        scheduleRouteSignature
        ? reconcileRouteSegments(
            initialSelectedRouteSegments,
            routeSnapshot.segments
          )
        : initialSelectedRouteSegments,
    [
      initialSelectedRouteSegments,
      routeSnapshot,
      scheduleRouteSignature,
      selectedDate,
    ]
  );

  const mapRouteSegments = useMemo(
    () =>
      routeSnapshot.date === renderedMapDate &&
      routeSnapshot.scheduleSignature ===
        renderedScheduleRouteSignature
        ? reconcileRouteSegments(
            initialRenderedRouteSegments,
            routeSnapshot.segments
          )
        : initialRenderedRouteSegments,
    [
      initialRenderedRouteSegments,
      renderedMapDate,
      renderedScheduleRouteSignature,
      routeSnapshot,
    ]
  );

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

  function formatTransitDetails(
    route: ComputedRoute
  ) {
    const summary = route.transitSummary;

    if (!summary) {
      return {
        isWalkOnly: false,
        transferLabel: null,
        detailLabel: null,
      };
    }

    const localizedLineNames = [
      ...new Set(
        (summary.lineNames ?? [])
          .map((lineName) =>
            localizeTransitLineName(lineName)
          )
          .filter(Boolean)
      ),
    ];
    const displayedLineNames =
      localizedLineNames.length <=
      MAX_VISIBLE_TRANSIT_LINE_NAMES
        ? localizedLineNames
        : [
            ...localizedLineNames.slice(
              0,
              MAX_VISIBLE_TRANSIT_LINE_NAMES - 1
            ),
            `외 ${
              localizedLineNames.length -
              MAX_VISIBLE_TRANSIT_LINE_NAMES
            }개`,
            localizedLineNames.at(-1) as string,
          ];
    const lineLabel = displayedLineNames.join(" → ");
    const vehicleLabel = summary.vehicleTypes
      .filter((vehicleType) => vehicleType !== "OTHER")
      .map(
        (vehicleType) =>
          TRANSIT_VEHICLE_LABELS[vehicleType]
      )
      .join("·");
    let fareLabel: string | null = null;

    if (summary.hasShinkansen) {
      const generalFare =
        summary.fare?.ticket ?? summary.fare?.ic;

      if (generalFare !== undefined) {
        fareLabel = `운임 약 ${generalFare.toLocaleString("ko-KR")}엔`;
      }
    } else if (summary.fare?.ic !== undefined) {
      fareLabel = `IC ${summary.fare.ic.toLocaleString("ko-KR")}엔`;
    } else if (summary.fare?.ticket !== undefined) {
      fareLabel = `운임 ${summary.fare.ticket.toLocaleString("ko-KR")}엔`;
    }
    const isWalkOnly = summary.transitLegCount === 0;
    const transferLabel =
      !isWalkOnly
        ? summary.transferCount === 0
          ? "환승 없음"
          : `환승 ${summary.transferCount}회`
        : null;

    return {
      isWalkOnly,
      transferLabel,
      detailLabel: isWalkOnly
        ? null
        : [lineLabel || vehicleLabel, fareLabel]
            .filter(Boolean)
            .join(" · ") || null,
    };
  }

  function getTransitUnavailableLabel(
    availability?: TransitTimeAvailability
  ) {
    if (availability === "too-far") {
      return "대중교통 경로는 여행일이 가까워지면 확인할 수 있어요.";
    }

    if (availability === "too-old") {
      return "이 날짜의 대중교통 경로는 조회 기간이 지났어요.";
    }

    return "대중교통 출발시간을 확인할 수 없어요.";
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
    if (!trip?.id || !renderedMapDate) {
      abortAllRouteRequests();
      return;
    }

    const tripId = trip.id;
    const tripCountry = trip.country;
    const routeDate = renderedMapDate;
    const routeContext = [
      tripId,
      tripCountry,
      routeDate,
      renderedScheduleRouteSignature,
    ].join("|");
    const routeContextChanged =
      routeRequestContextRef.current !== routeContext;

    if (routeContextChanged) {
      abortAllRouteRequests();
      routeRequestContextRef.current = routeContext;
    }

    const schedulesById = new Map(
      renderedMapSchedules.map((schedule) => [
        schedule.id,
        schedule,
      ])
    );

    const createResolvedRouteSegment = (
      baseSegment: RouteSegment,
      autoState: RouteAutoState
    ): RouteSegment => {
      const availability = {
        ...autoState.availability,
      };
      const walkAvailable =
        availability.WALK === "available";
      const transitAvailable =
        availability.TRANSIT === "available";
      const resolutionComplete =
        availability.WALK !== "loading" &&
        availability.TRANSIT !== "loading";

      if (!resolutionComplete) {
        return {
          ...baseSegment,
          status: "loading",
          route: undefined,
          modeAvailability: availability,
          recommendedMode: undefined,
          routeIdentity: autoState.routeIdentity,
        };
      }

      if (!walkAvailable && !transitAvailable) {
        autoState.recommendedMode = undefined;
        autoState.manuallySelectedMode = undefined;

        return {
          ...baseSegment,
          status: "fallback-unavailable",
          route: undefined,
          modeAvailability: availability,
          recommendedMode: undefined,
          routeIdentity: autoState.routeIdentity,
        };
      }

      let recommendedMode: RouteTravelMode;

      if (walkAvailable && transitAvailable) {
        recommendedMode = recommendRouteMode(
          autoState.routes.WALK as ComputedRoute,
          autoState.routes.TRANSIT as ComputedRoute
        ).recommendedMode;
      } else {
        recommendedMode = walkAvailable
          ? "WALK"
          : "TRANSIT";
        autoState.manuallySelectedMode = undefined;
      }

      autoState.recommendedMode = recommendedMode;

      const selectedMode =
        walkAvailable &&
        transitAvailable &&
        autoState.manuallySelectedMode
          ? autoState.manuallySelectedMode
          : recommendedMode;
      const selectedRoute = autoState.routes[selectedMode];
      const selectedSegment =
        autoState.segments[selectedMode];

      if (!selectedRoute) {
        return {
          ...baseSegment,
          status: "fallback-unavailable",
          route: undefined,
          modeAvailability: availability,
          recommendedMode: undefined,
          routeIdentity: autoState.routeIdentity,
        };
      }

      return {
        ...selectedSegment,
        status: "success",
        route: selectedRoute,
        modeAvailability: availability,
        recommendedMode:
          walkAvailable && transitAvailable
            ? recommendedMode
            : undefined,
        routeIdentity: autoState.routeIdentity,
      };
    };

    const autoEntries = initialRenderedRouteSegments
      .map((baseSegment) => {
        const originSchedule = schedulesById.get(
          baseSegment.fromScheduleId
        );
        const destinationSchedule = schedulesById.get(
          baseSegment.toScheduleId
        );

        if (
          !originSchedule ||
          !destinationSchedule ||
          baseSegment.status === "unavailable"
        ) {
          return null;
        }

        const segments = {
          WALK: createRouteSegment(
            originSchedule,
            destinationSchedule,
            "WALK"
          ),
          TRANSIT: createRouteSegment(
            originSchedule,
            destinationSchedule,
            "TRANSIT"
          ),
        };
        const routeIdentity = createSegmentRouteIdentity(
          tripId,
          tripCountry,
          routeDate,
          segments.WALK,
          segments.TRANSIT
        );
        let autoState =
          routeAutoStatesRef.current.get(routeIdentity);

        if (!autoState) {
          autoState = {
            routeIdentity,
            availability: {
              WALK: "loading",
              TRANSIT:
                segments.TRANSIT.status === "loading"
                  ? "loading"
                  : "unavailable",
            },
            routes: {},
            segments,
          };
          routeAutoStatesRef.current.set(
            routeIdentity,
            autoState
          );
        } else {
          autoState.segments = segments;
        }

        ROUTE_TRAVEL_MODES.forEach((travelMode) => {
          const candidateSegment = segments[travelMode];
          const resultKey = createRouteResultKey(
            tripId,
            tripCountry,
            routeDate,
            candidateSegment
          );
          const cachedRoute =
            routeResultsRef.current.get(resultKey);

          if (cachedRoute) {
            autoState.availability[travelMode] =
              "available";
            autoState.routes[travelMode] = cachedRoute;
          } else if (
            routeUnavailableResultsRef.current.has(resultKey) ||
            candidateSegment.status !== "loading"
          ) {
            autoState.availability[travelMode] =
              "unavailable";
            delete autoState.routes[travelMode];
          }
        });

        return {
          baseSegment,
          autoState,
        };
      })
      .filter(
        (
          entry
        ): entry is {
          baseSegment: RouteSegment;
          autoState: RouteAutoState;
        } => entry !== null
      );

    const autoStateBySegmentKey = new Map(
      autoEntries.map(({ baseSegment, autoState }) => [
        baseSegment.key,
        autoState,
      ])
    );
    let nextModeBySegment =
      routeModeBySegmentRef.current;
    let modeStateChanged = false;
    const hydratedSegments =
      initialRenderedRouteSegments.map((baseSegment) => {
        const autoState = autoStateBySegmentKey.get(
          baseSegment.key
        );

        if (!autoState) {
          return baseSegment;
        }

        const resolvedSegment =
          createResolvedRouteSegment(
            baseSegment,
            autoState
          );

        if (
          resolvedSegment.status === "success" &&
          nextModeBySegment[baseSegment.key] !==
            resolvedSegment.travelMode
        ) {
          nextModeBySegment = {
            ...nextModeBySegment,
            [baseSegment.key]:
              resolvedSegment.travelMode,
          };
          modeStateChanged = true;
        }

        return resolvedSegment;
      });

    if (modeStateChanged) {
      routeModeBySegmentRef.current =
        nextModeBySegment;
      setRouteModeBySegment(nextModeBySegment);
    }

    replaceRouteSnapshot({
      date: routeDate,
      scheduleSignature:
        renderedScheduleRouteSignature,
      segments: hydratedSegments,
    });

    const desiredRequestSignatures = new Map(
      autoEntries.flatMap(({ baseSegment, autoState }) => {
        const pendingModes = ROUTE_TRAVEL_MODES.filter(
          (travelMode) =>
            autoState.availability[travelMode] ===
            "loading"
        );

        return pendingModes.length > 0
          ? [
              [
                baseSegment.key,
                [
                  "AUTO",
                  autoState.routeIdentity,
                  ...pendingModes.map((travelMode) =>
                    createSegmentRequestSignature(
                      autoState.segments[travelMode]
                    )
                  ),
                ].join("|"),
              ] as const,
            ]
          : [];
      })
    );

    routeRequestControlsRef.current.forEach(
      (control, segmentKey) => {
        if (
          desiredRequestSignatures.get(segmentKey) !==
          control.requestSignature
        ) {
          control.controller.abort();
          routeRequestControlsRef.current.delete(segmentKey);
        }
      }
    );

    autoEntries.forEach(({ baseSegment, autoState }) => {
      const requestSignature =
        desiredRequestSignatures.get(baseSegment.key);

      if (!requestSignature) {
        return;
      }

      const userSelectionVersion =
        routeUserSelectionVersionsRef.current.get(
          baseSegment.key
        ) ?? 0;
      const activeRequest =
        routeRequestControlsRef.current.get(
          baseSegment.key
        );

      if (
        activeRequest?.requestSignature ===
          requestSignature &&
        activeRequest.userSelectionVersion ===
          userSelectionVersion
      ) {
        return;
      }

      activeRequest?.controller.abort();

      const controller = new AbortController();
      const version = routeRequestVersionRef.current + 1;
      routeRequestVersionRef.current = version;
      routeRequestControlsRef.current.set(
        baseSegment.key,
        {
          controller,
          requestSignature,
          version,
          userSelectionVersion,
        }
      );

      const isCurrentRequest = () => {
        const activeControl =
          routeRequestControlsRef.current.get(
            baseSegment.key
          );

        return (
          routeRequestContextRef.current === routeContext &&
          activeControl?.version === version &&
          activeControl.requestSignature ===
            requestSignature &&
          activeControl.userSelectionVersion ===
            userSelectionVersion &&
          (routeUserSelectionVersionsRef.current.get(
            baseSegment.key
          ) ?? 0) === userSelectionVersion
        );
      };

      void (async () => {
        const attemptedModes =
          new Set<RouteTravelMode>();

        for (const travelMode of ROUTE_TRAVEL_MODES) {
          if (
            autoState.availability[travelMode] !==
              "loading" ||
            attemptedModes.has(travelMode)
          ) {
            continue;
          }

          attemptedModes.add(travelMode);
          const candidateSegment =
            autoState.segments[travelMode];
          const resultKey = createRouteResultKey(
            tripId,
            tripCountry,
            routeDate,
            candidateSegment
          );

          try {
            const route = await computeRoute(
              {
                tripId,
                date: routeDate,
                country: tripCountry,
                origin:
                  candidateSegment.origin as RouteCoordinate,
                destination:
                  candidateSegment.destination as RouteCoordinate,
                travelMode,
                ...(candidateSegment.departureTime
                  ? {
                      departureTime:
                        candidateSegment.departureTime,
                    }
                  : {}),
              },
              controller.signal
            );

            if (!isCurrentRequest()) {
              return;
            }

            if (
              travelMode === "TRANSIT" &&
              route.transitSummary?.transitLegCount === 0
            ) {
              autoState.availability.TRANSIT =
                "unavailable";
              delete autoState.routes.TRANSIT;
              routeUnavailableResultsRef.current.add(
                resultKey
              );
            } else {
              autoState.availability[travelMode] =
                "available";
              autoState.routes[travelMode] = route;
              routeResultsRef.current.set(
                resultKey,
                route
              );
            }
          } catch (error: unknown) {
            if (
              error instanceof Error &&
              error.name === "AbortError"
            ) {
              return;
            }

            if (!isCurrentRequest()) {
              return;
            }

            autoState.availability[travelMode] =
              "unavailable";
            delete autoState.routes[travelMode];

            if (
              error instanceof RouteRequestError &&
              (error.code === "WALK_ROUTE_NOT_FOUND" ||
                error.code === "TRANSIT_ROUTE_NOT_FOUND" ||
                error.code === "TRANSIT_WALK_ONLY" ||
                error.code === "TRANSIT_TIME_TOO_OLD" ||
                error.code === "TRANSIT_TIME_TOO_FAR")
            ) {
              routeUnavailableResultsRef.current.add(
                resultKey
              );
            }
          }
        }

        if (!isCurrentRequest()) {
          return;
        }

        const latestSnapshot =
          routeSnapshotRef.current;
        const latestSegment =
          latestSnapshot.segments.find(
            (segment) =>
              segment.key === baseSegment.key &&
              segment.routeIdentity ===
                autoState.routeIdentity
          );

        if (
          latestSnapshot.date !== routeDate ||
          latestSnapshot.scheduleSignature !==
            renderedScheduleRouteSignature ||
          !latestSegment
        ) {
          return;
        }

        const resolvedSegment =
          createResolvedRouteSegment(
            latestSegment,
            autoState
          );
        const resolvedSegments =
          latestSnapshot.segments.map((segment) =>
            segment.key === baseSegment.key
              ? resolvedSegment
              : segment
          );

        if (
          resolvedSegment.status === "success"
        ) {
          routeModeBySegmentRef.current = {
            ...routeModeBySegmentRef.current,
            [baseSegment.key]:
              resolvedSegment.travelMode,
          };
          setRouteModeBySegment(
            routeModeBySegmentRef.current
          );
        }

        replaceRouteSnapshot({
          ...latestSnapshot,
          segments: resolvedSegments,
        });
        logRouteDiagnostics(
          routeDate,
          resolvedSegments
        );
      })().finally(() => {
        const activeControl =
          routeRequestControlsRef.current.get(
            baseSegment.key
          );

        if (activeControl?.version === version) {
          routeRequestControlsRef.current.delete(
            baseSegment.key
          );
        }
      });
    });

    if (
      !hydratedSegments.some(
        (segment) => segment.status === "loading"
      )
    ) {
      logRouteDiagnostics(
        routeDate,
        hydratedSegments
      );
    }
  }, [
    abortAllRouteRequests,
    initialRenderedRouteSegments,
    renderedMapDate,
    renderedMapSchedules,
    renderedScheduleRouteSignature,
    replaceRouteSnapshot,
    trip?.id,
    trip?.country,
  ]);

  function handleSelectDate(
    date: string
  ) {
    selectedDateRef.current = date;
    setSelectedDate(date);
    requestMapDate(date);
  }

  function handleSelectRouteMode(
    segmentKey: string,
    travelMode: RouteTravelMode
  ) {
    const latestSnapshot = routeSnapshotRef.current;
    const currentSegment =
      latestSnapshot.segments.find(
        (segment) => segment.key === segmentKey
      );
    const autoState = currentSegment?.routeIdentity
      ? routeAutoStatesRef.current.get(
          currentSegment.routeIdentity
        )
      : undefined;

    if (
      !currentSegment ||
      !autoState ||
      autoState.availability.WALK !== "available" ||
      autoState.availability.TRANSIT !== "available" ||
      !autoState.routes[travelMode]
    ) {
      return;
    }

    if (
      (routeModeBySegmentRef.current[segmentKey] ??
        "WALK") ===
      travelMode
    ) {
      return;
    }

    routeRequestControlsRef.current
      .get(segmentKey)
      ?.controller.abort();
    routeRequestControlsRef.current.delete(segmentKey);
    routeUserSelectionVersionsRef.current.set(
      segmentKey,
      (routeUserSelectionVersionsRef.current.get(
        segmentKey
      ) ?? 0) + 1
    );
    autoState.manuallySelectedMode = travelMode;

    const selectedSegment = {
      ...autoState.segments[travelMode],
      status: "success" as const,
      route: autoState.routes[travelMode],
      modeAvailability: {
        ...autoState.availability,
      },
      recommendedMode: autoState.recommendedMode,
      routeIdentity: autoState.routeIdentity,
    };
    const resolvedSegments =
      latestSnapshot.segments.map((segment) =>
        segment.key === segmentKey
          ? selectedSegment
          : segment
      );

    routeModeBySegmentRef.current = {
      ...routeModeBySegmentRef.current,
      [segmentKey]: travelMode,
    };
    setRouteModeBySegment(routeModeBySegmentRef.current);
    replaceRouteSnapshot({
      ...latestSnapshot,
      segments: resolvedSegments,
    });

    if (latestSnapshot.date) {
      logRouteDiagnostics(
        latestSnapshot.date,
        resolvedSegments
      );
    }
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
                segment.route?.travelMode !==
                  segment.travelMode ||
                !isRenderableRouteGeometry(coordinates)
              ) {
                return null;
              }

              return (
                <Polyline
                  key={`${mapInstanceKey}:${segment.key}`}
                  coordinates={coordinates}
                  strokeColor={
                    segment.travelMode === "TRANSIT"
                      ? "#7C3AED"
                      : "#2563EB"
                  }
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
              const selectedRouteMode =
                routeSegment?.travelMode ?? "WALK";
              const routeModeUi =
                ROUTE_MODE_UI[selectedRouteMode];

              let routeLabel: string | null =
                null;
              let routeDetailLabel: string | null =
                null;
              let routeResultColor =
                routeModeUi.color;

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
                  const routeDuration =
                    formatRouteDuration(
                      routeSegment.route
                        .durationSeconds
                    );

                  if (
                    selectedRouteMode ===
                    "TRANSIT"
                  ) {
                    const transitDetails =
                      formatTransitDetails(
                        routeSegment.route
                      );

                    if (transitDetails.isWalkOnly) {
                      routeLabel = `${ROUTE_MODE_UI.WALK.icon} 도보 경로 확인 중...`;
                      routeDetailLabel = null;
                      routeResultColor =
                        ROUTE_MODE_UI.WALK.color;
                    } else {
                      routeLabel = [
                        `${routeModeUi.icon} ${routeModeUi.label} ${routeDuration}`,
                        transitDetails.transferLabel,
                      ]
                        .filter(Boolean)
                        .join(" · ");
                      routeDetailLabel =
                        transitDetails.detailLabel;
                    }
                  } else {
                    routeLabel =
                      `${routeModeUi.icon} ${routeModeUi.label} ${routeDuration} · ${formatRouteDistance(
                        routeSegment.route
                          .distanceMeters
                      )}`;
                  }
                } else if (
                  routeSegment?.status ===
                  "time-unavailable"
                ) {
                  routeLabel =
                    getTransitUnavailableLabel(
                      routeSegment.timeAvailability
                    );
                } else if (
                  routeSegment?.status ===
                  "fallback-unavailable"
                ) {
                  routeLabel =
                    "사용 가능한 이동 경로를 찾지 못했어요";
                } else if (
                  routeSegment?.status === "no-route"
                ) {
                  routeLabel =
                    selectedRouteMode === "WALK"
                      ? `${ROUTE_MODE_UI.WALK.icon} 도보 경로를 찾을 수 없어요`
                      : "이 시간대에는 대중교통 경로를 찾지 못했어요.";
                } else if (
                  routeSegment?.status === "error"
                ) {
                  routeLabel =
                    `${routeModeUi.label} 경로 정보를 불러올 수 없음`;
                } else {
                  routeLabel =
                    `${routeModeUi.icon} ${routeModeUi.label} 경로 계산 중...`;
                }
              }

              if (
                routeLabel &&
                routeSegment?.status === "success" &&
                routeSegment.recommendedMode ===
                  selectedRouteMode
              ) {
                routeLabel = `⭐ ${routeLabel}`;
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
                        marginLeft: 48,
                        marginRight: 4,
                        paddingTop: 8,
                        paddingBottom: 2,
                      }}
                    >
                      {hasCoordinates &&
                        nextHasCoordinates &&
                        routeSegment && (
                          <View
                            style={{
                              flexDirection: "row",
                              gap: 8,
                              marginBottom: 7,
                            }}
                          >
                            {ROUTE_TRAVEL_MODES.map(
                              (travelMode) => {
                                const selected =
                                  selectedRouteMode ===
                                  travelMode;
                                const availability =
                                  routeSegment.modeAvailability?.[
                                    travelMode
                                  ] ?? "loading";
                                const bothModesAvailable =
                                  routeSegment.modeAvailability
                                    ?.WALK === "available" &&
                                  routeSegment.modeAvailability
                                    ?.TRANSIT === "available";
                                const disabled =
                                  !bothModesAvailable;
                                const modeUi =
                                  ROUTE_MODE_UI[
                                    travelMode
                                  ];

                                return (
                                  <Pressable
                                    key={travelMode}
                                    accessibilityRole="button"
                                    accessibilityState={{
                                      selected,
                                      disabled,
                                    }}
                                    disabled={disabled}
                                    onPress={() =>
                                      handleSelectRouteMode(
                                        routeSegment.key,
                                        travelMode
                                      )
                                    }
                                    style={{
                                      minHeight: 36,
                                      paddingHorizontal: 12,
                                      borderRadius: 18,
                                      borderWidth: 1,
                                      borderColor: selected
                                        ? modeUi.color
                                        : "#D1D5DB",
                                      backgroundColor: selected
                                        ? modeUi.selectedBackground
                                        : "white",
                                      flexDirection: "row",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      opacity:
                                        availability ===
                                        "unavailable"
                                          ? 0.38
                                          : availability ===
                                              "loading"
                                            ? 0.6
                                            : 1,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        color: selected
                                          ? modeUi.color
                                          : "#6B7280",
                                        fontSize: 12,
                                        fontWeight: "bold",
                                      }}
                                    >
                                      {modeUi.icon}{" "}
                                      {modeUi.label}
                                    </Text>
                                  </Pressable>
                                );
                              }
                            )}
                          </View>
                        )}

                      <View
                        style={{
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
                                  ? routeResultColor
                                  : "#9CA3AF",
                            fontSize: 14,
                            fontWeight: "bold",
                          }}
                        >
                          ↓
                        </Text>

                        <View
                          style={{
                            flex: 1,
                            marginLeft: 8,
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
                                    ? routeResultColor
                                    : "#6B7280",
                              fontSize: 12,
                              lineHeight: 18,
                              fontWeight: "bold",
                            }}
                          >
                            {routeLabel}
                          </Text>
                          {routeDetailLabel ? (
                            <Text
                              style={{
                                marginTop: 2,
                                color: "#4B5563",
                                fontSize: 12,
                                lineHeight: 18,
                              }}
                            >
                              {routeDetailLabel}
                            </Text>
                          ) : null}
                        </View>
                      </View>
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
