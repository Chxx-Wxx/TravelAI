import type {
  Trip,
} from "../types";

const API_URL =
  process.env.EXPO_PUBLIC_API_URL;

export type CreateTripInput = {
  tripName: string;
  country: string;
  city: string;
  startDate: string;
  endDate: string;
  people: string;

  members?: {
    id: string;
    name: string;
  }[];
};

export class TripNotFoundError extends Error {
  constructor(message = "여행을 찾을 수 없습니다.") {
    super(message);
    this.name = "TripNotFoundError";
  }
}

type EnsureServerTripResult = {
  trip: Trip;
  recovered: boolean;
};

// 같은 로컬 여행 ID에 대한 복구 요청은 하나의 생성 요청을 공유한다.
// 성공한 Promise도 유지해서 로컬 ID 저장이 늦거나 실패해도
// 같은 앱 실행 중 중복 여행을 만들지 않는다.
const tripRecoveryPromises =
  new Map<
    string,
    Promise<Trip>
  >();

function requireApiUrl() {
  if (!API_URL) {
    throw new Error(
      "EXPO_PUBLIC_API_URL이 설정되지 않았습니다."
    );
  }

  return API_URL;
}

// 여행 생성
export async function createTrip(
  trip: CreateTripInput
) {
  const apiUrl =
    requireApiUrl();

  const response = await fetch(
    `${apiUrl}/trips`,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify(
        trip
      ),
    }
  );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data.message ??
        "여행 저장에 실패했습니다."
    );
  }

  return data.trip;
}

export async function ensureServerTrip(
  localTrip: Trip
): Promise<EnsureServerTripResult> {
  const localTripId =
    localTrip.id;

  if (!localTripId) {
    return {
      trip: localTrip,
      recovered: false,
    };
  }

  try {
    await fetchTrip(
      localTripId
    );

    return {
      trip: localTrip,
      recovered: false,
    };
  } catch (error) {
    // 네트워크 오류와 500 등은 복구 조건이 아니다.
    if (
      !(error instanceof TripNotFoundError)
    ) {
      throw error;
    }
  }

  let recoveryPromise =
    tripRecoveryPromises.get(
      localTripId
    );

  if (!recoveryPromise) {
    recoveryPromise = createTrip({
      tripName: localTrip.tripName,
      country: localTrip.country,
      city: localTrip.city,
      startDate: localTrip.startDate,
      endDate: localTrip.endDate,
      people: localTrip.people,
      members: localTrip.members,
    });

    tripRecoveryPromises.set(
      localTripId,
      recoveryPromise
    );

    recoveryPromise.catch(() => {
      // 실패한 요청만 제거해 다음 화면 진입 때 재시도할 수 있게 한다.
      if (
        tripRecoveryPromises.get(
          localTripId
        ) === recoveryPromise
      ) {
        tripRecoveryPromises.delete(
          localTripId
        );
      }
    });
  }

  return {
    trip: await recoveryPromise,
    recovered: true,
  };
}

// 여행 전체 조회
export async function fetchTrips() {
  const apiUrl =
    requireApiUrl();

  const response =
    await fetch(
      `${apiUrl}/trips`
    );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data.message ??
        "여행 조회에 실패했습니다."
    );
  }

  return data.trips ?? [];
}

// 여행 하나 조회
export async function fetchTrip(
  id: string
) {
  const apiUrl =
    requireApiUrl();

  const response =
    await fetch(
      `${apiUrl}/trips/${id}`
    );

  const data =
    await response.json();

  if (
    response.status === 404
  ) {
    throw new TripNotFoundError(
      data.message
    );
  }

  if (!response.ok) {
    throw new Error(
      data.message ??
        "여행을 찾을 수 없습니다."
    );
  }

  return data.trip;
}

// 여행 수정
export async function updateServerTrip(
  id: string,
  trip: CreateTripInput
) {
  const apiUrl =
    requireApiUrl();

  const response = await fetch(
    `${apiUrl}/trips/${id}`,
    {
      method: "PUT",

      headers: {
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify(
        trip
      ),
    }
  );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data.message ??
        "여행 수정에 실패했습니다."
    );
  }

  return data.trip;
}

// 여행 삭제
export async function deleteServerTrip(
  id: string
) {
  const apiUrl =
    requireApiUrl();

  const response = await fetch(
    `${apiUrl}/trips/${id}`,
    {
      method: "DELETE",
    }
  );

  const data =
    await response.json();

  // 메모리 서버가 재시작되면 로컬에는 여행 ID가 남아 있지만
  // 서버 여행은 이미 사라져 있을 수 있다.
  // 삭제 요청의 최종 상태는 충족되었으므로 로컬 정리를 계속한다.
  if (
    response.status === 404
  ) {
    return data;
  }

  if (!response.ok) {
    throw new Error(
      data.message ??
        "여행 삭제에 실패했습니다."
    );
  }

  return data;
}
