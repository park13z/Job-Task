import { z } from "zod";

export const uuidSchema = z.uuid();
export const versionSchema = z.int().min(1);
export const revisionSchema = z.int().min(0);
export const instantSchema = z.int().min(0);
export const businessDateSchema = z.iso.date().refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Invalid calendar date");

export const roleSchema = z.enum(["manager", "supervisor", "line_leader", "assistant"]);
export const jobStatusSchema = z.enum(["todo", "in_progress", "paused", "done"]);
export const actionSchema = z.enum(["start", "pause", "resume", "done"]);

export const userSchema = z.strictObject({
  id: uuidSchema,
  username: z.string().regex(/^[a-z0-9._-]{2,32}$/),
  name: z.string().trim().min(1).max(100),
  role: roleSchema,
  active: z.boolean(),
  version: versionSchema,
  createdAt: instantSchema,
  updatedAt: instantSchema,
}).refine((user) => user.createdAt <= user.updatedAt, "createdAt exceeds updatedAt");

export const lineSchema = z.strictObject({
  id: uuidSchema,
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(100),
  active: z.boolean(),
  memberIds: z.array(uuidSchema),
});

const jobBaseSchema = z.strictObject({
  id: uuidSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000),
  targetSkids: z.int().positive().nullable(),
  dayOrder: z.int().positive(),
  queuePosition: z.int().min(0),
  insertedNumber: z.int().positive().nullable(),
  cancelledAt: instantSchema.nullable(),
  workDate: businessDateSchema,
  lineId: uuidSchema,
  createdBy: uuidSchema,
  version: versionSchema,
  createdAt: instantSchema,
  updatedAt: instantSchema,
  lastPausedAt: instantSchema.nullable(),
  lastResumedAt: instantSchema.nullable(),
  overdue: z.boolean(),
  activeMs: z.int().min(0),
});

const todoJobSchema = jobBaseSchema.extend({
  status: z.literal("todo"), startedAt: z.null(), completedAt: z.null(),
});
const inProgressJobSchema = jobBaseSchema.extend({
  status: z.literal("in_progress"), startedAt: instantSchema, completedAt: z.null(),
});
const pausedJobSchema = jobBaseSchema.extend({
  status: z.literal("paused"), startedAt: instantSchema, completedAt: z.null(),
});
const doneJobSchema = jobBaseSchema.extend({
  status: z.literal("done"), startedAt: instantSchema, completedAt: instantSchema,
});

export const jobSchema = z.discriminatedUnion("status", [
  todoJobSchema, inProgressJobSchema, pausedJobSchema, doneJobSchema,
]).superRefine((job, context) => {
  if (job.createdAt > job.updatedAt) {
    context.addIssue({ code: "custom", path: ["updatedAt"], message: "updatedAt precedes createdAt" });
  }
  if (job.status === "todo") {
    if (job.lastPausedAt !== null || job.lastResumedAt !== null || job.activeMs !== 0) {
      context.addIssue({ code: "custom", message: "Todo cannot have work history" });
    }
    return;
  }
  if (job.startedAt < job.createdAt || job.startedAt > job.updatedAt) {
    context.addIssue({ code: "custom", path: ["startedAt"], message: "Start is outside job lifetime" });
  }
  if (job.lastPausedAt !== null && (job.lastPausedAt < job.startedAt || job.lastPausedAt > job.updatedAt)) {
    context.addIssue({ code: "custom", path: ["lastPausedAt"], message: "Pause is outside work history" });
  }
  if (job.lastResumedAt !== null && (job.lastResumedAt < job.startedAt || job.lastResumedAt > job.updatedAt)) {
    context.addIssue({ code: "custom", path: ["lastResumedAt"], message: "Resume is outside work history" });
  }
  if (job.status === "in_progress" && job.lastPausedAt !== null &&
      (job.lastResumedAt === null || job.lastResumedAt < job.lastPausedAt)) {
    context.addIssue({ code: "custom", message: "Active work must follow its latest pause" });
  }
  if (job.status === "paused" && (job.lastPausedAt === null ||
      (job.lastResumedAt !== null && job.lastPausedAt < job.lastResumedAt))) {
    context.addIssue({ code: "custom", message: "Paused work must have a latest pause" });
  }
  if (job.status === "done" && (job.completedAt < job.startedAt || job.completedAt !== job.updatedAt)) {
    context.addIssue({ code: "custom", path: ["completedAt"], message: "Completion is outside work history" });
  }
});

export const jobEventSchema = z.strictObject({
  id: uuidSchema,
  eventType: z.enum(["created", "edited", "started", "paused", "resumed", "completed"]),
  happenedAt: instantSchema,
  actor: z.strictObject({ id: uuidSchema, name: z.string().min(1) }),
  version: versionSchema,
});

const titleSchema = z.string().trim().min(1).max(200);
const descriptionSchema = z.string().max(2000);
const targetSkidsSchema = z.int().positive();
export const jobInputSchema = z.strictObject({
  title: titleSchema,
  // The server assigns weekly order; a legacy supplied value is accepted but ignored.
  dayOrder: z.int().positive().optional(),
  workDate: businessDateSchema,
  lineId: uuidSchema,
  description: descriptionSchema.optional(),
  targetSkids: targetSkidsSchema.optional(),
});
export const bulkJobInputSchema = z.strictObject({ items: z.array(jobInputSchema).min(1).max(10) });
export const editJobInputSchema = z.strictObject({
  expectedVersion: versionSchema,
  title: titleSchema.optional(),
  description: descriptionSchema.optional(),
  targetSkids: targetSkidsSchema.nullable().optional(),
  dayOrder: z.int().positive().optional(),
  workDate: businessDateSchema.optional(),
  lineId: uuidSchema.optional(),
}).refine((value) => Object.keys(value).length > 1, "At least one edit is required");
export const actionInputSchema = z.strictObject({ expectedVersion: versionSchema });
export const queueReasonSchema = z.string().trim().min(1).max(2000);
export const queueChangeSchema = z.strictObject({
  expectedRevision: revisionSchema, reason: queueReasonSchema,
});
export const queueInsertSchema = queueChangeSchema.extend({
  job: jobInputSchema.omit({ dayOrder: true }),
  aboveQueue: z.int().positive(),
});
export const queueReorderSchema = queueChangeSchema.extend({
  workDate: businessDateSchema, lineId: uuidSchema,
  ids: z.array(uuidSchema).min(1).max(500).refine(ids => new Set(ids).size === ids.length, "Duplicate queue job"),
});
export const queueJobChangeSchema = queueChangeSchema.extend({ expectedVersion: versionSchema });
export const queueActionSchema = z.enum(["delete","cancel","recall"]);
export const idempotencyKeySchema = uuidSchema;

export const createUserInputSchema = z.strictObject({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{2,32}$/), name: z.string().trim().min(1).max(100), role: roleSchema, password: z.string().min(8).max(128),
});
export const changeNameInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  expectedVersion: versionSchema,
});
export const editUserInputSchema = z.strictObject({
  expectedVersion: versionSchema,
  name: z.string().trim().min(1).max(100).optional(),
  role: roleSchema.optional(),
  active: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 1, "At least one edit is required");
export const createLineInputSchema = z.strictObject({
  code: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(100),
});
export const editLineInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(100).optional(), active: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one edit is required");

export const jobTemplateSchema = z.strictObject({
  id: uuidSchema, name: z.string().trim().min(1).max(200), active: z.boolean(),
  lineIds: z.array(uuidSchema), version: versionSchema, createdAt: instantSchema, updatedAt: instantSchema,
});
export const jobTemplatesDataSchema = z.strictObject({ templates: z.array(jobTemplateSchema) });
export const jobTemplateDataSchema = z.strictObject({ template: jobTemplateSchema });
const jobTemplateLineIdsSchema = z.array(uuidSchema).max(50).refine(
  ids => new Set(ids).size === ids.length, "A production line can only be assigned once",
);
export const createJobTemplateInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  lineIds: jobTemplateLineIdsSchema.optional(),
});
export const editJobTemplateInputSchema = z.strictObject({
  expectedVersion: versionSchema,
  name: z.string().trim().min(1).max(200).optional(),
  active: z.boolean().optional(),
  lineIds: jobTemplateLineIdsSchema.optional(),
}).refine(value => value.name !== undefined || value.active !== undefined || value.lineIds !== undefined,
  "At least one edit is required");

export const jobWindowSchema = z.strictObject({ from: businessDateSchema, to: businessDateSchema });
export const jobFiltersSchema = z.strictObject({
  lineId: uuidSchema.nullable(), status: jobStatusSchema.nullable(),
});
const jobQueryBaseSchema = z.strictObject({
  from: businessDateSchema,
  to: businessDateSchema,
  lineId: uuidSchema.optional(),
  status: jobStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).optional(),
});
const validJobWindow = (query: { from: string; to: string }) => {
  const days = (Date.parse(`${query.to}T00:00:00Z`) - Date.parse(`${query.from}T00:00:00Z`)) / 86_400_000;
  return days >= 0 && days <= 6;
};
export const jobQuerySchema = jobQueryBaseSchema.refine(validJobWindow, "Date window must contain 1 to 7 days");
export const summaryQuerySchema = jobQueryBaseSchema.omit({ limit: true, cursor: true })
  .refine(validJobWindow, "Date window must contain 1 to 7 days");

export const meDataSchema = z.strictObject({
  user: userSchema, timezone: z.literal("America/Toronto"), weekStart: z.literal("monday"), lines: z.array(lineSchema),
});
export const usersDataSchema = z.strictObject({ users: z.array(userSchema) });
export const userDataSchema = z.strictObject({ user: userSchema });
export const linesDataSchema = z.strictObject({ lines: z.array(lineSchema) });
export const lineDataSchema = z.strictObject({ line: lineSchema });
export const jobsDataSchema = z.strictObject({
  jobs: z.array(jobSchema), nextCursor: z.string().nullable(), window: jobWindowSchema, filters: jobFiltersSchema,
});
export const jobDataSchema = z.strictObject({ job: jobSchema });
export const liveDataSchema = z.strictObject({ date: businessDateSchema, inProgress: z.array(jobSchema), paused: z.array(jobSchema), done: z.array(jobSchema), queued: z.array(jobSchema) });
export const bulkJobsDataSchema = z.strictObject({ jobs: z.array(jobSchema) });
export const eventsDataSchema = z.strictObject({ events: z.array(jobEventSchema) });
export const summaryDataSchema = z.strictObject({
  window: jobWindowSchema,
  filters: jobFiltersSchema,
  todo: z.int().min(0), inProgress: z.int().min(0), paused: z.int().min(0),
  done: z.int().min(0), overdue: z.int().min(0), total: z.int().min(0), activeMs: z.int().min(0),
}).superRefine((value, context) => {
  if (value.total !== value.todo + value.inProgress + value.paused + value.done) {
    context.addIssue({ code: "custom", path: ["total"], message: "Status counts do not sum to total" });
  }
  if (value.overdue > value.todo + value.inProgress + value.paused) {
    context.addIssue({ code: "custom", path: ["overdue"], message: "Overdue exceeds unfinished jobs" });
  }
});
export const changesDataSchema = z.strictObject({ revision: revisionSchema, businessDate: businessDateSchema });
export const successSchema = <T extends z.ZodType>(data: T) => z.strictObject({ data, revision: revisionSchema });
export const errorSchema = z.strictObject({ error: z.strictObject({
  code: z.enum(["VALIDATION_ERROR", "UNAUTHENTICATED", "FORBIDDEN", "NOT_FOUND", "CONFLICT", "IDEMPOTENCY_CONFLICT", "PAYLOAD_TOO_LARGE", "UNSUPPORTED_MEDIA_TYPE", "TEMPORARILY_UNAVAILABLE"]),
  message: z.string().min(1),
  fields: z.record(z.string(), z.string()).optional(),
}) });

export type Role = z.infer<typeof roleSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
export type JobAction = z.infer<typeof actionSchema>;
export type User = z.infer<typeof userSchema>;
export type Line = z.infer<typeof lineSchema>;
export type Job = z.infer<typeof jobSchema>;
export type JobEvent = z.infer<typeof jobEventSchema>;
export type JobInput = z.infer<typeof jobInputSchema>;
export type JobQuery = z.infer<typeof jobQuerySchema>;

export type JobTemplate = z.infer<typeof jobTemplateSchema>;

export const loginInputSchema=z.strictObject({username:z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{2,32}$/),password:z.string().min(1).max(128)});
export const resetPasswordInputSchema=z.strictObject({password:z.string().min(8).max(128)});
export const changePasswordInputSchema=z.strictObject({oldPassword:z.string().min(1),newPassword:z.string().min(8).max(128)});
export const emptyDataSchema=z.strictObject({});
