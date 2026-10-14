import { describe, expect, it } from "vitest";
import pages from "../src/pages-worker";

describe("Pages advanced-mode deep links", () => {
  it("serves index.html for frontend routes without intercepting asset paths", async () => {
    const urls: string[] = [];
    const env = {
      ASSETS: {
        fetch: async (request: Request) => {
          urls.push(new URL(request.url).pathname);
          return new Response("<!doctype html><title>Job Task</title>", {
            status: 200, headers: { "Content-Type": "text/html" },
          });
        },
      },
    } as unknown as Parameters<typeof pages.fetch>[1];
    const ctx = {} as ExecutionContext;
    for (const path of ["/dashboard", "/fill-task", "/job", "/live", "/team-settings", "/profile",
      "/team-settings/users", "/team-settings/lines", "/team-settings/members", "/team-settings/job-list"]) {
      const response = await pages.fetch(new Request("https://example.com" + path), env, ctx);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
    }
    expect(urls).toEqual(["/index.html", "/index.html", "/index.html", "/index.html",
      "/", "/index.html", "/index.html", "/", "/index.html", "/"]);
    await pages.fetch(new Request("https://example.com/assets/script.js"), env, ctx);
    expect(urls.at(-1)).toBe("/assets/script.js");
    await pages.fetch(new Request("https://example.com/live", { method: "POST" }), env, ctx);
    expect(urls.at(-1)).toBe("/live");
  });
});
