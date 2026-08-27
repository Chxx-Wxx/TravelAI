const API_URL =
  process.env.EXPO_PUBLIC_API_URL;

export type PlaceResult = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  primaryType?: string;
  types?: string[];
  distanceMeters?: number;
  distanceSource?: PlaceSearchReferenceSource;
};

export type PlaceSearchReferenceSource =
  | "current_location"
  | "schedule"
  | "map"
  | "city";

export type PlaceSearchReference = {
  latitude: number;
  longitude: number;
  source: PlaceSearchReferenceSource;
};

type SearchPlacesOptions = {
  reference?: PlaceSearchReference | null;
};

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function calculatePlaceDistanceMeters(
  from: Pick<PlaceSearchReference, "latitude" | "longitude">,
  to: Pick<PlaceResult, "latitude" | "longitude">
) {
  const latitudeDelta = toRadians(
    to.latitude - from.latitude
  );
  const longitudeDelta = toRadians(
    to.longitude - from.longitude
  );
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    2 *
    EARTH_RADIUS_METERS *
    Math.asin(Math.sqrt(haversine))
  );
}

export function formatPlaceDistance(
  distanceMeters: number
) {
  if (distanceMeters < 1000) {
    return `${Math.max(
      10,
      Math.round(distanceMeters / 10) * 10
    )}m`;
  }

  return `${(distanceMeters / 1000).toFixed(1)}km`;
}

export function getPlaceDistanceLabel(
  place: PlaceResult
) {
  if (
    place.distanceMeters === undefined ||
    !Number.isFinite(place.distanceMeters) ||
    !place.distanceSource
  ) {
    return null;
  }

  const prefix = {
    current_location: "현재 위치에서",
    schedule: "현재 일정에서",
    map: "지도 기준",
    city: "여행 도시 기준",
  }[place.distanceSource];

  return `${prefix} 약 ${formatPlaceDistance(
    place.distanceMeters
  )}`;
}

function getNameMatchRank(
  query: string,
  placeName: string
) {
  const normalizedQuery = normalizePlaceName(query);
  const normalizedName = normalizePlaceName(placeName);

  if (normalizedName === normalizedQuery) return 0;
  if (normalizedName.startsWith(normalizedQuery)) return 1;
  if (normalizedName.includes(normalizedQuery)) return 2;
  return 3;
}

function addDistancesAndSort(
  query: string,
  places: PlaceResult[],
  reference?: PlaceSearchReference | null
) {
  if (!reference) {
    return places;
  }

  return places
    .map((place, originalIndex) => {
      const hasCoordinates =
        Number.isFinite(place.latitude) &&
        Number.isFinite(place.longitude);

      return {
        place: hasCoordinates
          ? {
              ...place,
              distanceMeters: calculatePlaceDistanceMeters(
                reference,
                place
              ),
              distanceSource: reference.source,
            }
          : place,
        originalIndex,
        nameRank: getNameMatchRank(query, place.name),
      };
    })
    .sort((first, second) => {
      if (first.nameRank !== second.nameRank) {
        return first.nameRank - second.nameRank;
      }

      const firstDistance = first.place.distanceMeters;
      const secondDistance = second.place.distanceMeters;

      if (
        firstDistance === undefined ||
        secondDistance === undefined
      ) {
        return first.originalIndex - second.originalIndex;
      }

      const distanceDifference = firstDistance - secondDistance;

      if (Math.abs(distanceDifference) >= 50) {
        return distanceDifference;
      }

      return first.originalIndex - second.originalIndex;
    })
    .map(({ place }) => place);
}

function removeDuplicatePlacesById(
  places: PlaceResult[]
) {
  const seenIds = new Set<string>();

  return places.filter((place) => {
    if (!place.id) return true;
    if (seenIds.has(place.id)) return false;

    seenIds.add(place.id);
    return true;
  });
}

export type PlaceLocationKind =
  | "region"
  | "station"
  | "poi"
  | "unknown";

const REGION_PLACE_TYPES = new Set([
  "administrative_area_level_1",
  "administrative_area_level_2",
  "country",
  "locality",
  "neighborhood",
  "postal_town",
  "sublocality",
]);

const STATION_PLACE_TYPES = new Set([
  "bus_station",
  "subway_station",
  "train_station",
  "transit_station",
]);

const DESTINATION_PLACE_TYPES = new Set([
  "airport",
  "amusement_park",
  "aquarium",
  "art_gallery",
  "buddhist_temple",
  "church",
  "cultural_landmark",
  "historical_landmark",
  "historical_place",
  "marina",
  "monument",
  "mosque",
  "museum",
  "national_park",
  "observation_deck",
  "park",
  "place_of_worship",
  "shinto_shrine",
  "stadium",
  "tourist_attraction",
  "zoo",
]);

const GENERIC_PLACE_QUERIES = new Set([
  "숙소",
  "식당",
  "음식점",
  "편의점",
  "카페",
  "라멘",
  "호텔",
  "restaurant",
  "cafe",
  "conveniencestore",
  "ramen",
  "hotel",
]);

function normalizePlaceName(
  value: string
) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

function getPlaceTypes(
  place: PlaceResult
) {
  return new Set(
    [
      place.primaryType,
      ...(place.types ?? []),
    ].filter(
      (type): type is string =>
        Boolean(type)
    )
  );
}

export function getPlaceLocationKind(
  place: PlaceResult
): PlaceLocationKind {
  // 현재는 검색/자동 연결 정책에서만 사용한다.
  // 일정 DB에는 유형을 저장하지 않아 기존 데이터와 호환된다.
  const types = getPlaceTypes(place);

  if (
    [...types].some(
      (type) =>
        REGION_PLACE_TYPES.has(type) ||
        type.startsWith(
          "sublocality_level_"
        ) ||
        type.startsWith(
          "administrative_area_level_"
        )
    )
  ) {
    return "region";
  }

  if (
    [...types].some((type) =>
      STATION_PLACE_TYPES.has(type)
    )
  ) {
    return "station";
  }

  if (
    [...types].some((type) =>
      DESTINATION_PLACE_TYPES.has(type)
    )
  ) {
    return "poi";
  }

  return "unknown";
}

export function arePlaceNamesEquivalent(
  first: string,
  second: string
) {
  return (
    first
      .normalize("NFKC")
      .trim()
      .toLocaleLowerCase() ===
    second
      .normalize("NFKC")
      .trim()
      .toLocaleLowerCase()
  );
}

function isRegionNameMatch(
  query: string,
  placeName: string
) {
  const normalizedQuery =
    normalizePlaceName(query);
  const normalizedName =
    normalizePlaceName(placeName);

  if (normalizedName === normalizedQuery) {
    return true;
  }

  return [
    "구",
    "시",
    "도",
    "현",
    "동",
    "정",
    "촌",
  ].some(
    (suffix) =>
      normalizedName ===
      `${normalizedQuery}${suffix}`
  );
}

function hasPlaceTypeMetadata(
  place: PlaceResult
) {
  return Boolean(
    place.primaryType ||
      place.types?.length
  );
}

// 첫 결과가 아니라 이름 일치도, 결과 간 중복, 장소 유형을 함께 본다.
export function findConfidentPlaceMatch(
  query: string,
  results: PlaceResult[]
) {
  const normalizedQuery =
    normalizePlaceName(query);

  if (!normalizedQuery) {
    return null;
  }

  if (
    GENERIC_PLACE_QUERIES.has(
      normalizedQuery
    )
  ) {
    return null;
  }

  const regionMatches =
    results.filter(
      (place) =>
        getPlaceLocationKind(place) ===
          "region" &&
        isRegionNameMatch(
          query,
          place.name
        )
    );

  if (regionMatches.length === 1) {
    return regionMatches[0];
  }

  if (regionMatches.length > 1) {
    return null;
  }

  const exactMatches =
    results.filter(
      (place) =>
        normalizePlaceName(
          place.name
        ) === normalizedQuery
    );

  const stationMatches =
    exactMatches.filter(
      (place) =>
        getPlaceLocationKind(place) ===
        "station"
    );

  if (stationMatches.length === 1) {
    return stationMatches[0];
  }

  if (stationMatches.length > 1) {
    return null;
  }

  if (exactMatches.length !== 1) {
    return null;
  }

  const relatedMatches =
    results.filter((place) => {
      const normalizedName =
        normalizePlaceName(
          place.name
        );

      return (
        normalizedName.includes(
          normalizedQuery
        ) ||
        normalizedQuery.includes(
          normalizedName
        )
      );
    });

  const exactMatch = exactMatches[0];
  const locationKind =
    getPlaceLocationKind(exactMatch);

  if (
    locationKind === "poi" &&
    relatedMatches.length === 1
  ) {
    return exactMatch;
  }

  // 이전 서버 응답과의 호환용 보수적 fallback.
  if (
    !hasPlaceTypeMetadata(exactMatch) &&
    relatedMatches.length === 1
  ) {
    return exactMatch;
  }

  return null;
}

export async function searchPlaces(
  query: string,
  options: SearchPlacesOptions = {}
): Promise<PlaceResult[]> {
  if (!API_URL) {
    throw new Error(
      "EXPO_PUBLIC_API_URL이 설정되지 않았습니다."
    );
  }

  const response = await fetch(
    `${API_URL}/places/search`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        bias: options.reference
          ? {
              latitude:
                options.reference.latitude,
              longitude:
                options.reference.longitude,
            }
          : undefined,
      }),
    }
  );

  if (!response.ok) {
    const text =
      await response.text();

    console.log(
      "장소 검색 서버 오류:",
      response.status,
      text
    );

    throw new Error(
      `장소 검색 실패: ${response.status}`
    );
  }

  const data =
    await response.json();

  console.log(
    "장소 검색 결과:",
    data
  );

  return addDistancesAndSort(
    query,
    removeDuplicatePlacesById(
      data.places ?? []
    ),
    options.reference
  );
}
