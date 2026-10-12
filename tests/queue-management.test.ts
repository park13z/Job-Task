import { describe, expect, it } from "vitest";
import { createFixture, LINES } from "./harness/fixture";
import { businessDate } from "../src/shared/time";
import { successSchema, bulkJobsDataSchema, jobDataSchema, jobsDataSchema, changesDataSchema } from "../src/shared/contracts";

describe("Queue management (D1 transactional operations)", () => {
  it("inserts above ordinary queue, reorders by IDs, compacts on delete, and audits reasons", async () => {
    const f = await createFixture();
    try {
      const date = businessDate(Date.now());
      const changes = async () => successSchema(changesDataSchema).parse(await (await f.request("/api/changes",{user:"manager"})).json()).data.revision;
      const list = async () => successSchema(jobsDataSchema).parse(await (await f.request(
        `/api/jobs?from=${date}&to=${date}`,{user:"manager"})).json()).data.jobs.filter(job => job.lineId === LINES.ckt1a);
      const create = await f.request("/api/jobs",{user:"manager",key:crypto.randomUUID(),body:{
        items:["A","B","C"].map(title=>({title,workDate:date,lineId:LINES.ckt1a})),
      }});
      expect(create.status).toBe(201);
      const original=successSchema(bulkJobsDataSchema).parse(await create.json()).data.jobs;
      expect(original.map(j=>j.queuePosition)).toEqual([1,2,3]);

      let revision=await changes();
      const missingReason=await f.request("/api/queue/insert",{user:"manager",key:crypto.randomUUID(),body:{
        job:{title:"Urgent",workDate:date,lineId:LINES.ckt1a},aboveQueue:3,reason:"",expectedRevision:revision,
      }});
      expect(missingReason.status).toBe(400);
      const added=await f.request("/api/queue/insert",{user:"manager",key:crypto.randomUUID(),body:{
        job:{title:"Urgent",workDate:date,lineId:LINES.ckt1a},aboveQueue:3,reason:"Customer rush",expectedRevision:revision,
      }});
      expect(added.status).toBe(201);
      const inserted=successSchema(jobDataSchema).parse(await added.json()).data.job;
      expect(inserted.insertedNumber).toBe(1);
      expect((await list()).map(job=>job.title)).toEqual(["A","B","Urgent","C"]);
      expect((await list()).map(job=>job.dayOrder)).toEqual([1,2,4,3]);

      revision=await changes();
      const reordered=[original[1].id,inserted.id,original[0].id,original[2].id];
      const save=await f.request("/api/queue/reorder",{user:"manager",key:crypto.randomUUID(),body:{
        workDate:date,lineId:LINES.ckt1a,ids:reordered,reason:"Pack priority",expectedRevision:revision,
      }});
      expect(save.status).toBe(200);
      expect((await list()).map(job=>job.id)).toEqual(reordered);
      expect((await list()).find(j=>j.id===inserted.id)?.insertedNumber).toBe(1);

      const stale=await f.request("/api/queue/reorder",{user:"manager",key:crypto.randomUUID(),body:{
        workDate:date,lineId:LINES.ckt1a,ids:reordered.slice().reverse(),reason:"Stale",expectedRevision:revision,
      }});
      expect(stale.status).toBe(409);
      revision=await changes();
      const deleted=await f.request(`/api/queue/${original[1].id}/delete`,{user:"manager",key:crypto.randomUUID(),body:{
        expectedVersion:original[1].version,reason:"Order removed",expectedRevision:revision,
      }});
      expect(deleted.status).toBe(200);
      expect((await list()).map(job=>job.title)).toEqual(["Urgent","A","C"]);
      expect((await list()).map(job=>job.queuePosition)).toEqual([1,2,3]);
      const log=await f.database.prepare("SELECT action,reason FROM queue_actions ORDER BY happened_at, rowid").all<{action:string;reason:string}>();
      expect(log.results.map(row=>row.action)).toEqual(["insert","reorder","delete"]);
      expect(log.results.map(row=>row.reason)).toEqual(["Customer rush","Pack priority","Order removed"]);
      expect((await f.database.prepare("SELECT count(*) as n FROM job_events WHERE job_id=?").bind(original[1].id).first<{n:number}>())?.n).toBe(0);
    } finally { await f.close(); }
  });

  it("only waiting orders can be cancelled/deleted; recall restores queue; paused can be Done", async () => {
    const f=await createFixture();
    try {
      const date=businessDate(Date.now());
      const make = await f.request("/api/jobs",{user:"manager",key:crypto.randomUUID(),body:{
        items:["Waiting","Production"].map(title=>({title,lineId:LINES.ckt1a,workDate:date})),
      }});
      expect(make.status).toBe(201);
      const [a,b]=successSchema(bulkJobsDataSchema).parse(await make.json()).data.jobs;
      const revision=async()=>successSchema(changesDataSchema).parse(await (await f.request("/api/changes")).json()).data.revision;
      const action=(id:string,kind:string,body:unknown,user:"manager"|"assistant"="manager")=>
        f.request(`/api/queue/${id}/${kind}`,{user,key:crypto.randomUUID(),body});

      const noRole=await action(a.id,"cancel",{expectedVersion:1,reason:"Customer",expectedRevision:await revision()},"assistant");
      expect(noRole.status).toBe(403);
      const cancel=await action(a.id,"cancel",{expectedVersion:1,reason:"Cancelled order",expectedRevision:await revision()});
      expect(cancel.status).toBe(200);
      const afterCancel=successSchema(jobsDataSchema).parse(await (await f.request(
        `/api/jobs?from=${date}&to=${date}`)).json()).data.jobs;
      expect(afterCancel.find(job=>job.id===a.id)?.cancelledAt).not.toBeNull();
      const live=await (await f.request("/api/live")).json() as {data:{queued:{id:string}[]}};
      expect(live.data.queued.some(job=>job.id===a.id)).toBe(false);
      expect((await f.request(`/api/jobs/${a.id}/start`,{user:"manager",key:crypto.randomUUID(),body:{expectedVersion:1}})).status).toBe(409);
      expect((await action(a.id,"recall",{expectedVersion:1,reason:"Customer restored",expectedRevision:await revision()})).status).toBe(200);
      const afterRecall=successSchema(jobsDataSchema).parse(await (await f.request(
        `/api/jobs?from=${date}&to=${date}`)).json()).data.jobs;
      expect(afterRecall.find(job=>job.id===a.id)?.cancelledAt).toBeNull();

      const start=await f.request(`/api/jobs/${b.id}/start`,{user:"manager",key:crypto.randomUUID(),body:{expectedVersion:1}});
      expect(start.status).toBe(200);
      expect((await action(b.id,"delete",{expectedVersion:2,reason:"Not allowed",expectedRevision:await revision()})).status).toBe(409);
      const pause=await f.request(`/api/jobs/${b.id}/pause`,{user:"manager",key:crypto.randomUUID(),body:{expectedVersion:2}});
      expect(pause.status).toBe(200);
      const done=await f.request(`/api/jobs/${b.id}/done`,{user:"manager",key:crypto.randomUUID(),body:{expectedVersion:3}});
      expect(done.status).toBe(200);
      expect(successSchema(jobDataSchema).parse(await done.json()).data.job.status).toBe("done");
    } finally { await f.close(); }
  });
});
