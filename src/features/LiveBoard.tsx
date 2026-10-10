import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CheckCircle2, Clock3, Maximize2, Minimize2, PauseCircle, PlayCircle, RefreshCw } from "lucide-react";
import { Button } from "../components/ui";
import type { Job, Line } from "../shared/contracts";
import { api } from "../lib/api";
import { businessDate, formatBusinessDate, formatDuration, formatInstant, TORONTO_TIME_ZONE } from "../shared/time";
import "./live-board.css";

type LiveData = Awaited<ReturnType<typeof api.live>>["data"];
type Lane = "inProgress" | "queued" | "done" | "paused";
const lanes: { id: Lane; label: string; empty: string; icon: typeof PlayCircle }[] = [
  { id: "done", label: "DONE", empty: "No jobs completed today", icon: CheckCircle2 },
  { id: "inProgress", label: "In Progressing", empty: "No jobs started today are running", icon: PlayCircle },
  { id: "paused", label: "Paused Today", empty: "No jobs started today are paused", icon: PauseCircle },
  { id: "queued", label: "Waiting Queue", empty: "No jobs waiting today", icon: Clock3 },
];

const clock = new Intl.DateTimeFormat("en-CA", {
  timeZone: TORONTO_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const jobStatusLabel: Record<Job["status"], string> = {
  done: "DONE", in_progress: "In Progressing", paused: "Paused", todo: "Waiting",
};
function shortTimestamp(instant: number, today: string): string {
  const day = businessDate(instant);
  return day === today ? clock.format(instant) : `${formatBusinessDate(day)} ${clock.format(instant)}`;
}

/** Three original anime-chibi workers lifted from the approved visual mockup. */
function LiveWorker({ variant }: { variant: number }) {
  return <span className={"live-worker live-worker-" + variant} aria-hidden="true">
    <span className="live-worker-upper" />
    <span className="live-worker-leg live-worker-leg-left" />
    <span className="live-worker-leg live-worker-leg-right" />
  </span>;
}

function LiveTask({ job, lines, today }: { job: Job; lines: Line[]; today: string }) {
  const line = lines.find(item => item.id === job.lineId);
  const active = job.status === "in_progress";
  const endTime = job.status === "done" ? job.completedAt : null;
  return <article className={"live-task live-task-" + job.status}>
    <div className="live-task-origin" data-label="Line">
      <strong className="live-line-pill">{line?.code ?? "Line"}</strong>
      <span className="live-task-sequence">#{job.dayOrder}</span>
    </div>
    <div className="live-task-main" data-label="Task / Product">
      <h4>{job.title}</h4>
      {job.description && <p className="live-task-description">{job.description}</p>}
    </div>
    <div className="live-task-fact live-target" data-label="Target">
      <strong>{job.targetSkids !== null ? job.targetSkids + " skids" : "—"}</strong>
    </div>
    {active && <div className="live-task-fact live-progress-cell" data-label="Progress">
      <div className="live-progress-track" role="img" aria-label="Indeterminate activity, not a completion percentage"><span /></div>
    </div>}
    <div className="live-task-fact live-start" data-label="Start Time">
      {job.startedAt !== null ? <time title={formatInstant(job.startedAt)}>{shortTimestamp(job.startedAt, today)}</time> : "—"}
    </div>
    <div className="live-task-fact live-end" data-label={job.status === "done" ? "End Time" : "Est. End"}>
      {endTime !== null ? <time title={formatInstant(endTime)}>{shortTimestamp(endTime, today)}</time> : <span title="No estimated end time recorded">—</span>}
    </div>
    <div className="live-task-fact live-active" data-label="Active Time">
      <strong>{job.startedAt !== null ? formatDuration(job.activeMs) : "—"}</strong>
    </div>
    <div className="live-task-fact live-status" data-label="Status">
      <span className="live-task-state">{active ? <PlayCircle size={14} aria-hidden="true" /> :
        job.status === "done" ? <CheckCircle2 size={14} aria-hidden="true" /> :
        job.status === "paused" ? <PauseCircle size={14} aria-hidden="true" /> : <Clock3 size={14} aria-hidden="true" />}
        {jobStatusLabel[job.status]}</span>
    </div>
    {active && <div className="live-worker-track" aria-hidden="true">{[0, 1, 2].map(variant =>
      <div className={"live-worker-pacer live-worker-pacer-" + variant} key={variant}>
        <LiveWorker variant={variant} />
      </div>)}</div>}
  </article>;
}

export function LiveBoard({ lines }: { lines: Line[] }) {
  const [data, setData] = useState<LiveData | null>(null);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await api.live(signal);
      if (signal?.aborted) return;
      setData(response.data);
      setUpdatedAt(Date.now());
      setError("");
    } catch (reason) {
      if (signal?.aborted) return;
      setError(reason instanceof Error ? reason.message : "Unable to load live jobs.");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const tick = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void refresh(controller.signal);
    };
    const timer = window.setInterval(tick, 15_000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("online", tick);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("online", tick);
    };
  }, [refresh]);

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === boardRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  // Measure the real rendered content at each density, rather than assuming
  // all jobs have the same height. Long names remain readable and may wrap.
  useLayoutEffect(() => {
    if (!data) return;
    const fit = () => {
      const board = boardRef.current;
      if (!board) return;
      const full = document.fullscreenElement === board;
      const available = full ? board.clientHeight
        : Math.max(0, window.innerHeight - board.getBoundingClientRect().top - 16);
      const modes = ["comfortable", "compact", "dense", "ultra"] as const;
      let chosen: typeof modes[number] = "ultra";
      for (const mode of modes) {
        board.dataset.density = mode;
        if (board.scrollHeight <= available + 2) { chosen = mode; break; }
      }
      board.dataset.density = chosen;
      setOverflow(board.scrollHeight > available + 2);
    };
    const frame = window.requestAnimationFrame(fit);
    window.addEventListener("resize", fit);
    document.addEventListener("fullscreenchange", fit);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", fit);
      document.removeEventListener("fullscreenchange", fit);
    };
  }, [data, fullscreen, error]);

  // An unbounded number of jobs cannot physically fit a finite screen while
  // staying legible. Full-screen signage cycles through remaining rows.
  useEffect(() => {
    if (!fullscreen || !overflow) return;
    const timer = window.setInterval(() => {
      const board = boardRef.current;
      if (!board || document.visibilityState !== "visible") return;
      const bottom = board.scrollHeight - board.clientHeight;
      if (bottom <= 0) return;
      if (board.scrollTop >= bottom - 3) board.scrollTo({ top: 0, behavior: "smooth" });
      else board.scrollTo({ top: Math.min(bottom, board.scrollTop + board.clientHeight * 0.55), behavior: "smooth" });
    }, 6000);
    return () => window.clearInterval(timer);
  }, [fullscreen, overflow]);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === boardRef.current) await document.exitFullscreen();
      else await boardRef.current?.requestFullscreen();
    } catch {
      setError("Full screen is unavailable in this browser.");
    }
  }

  return <div className="live-board" ref={boardRef} aria-label="Live jobs today">
    <div className="live-board-header">
      <div>
        <p className="section-eyebrow">TODAY · AMERICA/TORONTO</p>
        <h2 className="live-board-title">Live Job Board</h2>
        <p className="section-description">Only today's starts, completions and waiting queue. Past jobs are in Dashboard.</p>
      </div>
      <div className="live-board-actions">
        <p className="text-sm font-semibold">{data ? formatBusinessDate(data.date) : "Today"}</p>
        <Button variant="outline" onClick={() => void refresh()} aria-label="Refresh live board"><RefreshCw size={16} aria-hidden="true" />Refresh</Button>
        <Button variant="outline" onClick={() => void toggleFullscreen()} aria-label={fullscreen ? "Exit full screen" : "Full screen"}>
          {fullscreen ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
          {fullscreen ? "Exit full screen" : "Full screen"}
        </Button>
      </div>
    </div>
    {error && <p role="alert" className="live-board-error">{error}{data ? " Displaying last successful update." : ""}</p>}
    {!data ? !error && <p role="status" className="app-empty-state">Loading live jobs…</p> : <>
      <p className="live-board-sync" role="status">Auto-refresh every 15 seconds · {updatedAt ? "Updated " + formatInstant(updatedAt) : "Waiting for data"} · {lanes.reduce((total, lane) => total + data[lane.id].length, 0)} jobs total{overflow ? fullscreen ? " · Auto-scrolling to show all jobs" : " · Scroll to see all jobs" : " · All jobs fit"}</p>
      <div className="live-board-grid">
        {lanes.map(lane => <section className={"live-lane live-lane-" + lane.id} key={lane.id} aria-label={lane.label}>
          <div className="live-lane-header">
            <div className="flex items-center gap-2"><lane.icon size={21} aria-hidden="true" /><h3>{lane.label}</h3></div>
            <strong className="live-lane-count">{data[lane.id].length}</strong>
          </div>
          {data[lane.id].length > 0 && <div className="live-column-headings" aria-hidden="true">
            <span>Line</span><span>Task / Product</span><span>Target</span>
            {lane.id === "inProgress" && <span>Progress</span>}
            <span>Start Time</span><span>{lane.id === "done" ? "End Time" : "Est. End"}</span>
            <span>Active Time</span><span>Status</span>
          </div>}
          <div className="live-lane-tasks">
            {data[lane.id].length === 0
              ? <p className="live-lane-empty">{lane.empty}</p>
              : data[lane.id].map(job => <LiveTask key={job.id} job={job} lines={lines} today={data.date} />)}
          </div>
        </section>)}
      </div>
    </>}
  </div>;
}
