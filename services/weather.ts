import type {
  Schedule,
} from "../types";

import {
  hasValidScheduleLocation,
} from "../lib/schedule-location";

export interface WeatherData {
  city: string;

  latitude: number;
  longitude: number;

  temperature: number;

  maxTemperature: number;
  minTemperature: number;

  precipitationProbability: number;

  weatherCode: number;

  description: string;
  icon: string;
}

export type ScheduleWeatherStatus =
  | "available"
  | "missing_coordinates"
  | "past"
  | "forecast_unavailable"
  | "error";

type AvailableScheduleWeatherData = {
  scheduleId: string;
  status: "available";
  forecastTime: string;
  temperature: number;
  precipitationProbability: number;
  weatherCode: number;
  description: string;
  icon: string;
};

type UnavailableScheduleWeatherData = {
  scheduleId: string;
  status: Exclude<
    ScheduleWeatherStatus,
    "available"
  >;
  message: string;
};

export type ScheduleWeatherData =
  | AvailableScheduleWeatherData
  | UnavailableScheduleWeatherData;

export const OPEN_METEO_FORECAST_DAYS = 16;
export const WEATHER_CACHE_TTL_MS =
  10 * 60 * 1000;

interface GeocodingResult {
  name: string;

  latitude: number;
  longitude: number;

  country?: string;
  country_code?: string;
}

interface GeocodingResponse {
  results?: GeocodingResult[];
}

interface ForecastResponse {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
  };

  daily?: {
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];

    precipitation_probability_max?: number[];

    weather_code?: number[];
  };

  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    precipitation_probability?: number[];
    weather_code?: number[];
  };
}

// 날씨 코드에 따라
// 한글 설명과 아이콘 반환
function getWeatherInfo(
  code: number
) {
  if (code === 0) {
    return {
      description: "맑음",
      icon: "☀️",
    };
  }

  if (
    code === 1 ||
    code === 2
  ) {
    return {
      description:
        "대체로 맑음",
      icon: "🌤️",
    };
  }

  if (code === 3) {
    return {
      description: "흐림",
      icon: "☁️",
    };
  }

  if (
    code === 45 ||
    code === 48
  ) {
    return {
      description: "안개",
      icon: "🌫️",
    };
  }

  if (
    code === 51 ||
    code === 53 ||
    code === 55 ||
    code === 56 ||
    code === 57
  ) {
    return {
      description: "이슬비",
      icon: "🌦️",
    };
  }

  if (
    code === 61 ||
    code === 63 ||
    code === 65 ||
    code === 66 ||
    code === 67 ||
    code === 80 ||
    code === 81 ||
    code === 82
  ) {
    return {
      description: "비",
      icon: "🌧️",
    };
  }

  if (
    code === 71 ||
    code === 73 ||
    code === 75 ||
    code === 77 ||
    code === 85 ||
    code === 86
  ) {
    return {
      description: "눈",
      icon: "🌨️",
    };
  }

  if (
    code === 95 ||
    code === 96 ||
    code === 99
  ) {
    return {
      description: "뇌우",
      icon: "⛈️",
    };
  }

  return {
    description:
      "날씨 정보",
    icon: "🌤️",
  };
}

// 도시 이름으로 위도 / 경도 검색
export async function getCityCoordinates(
  city: string,
  country?: string
) {
  const url =
    "https://geocoding-api.open-meteo.com/v1/search" +
    `?name=${encodeURIComponent(
      city
    )}` +
    "&count=10" +
    "&language=ko" +
    "&format=json";

  const response =
    await fetch(url);

  if (!response.ok) {
    throw new Error(
      "도시 위치 검색에 실패했습니다."
    );
  }

  const data:
    GeocodingResponse =
    await response.json();

  const results =
    data.results ?? [];

  if (
    results.length === 0
  ) {
    throw new Error(
      `${city}의 위치를 찾을 수 없습니다.`
    );
  }

  // 국가 정보가 있으면
  // 같은 국가의 도시를 우선 사용
  if (country) {
    const normalizedCountry =
      country
        .trim()
        .toLowerCase();

    const matched =
      results.find(
        (
          result
        ) => {
          const resultCountry =
            result.country
              ?.trim()
              .toLowerCase() ??
            "";

          return (
            resultCountry.includes(
              normalizedCountry
            ) ||
            normalizedCountry.includes(
              resultCountry
            )
          );
        }
      );

    if (matched) {
      return matched;
    }
  }

  // 일치 국가를 못 찾으면
  // 가장 첫 검색 결과 사용
  return results[0];
}

type CachedForecastRequest = {
  expiresAt: number;
  promise: Promise<ForecastResponse>;
};

const forecastRequestCache =
  new Map<
    string,
    CachedForecastRequest
  >();

function parseScheduleDateTime(
  schedule: Pick<Schedule, "date" | "time">
) {
  const [year, month, day] =
    schedule.date
      .split("-")
      .map(Number);
  const [hour, minute] =
    schedule.time
      .split(":")
      .map(Number);

  if (
    !year ||
    !month ||
    !day ||
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    return null;
  }

  const result = new Date(
    year,
    month - 1,
    day,
    hour,
    minute,
    0,
    0
  );

  return Number.isNaN(result.getTime())
    ? null
    : result;
}

function getTodayStart(now: Date) {
  const result = new Date(now);
  result.setHours(0, 0, 0, 0);
  return result;
}

function getForecastCacheKey(
  latitude: number,
  longitude: number,
  date: string
) {
  return [
    latitude.toFixed(4),
    longitude.toFixed(4),
    date,
  ].join(":");
}

async function requestHourlyForecast(
  latitude: number,
  longitude: number,
  date: string
) {
  const cacheKey =
    getForecastCacheKey(
      latitude,
      longitude,
      date
    );
  const cached =
    forecastRequestCache.get(cacheKey);

  if (
    cached &&
    cached.expiresAt > Date.now()
  ) {
    return cached.promise;
  }

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: [
      "temperature_2m",
      "precipitation_probability",
      "weather_code",
    ].join(","),
    timezone: "auto",
    start_date: date,
    end_date: date,
  });

  const promise = fetch(
    `https://api.open-meteo.com/v1/forecast?${params.toString()}`
  ).then(async (response) => {
    if (!response.ok) {
      throw new Error(
        "일정 시간대 날씨를 가져오지 못했습니다."
      );
    }

    return (await response.json()) as ForecastResponse;
  });

  forecastRequestCache.set(
    cacheKey,
    {
      expiresAt:
        Date.now() + WEATHER_CACHE_TTL_MS,
      promise,
    }
  );

  promise.catch(() => {
    if (
      forecastRequestCache.get(cacheKey)?.promise ===
      promise
    ) {
      forecastRequestCache.delete(cacheKey);
    }
  });

  return promise;
}

function findNearestHourlyIndex(
  hourlyTimes: string[],
  schedule: Pick<Schedule, "date" | "time">
) {
  const [targetHour, targetMinute] =
    schedule.time
      .split(":")
      .map(Number);
  const targetMinutes =
    targetHour * 60 + targetMinute;

  let selectedIndex = -1;
  let selectedDifference = Infinity;

  hourlyTimes.forEach((value, index) => {
    if (!value.startsWith(`${schedule.date}T`)) {
      return;
    }

    const [hour, minute] = value
      .slice(11, 16)
      .split(":")
      .map(Number);
    const difference = Math.abs(
      hour * 60 + minute - targetMinutes
    );

    if (difference < selectedDifference) {
      selectedIndex = index;
      selectedDifference = difference;
    }
  });

  return selectedIndex;
}

export function getNextUpcomingSchedule(
  schedules: Schedule[],
  now = new Date()
) {
  return (
    schedules
      .map((schedule) => ({
        schedule,
        dateTime:
          parseScheduleDateTime(schedule),
      }))
      .filter(
        (
          item
        ): item is {
          schedule: Schedule;
          dateTime: Date;
        } =>
          item.dateTime !== null &&
          item.dateTime.getTime() >= now.getTime()
      )
      .sort(
        (first, second) =>
          first.dateTime.getTime() -
          second.dateTime.getTime()
      )[0]?.schedule ?? null
  );
}

export async function fetchScheduleWeather(
  schedule: Schedule,
  now = new Date()
): Promise<ScheduleWeatherData> {
  const scheduleDateTime =
    parseScheduleDateTime(schedule);

  if (!scheduleDateTime) {
    return {
      scheduleId: schedule.id,
      status: "forecast_unavailable",
      message: "예보 준비 전",
    };
  }

  if (scheduleDateTime.getTime() < now.getTime()) {
    return {
      scheduleId: schedule.id,
      status: "past",
      message: "지난 일정",
    };
  }

  if (!hasValidScheduleLocation(schedule)) {
    return {
      scheduleId: schedule.id,
      status: "missing_coordinates",
      message: "일정 위치 정보 없음",
    };
  }

  const todayStart = getTodayStart(now);
  const scheduleDay = getTodayStart(
    scheduleDateTime
  );
  const dayDifference = Math.round(
    (scheduleDay.getTime() - todayStart.getTime()) /
      (24 * 60 * 60 * 1000)
  );

  if (
    dayDifference < 0 ||
    dayDifference >= OPEN_METEO_FORECAST_DAYS
  ) {
    return {
      scheduleId: schedule.id,
      status: "forecast_unavailable",
      message: "예보 준비 전",
    };
  }

  try {
    const data =
      await requestHourlyForecast(
        schedule.latitude,
        schedule.longitude,
        schedule.date
      );
    const hourlyTimes =
      data.hourly?.time ?? [];
    const hourlyIndex =
      findNearestHourlyIndex(
        hourlyTimes,
        schedule
      );

    if (hourlyIndex < 0) {
      return {
        scheduleId: schedule.id,
        status: "forecast_unavailable",
        message: "예보 준비 전",
      };
    }

    const temperature =
      data.hourly?.temperature_2m?.[
        hourlyIndex
      ];
    const precipitationProbability =
      data.hourly
        ?.precipitation_probability?.[
          hourlyIndex
        ];
    const weatherCode =
      data.hourly?.weather_code?.[
        hourlyIndex
      ];

    if (
      temperature === undefined ||
      precipitationProbability === undefined ||
      weatherCode === undefined
    ) {
      return {
        scheduleId: schedule.id,
        status: "forecast_unavailable",
        message: "예보 준비 전",
      };
    }

    const weatherInfo =
      getWeatherInfo(weatherCode);

    return {
      scheduleId: schedule.id,
      status: "available",
      forecastTime:
        hourlyTimes[hourlyIndex],
      temperature,
      precipitationProbability,
      weatherCode,
      description:
        weatherInfo.description,
      icon: weatherInfo.icon,
    };
  } catch (error) {
    console.error(
      "일정 날씨 불러오기 실패:",
      error
    );

    return {
      scheduleId: schedule.id,
      status: "error",
      message: "일정 날씨를 불러오지 못했습니다.",
    };
  }
}

export async function fetchScheduleWeatherList(
  schedules: Schedule[],
  now = new Date()
) {
  return Promise.all(
    schedules.map((schedule) =>
      fetchScheduleWeather(
        schedule,
        now
      )
    )
  );
}

// 일정 예보를 사용할 수 없을 때만 사용하는 대표 도시 fallback
export async function fetchWeather(
  city: string,
  country?: string
): Promise<WeatherData> {
  const location =
    await getCityCoordinates(
      city,
      country
    );

  const params =
    new URLSearchParams({
      latitude:
        String(location.latitude),
      longitude:
        String(location.longitude),
      current:
        [
          "temperature_2m",
          "weather_code",
        ].join(","),
      daily:
        [
          "temperature_2m_max",
          "temperature_2m_min",
          "precipitation_probability_max",
          "weather_code",
        ].join(","),
      timezone: "auto",
      forecast_days: "1",
    });

  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error(
      "날씨 정보를 가져오지 못했습니다."
    );
  }

  const data =
    (await response.json()) as ForecastResponse;
  const temperature =
    data.current?.temperature_2m;
  const weatherCode =
    data.current?.weather_code ??
    data.daily?.weather_code?.[0];
  const maxTemperature =
    data.daily?.temperature_2m_max?.[0];
  const minTemperature =
    data.daily?.temperature_2m_min?.[0];
  const precipitationProbability =
    data.daily
      ?.precipitation_probability_max?.[0];

  if (
    temperature === undefined ||
    weatherCode === undefined ||
    maxTemperature === undefined ||
    minTemperature === undefined
  ) {
    throw new Error(
      "날씨 데이터가 올바르지 않습니다."
    );
  }

  const weatherInfo =
    getWeatherInfo(weatherCode);

  return {
    city: location.name,
    latitude: location.latitude,
    longitude: location.longitude,
    temperature,
    maxTemperature,
    minTemperature,
    precipitationProbability:
      precipitationProbability ?? 0,
    weatherCode,
    description:
      weatherInfo.description,
    icon: weatherInfo.icon,
  };
}
