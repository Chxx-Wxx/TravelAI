const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const {
  pool,
  query,
} = require("./db");

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
// 여행/일정 PostgreSQL helpers
// ======================================================

const TRIP_COLUMNS = `
  id, trip_name, country, city,
  start_date, end_date, people, members
`;

const SCHEDULE_COLUMNS = `
  id, trip_id, title, location, address,
  latitude, longitude, place_id, category,
  duration_minutes, date, time, memo
`;

function toTrip(row) {
  return {
    id: row.id,
    tripName: row.trip_name,
    country: row.country,
    city: row.city,
    startDate: row.start_date,
    endDate: row.end_date,
    people: row.people,
    members: row.members,
  };
}

function toSchedule(row) {
  return {
    id: row.id,
    tripId: row.trip_id,
    title: row.title,
    location: row.location,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    placeId: row.place_id,
    category: row.category,
    durationMinutes: row.duration_minutes,
    date: row.date,
    time: row.time,
    memo: row.memo,
  };
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(
    object,
    key
  );
}

// ======================================================
// 여행 API - PostgreSQL 영구 저장
// ======================================================

app.post("/trips", async (req, res) => {
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
      return res.status(400).json({
        message:
          "여행 이름, 국가, 도시, 시작일, 종료일은 필수입니다.",
      });
    }

    const result = await query(
      `
        INSERT INTO trips (
          id, trip_name, country, city,
          start_date, end_date, people, members
        )
        VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8::jsonb
        )
        RETURNING ${TRIP_COLUMNS}
      `,
      [
        Date.now().toString(),
        String(tripName).trim(),
        String(country).trim(),
        String(city).trim(),
        startDate,
        endDate,
        people ??
          String(members?.length ?? 1),
        JSON.stringify(
          Array.isArray(members)
            ? members
            : []
        ),
      ]
    );

    const newTrip = toTrip(result.rows[0]);

    console.log("여행 저장 성공:", newTrip);

    return res.status(201).json({
      message: "여행이 저장되었습니다.",
      trip: newTrip,
    });
  } catch (error) {
    console.error("여행 저장 오류:", error);

    return res.status(500).json({
      message:
        "여행 저장 중 서버 오류가 발생했습니다.",
    });
  }
});

app.get("/trips", async (req, res) => {
  try {
    const result = await query(`
      SELECT ${TRIP_COLUMNS}
      FROM trips
      ORDER BY created_at ASC
    `);

    return res.json({
      trips: result.rows.map(toTrip),
    });
  } catch (error) {
    console.error("여행 조회 오류:", error);

    return res.status(500).json({
      message:
        "여행 조회 중 서버 오류가 발생했습니다.",
    });
  }
});

app.get("/trips/:id", async (req, res) => {
  try {
    const result = await query(
      `
        SELECT ${TRIP_COLUMNS}
        FROM trips
        WHERE id = $1
      `,
      [req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "여행을 찾을 수 없습니다.",
      });
    }

    return res.json({
      trip: toTrip(result.rows[0]),
    });
  } catch (error) {
    console.error("여행 조회 오류:", error);

    return res.status(500).json({
      message:
        "여행 조회 중 서버 오류가 발생했습니다.",
    });
  }
});

app.put("/trips/:id", async (req, res) => {
  try {
    const fieldMap = [
      ["tripName", "trip_name"],
      ["country", "country"],
      ["city", "city"],
      ["startDate", "start_date"],
      ["endDate", "end_date"],
      ["people", "people"],
      ["members", "members"],
    ];

    const assignments = [];
    const values = [];

    for (const [apiField, column] of fieldMap) {
      if (!hasOwn(req.body, apiField)) {
        continue;
      }

      let value = req.body[apiField];

      if (apiField === "members") {
        value = JSON.stringify(
          Array.isArray(value) ? value : []
        );
      }

      values.push(value);
      assignments.push(
        apiField === "members"
          ? `${column} = $${values.length}::jsonb`
          : `${column} = $${values.length}`
      );
    }

    values.push(req.params.id);

    const result = assignments.length > 0
      ? await query(
          `
            UPDATE trips
            SET ${assignments.join(", ")}
            WHERE id = $${values.length}
            RETURNING ${TRIP_COLUMNS}
          `,
          values
        )
      : await query(
          `
            SELECT ${TRIP_COLUMNS}
            FROM trips
            WHERE id = $1
          `,
          [req.params.id]
        );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "여행을 찾을 수 없습니다.",
      });
    }

    const updatedTrip = toTrip(result.rows[0]);

    console.log("여행 수정 성공:", updatedTrip);

    return res.json({
      message: "여행이 수정되었습니다.",
      trip: updatedTrip,
    });
  } catch (error) {
    console.error("여행 수정 오류:", error);

    return res.status(500).json({
      message:
        "여행 수정 중 서버 오류가 발생했습니다.",
    });
  }
});

app.delete("/trips/:id", async (req, res) => {
  try {
    const result = await query(
      `
        DELETE FROM trips
        WHERE id = $1
        RETURNING id
      `,
      [req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "여행을 찾을 수 없습니다.",
      });
    }

    return res.json({
      message: "여행이 삭제되었습니다.",
    });
  } catch (error) {
    console.error("여행 삭제 오류:", error);

    return res.status(500).json({
      message:
        "여행 삭제 중 서버 오류가 발생했습니다.",
    });
  }
});

// ======================================================
// 일정 API - PostgreSQL 영구 저장
// ======================================================

app.post("/schedules", async (req, res) => {
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
      return res.status(400).json({
        message:
          "여행 ID, 일정 이름, 장소, 날짜, 시간은 필수입니다.",
      });
    }

    const result = await query(
      `
        INSERT INTO schedules (
          id, trip_id, title, location, address,
          latitude, longitude, place_id, category,
          duration_minutes, date, time, memo
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13
        )
        RETURNING ${SCHEDULE_COLUMNS}
      `,
      [
        Date.now().toString(),
        tripId,
        String(title).trim(),
        String(location).trim(),
        address ?? "",
        latitude ?? null,
        longitude ?? null,
        placeId ?? null,
        category ?? "기타",
        durationMinutes ?? 60,
        date,
        time,
        memo ?? "",
      ]
    );

    const newSchedule = toSchedule(
      result.rows[0]
    );

    console.log(
      "일정 저장 성공:",
      newSchedule
    );

    return res.status(201).json({
      message: "일정이 저장되었습니다.",
      schedule: newSchedule,
    });
  } catch (error) {
    if (error.code === "23503") {
      return res.status(404).json({
        message:
          "해당 여행을 찾을 수 없습니다.",
      });
    }

    console.error("일정 저장 오류:", error);

    return res.status(500).json({
      message:
        "일정 저장 중 서버 오류가 발생했습니다.",
    });
  }
});

app.get("/schedules", async (req, res) => {
  try {
    const { tripId } = req.query;

    const result = tripId
      ? await query(
          `
            SELECT ${SCHEDULE_COLUMNS}
            FROM schedules
            WHERE trip_id = $1
            ORDER BY date ASC, time ASC
          `,
          [tripId]
        )
      : await query(`
          SELECT ${SCHEDULE_COLUMNS}
          FROM schedules
          ORDER BY date ASC, time ASC
        `);

    return res.json({
      schedules: result.rows.map(toSchedule),
    });
  } catch (error) {
    console.error("일정 조회 오류:", error);

    return res.status(500).json({
      message:
        "일정 조회 중 서버 오류가 발생했습니다.",
    });
  }
});

app.get("/schedules/:id", async (req, res) => {
  try {
    const result = await query(
      `
        SELECT ${SCHEDULE_COLUMNS}
        FROM schedules
        WHERE id = $1
      `,
      [req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "일정을 찾을 수 없습니다.",
      });
    }

    return res.json({
      schedule: toSchedule(result.rows[0]),
    });
  } catch (error) {
    console.error("일정 조회 오류:", error);

    return res.status(500).json({
      message:
        "일정 조회 중 서버 오류가 발생했습니다.",
    });
  }
});

app.put("/schedules/:id", async (req, res) => {
  try {
    const fieldMap = [
      ["title", "title"],
      ["location", "location"],
      ["address", "address"],
      ["latitude", "latitude"],
      ["longitude", "longitude"],
      ["placeId", "place_id"],
      ["category", "category"],
      ["durationMinutes", "duration_minutes"],
      ["date", "date"],
      ["time", "time"],
      ["memo", "memo"],
    ];

    const assignments = [];
    const values = [];

    for (const [apiField, column] of fieldMap) {
      if (!hasOwn(req.body, apiField)) {
        continue;
      }

      values.push(req.body[apiField]);
      assignments.push(
        `${column} = $${values.length}`
      );
    }

    values.push(req.params.id);

    const result = assignments.length > 0
      ? await query(
          `
            UPDATE schedules
            SET ${assignments.join(", ")}
            WHERE id = $${values.length}
            RETURNING ${SCHEDULE_COLUMNS}
          `,
          values
        )
      : await query(
          `
            SELECT ${SCHEDULE_COLUMNS}
            FROM schedules
            WHERE id = $1
          `,
          [req.params.id]
        );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "일정을 찾을 수 없습니다.",
      });
    }

    const updatedSchedule = toSchedule(
      result.rows[0]
    );

    console.log(
      "일정 수정 성공:",
      updatedSchedule
    );

    return res.json({
      message: "일정이 수정되었습니다.",
      schedule: updatedSchedule,
    });
  } catch (error) {
    console.error("일정 수정 오류:", error);

    return res.status(500).json({
      message:
        "일정 수정 중 서버 오류가 발생했습니다.",
    });
  }
});

app.delete("/schedules/:id", async (req, res) => {
  try {
    const result = await query(
      `
        DELETE FROM schedules
        WHERE id = $1
        RETURNING id
      `,
      [req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "일정을 찾을 수 없습니다.",
      });
    }

    return res.json({
      message: "일정이 삭제되었습니다.",
    });
  } catch (error) {
    console.error("일정 삭제 오류:", error);

    return res.status(500).json({
      message:
        "일정 삭제 중 서버 오류가 발생했습니다.",
    });
  }
});

// ======================================================
// 서버 시작
// ======================================================

const port =
  process.env.PORT ||
  4000;

async function startServer() {
  await query("SELECT 1");

  app.listen(port, () => {
    console.log(
      `TravelAI server running on port ${port}`
    );
  });
}

startServer().catch(async (error) => {
  console.error(
    "TravelAI server 시작 실패:",
    error
  );

  await pool.end().catch(() => {});
  process.exitCode = 1;
});
