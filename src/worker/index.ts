import { Hono } from "hono";
import { z } from "zod";
import {
  actionInputSchema, actionSchema, bulkJobInputSchema, queueInsertSchema, queueReorderSchema, queueJobChangeSchema, queueActionSchema, createLineInputSchema,
  createUserInputSchema, editJobInputSchema, editLineInputSchema, editUserInputSchema,
  jobDataSchema, bulkJobsDataSchema, jobsDataSchema, jobQuerySchema, summaryQuerySchema,
  summaryDataSchema, liveDataSchema, meDataSchema, linesDataSchema, lineDataSchema, usersDataSchema,
  userDataSchema, eventsDataSchema, changesDataSchema, uuidSchema,
  jobTemplateDataSchema, jobTemplatesDataSchema, createJobTemplateInputSchema, editJobTemplateInputSchema, loginInputSchema, resetPasswordInputSchema, changePasswordInputSchema, changeNameInputSchema, emptyDataSchema,
} from "../shared/contracts";
import { authenticate, requireManager, login, logout, clearCookie, renewSessionCookie, changePassword, setUserPassword } from "./auth";
import { ApiError, input, unavailable } from "./errors";
import { body, respond } from "./http";
import { operation } from "./idempotency";
import { businessDate } from "./job-projection";
import { queryJobs, summary } from "./job-queries";
import { liveJobs } from "./live-queries";
import { createJobs, editJob, actOnJob } from "./job-writes";
import { insertQueue, reorderQueue, changeQueueJob } from "./queue-writes";
import { revision, users, lines, events, findUser } from "./reads";
import { createUser, updateUser, updateOwnName, deleteTemporaryUser, createLine, updateLine, changeMember } from "./roster-writes";
import { jobTemplates, createJobTemplate, updateJobTemplate } from "./job-templates";
import type { App } from "./types";

const app = new Hono<App>();
app.onError((error, c) => {
  const problem = error instanceof ApiError ? error : unavailable();
  return c.json({ error: { code: problem.code, message: problem.message } }, problem.status, {
    "Cache-Control": "no-store",
  });
});
app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  if (c.req.path === "/api/auth/login") { await next(); return; }
  c.set("actor", await authenticate(c.req.raw, c.env));
  c.set("at", Date.now());
  // Sign-out and password changes must clear (never renew) the browser cookie.
  if (c.req.path !== "/api/auth/logout" && c.req.path !== "/api/auth/change-password") {
    const refreshed = renewSessionCookie(c.req.raw, c.env);
    if (refreshed) c.header("Set-Cookie", refreshed);
  }
  await next();
});
app.use("/api", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.set("actor", await authenticate(c.req.raw, c.env));
  c.set("at", Date.now());
  await next();
});
function query(c: { req: { url: string } }) {
  const values = new URL(c.req.url).searchParams;
  if ([...values.keys()].some(key => values.getAll(key).length !== 1)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Duplicate query parameters are not allowed.");
  }
  return Object.fromEntries(values);
}
const id = (value: string) => input(uuidSchema, value);
app.post("/api/auth/login", async c => {
  const data=await body(c,loginInputSchema);
  const result=await login(c.env.DB,c.req.raw,data.username,data.password,Date.now(),c.env);
  c.header("Set-Cookie",result.cookie);
  return respond(c,emptyDataSchema,{});
});
app.post("/api/auth/logout", async c => {
  await body(c,emptyDataSchema);
  await logout(c.env.DB,c.req.raw,c.env);
  c.header("Set-Cookie",clearCookie(c.req.raw,c.env));
  return respond(c,emptyDataSchema,{});
});
app.post("/api/auth/change-password",async c=>{
  const data=await body(c,changePasswordInputSchema);
  await changePassword(c.env.DB,c.get("actor"),data.oldPassword,data.newPassword,Date.now());
  c.header("Set-Cookie",clearCookie(c.req.raw,c.env));
  return respond(c,emptyDataSchema,{});
});
app.post("/api/users/:id/password",async c=>{
  requireManager(c.get("actor"));
  const data=await body(c,resetPasswordInputSchema);
  const target=await findUser(c.env.DB,id(c.req.param("id")));
  await setUserPassword(c.env.DB,target.id,data.password,Date.now());
  return respond(c,emptyDataSchema,{});
});
app.get("/api/me", async c => {
  const actor = c.get("actor");
  const visible = await lines(c.env.DB, actor);
  return respond(c, meDataSchema, { user: actor, timezone: "America/Toronto", weekStart: "monday", lines: visible });
});
app.patch("/api/me", async c => {
  const data = await body(c, changeNameInputSchema);
  return respond(c, userDataSchema, { user: await updateOwnName(c.env.DB, c.get("actor"), data.name, data.expectedVersion, c.get("at")) });
});
app.get("/api/users", async c => {
  requireManager(c.get("actor"));
  return respond(c, usersDataSchema, { users: await users(c.env.DB) });
});
app.post("/api/users", async c => {
  requireManager(c.get("actor"));
  const data = await body(c, createUserInputSchema);
  return respond(c, userDataSchema, { user: await createUser(c.env, c.get("actor"), data, c.get("at")) }, 201);
});
app.patch("/api/users/:id", async c => {
  requireManager(c.get("actor"));
  const data = await body(c, editUserInputSchema);
  return respond(c, userDataSchema, { user: await updateUser(c.env.DB, c.get("actor"), id(c.req.param("id")), data, c.get("at")) });
});
app.delete("/api/users/:id", async c => {
  requireManager(c.get("actor"));
  await body(c,emptyDataSchema);
  await deleteTemporaryUser(c.env.DB,c.get("actor"),id(c.req.param("id")));
  return respond(c,emptyDataSchema,{});
});
app.get("/api/lines", async c => respond(c, linesDataSchema, { lines: await lines(c.env.DB, c.get("actor")) }));
app.post("/api/lines", async c => {
  requireManager(c.get("actor"));
  const data = await body(c, createLineInputSchema);
  return respond(c, lineDataSchema, { line: await createLine(c.env.DB, c.get("actor"), data) }, 201);
});
app.patch("/api/lines/:id", async c => {
  requireManager(c.get("actor"));
  const data = await body(c, editLineInputSchema);
  return respond(c, lineDataSchema, { line: await updateLine(c.env.DB, c.get("actor"), id(c.req.param("id")), data) });
});
for (const method of ["put", "delete"] as const) {
  app[method]("/api/lines/:id/members/:userId", async c => {
    requireManager(c.get("actor"));
    await body(c, z.strictObject({}));
    return respond(c, lineDataSchema, {
      line: await changeMember(c.env.DB, c.get("actor"), id(c.req.param("id")), id(c.req.param("userId")), method === "put"),
    });
  });
}
app.get("/api/job-list", async c =>
  respond(c, jobTemplatesDataSchema, { templates: await jobTemplates(c.env.DB, c.get("actor")) }));
app.post("/api/job-list", async c => {
  requireManager(c.get("actor"));
  const data = await body(c, createJobTemplateInputSchema);
  return respond(c, jobTemplateDataSchema, { template: await createJobTemplate(c.env.DB, c.get("actor"), data, c.get("at")) }, 201);
});
app.patch("/api/job-list/:id", async c => {
  requireManager(c.get("actor"));
  const data = await body(c, editJobTemplateInputSchema);
  return respond(c, jobTemplateDataSchema, { template: await updateJobTemplate(c.env.DB, c.get("actor"), id(c.req.param("id")), data, c.get("at")) });
});
app.get("/api/changes", async c => respond(c, changesDataSchema, { revision: await revision(c.env.DB), businessDate: businessDate(c.get("at")) }));
app.get("/api/jobs", async c => respond(c, jobsDataSchema, await queryJobs(c.env.DB, c.get("actor"), input(jobQuerySchema, query(c)), c.get("at"), true)));
app.get("/api/summary", async c => respond(c, summaryDataSchema, await summary(c.env.DB, c.get("actor"), input(summaryQuerySchema, query(c)), c.get("at"))));
app.get("/api/live", async c => respond(c, liveDataSchema, await liveJobs(c.env.DB, c.get("actor"), c.get("at"))));
app.get("/api/jobs/:id/events", async c => respond(c, eventsDataSchema, { events: await events(c.env.DB, c.get("actor"), id(c.req.param("id")), c.get("at")) }));
app.post("/api/jobs", async c => {
  const data = await body(c, bulkJobInputSchema);
  const op = await operation(c.req.raw, c.get("actor"), data, data.items.length);
  return respond(c, bulkJobsDataSchema, { jobs: await createJobs(c.env.DB, c.get("actor"), data.items, op, c.get("at")) }, 201);
});
app.post("/api/queue/insert", async c => {
  const data = await body(c, queueInsertSchema);
  const op = await operation(c.req.raw, c.get("actor"), data);
  return respond(c, jobDataSchema, {job: await insertQueue(c.env.DB,c.get("actor"),data,op,c.get("at"))},201);
});
app.post("/api/queue/reorder", async c => {
  const data = await body(c, queueReorderSchema);
  const op = await operation(c.req.raw, c.get("actor"), data);
  await reorderQueue(c.env.DB,c.get("actor"),data,op,c.get("at"));
  return respond(c, emptyDataSchema, {});
});
app.post("/api/queue/:id/:action", async c => {
  const action = input(queueActionSchema,c.req.param("action"));
  const data = await body(c, queueJobChangeSchema);
  const op = await operation(c.req.raw,c.get("actor"),data);
  await changeQueueJob(c.env.DB,c.get("actor"),id(c.req.param("id")),action,data,op,c.get("at"));
  return respond(c,emptyDataSchema,{});
});
app.patch("/api/jobs/:id", async c => {
  const data = await body(c, editJobInputSchema);
  const op = await operation(c.req.raw, c.get("actor"), data);
  return respond(c, jobDataSchema, { job: await editJob(c.env.DB, c.get("actor"), id(c.req.param("id")), data, op, c.get("at")) });
});
app.post("/api/jobs/:id/:action", async c => {
  const action = input(actionSchema, c.req.param("action"));
  const data = await body(c, actionInputSchema);
  const op = await operation(c.req.raw, c.get("actor"), data);
  return respond(c, jobDataSchema, { job: await actOnJob(c.env.DB, c.get("actor"), id(c.req.param("id")), action, data.expectedVersion, op, c.get("at")) });
});
app.notFound(c => c.req.path.startsWith("/api") ? c.json({ error: { code: "NOT_FOUND", message: "The API route does not exist." } }, 404, { "Cache-Control": "no-store" }) : c.text("Not Found", 404));
export default app;
