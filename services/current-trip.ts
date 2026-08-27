import {
  deleteCurrentMemberId,
  deleteTrip,
  getCurrentMemberId,
  getTrip,
  saveCurrentMemberId,
  saveTrip,
} from "../lib/storage";

import {
  findOwnerMember,
} from "../lib/trip-member";

import type {
  Trip,
} from "../types";

import {
  deleteServerTrip,
  ensureServerTrip,
  fetchTripMembers,
} from "./trip";

let localTripRevision = 0;

async function ensureStoredCurrentMember(
  trip: Trip
) {
  if (!trip.id) {
    return;
  }

  const storedMemberId =
    await getCurrentMemberId(trip.id);

  if (storedMemberId) {
    return;
  }

  try {
    const members = trip.tripMembers?.length
      ? trip.tripMembers
      : await fetchTripMembers(trip.id);
    const owner = findOwnerMember(members);

    if (owner) {
      await saveCurrentMemberId(
        trip.id,
        owner.id
      );
    }
  } catch (error) {
    // A member lookup failure must not make the current trip unusable.
    console.error(
      "현재 여행 멤버 확인 실패:",
      error
    );
  }
}

async function removeUnusedRecoveredTrip(
  tripId: string
) {
  try {
    await deleteServerTrip(
      tripId
    );
  } catch (error) {
    console.error(
      "사용하지 않는 복구 여행 정리 실패:",
      error
    );
  }
}

export async function getCurrentTripWithRecovery(): Promise<Trip | null> {
  const localTrip =
    (await getTrip()) as Trip | null;

  if (!localTrip?.id) {
    return localTrip;
  }

  const sourceTripId =
    localTrip.id;
  const revisionAtStart =
    localTripRevision;

  let result;

  try {
    result =
      await ensureServerTrip(
        localTrip
      );
  } catch (error) {
    // 404 이외의 오류에서는 새 여행을 만들지 않고 로컬 여행을 유지한다.
    console.error(
      "현재 여행 서버 확인 실패:",
      error
    );

    return localTrip;
  }

  if (!result.recovered) {
    await ensureStoredCurrentMember(
      localTrip
    );
    return localTrip;
  }

  const latestLocalTrip =
    (await getTrip()) as Trip | null;

  // 다른 화면이 같은 복구 결과를 먼저 저장했다면 그대로 사용한다.
  if (
    latestLocalTrip?.id ===
    result.trip.id
  ) {
    return latestLocalTrip;
  }

  // 복구 중 여행이 삭제되거나 교체됐다면 로컬 여행을 되살리지 않는다.
  if (
    revisionAtStart !== localTripRevision ||
    latestLocalTrip?.id !== sourceTripId
  ) {
    if (result.trip.id) {
      await removeUnusedRecoveredTrip(
        result.trip.id
      );
    }

    return latestLocalTrip;
  }

  await saveTrip(result.trip);

  if (
    result.trip.id &&
    result.trip.id !== sourceTripId
  ) {
    await deleteCurrentMemberId(
      sourceTripId
    );
  }

  await ensureStoredCurrentMember(
    result.trip
  );

  console.info(
    "현재 여행을 서버에 자동 복구했습니다."
  );

  return result.trip;
}

export async function deleteCurrentTripLocally() {
  // 진행 중인 복구 결과가 삭제 후 로컬에 저장되지 않게 무효화한다.
  localTripRevision += 1;
  await deleteTrip();
}
