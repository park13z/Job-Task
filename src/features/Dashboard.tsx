import { Fragment } from "react";
import { Activity, AlertCircle, CheckCheck, ClipboardList, Clock3, PauseCircle, PlayCircle } from "lucide-react";
import { formatBusinessDate, formatDuration } from "../shared/time";
import type { Workspace } from "../hooks/useWorkspace";
import { DashboardJobRow } from "./DashboardJobRow";

export function Dashboard({ value }: { value: Workspace }) {
  const { summary, jobs, lines } = value;
  const cards = [
    { label: "To do", count: summary.todo, icon: ClipboardList, tone: "todo" },
    { label: "In progress", count: summary.inProgress, icon: PlayCircle, tone: "progress" },
    { label: "Paused", count: summary.paused, icon: PauseCircle, tone: "paused" },
    { label: "Done", count: summary.done, icon: CheckCheck, tone: "done" },
  ];
  const tasksPerDate = new Map<string, number>();
  for (const job of jobs) tasksPerDate.set(job.workDate, (tasksPerDate.get(job.workDate) ?? 0) + 1);

  return <section className="space-y-4">
    <div className="surface-card dashboard-summary" aria-label="Task summary">
      {cards.map(card => <div key={card.label} className={"summary-metric summary-status kpi-" + card.tone}>
        <p className="summary-label"><card.icon size={15} aria-hidden="true" />{card.label}</p>
        <strong className="summary-value">{card.count}</strong>
      </div>)}
      <div className="summary-metric summary-stat"><p className="summary-label"><ClipboardList size={15} aria-hidden="true" />Total tasks</p><strong className="summary-value">{summary.total}</strong></div>
      <div className="summary-metric summary-stat"><p className="summary-label"><AlertCircle size={15} className="text-[#9a4a00]" aria-hidden="true" />Overdue</p><strong className="summary-value">{summary.overdue}</strong></div>
      <div className="summary-metric summary-stat"><p className="summary-label"><Clock3 size={15} aria-hidden="true" />Active time</p><strong className="summary-value summary-duration">{formatDuration(summary.activeMs)}</strong></div>
    </div>

    <div className="surface-card dashboard-schedule">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-base font-extrabold tracking-tight">Production schedule</h2>
        <span className="inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs font-bold text-[#526c78]"><Activity size={14} aria-hidden="true" /> {jobs.length} shown</span>
      </div>
      {jobs.length === 0 ? <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground"><ClipboardList size={28} className="text-[#9caeb6]" aria-hidden="true" /><p>No tasks in the selected period</p></div>
        : <div>
          <div className="dash-columns" aria-hidden="true"><span>#</span><span>Line</span><span>Task</span><span>Target</span><span>Status</span><span>Active</span><span>Times</span></div>
          {jobs.map((job, index) => <Fragment key={job.id}>
          {(index === 0 || jobs[index - 1].workDate !== job.workDate) && <div className="date-group"><span>{formatBusinessDate(job.workDate)}</span><span className="font-medium">{tasksPerDate.get(job.workDate)} {tasksPerDate.get(job.workDate) === 1 ? "task" : "tasks"}</span></div>}
          <DashboardJobRow job={job} lines={lines} />
        </Fragment>)}</div>}
    </div>
  </section>;
}
