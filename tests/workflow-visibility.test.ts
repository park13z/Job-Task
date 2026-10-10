import { describe, expect, it } from "vitest";
import type { Line, User } from "../src/shared/contracts";
import { canActOnJob } from "../src/shared/workflow";

const user = (role: User["role"], active = true) => ({ id: "user-1", role, active });
const lines: Pick<Line, "id" | "active" | "memberIds">[] = [
  { id: "line-1", active: true, memberIds: ["user-1"] },
  { id: "line-2", active: true, memberIds: [] },
  { id: "line-3", active: false, memberIds: ["user-1"] },
];
const job = (lineId: string) => ({ lineId });

describe("Job action button visibility", () => {
  it("shows manager and supervisor actions on any active line", () => {
    for (const role of ["manager", "supervisor"] as const) {
      expect(canActOnJob(user(role), lines, job("line-1"))).toBe(true);
      expect(canActOnJob(user(role), lines, job("line-2"))).toBe(true);
      expect(canActOnJob(user(role), lines, job("line-3"))).toBe(false);
    }
  });

  it("restricts line leader and assistant to active assigned lines", () => {
    for (const role of ["line_leader", "assistant"] as const) {
      expect(canActOnJob(user(role), lines, job("line-1"))).toBe(true);
      expect(canActOnJob(user(role), lines, job("line-2"))).toBe(false);
      expect(canActOnJob(user(role), lines, job("line-3"))).toBe(false);
    }
  });

  it("hides actions for inactive accounts or missing lines", () => {
    expect(canActOnJob(user("manager", false), lines, job("line-1"))).toBe(false);
    expect(canActOnJob(user("assistant", false), lines, job("line-1"))).toBe(false);
    expect(canActOnJob(user("manager"), lines, job("unknown"))).toBe(false);
  });
});
