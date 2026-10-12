import { AlertCircle, Check, Circle, Pause, Play } from "lucide-react";
import type { Job } from "../shared/contracts";
import { formatInstant } from "../shared/time";

const statusIcons = { todo: Circle, in_progress: Play, paused: Pause, done: Check } as const;

export function Status({ job }: { job: Job }) {
  const label = job.cancelledAt !== null ? "Cancelled" : { todo: "To do", in_progress: "In progress", paused: "Paused", done: "Done" }[job.status];
  const tone = job.cancelledAt !== null ? "bg-[#34454e] text-white" : { todo: "bg-[#eff3f5] text-[#4e6471]", in_progress: "bg-[#dff5ec] text-[#0c6a50]", paused: "bg-[#fff1d7] text-[#80591b]", done: "bg-red-50 text-destructive" }[job.status];
  const Icon = statusIcons[job.status];
  return <span className={"inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold " + tone}><Icon size={13} strokeWidth={2.4} aria-hidden="true" />{label}</span>;
}

// Overdue is a modifier, not a status. It uses a dark orange so it cannot be confused with the red Done treatment.
export function OverdueBadge() {
  return <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#fff0e0] px-2.5 py-1.5 text-xs font-bold text-[#9a4a00]"><AlertCircle size={14} aria-hidden="true" />Overdue</span>;
}

export function JobTimes({ job }: { job: Job }) {
  const dates = [
    { label: "First started", value: job.startedAt },
    { label: "Last paused", value: job.lastPausedAt },
    { label: "Last resumed", value: job.lastResumedAt },
    { label: "Done", value: job.completedAt },
  ];
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs xl:grid-cols-4">
    {dates.map(item => <div key={item.label} className="min-w-0"><dt className="mb-1 font-medium text-[#566d79]">{item.label}</dt><dd className={"break-words font-semibold " + (item.label === "Done" && item.value !== null ? "text-destructive" : "text-[#37515d]")}>{item.value === null ? "—" : formatInstant(item.value)}</dd></div>)}
  </dl>;
}
