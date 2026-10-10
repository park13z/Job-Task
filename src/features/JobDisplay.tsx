import type { Job } from "../shared/contracts";
import { formatInstant } from "../shared/time";

export function Status({ job }: { job: Job }) {
  const label = { todo: "To do", in_progress: "In progress", paused: "Paused", done: "Done" }[job.status];
  const tone = { todo: "bg-[#eff3f5] text-[#4e6471]", in_progress: "bg-[#dff5ec] text-[#0c6a50]", paused: "bg-[#fff1d7] text-[#80591b]", done: "bg-red-50 text-destructive" }[job.status];
  return <span className={"inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold " + tone}><span className="h-[6px] w-[6px] rounded-[50%] bg-current" />{label}</span>;
}

export function JobTimes({ job }: { job: Job }) {
  const dates = [
    { label: "First started", value: job.startedAt },
    { label: "Last paused", value: job.lastPausedAt },
    { label: "Last resumed", value: job.lastResumedAt },
    { label: "Done", value: job.completedAt },
  ];
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[11px] xl:grid-cols-4">
    {dates.map(item => <div key={item.label} className="min-w-0"><dt className="mb-1 font-medium text-[#566d79]">{item.label}</dt><dd className={"break-words font-semibold " + (item.label === "Done" && item.value !== null ? "text-destructive" : "text-[#37515d]")}>{item.value === null ? "—" : formatInstant(item.value)}</dd></div>)}
  </dl>;
}
