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
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
