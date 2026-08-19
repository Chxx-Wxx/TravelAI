export interface Trip {
  tripName: string;
  country: string;
  city: string;
  startDate: string;
  endDate: string;
  people: string;
}

export type ScheduleCategory =
  | "관광"
  | "식사"
  | "카페"
  | "쇼핑"
  | "숙소"
  | "이동"
  | "기타";

export interface Schedule {
  id: string;
  title: string;
  location: string;
  date: string;
  time: string;

  // 기존에 만든 일정 데이터와도 호환되도록 optional
  category?: ScheduleCategory;
  durationMinutes?: number;
  memo?: string;
  // 지도 연동용
  latitude?: number;
  Longitude?: number;
  placeId?: string;
}