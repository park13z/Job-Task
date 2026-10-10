import { useRef, useState } from "react";
import { AlertCircle, Check, Clock3, History, Pause, Play, RotateCcw, Target } from "lucide-react";
import type { Job, JobAction, JobEvent, Line, User } from "../shared/contracts";
import { availableActions, isPlanner } from "../shared/workflow";
import { formatBusinessDate, formatDuration, formatInstant } from "../shared/time";
import { api, ApiError } from "../lib/api";
import { friendlyError, operationKey, type Pending } from "../lib/operation";
import { Button, Dialog } from "../components/ui";

const labels: Record<JobAction, string> = { start: "Start", pause: "Pause", resume: "Resume", done: "Done" };
const actionIcons = { start: Play, pause: Pause, resume: RotateCcw, done: Check } as const;

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

export function Jobs({ jobs, lines, user, businessDate, refresh }: { jobs: Job[]; lines: Line[]; user: User; businessDate: string; refresh: () => Promise<void> }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<Job | null>(null);
  const [timeline, setTimeline] = useState<{ job: Job; events: JobEvent[] } | null>(null);
  const [timelineError, setTimelineError] = useState("");
  const pending = useRef<{ jobId: string; action: JobAction; request: Pending } | null>(null);
  const canAct = (job: Job) => user.active && lines.some(line => line.id === job.lineId && line.active && (isPlanner(user.role) || line.memberIds.includes(user.id)));
  const act = async (job: Job, action: JobAction) => {
    const body = { expectedVersion: job.version };
    const request = pending.current?.jobId === job.id && pending.current.action === action ? operationKey(pending.current.request, body) : operationKey(null, body);
    pending.current = { jobId: job.id, action, request }; setBusyId(job.id); setMessage("");
    try { await api.action(job.id, action, body, request.key); pending.current = null; setConfirm(null); await refresh(); }
    catch (error) { setMessage(friendlyError(error)); if (error instanceof ApiError && error.status === 409) { pending.current = null; setConfirm(null); await refresh(); } }
    finally { setBusyId(null); }
  };
  const openTimeline = async (job: Job) => {
    setTimeline({ job, events: [] }); setTimelineError("");
    try { const response = await api.events(job.id); setTimeline({ job, events: [...response.data.events].sort((a, b) => a.version - b.version) }); }
    catch (error) { setTimelineError(friendlyError(error)); }
  };
  return <section className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="section-eyebrow">FLOOR EXECUTION</p><h2 className="section-title mt-1">Job</h2><p className="section-description">Live tasks ordered by date and production sequence</p></div>
      <span className="rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold text-muted-foreground">{jobs.length} tasks shown</span>
    </div>
    {message && <p role="alert" className="rounded-lg border border-[#e5baba] bg-white p-4 text-sm text-destructive">{message}</p>}
    {jobs.length === 0 ? <div className="app-empty-state"><Clock3 size={26} className="text-[#90a7ad]" /><p>No tasks in the selected period</p></div> : <div className="space-y-3">
      {jobs.map(job => <article key={job.id} className={"task-card overflow-hidden is-" + (job.status === "in_progress" ? "active" : job.status)}>
        <div className="px-4 py-4 sm:px-5 sm:py-5">
          <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
            <div className="task-sequence" aria-label={"Daily order " + job.dayOrder}>{job.dayOrder}</div>
            <div className="min-w-0 flex-1"><p className="task-meta">{formatBusinessDate(job.workDate)} <span className="mx-2 text-[#b4c4c9]">/</span>{lines.find(line => line.id === job.lineId)?.code ?? "Line"}</p><h3 className="mt-1.5 text-base font-extrabold leading-snug tracking-tight text-[#1d3845] sm:text-[17px]">{job.title}</h3>{job.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{job.description}</p>}</div>
            <Status job={job} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2.5 sm:ml-[54px]">
            <span className="inline-flex items-center gap-2 rounded-lg bg-[#ecf5f4] px-3 py-2 text-[13px] font-extrabold text-[#1b7369]"><Clock3 size={16} aria-hidden="true" /> {formatDuration(job.activeMs)} <span className="text-[10px] font-medium text-[#497e77]">ACTIVE</span></span>
            {job.targetSkids !== null && <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#f1f5f6] px-3 py-2 text-xs font-bold text-[#3d5763]"><Target size={15} aria-hidden="true" /> Target {job.targetSkids} skids</span>}
            {job.overdue && <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-destructive"><AlertCircle size={15} aria-hidden="true" /> Overdue</span>}
          </div>
          <div className="mt-4 rounded-lg border border-[#e7edef] bg-[#fafcfc] px-3 py-3 sm:ml-[54px]"><JobTimes job={job} /></div>
        </div>
        <div className="task-action-row flex flex-wrap items-center gap-2 px-4 py-3 sm:justify-end sm:px-5">
          <Button variant="outline" className="mr-auto" onClick={() => void openTimeline(job)}><History size={16} aria-hidden="true" /> History</Button>
          {canAct(job) && availableActions(job.status).filter(action => action !== "start" || job.workDate <= businessDate).map(action => {
            const ActionIcon = actionIcons[action];
            return <Button key={action} variant={action === "done" ? "danger" : "primary"} className="min-w-[100px] max-sm:flex-1" disabled={busyId === job.id} onClick={() => action === "done" ? setConfirm(job) : void act(job, action)}><ActionIcon size={16} aria-hidden="true" />{busyId === job.id ? "Saving…" : labels[action]}</Button>;
          })}
        </div>
      </article>)}
    </div>}
    <Dialog open={confirm !== null} onOpenChange={open => { if (!open) setConfirm(null); }} title="Confirm completion">{confirm && <div className="space-y-4"><p>Mark this task as done: “{confirm.title}”?</p><div className="flex gap-2"><Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button><Button variant="danger" disabled={busyId === confirm.id} onClick={() => void act(confirm, "done")}>Confirm Done</Button></div></div>}</Dialog>
    <Dialog open={timeline !== null} onOpenChange={open => { if (!open) setTimeline(null); }} title="Task history">{timeline && <div><p className="mb-3 font-semibold">{timeline.job.title}</p>{timelineError ? <p role="alert">{timelineError}</p> : timeline.events.length === 0 ? <p>Loading history…</p> : <ol className="space-y-3 border-l-2 border-secondary pl-4">{timeline.events.map(event => <li key={event.id} className="text-sm"><strong>{event.eventType}</strong> · {formatInstant(event.happenedAt)}<br /><span className="text-muted-foreground">{event.actor.name}</span></li>)}</ol>}</div>}</Dialog>
  </section>;
}
