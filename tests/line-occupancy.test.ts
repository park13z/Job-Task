import { describe, expect, it } from "vitest";
import { createFixture, LINES } from "./harness/fixture";
import { businessDate } from "../src/shared/time";
import { successSchema, bulkJobsDataSchema, jobDataSchema } from "../src/shared/contracts";

describe("one running job per production line", () => {
  const readJob = async (response: { json(): Promise<unknown> }) => successSchema(jobDataSchema).parse(await response.json()).data.job;
  it("validates Start and Resume, preserves blocked jobs, and permits different lines", async () => {
    const f = await createFixture();
    try {
      const today = businessDate(Date.now());
      const create = await f.request("/api/jobs", { user: "manager", key: crypto.randomUUID(), body: {
        items: [
          { title: "Line A first", workDate: today, lineId: LINES.ckt1a },
          { title: "Line A second", workDate: today, lineId: LINES.ckt1a },
          { title: "Line B first", workDate: today, lineId: LINES.ckt1b },
        ],
      } });
      expect(create.status).toBe(201);
      const [first, second, other] = successSchema(bulkJobsDataSchema).parse(await create.json()).data.jobs;
      const action = (id: string, type: string, version: number, key = crypto.randomUUID()) =>
        f.request(`/api/jobs/${id}/${type}`, { user: "manager", body: { expectedVersion: version }, key });

      expect((await action(first.id, "start", 1)).status).toBe(200);
      const beforeRevision = (await f.database.prepare("SELECT revision FROM org_settings").first<{revision:number}>())?.revision;
      const failed = await action(second.id, "start", 1);
      expect(failed.status).toBe(409);
      const reason = await failed.json() as {error:{code:string;message:string}};
      expect(reason.error.code).toBe("CONFLICT");
      expect(reason.error.message).toContain("Line A first");
      expect(reason.error.message).toContain("Pause or Done");

      const blocked = await f.database.prepare("SELECT status,version,started_at FROM jobs WHERE id=?")
        .bind(second.id).first<{status:string;version:number;started_at:number|null}>();
      expect(blocked).toMatchObject({ status:"todo",version:1,started_at:null });
      expect((await f.database.prepare("SELECT count(*) AS n FROM job_events WHERE job_id=?").bind(second.id).first<{n:number}>())?.n).toBe(1);
      expect((await f.database.prepare("SELECT count(*) AS n FROM work_intervals WHERE job_id=?").bind(second.id).first<{n:number}>())?.n).toBe(0);
      expect((await f.database.prepare("SELECT revision FROM org_settings").first<{revision:number}>())?.revision).toBe(beforeRevision);

      // Line B runs in parallel with Line A.
      expect((await action(other.id, "start", 1)).status).toBe(200);
      expect((await action(first.id, "pause", 2)).status).toBe(200);
      expect((await action(second.id, "start", 1)).status).toBe(200);
      const rejectedResume = await action(first.id, "resume", 3);
      expect(rejectedResume.status).toBe(409);
      expect((await rejectedResume.json() as {error:{message:string}}).error.message).toContain("Line A second");
      expect((await f.database.prepare("SELECT status,version FROM jobs WHERE id=?").bind(first.id).first())
        ).toMatchObject({ status:"paused",version:3 });

      expect((await action(second.id, "done", 2)).status).toBe(200);
      expect((await action(first.id, "resume", 3)).status).toBe(200);
      const running = await f.database.prepare("SELECT line_id,COUNT(*) AS count FROM jobs WHERE status='in_progress' GROUP BY line_id").all<{line_id:string;count:number}>();
      expect(running.results).toHaveLength(2);
      expect(running.results.every(row => row.count === 1)).toBe(true);
      expect((await action(first.id, "done", 4)).status).toBe(200);
      expect((await action(other.id, "done", 2)).status).toBe(200);
    } finally { await f.close(); }
  });

  it("concurrent Start/Resume requests cannot occupy the same line twice", async () => {
    const f = await createFixture();
    try {
      const now = businessDate(Date.now());
      const create = await f.request("/api/jobs", { user: "manager", key:crypto.randomUUID(), body: {
        items: [{title:"Race A",workDate:now,lineId:LINES.ckt1a},{title:"Race B",workDate:now,lineId:LINES.ckt1a}],
      } });
      expect(create.status).toBe(201);
      const [a,b] = successSchema(bulkJobsDataSchema).parse(await create.json()).data.jobs;
      const idempotency = [crypto.randomUUID(),crypto.randomUUID()];
      const [x,y] = await Promise.all([
        f.request(`/api/jobs/${a.id}/start`,{user:"leader",body:{expectedVersion:1},key:idempotency[0]}),
        f.request(`/api/jobs/${b.id}/start`,{user:"assistant",body:{expectedVersion:1},key:idempotency[1]}),
      ]);
      expect([x.status,y.status].sort()).toEqual([200,409]);
      const rows = await f.database.prepare("SELECT id,status FROM jobs WHERE line_id=? ORDER BY id").bind(LINES.ckt1a).all<{id:string;status:string}>();
      expect(rows.results.filter(row => row.status === "in_progress")).toHaveLength(1);
      expect(rows.results.filter(row => row.status === "todo")).toHaveLength(1);
      const winner = x.status === 200 ? a : b;
      const winnerKey = x.status === 200 ? idempotency[0] : idempotency[1];
      const winnerActor = x.status === 200 ? "leader" : "assistant";
      const replay = await f.request(`/api/jobs/${winner.id}/start`,{user:winnerActor,body:{expectedVersion:1},key:winnerKey});
      expect(replay.status).toBe(200);
      expect((await readJob(replay)).status).toBe("in_progress");
      const counters = await f.database.prepare("SELECT job_id,COUNT(*) AS n FROM work_intervals GROUP BY job_id").all<{job_id:string;n:number}>();
      expect(counters.results).toHaveLength(1);
      expect(counters.results[0].n).toBe(1);
      // Direct database writes must not circumvent the invariant.
      const pending = rows.results.find(row => row.status === "todo")!;
      await expect(f.database.prepare("UPDATE jobs SET status='in_progress',started_at=updated_at WHERE id=?")
        .bind(pending.id).run()).rejects.toThrow(/UNIQUE constraint/i);
    } finally { await f.close(); }
  });
});
