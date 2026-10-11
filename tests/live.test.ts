import { describe, expect, it } from "vitest";
import { addDays, businessDate, torontoDayRange } from "../src/shared/time";
import { successSchema, bulkJobsDataSchema, liveDataSchema, jobDataSchema } from "../src/shared/contracts";
import { createFixture, LINES } from "./harness/fixture";

describe("Live overdue queue, ongoing work, and today's completions", () => {
  it("uses Toronto midnight even through spring and autumn DST changes", () => {
    expect((torontoDayRange("2026-03-08").end - torontoDayRange("2026-03-08").start) / 3600000).toBe(23);
    expect((torontoDayRange("2026-11-01").end - torontoDayRange("2026-11-01").start) / 3600000).toBe(25);
    expect(new Date(torontoDayRange("2026-03-08").start).toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(new Date(torontoDayRange("2026-11-01").end).toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });

  it("includes overdue queue and jobs started on any date while excluding future unstarted jobs", async () => {
    const f = await createFixture();
    try {
      const today = businessDate(Date.now());
      const yesterday = addDays(today, -1);
      const tomorrow = addDays(today, 1);
      const items = [
        { workDate: today, lineId: LINES.ckt1a, dayOrder: 1, title: "Queue now" },
        { workDate: today, lineId: LINES.ckt1a, dayOrder: 2, title: "Running now" },
        { workDate: today, lineId: LINES.ckt1a, dayOrder: 3, title: "Done now" },
        { workDate: today, lineId: LINES.ckt1a, dayOrder: 4, title: "Paused now" },
        { workDate: yesterday, lineId: LINES.ckt1a, dayOrder: 1, title: "Yesterday queue" },
        { workDate: tomorrow, lineId: LINES.ckt1a, dayOrder: 1, title: "Tomorrow queue" },
        { workDate: tomorrow, lineId: LINES.ckt1b, dayOrder: 2, title: "Tomorrow early start" },
        { workDate: today, lineId: LINES.ckt1b, dayOrder: 5, title: "Other line queue" },
      ];
      const result = await f.request("/api/jobs", { user: "manager", body: { items }, key: crypto.randomUUID() });
      expect(result.status, await result.clone().text()).toBe(201);
      const saved = successSchema(bulkJobsDataSchema).parse(await result.json()).data.jobs;
      const action = async (id: string, type: string, expectedVersion: number) => {
        const r = await f.request(`/api/jobs/${id}/${type}`, {
          user: "manager", body: { expectedVersion }, key: crypto.randomUUID(),
        });
        expect(r.status, await r.clone().text()).toBe(200);
        return successSchema(jobDataSchema).parse(await r.json()).data.job;
      };
      await action(saved[2].id, "start", 1);
      await action(saved[2].id, "done", 2);
      await action(saved[3].id, "start", 1);
      await action(saved[3].id, "pause", 2);
      const old = await f.request("/api/jobs", { user: "manager", body: { items: [
        { workDate: yesterday, lineId: LINES.ckt2ab, dayOrder: 2, title: "Old unfinished job" },
        { workDate: yesterday, lineId: LINES.ckt2ab, dayOrder: 3, title: "Old completed job" },
        { workDate: yesterday, lineId: LINES.ckt1a, dayOrder: 4, title: "Old paused job" },
      ] }, key: crypto.randomUUID() });
      expect(old.status).toBe(201);
      const oldJobs = successSchema(bulkJobsDataSchema).parse(await old.json()).data.jobs;
      await action(oldJobs[1].id, "start", 1);
      await action(oldJobs[1].id, "done", 2);
      await action(oldJobs[0].id, "start", 1);
      // A paused job from the past can coexist with the one running today.
      // Use a separate line here to preserve the single-active-job rule.
      await action(oldJobs[2].id, "start", 1);
      await action(oldJobs[2].id, "pause", 2);
      await action(saved[1].id, "start", 1);
      await action(saved[6].id, "start", 1);
      const past = torontoDayRange(yesterday).start + 3600000;
      for (const oldJob of oldJobs) {
        // This job was started yesterday but paused today. Its latest
        // pause event must remain within the job's (real) updatedAt.
        const updatedAt = oldJob.id === oldJobs[2].id ? Date.now() : past;
        await f.database.prepare("UPDATE jobs SET created_at=?,updated_at=?,started_at=?,completed_at=CASE WHEN status='done' THEN ? ELSE NULL END WHERE id=?")
          .bind(past - 1000, updatedAt, past, past, oldJob.id).run();
      }

      const live = await f.request("/api/live", { user: "manager" });
      expect(live.status, await live.clone().text()).toBe(200);
      const value = successSchema(liveDataSchema).parse(await live.json()).data;
      expect(value.date).toBe(today);
      expect(value.queued.map(job => job.title)).toEqual(["Yesterday queue", "Queue now", "Other line queue"]);
      expect(value.inProgress.map(job => job.title)).toEqual(["Old unfinished job", "Running now", "Tomorrow early start"]);
      expect(value.paused.map(job => job.title)).toEqual(["Old paused job", "Paused now"]);
      expect(value.done.map(job => job.title)).toEqual(["Done now"]);

      const leader = await f.request("/api/live", { user: "leader" });
      expect(leader.status).toBe(200);
      const restricted = successSchema(liveDataSchema).parse(await leader.json()).data;
      expect(restricted.queued.map(job => job.title)).toEqual(["Yesterday queue", "Queue now"]);
      expect((await f.request("/api/live", { user: null })).status).toBe(401);
    } finally {
      await f.close();
    }
  });
});
