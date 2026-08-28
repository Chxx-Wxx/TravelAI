const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { randomUUID } = require("crypto");

dotenv.config();

const {
  hasDatabaseUrl,
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

const PLACES_SEARCH_PAGE_SIZE = 10;
const PLACES_BIAS_RADIUS_METERS = 20000;

function normalizePlaceBias(value) {
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);

  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
}

async function requestPlaces(query, bias) {
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
          "places.primaryType",
          "places.types",
        ].join(","),
      },

      body: JSON.stringify({
        textQuery: query,

        pageSize: PLACES_SEARCH_PAGE_SIZE,

        languageCode: "ko",

        regionCode: "JP",

        ...(bias
          ? {
              locationBias: {
                circle: {
                  center: bias,
                  radius: PLACES_BIAS_RADIUS_METERS,
                },
              },
            }
          : {}),
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

      primaryType:
        place.primaryType,

      types:
        place.types ?? [],
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

      const bias = normalizePlaceBias(
        req.body?.bias
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
          query,
          bias
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
            fallbackQuery,
            bias
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
// 여행/일정 저장소 helpers
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

const TRIP_MEMBER_COLUMNS = `
  id, trip_id, user_id, display_name,
  role, status, created_at, joined_at
`;

const USER_COLUMNS = `
  id, auth_provider, auth_subject, display_name,
  email, created_at, updated_at
`;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function toTripMember(row) {
  return {
    id: row.id,
    tripId: row.trip_id,
    userId: row.user_id,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    joinedAt: row.joined_at,
  };
}

function toUser(row) {
  return {
    id: row.id,
    authProvider: row.auth_provider,
    authSubject: row.auth_subject,
    displayName: row.display_name,
    email: row.email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeTripMembers(
  members,
  tripId,
  ownerUserId = null
) {
  const sourceMembers = Array.isArray(members)
    ? members
    : [];

  const normalizedMembers = sourceMembers
    .map((member) => ({
      displayName: String(
        member?.displayName ?? member?.name ?? ""
      ).trim(),
    }))
    .filter((member) => member.displayName);

  if (normalizedMembers.length === 0) {
    normalizedMembers.push({
      displayName: "여행 만든 사람",
    });
  }

  return normalizedMembers.map((member, index) => {
    const id = randomUUID();
    const isLinkedOwner =
      index === 0 && Boolean(ownerUserId);

    return {
      id,
      tripId,
      userId: isLinkedOwner
        ? ownerUserId
        : null,
      displayName: member.displayName,
      role: index === 0 ? "owner" : "member",
      status: isLinkedOwner
        ? "active"
        : "placeholder",
      createdAt: new Date().toISOString(),
      joinedAt: isLinkedOwner
        ? new Date().toISOString()
        : null,
      legacyMemberId: id,
    };
  });
}

function toLegacyMembers(members) {
  return members.map((member) => ({
    id: member.id,
    name: member.displayName,
  }));
}

async function insertTripMembers(client, members) {
  for (const member of members) {
    await client.query(
      `
        INSERT INTO trip_members (
          id, trip_id, user_id, legacy_member_id,
          display_name, role, status, joined_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        member.id,
        member.tripId,
        member.userId,
        member.legacyMemberId,
        member.displayName,
        member.role,
        member.status,
        member.joinedAt,
      ]
    );
  }
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(
    object,
    key
  );
}

let trips = [];
let schedules = [];
let tripMembers = [];
let users = [];

// ======================================================
// 사용자 API - 로그인 전 기기 로컬 identity
// userId는 현재 인증/권한 증명이 아니라 클라이언트 식별자다.
// ======================================================

app.post("/users/ensure", async (req, res) => {
  try {
    const userId = String(
      req.body?.userId ?? ""
    ).trim().toLowerCase();

    if (!UUID_PATTERN.test(userId)) {
      return res.status(400).json({
        message: "올바른 사용자 ID가 필요합니다.",
      });
    }

    if (!hasDatabaseUrl) {
      let user = users.find(
        (item) => item.id === userId
      );

      if (!user) {
        const now = new Date().toISOString();
        user = {
          id: userId,
          authProvider: null,
          authSubject: null,
          displayName: "TravelAI 사용자",
          email: null,
          createdAt: now,
          updatedAt: now,
        };
        users.push(user);
      }

      return res.json({ user });
    }

    const result = await query(
      `
        INSERT INTO users (
          id, display_name
        )
        VALUES ($1, $2)
        ON CONFLICT (id)
        DO UPDATE SET id = EXCLUDED.id
        RETURNING ${USER_COLUMNS}
      `,
      [userId, "TravelAI 사용자"]
    );

    return res.json({
      user: toUser(result.rows[0]),
    });
  } catch (error) {
    console.error("사용자 확인 오류:", error);

    return res.status(500).json({
      message:
        "사용자 확인 중 서버 오류가 발생했습니다.",
    });
  }
});

// ======================================================
// 여행 API - PostgreSQL 또는 메모리 저장
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
      ownerUserId,
    } = req.body;

    const normalizedOwnerUserId = ownerUserId
      ? String(ownerUserId).trim().toLowerCase()
      : null;

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

    if (
      normalizedOwnerUserId &&
      !UUID_PATTERN.test(normalizedOwnerUserId)
    ) {
      return res.status(400).json({
        message: "올바른 owner 사용자 ID가 필요합니다.",
      });
    }

    if (
      normalizedOwnerUserId &&
      !hasDatabaseUrl &&
      !users.some(
        (user) =>
          user.id === normalizedOwnerUserId
      )
    ) {
      const now = new Date().toISOString();
      users.push({
        id: normalizedOwnerUserId,
        authProvider: null,
        authSubject: null,
        displayName: "TravelAI 사용자",
        email: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    const tripId = Date.now().toString();
    const newTripMembers = normalizeTripMembers(
      members,
      tripId,
      normalizedOwnerUserId
    );
    const newTrip = {
      id: tripId,
      tripName: String(tripName).trim(),
      country: String(country).trim(),
      city: String(city).trim(),
      startDate,
      endDate,
      people:
        people ?? String(members?.length ?? 1),
      members: toLegacyMembers(newTripMembers),
      tripMembers: newTripMembers.map((member) => ({
        id: member.id,
        tripId: member.tripId,
        userId: member.userId,
        displayName: member.displayName,
        role: member.role,
        status: member.status,
        createdAt: member.createdAt,
        joinedAt: member.joinedAt,
      })),
    };

    if (hasDatabaseUrl) {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        if (normalizedOwnerUserId) {
          await client.query(
            `
              INSERT INTO users (
                id, display_name
              )
              VALUES ($1, $2)
              ON CONFLICT (id) DO NOTHING
            `,
            [
              normalizedOwnerUserId,
              "TravelAI 사용자",
            ]
          );
        }

        const result = await client.query(
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
            newTrip.id,
            newTrip.tripName,
            newTrip.country,
            newTrip.city,
            newTrip.startDate,
            newTrip.endDate,
            newTrip.people,
            JSON.stringify(newTrip.members),
          ]
        );

        await insertTripMembers(
          client,
          newTripMembers
        );
        await client.query("COMMIT");

        Object.assign(newTrip, toTrip(result.rows[0]));
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } else {
      trips.push(newTrip);
      tripMembers.push(...newTripMembers);
    }

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
    if (!hasDatabaseUrl) {
      return res.json({ trips });
    }

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

app.get("/trips/:id/members", async (req, res) => {
  try {
    if (!hasDatabaseUrl) {
      const tripExists = trips.some(
        (trip) => trip.id === req.params.id
      );

      if (!tripExists) {
        return res.status(404).json({
          message: "여행을 찾을 수 없습니다.",
        });
      }

      return res.json({
        members: tripMembers
          .filter((member) => member.tripId === req.params.id)
          .map(({ legacyMemberId, ...member }) => member),
      });
    }

    const tripResult = await query(
      "SELECT id FROM trips WHERE id = $1",
      [req.params.id]
    );

    if (tripResult.rowCount === 0) {
      return res.status(404).json({
        message: "여행을 찾을 수 없습니다.",
      });
    }

    const result = await query(
      `
        SELECT ${TRIP_MEMBER_COLUMNS}
        FROM trip_members
        WHERE trip_id = $1
        ORDER BY
          CASE WHEN role = 'owner' THEN 0 ELSE 1 END,
          created_at ASC,
          id ASC
      `,
      [req.params.id]
    );

    return res.json({
      members: result.rows.map(toTripMember),
    });
  } catch (error) {
    console.error("여행 멤버 조회 오류:", error);

    return res.status(500).json({
      message: "여행 멤버 조회 중 서버 오류가 발생했습니다.",
    });
  }
});

// 로그인 전 단계라 userId 자체는 권한 증명이 아니다. 현재는 tripId와
// memberId를 아는 클라이언트가 claim할 수 있으며, 추후 초대 토큰 또는
// 인증이 도입되면 이 경계에서 권한을 추가 검증해야 한다.
app.post(
  "/trips/:tripId/members/:memberId/claim",
  async (req, res) => {
    try {
      const { tripId, memberId } = req.params;
      const userId = String(
        req.body?.userId ?? ""
      ).trim().toLowerCase();

      if (!UUID_PATTERN.test(userId)) {
        return res.status(400).json({
          message: "올바른 사용자 ID가 필요합니다.",
        });
      }

      if (!hasDatabaseUrl) {
        const tripExists = trips.some(
          (trip) => trip.id === tripId
        );

        if (!tripExists) {
          return res.status(404).json({
            message: "여행을 찾을 수 없습니다.",
          });
        }

        const userExists = users.some(
          (user) => user.id === userId
        );

        if (!userExists) {
          return res.status(404).json({
            message:
              "사용자 정보를 찾을 수 없습니다.",
          });
        }

        const member = tripMembers.find(
          (item) =>
            item.id === memberId &&
            item.tripId === tripId
        );

        if (!member) {
          return res.status(404).json({
            message:
              "해당 여행 멤버를 찾을 수 없습니다.",
          });
        }

        if (member.status === "removed") {
          return res.status(409).json({
            message:
              "삭제된 여행 멤버는 연결할 수 없습니다.",
          });
        }

        if (
          member.userId &&
          member.userId !== userId
        ) {
          return res.status(409).json({
            message:
              "이미 다른 사용자와 연결된 여행 멤버입니다.",
          });
        }

        if (
          !member.userId &&
          member.status !== "placeholder"
        ) {
          return res.status(409).json({
            message:
              "참여 대기 중인 여행 멤버만 연결할 수 있습니다.",
          });
        }

        const duplicateMember = tripMembers.find(
          (item) =>
            item.tripId === tripId &&
            item.id !== memberId &&
            item.userId === userId &&
            item.status !== "removed"
        );

        if (duplicateMember) {
          return res.status(409).json({
            message:
              "현재 사용자는 이미 이 여행의 다른 멤버와 연결되어 있습니다.",
          });
        }

        member.userId = userId;
        member.status = "active";
        member.joinedAt ??=
          new Date().toISOString();

        const {
          legacyMemberId,
          ...responseMember
        } = member;

        return res.json({
          member: responseMember,
        });
      }

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const tripResult = await client.query(
          "SELECT id FROM trips WHERE id = $1 FOR UPDATE",
          [tripId]
        );

        if (tripResult.rowCount === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({
            message: "여행을 찾을 수 없습니다.",
          });
        }

        const userResult = await client.query(
          "SELECT id FROM users WHERE id = $1",
          [userId]
        );

        if (userResult.rowCount === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({
            message:
              "사용자 정보를 찾을 수 없습니다.",
          });
        }

        const memberResult = await client.query(
          `
            SELECT ${TRIP_MEMBER_COLUMNS}
            FROM trip_members
            WHERE id = $1 AND trip_id = $2
            FOR UPDATE
          `,
          [memberId, tripId]
        );

        if (memberResult.rowCount === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({
            message:
              "해당 여행 멤버를 찾을 수 없습니다.",
          });
        }

        const member = memberResult.rows[0];

        if (member.status === "removed") {
          await client.query("ROLLBACK");
          return res.status(409).json({
            message:
              "삭제된 여행 멤버는 연결할 수 없습니다.",
          });
        }

        if (
          member.user_id &&
          member.user_id !== userId
        ) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            message:
              "이미 다른 사용자와 연결된 여행 멤버입니다.",
          });
        }

        if (
          !member.user_id &&
          member.status !== "placeholder"
        ) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            message:
              "참여 대기 중인 여행 멤버만 연결할 수 있습니다.",
          });
        }

        const duplicateResult = await client.query(
          `
            SELECT id
            FROM trip_members
            WHERE trip_id = $1
              AND user_id = $2
              AND id <> $3
              AND status <> 'removed'
            LIMIT 1
          `,
          [tripId, userId, memberId]
        );

        if (duplicateResult.rowCount > 0) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            message:
              "현재 사용자는 이미 이 여행의 다른 멤버와 연결되어 있습니다.",
          });
        }

        const updatedResult = await client.query(
          `
            UPDATE trip_members
            SET user_id = $1,
              status = 'active',
              joined_at = COALESCE(joined_at, NOW())
            WHERE id = $2 AND trip_id = $3
            RETURNING ${TRIP_MEMBER_COLUMNS}
          `,
          [userId, memberId, tripId]
        );

        await client.query("COMMIT");

        return res.json({
          member: toTripMember(
            updatedResult.rows[0]
          ),
        });
      } catch (error) {
        await client.query("ROLLBACK");

        if (error.code === "23505") {
          return res.status(409).json({
            message:
              "현재 사용자는 이미 이 여행의 다른 멤버와 연결되어 있습니다.",
          });
        }

        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(
        "여행 멤버 연결 오류:",
        error
      );

      return res.status(500).json({
        message:
          "여행 멤버 연결 중 서버 오류가 발생했습니다.",
      });
    }
  }
);

app.get("/trips/:id", async (req, res) => {
  try {
    if (!hasDatabaseUrl) {
      const trip = trips.find(
        (item) => item.id === req.params.id
      );

      if (!trip) {
        return res.status(404).json({
          message: "여행을 찾을 수 없습니다.",
        });
      }

      return res.json({
        trip: {
          ...trip,
          tripMembers: tripMembers
            .filter((member) => member.tripId === trip.id)
            .map(({ legacyMemberId, ...member }) => member),
        },
      });
    }

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

    const memberResult = await query(
      `
        SELECT ${TRIP_MEMBER_COLUMNS}
        FROM trip_members
        WHERE trip_id = $1
        ORDER BY
          CASE WHEN role = 'owner' THEN 0 ELSE 1 END,
          created_at ASC,
          id ASC
      `,
      [req.params.id]
    );

    return res.json({
      trip: {
        ...toTrip(result.rows[0]),
        tripMembers: memberResult.rows.map(toTripMember),
      },
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
    if (!hasDatabaseUrl) {
      const index = trips.findIndex(
        (item) => item.id === req.params.id
      );

      if (index === -1) {
        return res.status(404).json({
          message: "여행을 찾을 수 없습니다.",
        });
      }

      trips[index] = {
        ...trips[index],
        ...req.body,
        id: trips[index].id,
      };

      return res.json({
        message: "여행이 수정되었습니다.",
        trip: trips[index],
      });
    }

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
    if (!hasDatabaseUrl) {
      const exists = trips.some(
        (item) => item.id === req.params.id
      );

      if (!exists) {
        return res.status(404).json({
          message: "여행을 찾을 수 없습니다.",
        });
      }

      trips = trips.filter(
        (item) => item.id !== req.params.id
      );
      schedules = schedules.filter(
        (schedule) => schedule.tripId !== req.params.id
      );
      tripMembers = tripMembers.filter(
        (member) => member.tripId !== req.params.id
      );

      return res.json({
        message: "여행이 삭제되었습니다.",
      });
    }

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
// 일정 API - PostgreSQL 또는 메모리 저장
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

    const newSchedule = {
      id: Date.now().toString(),
      tripId,
      title: String(title).trim(),
      location: String(location).trim(),
      address: address ?? "",
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      placeId: placeId ?? null,
      category: category ?? "기타",
      durationMinutes: durationMinutes ?? 60,
      date,
      time,
      memo: memo ?? "",
    };

    if (hasDatabaseUrl) {
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
          newSchedule.id,
          newSchedule.tripId,
          newSchedule.title,
          newSchedule.location,
          newSchedule.address,
          newSchedule.latitude,
          newSchedule.longitude,
          newSchedule.placeId,
          newSchedule.category,
          newSchedule.durationMinutes,
          newSchedule.date,
          newSchedule.time,
          newSchedule.memo,
        ]
      );

      Object.assign(
        newSchedule,
        toSchedule(result.rows[0])
      );
    } else {
      const tripExists = trips.some(
        (trip) => trip.id === tripId
      );

      if (!tripExists) {
        return res.status(404).json({
          message: "해당 여행을 찾을 수 없습니다.",
        });
      }

      schedules.push(newSchedule);
    }

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

    if (!hasDatabaseUrl) {
      const result = schedules
        .filter(
          (schedule) =>
            !tripId || schedule.tripId === tripId
        )
        .sort((a, b) =>
          `${a.date} ${a.time}`.localeCompare(
            `${b.date} ${b.time}`
          )
        );

      return res.json({ schedules: result });
    }

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
    if (!hasDatabaseUrl) {
      const schedule = schedules.find(
        (item) => item.id === req.params.id
      );

      if (!schedule) {
        return res.status(404).json({
          message: "일정을 찾을 수 없습니다.",
        });
      }

      return res.json({ schedule });
    }

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
    if (!hasDatabaseUrl) {
      const index = schedules.findIndex(
        (item) => item.id === req.params.id
      );

      if (index === -1) {
        return res.status(404).json({
          message: "일정을 찾을 수 없습니다.",
        });
      }

      schedules[index] = {
        ...schedules[index],
        ...req.body,
        id: schedules[index].id,
        tripId: schedules[index].tripId,
      };

      return res.json({
        message: "일정이 수정되었습니다.",
        schedule: schedules[index],
      });
    }

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
    if (!hasDatabaseUrl) {
      const exists = schedules.some(
        (item) => item.id === req.params.id
      );

      if (!exists) {
        return res.status(404).json({
          message: "일정을 찾을 수 없습니다.",
        });
      }

      schedules = schedules.filter(
        (item) => item.id !== req.params.id
      );

      return res.json({
        message: "일정이 삭제되었습니다.",
      });
    }

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
  if (hasDatabaseUrl) {
    await query("SELECT 1");
  }

  app.listen(port, () => {
    console.log(
      hasDatabaseUrl
        ? "TravelAI storage: PostgreSQL"
        : "TravelAI storage: In-memory development mode"
    );
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

  await pool?.end().catch(() => {});
  process.exitCode = 1;
});
