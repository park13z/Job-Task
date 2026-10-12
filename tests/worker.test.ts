import { describe, expect, it } from "vitest";
import { createFixture, LINES } from "./harness/fixture";
import { businessDate } from "../src/shared/time";
import { successSchema, bulkJobsDataSchema, jobDataSchema, eventsDataSchema } from "../src/shared/contracts";

const job = () => ({ workDate: businessDate(Date.now()), lineId: LINES.ckt1a, dayOrder: 1, title: "Pack 8 skids" });

describe("Job Task Worker integration (local D1 + session)", () => {
  it("rejects missing, invalid and unauthorized users", async () => {
    const fixture = await createFixture();
    try {
      expect((await fixture.request("/api/me", { token: "invalid" })).status).toBe(401);
      expect((await fixture.request("/api/me", { user: "inactive" })).status).toBe(403);
      expect((await fixture.request("/api/users", { user: "leader" })).status).toBe(403);
      expect((await fixture.request("/api", { user: "manager" })).status).toBe(404);
    } finally { await fixture.close(); }
  });

  it("enforces line-scoped collaboration, state transitions, and idempotent replay", async () => {
    const f = await createFixture();
    try {
      const key = crypto.randomUUID();
      const create = { items: [job()] };
      const created = await f.request("/api/jobs", { user: "manager", body: create, key });
      expect(created.status).toBe(201);
      const first = successSchema(bulkJobsDataSchema).parse(await created.json()).data.jobs[0];
      expect(first.status).toBe("todo");
      expect((await f.request("/api/jobs", { user: "manager", body: create, key })).status).toBe(201);
      const repeat = await f.request("/api/jobs", { user: "manager", body: create, key });
      expect(successSchema(bulkJobsDataSchema).parse(await repeat.json()).data.jobs[0].id).toBe(first.id);
      expect((await f.request("/api/jobs/" + first.id + "/events", { user: "manager" })).status).toBe(200);
      expect((await f.request("/api/jobs/" + first.id + "/events", { user: "outside" })).status).toBe(404);
      const perform = async (action: string, user: "leader" | "assistant", version: number) =>
        f.request("/api/jobs/" + first.id + "/" + action, { user, body: { expectedVersion: version }, key: crypto.randomUUID() });
      const started = await perform("start", "leader", 1);
      expect(started.status).toBe(200);
      expect(successSchema(jobDataSchema).parse(await started.json()).data.job.status).toBe("in_progress");
      const paused = await perform("pause", "assistant", 2);
      expect(paused.status).toBe(200);
      expect(successSchema(jobDataSchema).parse(await paused.json()).data.job.status).toBe("paused");
      const done = await perform("done", "assistant", 3);
      expect((await perform("resume", "leader", 4)).status).toBe(409);
      expect(done.status).toBe(200);
      const finished = successSchema(jobDataSchema).parse(await done.json()).data.job;
      expect(finished.status).toBe("done");
      expect(finished.activeMs).toBeGreaterThanOrEqual(0);
      const history = await f.request("/api/jobs/" + first.id + "/events", { user: "leader" });
      expect(successSchema(eventsDataSchema).parse(await history.json()).data.events.map((event: { eventType: string }) => event.eventType))
        .toEqual(["created", "started", "paused", "completed"]);
    } finally { await f.close(); }
  });

  it("allows every role to act on permitted active lines", async () => {
    const f = await createFixture();
    try {
      const created = await f.request("/api/jobs", { user: "manager", body: {
        items: [{ ...job(), lineId: LINES.ckt1b, dayOrder: 12 }],
      }, key: crypto.randomUUID() });
      expect(created.status).toBe(201);
      const id = successSchema(bulkJobsDataSchema).parse(await created.json()).data.jobs[0].id;
      const perform = (action: string, user: "manager" | "supervisor" | "leader" | "assistant" | "outside" | "inactive", expectedVersion: number) =>
        f.request(`/api/jobs/${id}/${action}`, { user, body: { expectedVersion }, key: crypto.randomUUID() });
      expect((await perform("start", "leader", 1)).status).toBe(404);
      expect((await perform("start", "assistant", 1)).status).toBe(404);
      expect((await perform("start", "inactive", 1)).status).toBe(403);
      expect((await perform("start", "manager", 1)).status).toBe(200);
      expect((await perform("pause", "supervisor", 2)).status).toBe(200);
      expect((await perform("resume", "outside", 3)).status).toBe(200);
      expect((await perform("done", "manager", 4)).status).toBe(200);
      const final = await f.database.prepare("SELECT status,version FROM jobs WHERE id=?").bind(id).first();
      expect(final).toMatchObject({ status: "done", version: 5 });
    } finally { await f.close(); }
  });

  it("keeps manager roster access closed when seats were not reserved", async () => {
    const f = await createFixture({ seatBudget: "0" });
    try {
      const response = await f.request("/api/users", { body: { name: "New", username: "newuser", role: "assistant", password: "NewUserPassword123!" }, user: "manager" });
      expect(response.status).not.toBe(201);
      expect((await f.request("/api/users", { user: "manager" })).status).toBe(200);
    } finally { await f.close(); }
  });
});
