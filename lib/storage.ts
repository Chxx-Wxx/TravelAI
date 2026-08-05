import AsyncStorage from "@react-native-async-storage/async-storage";

const TRIP_KEY = "@travelai_trip";

export async function saveTrip(trip: any) {
  await AsyncStorage.setItem(TRIP_KEY, JSON.stringify(trip));
}

export async function getTrip() {
  const data = await AsyncStorage.getItem(TRIP_KEY);

  if (!data) return null;

  return JSON.parse(data);
}

export async function deleteTrip() {
  await AsyncStorage.removeItem(TRIP_KEY);
}