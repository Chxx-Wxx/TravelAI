const API_URL =
  process.env.EXPO_PUBLIC_API_URL;

export type PlaceResult = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
};

export async function searchPlaces(
  query: string
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

  return data.places ?? [];
}