import AsyncStorage from "@react-native-async-storage/async-storage";

const TRIP_KEY = "@travelai_trip";
const SCHEDULE_KEY = "@travelai_schedule";

export async function saveTrip(trip: any) {
  await AsyncStorage.setItem(TRIP_KEY, JSON.stringify(trip));
}

export async function getTrip() {
  const data = await AsyncStorage.getItem(TRIP_KEY);
  return data ? JSON.parse(data) : null;
}

export async function deleteTrip() {
  await AsyncStorage.removeItem(TRIP_KEY);
}

export async function saveSchedules(schedules: any[]) {
  await AsyncStorage.setItem(
    SCHEDULE_KEY,
    JSON.stringify(schedules)
  );
}

export async function getSchedules() {
  const data = await AsyncStorage.getItem(SCHEDULE_KEY);
  return data ? JSON.parse(data) : [];
}