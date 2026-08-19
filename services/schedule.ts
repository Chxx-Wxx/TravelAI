const API_URL =
  process.env.EXPO_PUBLIC_API_URL;

export type ServerScheduleInput = {
  title: string;
  location: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
  category?: string;
  durationMinutes?: number;
  date: string;
  time: string;
  memo?: string;
};

function requireApiUrl() {
  if (!API_URL) {
    throw new Error(
      "EXPO_PUBLIC_API_URL이 설정되지 않았습니다."
    );
  }

  return API_URL;
}

// 일정 생성
export async function createSchedule(
  schedule: ServerScheduleInput
) {
  const apiUrl =
    requireApiUrl();

  const response = await fetch(
    `${apiUrl}/schedules`,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify(
        schedule
      ),
    }
  );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data.message ??
        "일정 저장에 실패했습니다."
    );
  }

  return data.schedule;
}

// 일정 전체 조회
export async function fetchSchedules() {
  const apiUrl =
    requireApiUrl();

  const response =
    await fetch(
      `${apiUrl}/schedules`
    );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data.message ??
        "일정 조회에 실패했습니다."
    );
  }

  return data.schedules ?? [];
}

// 일정 하나 조회
export async function fetchSchedule(
  id: string
) {
  const apiUrl =
    requireApiUrl();

  const response =
    await fetch(
      `${apiUrl}/schedules/${id}`
    );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data.message ??
        "일정을 찾을 수 없습니다."
    );
  }

  return data.schedule;
}

// 일정 수정
export async function updateServerSchedule(
  id: string,
  schedule: ServerScheduleInput
) {
  const apiUrl =
    requireApiUrl();

  const response = await fetch(
    `${apiUrl}/schedules/${id}`,
    {
      method: "PUT",

      headers: {
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify(
        schedule
      ),
    }
  );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data.message ??
        "일정 수정에 실패했습니다."
    );
  }

  return data.schedule;
}

// 일정 삭제
export async function deleteServerSchedule(
  id: string
) {
  const apiUrl =
    requireApiUrl();

  const response = await fetch(
    `${apiUrl}/schedules/${id}`,
    {
      method: "DELETE",
    }
  );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data.message ??
        "일정 삭제에 실패했습니다."
    );
  }

  return data;
}