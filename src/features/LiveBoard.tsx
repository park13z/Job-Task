import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CheckCircle2, Clock3, Maximize2, Minimize2, PauseCircle, PlayCircle, RefreshCw } from "lucide-react";
import { Button } from "../components/ui";
import { LiveTask } from "./LiveTask";
import { LiveWalkers } from "./live-animation/LiveWalkers";
import type { Line } from "../shared/contracts";
import { api } from "../lib/api";
import { formatBusinessDate, formatInstant } from "../shared/time";
import "./live-board.css";

type LiveData = Awaited<ReturnType<typeof api.live>>["data"];
type Lane = "inProgress" | "queued" | "done" | "paused";
const lanes: { id: Lane; label: string; empty: string; icon: typeof PlayCircle }[] = [
  { id: "done", label: "DONE", empty: "No jobs completed today", icon: CheckCircle2 },
  { id: "inProgress", label: "In Progressing", empty: "No jobs currently running", icon: PlayCircle },
  { id: "paused", label: "Paused", empty: "No jobs currently paused", icon: PauseCircle },
  { id: "queued", label: "Waiting Queue", empty: "No unstarted jobs due today or earlier", icon: Clock3 },
];


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
        <p className="section-description">Unstarted work due today or earlier, all ongoing/paused work, and today's completions. Future unstarted jobs stay in Job.</p>
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
            {lane.id === "inProgress" && data.inProgress.length > 0 && <LiveWalkers />}
          </div>
        </section>)}
      </div>
    </>}
  </div>;
}
