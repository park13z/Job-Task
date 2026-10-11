import api from "./worker/index";
import type { Env } from "./worker/types";

// Cloudflare Pages advanced mode: the platform provides DB, Access configuration,
// and ASSETS. Never use the local fixture server in a deployed build.
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/api" || path.startsWith("/api/")) {
      return api.fetch(request, env, ctx);
    }
    if (!env.ASSETS) {
      return Promise.resolve(new Response("Static assets are not configured.", { status: 503 }));
    }
    // Direct links and browser Refresh must serve the React entry document
    // on Pages Advanced Mode as well as on the local SPA-capable Worker.
    // Never intercept API calls, non-GET writes, or asset URLs.
    const appPages = new Set(["/dashboard", "/fill-task", "/job", "/live", "/team-settings", "/profile",
      "/team-settings/users", "/team-settings/lines", "/team-settings/members", "/team-settings/job-list"]);
    if ((request.method === "GET" || request.method === "HEAD") && appPages.has(path)) {
      return env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
