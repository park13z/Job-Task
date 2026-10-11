import { describe, expect, it } from "vitest";
import { createFixture, LINES } from "./harness/fixture";
import { businessDate, addDays, mondayWeekRange } from "../src/shared/time";
import { successSchema, bulkJobsDataSchema, jobDataSchema, jobsDataSchema } from "../src/shared/contracts";

const j = (date = businessDate(Date.now()), order = 1): { title: string; workDate: string; dayOrder: number; lineId: string } => ({
  title: "Pack line order", workDate: date, dayOrder: order, lineId: LINES.ckt1a,
});
const create = (f: Awaited<ReturnType<typeof createFixture>>, items: ReturnType<typeof j>[]) =>
  f.request("/api/jobs", { user: "manager", body: { items }, key: crypto.randomUUID() });

describe("atomicity and permission boundaries", () => {
  it("assigns consecutive weekly orders across lines and weekdays, resetting on Monday", async () => {
    const f = await createFixture();
    try {
      const monday = mondayWeekRange(businessDate(Date.now())).from;
      const tuesday = addDays(monday, 1);
      const nextMonday = addDays(monday, 7);
      const firstResponse = await create(f, [j(monday, 71), { ...j(tuesday, 71), lineId: LINES.ckt1b }]);
      expect(firstResponse.status).toBe(201);
      const first = successSchema(bulkJobsDataSchema).parse(await firstResponse.json()).data.jobs;
      expect(first.map(row => row.dayOrder)).toEqual([1, 2]);
      const second = successSchema(bulkJobsDataSchema).parse(await (await create(f, [j(tuesday)])).json()).data.jobs[0];
      expect(second.dayOrder).toBe(3);
      const reset = successSchema(bulkJobsDataSchema).parse(await (await create(f, [j(nextMonday)])).json()).data.jobs[0];
      expect(reset.dayOrder).toBe(1);
      expect((await f.database.prepare("SELECT revision FROM org_settings").first<{revision:number}>())?.revision).toBe(3);
    } finally { await f.close(); }
  });

  it("serializes two nearly simultaneous saves into different weekly numbers", async () => {
    const f = await createFixture();
    try {
      const day = mondayWeekRange(businessDate(Date.now())).from;
      const requests = await Promise.all([create(f, [j(day, 99)]), create(f, [j(day, 99)])]);
      expect(requests.map(response => response.status)).toEqual([201, 201]);
      const orders = await Promise.all(requests.map(async response =>
        successSchema(bulkJobsDataSchema).parse(await response.json()).data.jobs[0].dayOrder));
      expect(orders.sort((a, b) => a - b)).toEqual([1, 2]);
    } finally { await f.close(); }
  });

  it("rolls back every task if one row in the bulk cannot be created", async () => {
    const f = await createFixture();
    try {
      const failed = await create(f, [j(), { ...j(), lineId: "10000000-0000-4000-8000-000000000099" }]);
      expect(failed.status).toBe(409);
      const today = businessDate(Date.now());
      const jobs = await f.request(`/api/jobs?from=${today}&to=${today}`, { user: "manager" });
      expect(successSchema(jobsDataSchema).parse(await jobs.json()).data.jobs).toHaveLength(0);
      expect((await f.database.prepare("SELECT revision FROM org_settings").first<{revision:number}>())?.revision).toBe(0);
    } finally { await f.close(); }
  });

  it("reassigns weekly order when a pending job moves to a new week", async () => {
    const f = await createFixture();
    try {
      const thisMonday = mondayWeekRange(businessDate(Date.now())).from;
      const nextMonday = addDays(thisMonday, 7);
      const old = successSchema(bulkJobsDataSchema).parse(await (await create(f, [j(thisMonday)])).json()).data.jobs[0];
      const newWeek = successSchema(bulkJobsDataSchema).parse(await (await create(f, [j(nextMonday)])).json()).data.jobs[0];
      const moved = await f.request(`/api/jobs/${old.id}`, { user: "manager", method: "PATCH",
        key: crypto.randomUUID(), body: { expectedVersion: 1, workDate: nextMonday, dayOrder: 200 } });
      expect(moved.status).toBe(200);
      expect(successSchema(jobDataSchema).parse(await moved.json()).data.job.dayOrder).toBe(newWeek.dayOrder + 1);
    } finally { await f.close(); }
  });

  it("allows early start of scheduled work and prevents revoked membership", async () => {
    const f = await createFixture();
    try {
      const future = successSchema(bulkJobsDataSchema).parse(await (await create(f, [j(addDays(businessDate(Date.now()), 10))])).json()).data.jobs[0];
      const earlyStart = await f.request(`/api/jobs/${future.id}/start`, {
        user: "leader", body: { expectedVersion: 1 }, key: crypto.randomUUID(),
      });
      expect(earlyStart.status).toBe(200);
      expect(successSchema(jobDataSchema).parse(await earlyStart.json()).data.job).toMatchObject({
        workDate: future.workDate, status: "in_progress",
      });
      const today = successSchema(bulkJobsDataSchema).parse(await (await create(f, [j(businessDate(Date.now()), 2)])).json()).data.jobs[0];
      const remove = await f.request(`/api/lines/${LINES.ckt1a}/members/00000000-0000-4000-8000-000000000005`, {
        user: "manager", method: "DELETE", body: {},
      });
      expect(remove.status).toBe(200);
      expect((await f.request(`/api/jobs/${today.id}/start`, {
        user: "leader", body: { expectedVersion: 1 }, key: crypto.randomUUID(),
      })).status).toBe(404);
    } finally { await f.close(); }
  });

  it("rolls back a status update when its required interval is missing", async () => {
    const f = await createFixture();
    try {
      const created = await create(f, [j()]);
      const record = successSchema(bulkJobsDataSchema).parse(await created.json()).data.jobs[0];
      const started = await f.request(`/api/jobs/${record.id}/start`, {
        user: "leader", body: { expectedVersion: 1 }, key: crypto.randomUUID(),
      });
      expect(started.status).toBe(200);
      await f.database.prepare("DELETE FROM work_intervals WHERE job_id=?").bind(record.id).run();
      const before = (await f.database.prepare("SELECT revision FROM org_settings").first<{revision:number}>())?.revision;
      const failed = await f.request(`/api/jobs/${record.id}/pause`, {
        user: "assistant", body: { expectedVersion: 2 }, key: crypto.randomUUID(),
      });
      expect(failed.status).toBe(409);
      const row = await f.database.prepare("SELECT status,version FROM jobs WHERE id=?").bind(record.id).first<{status:string; version:number}>();
      expect(row).toMatchObject({ status: "in_progress", version: 2 });
      expect((await f.database.prepare("SELECT revision FROM org_settings").first<{revision:number}>())?.revision).toBe(before);
    } finally { await f.close(); }
  });

  it("cannot deactivate the signed-in manager, and roster seats include inactive users", async () => {
    const f = await createFixture({ seatBudget: "8" });
    try {
      const edited = await f.request("/api/users/00000000-0000-4000-8000-000000000001", {
        user: "manager", method: "PATCH", body: { expectedVersion: 1, active: false },
      });
      expect(edited.status).toBe(409);
      const added = await f.request("/api/users", {
        user: "manager", body: { username: "next", name: "Next", role: "assistant", password: "NextUserPassword123!" },
      });
      expect(added.status).toBe(409);
    } finally { await f.close(); }
  });
});
