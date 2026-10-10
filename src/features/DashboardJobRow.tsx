import { Clock3 } from "lucide-react";
import type { Job, Line } from "../shared/contracts";
import { formatBusinessDate, formatDuration } from "../shared/time";
import { JobTimes, Status } from "./Jobs";

export function DashboardJobRow({ job, lines }: { job: Job; lines: Line[] }) {
  return <article className="px-4 py-4 transition-colors hover:bg-[#fbfcfd] sm:px-6">
    <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
      <div className="task-sequence" aria-label={"Daily order " + job.dayOrder}>{job.dayOrder}</div>
      <div className="min-w-0 flex-1">
        <p className="task-meta">{formatBusinessDate(job.workDate)} <span className="mx-1.5 text-[#9aacb2]">/</span> {lines.find((line: Line) => line.id === job.lineId)?.code ?? "Line"}</p>
        <h4 className="mt-1.5 text-sm font-bold leading-snug text-[#1b3642] sm:text-[15px]">{job.title}</h4>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[#647a84]">
          <span className="inline-flex items-center gap-1.5"><Clock3 size={14} aria-hidden="true" /> Active {formatDuration(job.activeMs)}</span>
          {job.targetSkids !== null && <span>Target: <strong className="text-foreground">{job.targetSkids} skids</strong></span>}
          {job.overdue && <span className="font-bold text-destructive">Overdue</span>}
        </div>
      </div>
      <div className="ml-[54px] sm:ml-auto"><Status job={job} /></div>
    </div>
    <div className="ml-0 mt-3 rounded-lg bg-[#f7fafb] px-3 py-3 sm:ml-[54px]"><JobTimes job={job} /></div>
  </article>;
}
