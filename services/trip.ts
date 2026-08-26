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
