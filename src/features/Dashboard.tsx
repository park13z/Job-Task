import { Activity, AlertCircle, CheckCheck, ClipboardList, Clock3, PauseCircle, PlayCircle } from "lucide-react";
import { formatDuration } from "../shared/time";
import type { Workspace } from "../hooks/useWorkspace";
import { DashboardJobRow } from "./DashboardJobRow";

export function Dashboard({ value }: { value: Workspace }) {
  const { summary, jobs, lines } = value;
  const cards = [
    { label: "To do", count: summary.todo, icon: ClipboardList, tone: "todo", sub: "Waiting to start" },
    { label: "In progress", count: summary.inProgress, icon: PlayCircle, tone: "progress", sub: "Currently running" },
    { label: "Paused", count: summary.paused, icon: PauseCircle, tone: "paused", sub: "On hold" },
    { label: "Done", count: summary.done, icon: CheckCheck, tone: "done", sub: "Completed work" },
  ];

  return <section className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="section-eyebrow">PRODUCTION AT A GLANCE</p><h2 className="section-title mt-1">Dashboard</h2><p className="section-description">Task overview for the selected week and filters</p></div>
      <span className="rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold text-muted-foreground">Weekly performance</span>
    </div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {cards.map(card => <div key={card.label} className={"kpi-card kpi-" + card.tone}>
        <div className="flex items-start justify-between gap-2"><p className="kpi-name">{card.label}</p><span className="kpi-icon"><card.icon size={19} aria-hidden="true" /></span></div>
        <p className="kpi-value mt-1">{card.count}</p><p className="mt-2 text-[11px] text-muted-foreground">{card.sub}</p>
      </div>)}
    </div>
    <div className="surface-card flex flex-wrap items-center gap-0 divide-x divide-border overflow-hidden">
      <div className="flex min-w-[130px] flex-1 items-center gap-3 px-4 py-4 sm:px-6"><ClipboardList size={19} className="text-primary" aria-hidden="true" /><div><p className="text-[11px] font-medium text-muted-foreground">Total tasks</p><strong className="text-xl font-extrabold tabular-nums">{summary.total}</strong></div></div>
      <div className="flex min-w-[130px] flex-1 items-center gap-3 px-4 py-4 sm:px-6"><AlertCircle size={19} className="text-[#aa6713]" aria-hidden="true" /><div><p className="text-[11px] font-medium text-muted-foreground">Overdue</p><strong className="text-xl font-extrabold tabular-nums">{summary.overdue}</strong></div></div>
      <div className="flex min-w-[150px] flex-1 items-center gap-3 px-4 py-4 sm:px-6"><Clock3 size={19} className="text-primary" aria-hidden="true" /><div><p className="text-[11px] font-medium text-muted-foreground">Total active time</p><strong className="text-xl font-extrabold tabular-nums">{formatDuration(summary.activeMs)}</strong></div></div>
    </div>

    <div className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
        <div><p className="section-eyebrow">WEEKLY WORK QUEUE</p><h3 className="mt-1 text-[17px] font-extrabold tracking-tight">Production schedule</h3></div>
        <span className="inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs font-bold text-[#526c78]"><Activity size={14} aria-hidden="true" /> {jobs.length} shown</span>
      </div>
      {jobs.length === 0 ? <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground"><ClipboardList size={28} className="text-[#9caeb6]" aria-hidden="true" /><p>No tasks in the selected period</p></div>
        : <div className="divide-y divide-[#e9eef0]">{jobs.map(job => <DashboardJobRow key={job.id} job={job} lines={lines} />)}</div>}
    </div>
  </section>;
}
