import type { User } from "../shared/contracts";

type SyncRevision = { revision: number; businessDate: string };
type CurrentWorkspace = SyncRevision & { summary: { inProgress: number } };

export function shouldRefreshWorkspace(current: CurrentWorkspace, changes: SyncRevision): boolean {
  return changes.revision !== current.revision ||
    changes.businessDate !== current.businessDate ||
    current.summary.inProgress > 0;
}

export function workspacePollDelay(role: User["role"], errors: number): number {
  const baseDelay = role === "manager" || role === "supervisor" ? 60_000 : 120_000;
  return baseDelay * Math.min(2 ** errors, 8);
}
