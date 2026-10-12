import type { Job, JobAction, JobStatus, Line, Role, User } from "./contracts";

export const transitionMap = {
  todo: { start: "in_progress" },
  in_progress: { pause: "paused", done: "done" },
  paused: { resume: "in_progress", done: "done" },
  done: {},
} as const satisfies Record<JobStatus, Partial<Record<JobAction, JobStatus>>>;

export function availableActions(status: JobStatus): JobAction[] {
  switch (status) {
    case "todo": return ["start"];
    case "in_progress": return ["pause", "done"];
    case "paused": return ["resume","done"];
    case "done": return [];
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function nextStatus(status: JobStatus, action: JobAction): JobStatus | null {
  switch (status) {
    case "todo": return action === "start" ? transitionMap.todo.start : null;
    case "in_progress": return action === "pause" ? transitionMap.in_progress.pause : action === "done" ? transitionMap.in_progress.done : null;
    case "paused": return action === "resume" ? transitionMap.paused.resume : action === "done" ? transitionMap.paused.done : null;
    case "done": return null;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function isPlanner(role: Role): boolean {
  return role === "manager" || role === "supervisor";
}

/** UI action visibility only; the Worker rechecks authorization in guarded SQL. */
export function canActOnJob(
  user: Pick<User, "id" | "active" | "role">,
  lines: ReadonlyArray<Pick<Line, "id" | "active" | "memberIds">>,
  job: Pick<Job, "lineId">,
): boolean {
  return user.active && lines.some(line => line.id === job.lineId && line.active &&
    (isPlanner(user.role) || line.memberIds.includes(user.id)));
}
