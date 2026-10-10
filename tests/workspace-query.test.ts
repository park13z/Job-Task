import { describe, expect, it } from "vitest";
import { workspaceQuery } from "../src/hooks/workspaceQuery";

const week = "2026-10-07";

describe("workspace request query", () => {
  it("uses a Monday–Sunday range and default page limit", () => {
    const params = workspaceQuery({ week, lineId: "", status: "" });
    expect(Object.fromEntries(params)).toEqual({
      from: "2026-10-05",
      to: "2026-10-11",
      limit: "50",
    });
  });

  it("preserves independent filters and optional pagination cursor", () => {
    const lineOnly = workspaceQuery({ week, lineId: "line-1", status: "" });
    expect(lineOnly.get("lineId")).toBe("line-1");
    expect(lineOnly.has("status")).toBe(false);
    expect(lineOnly.has("cursor")).toBe(false);

    const filtered = workspaceQuery({ week, lineId: "line-1", status: "paused" }, "next-page");
    expect(filtered.get("lineId")).toBe("line-1");
    expect(filtered.get("status")).toBe("paused");
    expect(filtered.get("cursor")).toBe("next-page");
    expect(filtered.get("limit")).toBe("50");
  });

  it("allows the summary request to remove the page limit without mutating the job query", () => {
    const jobs = workspaceQuery({ week, lineId: "line-1", status: "todo" });
    const summary = new URLSearchParams(jobs);
    summary.delete("limit");
    expect(summary.has("limit")).toBe(false);
    expect(summary.get("lineId")).toBe("line-1");
    expect(summary.get("status")).toBe("todo");
    expect(jobs.get("limit")).toBe("50");
  });
});
