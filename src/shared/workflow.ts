import type { JobAction, JobStatus, Role } from "./contracts";

export const transitionMap = {
  todo: { start: "in_progress" },
  in_progress: { pause: "paused", done: "done" },
  paused: { resume: "in_progress" },
  done: {},
} as const satisfies Record<JobStatus, Partial<Record<JobAction, JobStatus>>>;

export function availableActions(status: JobStatus): JobAction[] {
  switch (status) {
    case "todo": return ["start"];
    case "in_progress": return ["pause", "done"];
    case "paused": return ["resume"];
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
    case "paused": return action === "resume" ? transitionMap.paused.resume : null;
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
