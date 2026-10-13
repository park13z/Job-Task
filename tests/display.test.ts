import { describe, expect, it } from "vitest";
import { createFixture } from "./harness/fixture";

describe("Private Live Display approval", () => {
  it("requires manager approval and never grants normal staff access", async () => {
    const f = await createFixture();
    try {
      const anonymous = { user: null as null };
      expect((await f.request("/api/display/state", anonymous)).status).toBe(200);
      const begin = await f.request("/api/display/request", { ...anonymous, body: {} });
      expect(begin.status, await begin.clone().text()).toBe(200);
      expect((await begin.json() as {data:{status:string}}).data.status).toBe("pending");
      const setCookie = begin.headers.get("Set-Cookie")!;
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Lax");
      const cookie = setCookie.split(";")[0];
      const browser = { user: null as null, headers: { Cookie: cookie } };

      expect((await f.request("/api/display/live", browser)).status).toBe(403);
      expect((await f.request("/api/jobs", browser)).status).toBe(401);
      expect((await f.request("/api/display/devices", anonymous)).status).toBe(401);
      expect((await f.request("/api/display/devices", {user:"supervisor"})).status).toBe(403);
      const devices = await f.request("/api/display/devices", {user:"manager"});
      const list = (await devices.json() as {data:{devices:{id:string;status:string;browser:string}[]}}).data.devices;
      expect(list).toHaveLength(1);
      expect(list[0].status).toBe("pending");
      expect(list[0].browser).toBeTruthy();
      const id = list[0].id;
      const supervisor = await f.request(`/api/display/devices/${id}/approve`, {user:"supervisor",body:{}});
      expect(supervisor.status).toBe(403);

      expect((await f.request(`/api/display/devices/${id}/approve`, {user:"manager",body:{}})).status).toBe(200);
      const state = await f.request("/api/display/state", browser);
      expect((await state.json() as {data:{status:string}}).data.status).toBe("approved");
      const live = await f.request("/api/display/live", browser);
      expect(live.status, await live.clone().text()).toBe(200);
      const snapshot = (await live.json() as {data:{live:{date:string;queued:unknown[]},lines:unknown[]}}).data;
      expect(snapshot.live.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(snapshot.lines.length).toBeGreaterThan(0);
      expect((await f.request("/api/jobs", browser)).status).toBe(401);

      const duplicate = await f.request("/api/display/request", { ...browser, body:{} });
      expect(duplicate.status).toBe(200);
      expect((await (await f.request("/api/display/devices", {user:"manager"})).json() as {data:{devices:unknown[]}}).data.devices).toHaveLength(1);

      expect((await f.request(`/api/display/devices/${id}/revoke`, {user:"manager",body:{}})).status).toBe(200);
      expect((await f.request("/api/display/live", browser)).status).toBe(403);
      expect((await f.request(`/api/display/devices/${id}/approve`, {user:"manager",body:{}})).status).toBe(404);
    } finally { await f.close(); }
  });

  it("allows rejection and refuses cross-site request spoofing", async () => {
    const f = await createFixture();
    try {
      const csrf = await f.request("/api/display/request", {
        user:null, body:{}, headers:{ Origin:"https://elsewhere.invalid" },
      });
      expect(csrf.status).toBe(403);
      expect((await (await f.request("/api/display/devices", {user:"manager"})).json() as {data:{devices:unknown[]}}).data.devices).toHaveLength(0);

      const pending = await f.request("/api/display/request", {user:null,body:{}});
      const cookie = pending.headers.get("Set-Cookie")!.split(";")[0];
      const devices = await f.request("/api/display/devices", {user:"manager"});
      const id = (await devices.json() as {data:{devices:{id:string}[]}}).data.devices[0].id;
      expect((await f.request(`/api/display/devices/${id}/reject`, {user:"manager",body:{}})).status).toBe(200);
      expect((await (await f.request("/api/display/state", {user:null,headers:{Cookie:cookie}})).json() as {data:{status:string}}).data.status).toBe("rejected");
      expect((await f.request("/api/display/live", {user:null,headers:{Cookie:cookie}})).status).toBe(403);
    } finally { await f.close(); }
  });
});
