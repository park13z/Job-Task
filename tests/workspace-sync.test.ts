import { describe, expect, it } from "vitest";
import { shouldRefreshWorkspace, workspacePollDelay } from "../src/hooks/workspaceSync";

describe("workspace change polling rules", () => {
  const current = { revision: 8, businessDate: "2026-10-10", summary: { inProgress: 0 } };

  it("refreshes only for a change or ongoing work", () => {
    expect(shouldRefreshWorkspace(current, { revision: 8, businessDate: "2026-10-10" })).toBe(false);
    expect(shouldRefreshWorkspace(current, { revision: 9, businessDate: "2026-10-10" })).toBe(true);
    expect(shouldRefreshWorkspace(current, { revision: 8, businessDate: "2026-10-11" })).toBe(true);
    expect(shouldRefreshWorkspace({ ...current, summary: { inProgress: 1 } }, { revision: 8, businessDate: "2026-10-10" })).toBe(true);
  });

  it("preserves role polling rates and the original retry cap", () => {
    expect(workspacePollDelay("manager", 0)).toBe(60_000);
    expect(workspacePollDelay("supervisor", 3)).toBe(480_000);
    expect(workspacePollDelay("assistant", 0)).toBe(120_000);
    expect(workspacePollDelay("assistant", 10)).toBe(960_000);
    expect(workspacePollDelay("line_leader", 1)).toBe(240_000);
  });
});
