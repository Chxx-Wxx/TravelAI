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
async function getCityCoordinates(
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

// 실제 날씨 조회
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
        String(
          location.latitude
        ),

      longitude:
        String(
          location.longitude
        ),

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

  const response =
    await fetch(
      `https://api.open-meteo.com/v1/forecast?${params.toString()}`
    );

  if (!response.ok) {
    throw new Error(
      "날씨 정보를 가져오지 못했습니다."
    );
  }

  const data:
    ForecastResponse =
    await response.json();

  const temperature =
    data.current
      ?.temperature_2m;

  const weatherCode =
    data.current
      ?.weather_code ??
    data.daily
      ?.weather_code?.[0];

  const maxTemperature =
    data.daily
      ?.temperature_2m_max?.[0];

  const minTemperature =
    data.daily
      ?.temperature_2m_min?.[0];

  const precipitationProbability =
    data.daily
      ?.precipitation_probability_max?.[0];

  if (
    temperature ===
      undefined ||
    weatherCode ===
      undefined ||
    maxTemperature ===
      undefined ||
    minTemperature ===
      undefined
  ) {
    throw new Error(
      "날씨 데이터가 올바르지 않습니다."
    );
  }

  const weatherInfo =
    getWeatherInfo(
      weatherCode
    );

  return {
    city:
      location.name,

    latitude:
      location.latitude,

    longitude:
      location.longitude,

    temperature,

    maxTemperature,

    minTemperature,

    precipitationProbability:
      precipitationProbability ??
      0,

    weatherCode,

    description:
      weatherInfo.description,

    icon:
      weatherInfo.icon,
  };
}