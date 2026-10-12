import { z } from "zod";
import {
  bulkJobsDataSchema, changesDataSchema, errorSchema, eventsDataSchema,
  jobDataSchema, jobsDataSchema, liveDataSchema, lineDataSchema, linesDataSchema, meDataSchema,
  summaryDataSchema, userDataSchema, usersDataSchema, jobTemplatesDataSchema, jobTemplateDataSchema, emptyDataSchema,
} from "../shared/contracts";

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly fields: Record<string, string> = {}) {
    super(message);
  }
}

async function request<T extends z.ZodType>(path: string, schema: T, options: RequestInit = {}): Promise<{ data: z.output<T>; revision: number }> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { credentials: "same-origin", cache: "no-store", ...options });
  } catch {
    throw new ApiError(0, "Unable to connect. Please try again.");
  }
  let json: unknown;
  try { json = await response.json(); } catch { throw new ApiError(response.status, "The server returned an invalid response."); }
  if (!response.ok) {
    const parsed = errorSchema.safeParse(json);
    const message = parsed.success ? parsed.data.error.message : response.status === 503
      ? "The system is temporarily unavailable. Please contact your administrator." : "The operation failed. Please try again.";
    throw new ApiError(response.status, message, parsed.success ? parsed.data.error.fields : {});
  }
  const parsed = z.strictObject({ data: z.unknown(), revision: z.int().min(0) }).safeParse(json);
  if (!parsed.success) throw new ApiError(response.status, "The server returned invalid data. Please try again.");
  return { data: schema.parse(parsed.data.data), revision: parsed.data.revision };
}

export const api = {
  login: (username:string,password:string) => request("/auth/login",emptyDataSchema,{method:"POST",
    headers:{"Content-Type":"application/json"},body:JSON.stringify({username,password})}),
  logout: () => request("/auth/logout",emptyDataSchema,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}),
  changePassword: (oldPassword:string,newPassword:string) => request("/auth/change-password",emptyDataSchema,{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({oldPassword,newPassword})}),
  resetPassword: (id:string,password:string) => api.mutate(`/users/${id}/password`,"POST",{password},emptyDataSchema),

  me: (signal?: AbortSignal) => request("/me", meDataSchema, { signal }),
  changeName: (name: string, expectedVersion: number) => api.mutate("/me", "PATCH", { name, expectedVersion }, userDataSchema),
  lines: (signal?: AbortSignal) => request("/lines", linesDataSchema, { signal }),
  jobTemplates: (signal?: AbortSignal) => request("/job-list", jobTemplatesDataSchema, { signal }),
  createJobTemplate: (body: unknown) => api.mutate("/job-list", "POST", body, jobTemplateDataSchema),
  editJobTemplate: (id: string, body: unknown) => api.mutate(`/job-list/${id}`, "PATCH", body, jobTemplateDataSchema),
  users: (signal?: AbortSignal) => request("/users", usersDataSchema, { signal }),
  changes: (signal?: AbortSignal) => request("/changes", changesDataSchema, { signal }),
  jobs: (query: URLSearchParams, signal?: AbortSignal) => request(`/jobs?${query}`, jobsDataSchema, { signal }),
  live: (signal?: AbortSignal) => request("/live", liveDataSchema, { signal }),
  summary: (query: URLSearchParams, signal?: AbortSignal) => request(`/summary?${query}`, summaryDataSchema, { signal }),
  events: (id: string, signal?: AbortSignal) => request(`/jobs/${id}/events`, eventsDataSchema, { signal }),
  mutate: <T extends z.ZodType>(path: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body: unknown, schema: T, key?: string) =>
    request(path, schema, { method, headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) }, body: JSON.stringify(body) }),
  createJobs: (body: unknown, key: string) => api.mutate("/jobs", "POST", body, bulkJobsDataSchema, key),
  insertQueue: (body: unknown,key:string) => api.mutate("/queue/insert","POST",body,jobDataSchema,key),
  reorderQueue: (body: unknown,key:string) => api.mutate("/queue/reorder","POST",body,emptyDataSchema,key),
  queueJobAction: (id:string,action:"delete"|"cancel"|"recall",body:unknown,key:string) =>
    api.mutate(`/queue/${id}/${action}`,"POST",body,emptyDataSchema,key),
  editJob: (id: string, body: unknown, key: string) => api.mutate(`/jobs/${id}`, "PATCH", body, jobDataSchema, key),
  action: (id: string, action: string, body: unknown, key: string) => api.mutate(`/jobs/${id}/${action}`, "POST", body, jobDataSchema, key),
  createUser: (body: unknown) => api.mutate("/users", "POST", body, userDataSchema),
  editUser: (id: string, body: unknown) => api.mutate(`/users/${id}`, "PATCH", body, userDataSchema),
  removeTemporaryUser: (id:string)=>api.mutate(`/users/${id}`,"DELETE",{},emptyDataSchema),
  createLine: (body: unknown) => api.mutate("/lines", "POST", body, lineDataSchema),
  editLine: (id: string, body: unknown) => api.mutate(`/lines/${id}`, "PATCH", body, lineDataSchema),
  member: (lineId: string, userId: string, add: boolean) => api.mutate(`/lines/${lineId}/members/${userId}`, add ? "PUT" : "DELETE", {}, lineDataSchema),
};
