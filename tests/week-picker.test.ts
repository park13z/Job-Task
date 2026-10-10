import { describe, expect, it } from "vitest";
import { isoWeekStart, isoWeekValue, mondayWeekRange } from "../src/shared/time";

describe("Dashboard week picker", () => {
  it("maps ISO weeks and the Monday–Sunday range across production years", () => {
    expect(isoWeekValue("2027-01-01")).toBe("2026-W53");
    expect(isoWeekValue("2027-01-04")).toBe("2027-W01");
    expect(isoWeekStart("2026-W53")).toBe("2026-12-28");
    expect(mondayWeekRange(isoWeekStart("2026-W53")!)).toEqual({ from: "2026-12-28", to: "2027-01-03" });
    expect(isoWeekStart("2027-W01")).toBe("2027-01-04");
    expect(isoWeekStart("2027-W53")).toBeNull();
    expect(isoWeekStart("2026-W00")).toBeNull();
    expect(isoWeekStart("invalid")).toBeNull();
  });
});
