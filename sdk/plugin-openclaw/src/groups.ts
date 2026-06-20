/**
 * The group layer (metadata + membership/admin) — now a re-export of the flagship
 * SDK's agent facade (`@tinyhumansai/tinyplace/agent`), the single source of
 * truth. Kept as a stable import path for the OpenClaw CLI + plugin. (Encrypted
 * group messaging stays in `group-messaging.ts`.)
 */
export {
  addGroupMember,
  approveMember,
  createGroup,
  getGroup,
  groupMembers,
  joinGroup,
  listGroups,
  rejectMember,
  removeGroupMember,
} from "@tinyhumansai/tinyplace/agent";
export type {
  CreateGroupInput,
  GroupMemberSummary,
  GroupSummary,
} from "@tinyhumansai/tinyplace/agent";
