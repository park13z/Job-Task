import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { createFixture, type TestUser } from "./fixture";

const fixture = await createFixture();
const root = resolve("dist");
const users = new Set<TestUser>(["manager", "supervisor", "leader", "assistant", "outside", "inactive"]);
const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
const port = Number(process.argv[2] ?? "4173");
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1:4173");
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      const chosen = req.headers.cookie?.match(/(?:^|;\s*)e2e_user=([\w]+)/)?.[1] ?? "";
      const hasRealCookie = Boolean(req.headers.cookie?.includes("__Host-jt_session="));
      const user: TestUser | null = hasRealCookie || chosen === "anon" ? null :
        users.has(chosen as TestUser) ? chosen as TestUser : "manager";
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const raw = Buffer.concat(chunks).toString("utf8");
      const response = await fixture.request(url.pathname + url.search, {
        user, method: req.method ?? "GET",
        ...(hasRealCookie ? {headers: {Cookie: req.headers.cookie??""}} : {}), ...(raw.length ? { body: JSON.parse(raw) } : {}),
        ...(req.headers["idempotency-key"] ? { key: String(req.headers["idempotency-key"]) } : {}),
      });
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    const path = resolve(root, "." + decodeURIComponent(url.pathname));
    const safe = path === root || path.startsWith(root + sep);
    const file = safe ? await readFile(path).catch(() => readFile(resolve(root, "index.html"))) : await readFile(resolve(root, "index.html"));
    res.writeHead(200, { "Content-Type": types[extname(path)] ?? "text/html" });
    res.end(file);
  } catch (error) {
    console.error(error);
    res.writeHead(500).end("Test server failed");
  }
});
server.listen(port, "127.0.0.1");
process.once("SIGINT", () => { server.close(); void fixture.close(); });
process.once("SIGTERM", () => { server.close(); void fixture.close(); });
