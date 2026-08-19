const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "TravelAI server is running",
  });
});

// ======================================================
// Google Places
// ======================================================

function normalizeQuery(value) {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, " ");
}

function makeFallbackQuery(query) {
  const normalized =
    normalizeQuery(query).toLowerCase();

  if (
    normalized.includes("센소지") ||
    normalized.includes("浅草寺")
  ) {
    return "Sensoji Tokyo";
  }

  if (
    normalized.includes("도쿄 스카이트리") ||
    normalized.includes("스카이트리") ||
    normalized.includes("東京スカイツリー")
  ) {
    return "Tokyo Skytree";
  }

  if (
    normalized.includes("시부야 스카이") ||
    normalized.includes("渋谷スカイ")
  ) {
    return "Shibuya Sky Tokyo";
  }

  if (
    normalized.includes("도쿄 타워") ||
    normalized.includes("東京タワー")
  ) {
    return "Tokyo Tower";
  }

  if (
    normalized.includes("메이지 신궁") ||
    normalized.includes("明治神宮")
  ) {
    return "Meiji Jingu Tokyo";
  }

  return null;
}

async function requestPlaces(query) {
  const response = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",

        "X-Goog-Api-Key":
          process.env.GOOGLE_MAPS_API_KEY,

        "X-Goog-FieldMask": [
          "places.id",
          "places.displayName",
          "places.formattedAddress",
          "places.location",
        ].join(","),
      },

      body: JSON.stringify({
        textQuery: query,

        languageCode: "ko",

        regionCode: "JP",

        // 현재는 테스트용으로 도쿄 중심
        // 나중에 여행 도시 기준으로 자동 변경 예정
        locationBias: {
          circle: {
            center: {
              latitude: 35.6762,
              longitude: 139.6503,
            },

            radius: 50000,
          },
        },
      }),
    }
  );

  const data =
    await response.json();

  return {
    response,
    data,
  };
}

function convertPlaces(data) {
  return (
    data.places?.map((place) => ({
      id: place.id,

      name:
        place.displayName?.text ??
        "이름 없음",

      address:
        place.formattedAddress ?? "",

      latitude:
        place.location?.latitude,

      longitude:
        place.location?.longitude,
    })) ?? []
  );
}

app.post(
  "/places/search",
  async (req, res) => {
    try {
      const receivedQuery =
        req.body?.query;

      const query =
        normalizeQuery(
          receivedQuery
        );

      if (!query) {
        return res
          .status(400)
          .json({
            message:
              "검색어가 필요합니다.",
          });
      }

      if (
        !process.env
          .GOOGLE_MAPS_API_KEY
      ) {
        return res
          .status(500)
          .json({
            message:
              "Google Maps API key가 설정되지 않았습니다.",
          });
      }

      const fallbackQuery =
        makeFallbackQuery(
          query
        );

      console.log(
        "받은 검색어:",
        query
      );

      console.log(
        "fallback 검색어:",
        fallbackQuery
      );

      const first =
        await requestPlaces(
          query
        );

      if (!first.response.ok) {
        console.error(
          "Google Places 오류:",
          first.data
        );

        return res
          .status(
            first.response.status
          )
          .json({
            message:
              "Google Places 검색에 실패했습니다.",

            detail:
              first.data,
          });
      }

      let places =
        convertPlaces(
          first.data
        );

      console.log(
        "1차 결과:",
        places.length
      );

      if (
        places.length === 0 &&
        fallbackQuery
      ) {
        console.log(
          "영문 fallback 실행:",
          fallbackQuery
        );

        const second =
          await requestPlaces(
            fallbackQuery
          );

        if (
          second.response.ok
        ) {
          places =
            convertPlaces(
              second.data
            );
        } else {
          console.error(
            "fallback Places 오류:",
            second.data
          );
        }

        console.log(
          "fallback 결과:",
          places.length
        );
      }

      return res.json({
        places,
      });
    } catch (error) {
      console.error(
        "Places 서버 오류:",
        error
      );

      return res
        .status(500)
        .json({
          message:
            "서버 오류가 발생했습니다.",
        });
    }
  }
);

// ======================================================
// 여행 API - 임시 메모리 저장
// 서버를 껐다 켜면 여행 데이터는 사라짐
// DB 연결 전 테스트용
// ======================================================

let trips = [];

// 여행 저장
app.post(
  "/trips",
  (req, res) => {
    try {
      const {
        tripName,
        country,
        city,
        startDate,
        endDate,
        people,
        members,
      } = req.body;

      if (
        !tripName ||
        !country ||
        !city ||
        !startDate ||
        !endDate
      ) {
        return res
          .status(400)
          .json({
            message:
              "여행 이름, 국가, 도시, 시작일, 종료일은 필수입니다.",
          });
      }

      const newTrip = {
        id:
          Date.now().toString(),

        tripName:
          String(
            tripName
          ).trim(),

        country:
          String(
            country
          ).trim(),

        city:
          String(
            city
          ).trim(),

        startDate,

        endDate,

        people:
          people ??
          String(
            members?.length ?? 1
          ),

        members:
          Array.isArray(members)
            ? members
            : [],
      };

      trips.push(
        newTrip
      );

      console.log(
        "여행 저장 성공:",
        newTrip
      );

      return res
        .status(201)
        .json({
          message:
            "여행이 저장되었습니다.",

          trip:
            newTrip,
        });
    } catch (error) {
      console.error(
        "여행 저장 오류:",
        error
      );

      return res
        .status(500)
        .json({
          message:
            "여행 저장 중 서버 오류가 발생했습니다.",
        });
    }
  }
);

// 여행 전체 조회
app.get(
  "/trips",
  (req, res) => {
    return res.json({
      trips,
    });
  }
);

// 여행 하나 조회
app.get(
  "/trips/:id",
  (req, res) => {
    const trip =
      trips.find(
        (item) =>
          item.id ===
          req.params.id
      );

    if (!trip) {
      return res
        .status(404)
        .json({
          message:
            "여행을 찾을 수 없습니다.",
        });
    }

    return res.json({
      trip,
    });
  }
);

// 여행 수정
app.put(
  "/trips/:id",
  (req, res) => {
    const index =
      trips.findIndex(
        (item) =>
          item.id ===
          req.params.id
      );

    if (index === -1) {
      return res
        .status(404)
        .json({
          message:
            "여행을 찾을 수 없습니다.",
        });
    }

    trips[index] = {
      ...trips[index],
      ...req.body,

      // 여행 ID는 수정되지 않게 유지
      id:
        trips[index].id,
    };

    console.log(
      "여행 수정 성공:",
      trips[index]
    );

    return res.json({
      message:
        "여행이 수정되었습니다.",

      trip:
        trips[index],
    });
  }
);

// 여행 삭제
app.delete(
  "/trips/:id",
  (req, res) => {
    const exists =
      trips.some(
        (item) =>
          item.id ===
          req.params.id
      );

    if (!exists) {
      return res
        .status(404)
        .json({
          message:
            "여행을 찾을 수 없습니다.",
        });
    }

    trips =
      trips.filter(
        (item) =>
          item.id !==
          req.params.id
      );

    // 해당 여행의 일정도 함께 제거
    schedules =
      schedules.filter(
        (schedule) =>
          schedule.tripId !==
          req.params.id
      );

    return res.json({
      message:
        "여행이 삭제되었습니다.",
    });
  }
);

// ======================================================
// 일정 API - 임시 메모리 저장
// tripId를 이용해 여행별로 일정 구분
// 서버를 껐다 켜면 일정 데이터는 사라짐
// DB 연결 전 테스트용
// ======================================================

let schedules = [];

// 일정 저장
app.post(
  "/schedules",
  (req, res) => {
    try {
      const {
        tripId,
        title,
        location,
        address,
        latitude,
        longitude,
        placeId,
        category,
        durationMinutes,
        date,
        time,
        memo,
      } = req.body;

      if (
        !tripId ||
        !title ||
        !location ||
        !date ||
        !time
      ) {
        return res
          .status(400)
          .json({
            message:
              "여행 ID, 일정 이름, 장소, 날짜, 시간은 필수입니다.",
          });
      }

      // 실제 존재하는 여행인지 확인
      const tripExists =
        trips.some(
          (trip) =>
            trip.id === tripId
        );

      if (!tripExists) {
        return res
          .status(404)
          .json({
            message:
              "해당 여행을 찾을 수 없습니다.",
          });
      }

      const newSchedule = {
        id:
          Date.now().toString(),

        // 이 일정이 어느 여행 소속인지 저장
        tripId,

        title:
          String(
            title
          ).trim(),

        location:
          String(
            location
          ).trim(),

        address:
          address ?? "",

        latitude:
          latitude ?? null,

        longitude:
          longitude ?? null,

        placeId:
          placeId ?? null,

        category:
          category ?? "기타",

        durationMinutes:
          durationMinutes ?? 60,

        date,

        time,

        memo:
          memo ?? "",
      };

      schedules.push(
        newSchedule
      );

      console.log(
        "일정 저장 성공:",
        newSchedule
      );

      return res
        .status(201)
        .json({
          message:
            "일정이 저장되었습니다.",

          schedule:
            newSchedule,
        });
    } catch (error) {
      console.error(
        "일정 저장 오류:",
        error
      );

      return res
        .status(500)
        .json({
          message:
            "일정 저장 중 서버 오류가 발생했습니다.",
        });
    }
  }
);

// 일정 전체 조회
// tripId가 있으면 해당 여행의 일정만 반환
// 예: GET /schedules?tripId=123
app.get(
  "/schedules",
  (req, res) => {
    const {
      tripId,
    } = req.query;

    let result =
      [...schedules];

    if (tripId) {
      result =
        result.filter(
          (schedule) =>
            schedule.tripId ===
            tripId
        );
    }

    result.sort(
      (a, b) => {
        const first =
          `${a.date} ${a.time}`;

        const second =
          `${b.date} ${b.time}`;

        return first.localeCompare(
          second
        );
      }
    );

    return res.json({
      schedules:
        result,
    });
  }
);

// 일정 하나 조회
app.get(
  "/schedules/:id",
  (req, res) => {
    const schedule =
      schedules.find(
        (item) =>
          item.id ===
          req.params.id
      );

    if (!schedule) {
      return res
        .status(404)
        .json({
          message:
            "일정을 찾을 수 없습니다.",
        });
    }

    return res.json({
      schedule,
    });
  }
);

// 일정 수정
app.put(
  "/schedules/:id",
  (req, res) => {
    const index =
      schedules.findIndex(
        (item) =>
          item.id ===
          req.params.id
      );

    if (index === -1) {
      return res
        .status(404)
        .json({
          message:
            "일정을 찾을 수 없습니다.",
        });
    }

    schedules[index] = {
      ...schedules[index],
      ...req.body,

      // 일정 ID는 수정되지 않게 유지
      id:
        schedules[index].id,

      // 일정이 속한 여행도
      // 수정 요청으로 바뀌지 않게 유지
      tripId:
        schedules[index]
          .tripId,
    };

    console.log(
      "일정 수정 성공:",
      schedules[index]
    );

    return res.json({
      message:
        "일정이 수정되었습니다.",

      schedule:
        schedules[index],
    });
  }
);

// 일정 삭제
app.delete(
  "/schedules/:id",
  (req, res) => {
    const exists =
      schedules.some(
        (item) =>
          item.id ===
          req.params.id
      );

    if (!exists) {
      return res
        .status(404)
        .json({
          message:
            "일정을 찾을 수 없습니다.",
        });
    }

    schedules =
      schedules.filter(
        (item) =>
          item.id !==
          req.params.id
      );

    return res.json({
      message:
        "일정이 삭제되었습니다.",
    });
  }
);

// ======================================================
// 서버 시작
// ======================================================

const port =
  process.env.PORT ||
  4000;

app.listen(
  port,
  () => {
    console.log(
      `TravelAI server running on port ${port}`
    );
  }
);