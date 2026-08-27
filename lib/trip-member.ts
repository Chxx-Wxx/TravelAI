import type {
  TripMember,
} from "../types";

export function formatMemberName(
  member: TripMember,
  currentMemberId?: string | null
) {
  return member.id === currentMemberId
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
