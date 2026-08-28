import {
  saveJoinedTrip,
} from "../lib/storage";

import type {
  AppUser,
  Trip,
  TripMember,
} from "../types";

import {
  ensureCurrentUser,
} from "./current-user";

import {
  claimTripMember,
  fetchTrip,
  fetchTripMembers,
} from "./trip";

export type JoinTripResult = {
  user: AppUser;
  trip: Trip;
  member: TripMember;
};

export async function joinTripAsMember(
  tripId: string,
  memberId: string
): Promise<JoinTripResult> {
  const normalizedTripId = tripId.trim();
  const normalizedMemberId = memberId
    .trim()
    .toLowerCase();

  if (!normalizedTripId || !normalizedMemberId) {
    throw new Error(
      "여행 ID와 멤버 ID가 필요합니다."
    );
  }

  // 참여 직전에는 캐시된 사용자만 사용하지 않고 서버의 users 행도
  // 다시 보장한다. in-memory 서버가 재시작된 경우에도 같은 ID를 쓴다.
  const user = await ensureCurrentUser();

  await claimTripMember(
    normalizedTripId,
    normalizedMemberId,
    user.id
  );

  // claim 이후 서버 데이터를 다시 읽어 응답 하나만 믿고 로컬 상태를
  // 바꾸지 않는다. 여기까지 실패하면 기존 로컬 여행은 그대로 유지된다.
  const latestTrip = await fetchTrip(
    normalizedTripId
  );
  const latestMembers =
    await fetchTripMembers(
      normalizedTripId
    );

  const linkedMembers = latestMembers.filter(
    (member) =>
      member.userId === user.id &&
      member.status !== "removed"
  );
  const member = linkedMembers.find(
    (item) =>
      item.id === normalizedMemberId &&
      item.tripId === normalizedTripId &&
      item.status === "active"
  );

  if (
    !latestTrip.id ||
    latestTrip.id !== normalizedTripId ||
    linkedMembers.length !== 1 ||
    !member
  ) {
    throw new Error(
      "서버에서 현재 사용자의 여행 멤버 연결을 확인하지 못했습니다."
    );
  }

  const trip: Trip = {
    ...latestTrip,
    tripMembers: latestMembers,
  };

  await saveJoinedTrip(
    trip,
    member.id
  );

  return {
    user,
    trip,
    member,
  };
}
