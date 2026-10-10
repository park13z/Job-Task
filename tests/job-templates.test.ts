import { expect, it } from "vitest";
import { createFixture, LINES } from "./harness/fixture";
import { successSchema, jobTemplatesDataSchema, jobTemplateDataSchema, bulkJobsDataSchema } from "../src/shared/contracts";
import { businessDate } from "../src/shared/time";

it("manager controls Job List while all active roles may select active names", async () => {
  const f = await createFixture();
  try {
    expect((await f.request("/api/job-list", { user: "leader" })).status).toBe(200);
    expect((await f.request("/api/job-list", { user: "inactive" })).status).toBe(403);
    expect((await f.request("/api/job-list", { user: "supervisor", body: { name: "Unauthorized" } })).status).toBe(403);
    const created = await f.request("/api/job-list", { user: "manager", body: { name: "  Pack 8x341g LOB  ", lineIds: [LINES.ckt1a] } });
    expect(created.status).toBe(201);
    const first = successSchema(jobTemplateDataSchema).parse(await created.json()).data.template;
    expect(first).toMatchObject({ name: "Pack 8x341g LOB", active: true, version: 1, lineIds: [LINES.ckt1a] });
    const list = await f.request("/api/job-list", { user: "leader" });
    expect(successSchema(jobTemplatesDataSchema).parse(await list.json()).data.templates.map(t=>t.name)).toEqual(["Pack 8x341g LOB"]);
    expect((await f.request("/api/job-list", { user: "manager", body: { name: "pack 8x341g lob" } })).status).toBe(409);
    expect((await f.request("/api/job-list", { user: "manager", body: { name: " " } })).status).toBe(400);
    expect((await f.request("/api/job-list/" + first.id, { user: "leader", method: "PATCH", body: { expectedVersion: 1, active: false } })).status).toBe(403);
    expect((await f.request("/api/job-list/" + first.id, { user: "manager", method: "PATCH", body: { expectedVersion: 4, name: "Stale" } })).status).toBe(409);

    // Job creation accepts either a chosen title or free text. No template ID is stored on the job.
    const make = (name:string, order:number) => f.request("/api/jobs", { user: "supervisor",
      key: crypto.randomUUID(), body: { items: [{ title: name, lineId: LINES.ckt1a, dayOrder: order, workDate: businessDate(Date.now()) }] } });
    const a = await make(first.name, 21);
    const b = await make("Custom label edited after selection", 22);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const oldId = successSchema(bulkJobsDataSchema).parse(await a.json()).data.jobs[0].id;

    const patched = await f.request("/api/job-list/" + first.id, { user: "manager", method: "PATCH", body: { expectedVersion: 1, name: "Updated template", active: false } });
    expect(patched.status).toBe(200);
    expect(successSchema(jobTemplateDataSchema).parse(await patched.json()).data.template).toMatchObject({ active:false, version:2, name:"Updated template" });
    const hidden = await f.request("/api/job-list", { user: "supervisor" });
    expect(successSchema(jobTemplatesDataSchema).parse(await hidden.json()).data.templates).toEqual([]);
    const managerList = await f.request("/api/job-list", { user: "manager" });
    expect(successSchema(jobTemplatesDataSchema).parse(await managerList.json()).data.templates).toHaveLength(1);
    expect((await f.database.prepare("SELECT title FROM jobs WHERE id=?").bind(oldId).first())?.title).toBe("Pack 8x341g LOB");
    expect((await f.database.prepare("SELECT revision FROM org_settings WHERE id=1").first())?.revision).toBeGreaterThan(0);
    expect((await f.request("/api/job-list/" + first.id, { user: "manager", method: "PATCH", body: { expectedVersion: 2, active: true } })).status).toBe(200);
    expect((await f.request("/api/job-list", { user: "assistant" })).status).toBe(200);
  } finally { await f.close(); }
});

it("keeps legacy saved jobs unassigned until mapped and filters assignments by permitted lines", async () => {
  const f = await createFixture();
  try {
    const create = async (name: string, lineIds?: string[]) => {
      const response = await f.request("/api/job-list", {user: "manager",body:{name, ...(lineIds ? {lineIds} : {})}});
      expect(response.status).toBe(201);
      return successSchema(jobTemplateDataSchema).parse(await response.json()).data.template;
    };
    const legacy = await create("Old saved job");
    expect(legacy.lineIds).toEqual([]);
    expect(successSchema(jobTemplatesDataSchema).parse(await (await f.request("/api/job-list", {user:"manager"})).json()).data.templates)
      .toContainEqual(legacy);
    expect(successSchema(jobTemplatesDataSchema).parse(await (await f.request("/api/job-list", {user:"leader"})).json()).data.templates).toEqual([]);

    const a = await create("CKT1A exclusive", [LINES.ckt1a]);
    const b = await create("CKT1B exclusive", [LINES.ckt1b]);
    const shared = await create("Shared across 2 lines", [LINES.ckt1a, LINES.ckt1b]);
    expect(shared.lineIds).toEqual([LINES.ckt1a, LINES.ckt1b]);
    const names = async (user:"manager"|"supervisor"|"leader"|"outside"|"assistant") =>
      successSchema(jobTemplatesDataSchema).parse(await (await f.request("/api/job-list",{user})).json()).data.templates.map(t=>t.name);
    expect(await names("manager")).toHaveLength(4);
    expect(await names("supervisor")).toHaveLength(4);
    expect(await names("leader")).toEqual(["CKT1A exclusive","Shared across 2 lines"]);
    expect(await names("outside")).toEqual(["CKT1B exclusive","Shared across 2 lines"]);
    expect(await names("assistant")).toEqual(["CKT1A exclusive","Shared across 2 lines"]);

    const before = await f.database.prepare("SELECT revision FROM org_settings WHERE id=1").first<{revision:number}>();
    const stale = await f.request("/api/job-list/"+a.id,{method:"PATCH",user:"manager",
      body:{expectedVersion:9,lineIds:[LINES.ckt1b]}});
    expect(stale.status).toBe(409);
    const afterStale = await f.database.prepare("SELECT revision FROM org_settings WHERE id=1").first<{revision:number}>();
    expect(afterStale).toEqual(before);
    expect((await f.database.prepare("SELECT line_id FROM job_template_lines WHERE template_id=?").bind(a.id).all<{line_id:string}>()).results.map(x=>x.line_id))
      .toEqual([LINES.ckt1a]);

    const updated = await f.request("/api/job-list/"+a.id,{method:"PATCH",user:"manager",
      body:{expectedVersion:1,lineIds:[LINES.ckt1b]}});
    expect(updated.status).toBe(200);
    expect(successSchema(jobTemplateDataSchema).parse(await updated.json()).data.template.lineIds).toEqual([LINES.ckt1b]);
    expect(await names("leader")).toEqual(["Shared across 2 lines"]);
    expect(await names("outside")).toEqual(["CKT1A exclusive","CKT1B exclusive","Shared across 2 lines"]);

    expect((await f.request("/api/job-list/"+b.id,{method:"PATCH",user:"supervisor",
      body:{expectedVersion:1,lineIds:[LINES.ckt1a]}})).status).toBe(403);
    expect((await f.request("/api/job-list",{user:"manager",body:{name:"Duplicate mappings",lineIds:[LINES.ckt1a,LINES.ckt1a]}})).status).toBe(400);
    expect((await f.request("/api/job-list",{user:"manager",body:{name:"Unknown line",lineIds:[crypto.randomUUID()]}})).status).toBe(409);

    await f.database.prepare("UPDATE production_lines SET active=0 WHERE id=?").bind(LINES.ckt1b).run();
    expect((await f.request("/api/job-list/"+shared.id,{method:"PATCH",user:"manager",
      body:{expectedVersion:1,lineIds:[LINES.ckt1b]}})).status).toBe(409);
    expect((await f.request("/api/job-list",{user:"manager",body:{name:"Not on inactive line",lineIds:[LINES.ckt1b]}})).status).toBe(409);
    const stillShared = await f.database.prepare("SELECT COUNT(*) AS count FROM job_template_lines WHERE template_id=?")
      .bind(shared.id).first<{count:number}>();
    expect(stillShared?.count).toBe(2);
  } finally { await f.close(); }
});
