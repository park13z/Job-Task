import { mondayWeekRange } from "../shared/time";

export type Filters = { week: string; lineId: string; status: string };

export function workspaceQuery(filters: Filters, cursor?: string): URLSearchParams {
  const range = mondayWeekRange(filters.week);
  const params = new URLSearchParams({ from: range.from, to: range.to, limit: "50" });
  if (filters.lineId) params.set("lineId", filters.lineId);
  if (filters.status) params.set("status", filters.status);
  if (cursor) params.set("cursor", cursor);
  return params;
}
