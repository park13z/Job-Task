import { describe, expect, it } from "vitest";
import { createFixture, USERS } from "./harness/fixture";
import { successSchema, lineDataSchema, jobTemplateDataSchema, bulkJobsDataSchema, jobDataSchema } from "../src/shared/contracts";
import { businessDate } from "../src/shared/time";

describe("Supervisor permissions", () => {
  it("can add lines, saved jobs, production tasks, and complete work without edit rights", async () => {
    const f = await createFixture();
    try {
      const createLine = await f.request("/api/lines", {
        user: "supervisor", body: { code: "SV1", name: "Supervisor Packing" },
      });
      expect(createLine.status, await createLine.clone().text()).toBe(201);
      const line = successSchema(lineDataSchema).parse(await createLine.json()).data.line;
      expect(line.code).toBe("SV1");
      expect((await f.request("/api/lines", { user:"supervisor" })).status).toBe(200);
      expect((await f.request("/api/lines", { user:"leader", body:{code:"X",name:"Forbidden"} })).status).toBe(403);
      expect((await f.request("/api/lines/"+line.id, {
        user:"supervisor", method:"PATCH", body:{name:"Unauthorized edit"},
      })).status).toBe(403);

      const saved = await f.request("/api/job-list", {
        user:"supervisor", body:{name:"Supervisor Label",lineIds:[line.id]},
      });
      expect(saved.status, await saved.clone().text()).toBe(201);
      const template = successSchema(jobTemplateDataSchema).parse(await saved.json()).data.template;
      expect(template.lineIds).toEqual([line.id]);
      expect((await f.request("/api/job-list/"+template.id, {
        user:"supervisor",method:"PATCH",body:{expectedVersion:1,name:"Unauthorized edit"},
      })).status).toBe(403);
      expect((await f.request("/api/job-list", {user:"leader",body:{name:"Forbidden"}})).status).toBe(403);

      const created = await f.request("/api/jobs", {
        user:"supervisor",key:crypto.randomUUID(),
        body:{items:[{title:template.name,lineId:line.id,workDate:businessDate(Date.now())}]},
      });
      expect(created.status, await created.clone().text()).toBe(201);
      const job = successSchema(bulkJobsDataSchema).parse(await created.json()).data.jobs[0];
      expect(job.status).toBe("todo");
      const start = await f.request("/api/jobs/"+job.id+"/start", {
        user:"supervisor",body:{expectedVersion:1},key:crypto.randomUUID(),
      });
      expect(start.status,await start.clone().text()).toBe(200);
      const done = await f.request("/api/jobs/"+job.id+"/done", {
        user:"supervisor",body:{expectedVersion:2},key:crypto.randomUUID(),
      });
      expect(done.status,await done.clone().text()).toBe(200);
      expect(successSchema(jobDataSchema).parse(await done.json()).data.job.status).toBe("done");

      // Existing Manager editing privileges remain intact.
      expect((await f.request("/api/lines/"+line.id, {
        user:"manager",method:"PATCH",body:{name:"Manager Rename"},
      })).status).toBe(200);
      expect((await f.request("/api/job-list/"+template.id, {
        user:"manager",method:"PATCH",body:{expectedVersion:1,name:"Manager Rename Job"},
      })).status).toBe(200);
    } finally { await f.close(); }
  });

  it("cannot manage users, approvals, or line memberships", async () => {
    const f = await createFixture();
    try {
      const target = USERS.leader.id;
      expect((await f.request("/api/users",{user:"supervisor"})).status).toBe(403);
      expect((await f.request("/api/users", {
        user:"supervisor",body:{username:"newuser",name:"New User",role:"assistant",password:"ValidPassword123!"},
      })).status).toBe(403);
      expect((await f.request("/api/users/"+target, {
        user:"supervisor",method:"PATCH",body:{expectedVersion:1,name:"Not Allowed"},
      })).status).toBe(403);
      expect((await f.request("/api/users/"+target+"/password",{
        user:"supervisor",body:{password:"NewPassword123!"},
      })).status).toBe(403);
      expect((await f.request("/api/users/"+target, {
        user:"supervisor",method:"DELETE",body:{},
      })).status).toBe(403);
      expect((await f.request("/api/display/devices",{user:"supervisor"})).status).toBe(403);
      for (const action of ["approve","reject","revoke"]) {
        expect((await f.request("/api/display/devices/"+crypto.randomUUID()+"/"+action, {
          user:"supervisor",body:{},
        })).status).toBe(403);
      }
      expect((await f.request("/api/lines/"+crypto.randomUUID()+"/members/"+target, {
        user:"supervisor",method:"PUT",body:{},
      })).status).toBe(403);
      expect((await f.request("/api/users",{user:"manager"})).status).toBe(200);
      expect((await f.request("/api/display/devices",{user:"manager"})).status).toBe(200);
    } finally { await f.close(); }
  });
});
