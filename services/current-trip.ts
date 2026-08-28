import {
  deleteCurrentMemberId,
  deleteTripLocalData,
  getCurrentMemberId,
  getTrip,
  moveTripLocalData,
  saveCurrentMemberId,
  saveTrip,
} from "../lib/storage";

import type {
  Trip,
  TripMember,
} from "../types";

import {
  claimTripMember,
  deleteServerTrip,
  ensureServerTrip,
  fetchTripMembers,
} from "./trip";

import {
  getCurrentUser,
} from "./current-user";

let localTripRevision = 0;

async function ensureStoredCurrentMember(
  trip: Trip,
  currentUserId: string
) {
  if (!trip.id) {
    return null;
  }

  try {
    let members =
      await fetchTripMembers(trip.id);
    const linkedMember = members.find(
      (member) =>
        member.userId === currentUserId &&
        member.status !== "removed"
    );

    if (linkedMember) {
      await saveCurrentMemberId(
        trip.id,
        linkedMember.id
      );

      return members;
    }

    const storedMemberId =
      await getCurrentMemberId(trip.id);

    if (!storedMemberId) {
      return members;
    }

    const legacyMember = members.find(
      (member) =>
        member.id === storedMemberId
    );

    if (
      !legacyMember ||
      legacyMember.status === "removed"
    ) {
      return members;
    }

    const claimedMember =
      await claimTripMember(
        trip.id,
        legacyMember.id,
        currentUserId
      );

    members = members.map(
      (member): TripMember =>
        member.id === claimedMember.id
          ? claimedMember
          : member
    );

    await saveCurrentMemberId(
      trip.id,
      claimedMember.id
    );

    return members;
  } catch (error) {
    // A member lookup failure must not make the current trip unusable.
    console.error(
      "현재 여행 멤버 확인 실패:",
      error
    );

    return null;
  }
}

async function withCurrentMembers(
  trip: Trip,
  currentUserId: string
) {
  const tripMembers =
    await ensureStoredCurrentMember(
      trip,
      currentUserId
    );

  if (!tripMembers) {
    return trip;
  }

  const updatedTrip = {
    ...trip,
    tripMembers,
  };

  return updatedTrip;
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
  let currentUser;
  let result;

  try {
    currentUser =
      await getCurrentUser();
    result =
      await ensureServerTrip(
        localTrip,
        currentUser.id
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
    return withCurrentMembers(
      localTrip,
      currentUser.id
    );
  }

  const latestLocalTrip =
    (await getTrip()) as Trip | null;

  // 다른 화면이 같은 복구 결과를 먼저 저장했다면 그대로 사용한다.
  if (
    latestLocalTrip &&
    latestLocalTrip.id ===
    result.trip.id
  ) {
    return withCurrentMembers(
      latestLocalTrip,
      currentUser.id
    );
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

  if (result.trip.id) {
    await moveTripLocalData(
      sourceTripId,
      result.trip.id
    );
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

  console.info(
    "현재 여행을 서버에 자동 복구했습니다."
  );

  return withCurrentMembers(
    result.trip,
    currentUser.id
  );
}

export async function deleteCurrentTripLocally(
  tripId: string
) {
  // 진행 중인 복구 결과가 삭제 후 로컬에 저장되지 않게 무효화한다.
  localTripRevision += 1;
  await deleteTripLocalData(tripId);
}
