import type {
  TripMember,
} from "../types";

export function formatMemberName(
  member: TripMember,
  currentUserId?: string | null
) {
  return currentUserId &&
    member.userId === currentUserId
    ? "나"
    : member.displayName;
}

export function findOwnerMember(
  members?: TripMember[]
) {
  return members?.find(
    (member) =>
      member.role === "owner" &&
      member.status !== "removed"
  );
}
