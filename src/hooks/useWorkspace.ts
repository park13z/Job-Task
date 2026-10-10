import { useCallback, useEffect, useRef, useState } from "react";
import type { Job, Line, User } from "../shared/contracts";
import { businessDate } from "../shared/time";
import { workspaceQuery, type Filters } from "./workspaceQuery";
import { shouldRefreshWorkspace, workspacePollDelay } from "./workspaceSync";
export type { Filters } from "./workspaceQuery";
import { api, ApiError } from "../lib/api";

type Summary = Awaited<ReturnType<typeof api.summary>>["data"];
type Me = Awaited<ReturnType<typeof api.me>>["data"];
type Workspace = { me: Me; lines: Line[]; jobs: Job[]; summary: Summary; cursor: string | null; revision: number; businessDate: string; syncedAt: number };
export type LoadState = { kind: "loading" } | { kind: "error"; message: string; status: number } | { kind: "ready"; value: Workspace; stale: boolean; message?: string };
export function useWorkspace(filters: Filters) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const refresh = useCallback(async (showLoading = false) => {
    const id = ++requestId.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    if (showLoading) setState({ kind: "loading" });
    try {
      const [me, lines] = await Promise.all([api.me(abort.signal), api.lines(abort.signal)]);
      const params = workspaceQuery(filtersRef.current);
      const summaryParams = new URLSearchParams(params);
      summaryParams.delete("limit");
      const [jobs, summary, changes] = await Promise.all([
        api.jobs(params, abort.signal), api.summary(summaryParams, abort.signal), api.changes(abort.signal),
      ]);
      if (id !== requestId.current) return;
      setState({ kind: "ready", stale: false, value: {
        me: me.data, lines: lines.data.lines, jobs: jobs.data.jobs, summary: summary.data,
        cursor: jobs.data.nextCursor, revision: changes.data.revision,
        businessDate: changes.data.businessDate, syncedAt: Date.now(),
      } });
    } catch (error) {
      if (abort.signal.aborted || id !== requestId.current) return;
      const message = error instanceof Error ? error.message : "Unable to load data";
      const status = error instanceof ApiError ? error.status : 0;
      const previous = stateRef.current;
      setState(status!==401 && previous.kind === "ready" && !showLoading
        ? { ...previous, stale: true, message } : { kind: "error", message, status });
    }
  }, []);

  useEffect(() => { void refresh(true); return () => { requestId.current++; controller.current?.abort(); }; }, [filters.week, filters.lineId, filters.status, refresh]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let errors = 0;
    let stopped = false;
    async function check() {
      if (stopped) return;
      const current = stateRef.current;
      if (current.kind === "ready" && document.visibilityState === "visible" && navigator.onLine) {
        try {
          const changes = await api.changes();
          errors = 0;
          if (shouldRefreshWorkspace(current.value, changes.data)) await refresh();
        } catch (error) {
          errors++;
          const message = error instanceof Error ? error.message : "Unable to sync data";
          setState(existing => error instanceof ApiError && error.status===401 ? {kind:"error",message,status:401} : existing.kind === "ready" ? { ...existing, stale: true, message } : existing);
        }
      }
      const role = stateRef.current.kind === "ready" ? stateRef.current.value.me.user.role : "assistant";
      timer = setTimeout(check, workspacePollDelay(role, errors));
    }
    const wake = () => { if (document.visibilityState === "visible" && navigator.onLine) void refresh(); };
    timer = setTimeout(check, 60_000);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", wake); window.removeEventListener("online", wake); };
  }, [refresh]);

  const loadMore = async () => {
    const current = stateRef.current;
    if (current.kind !== "ready" || !current.value.cursor) return;
    const cursor = current.value.cursor;
    const id = requestId.current;
    try {
      const page = await api.jobs(workspaceQuery(filtersRef.current, cursor));
      if (id !== requestId.current) return;
      setState(existing => existing.kind === "ready" && existing.value.cursor === cursor
        ? { ...existing, value: { ...existing.value, jobs: [...existing.value.jobs, ...page.data.jobs], cursor: page.data.nextCursor } } : existing);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load more tasks";
      setState(existing => existing.kind === "ready" ? { ...existing, stale: true, message } : existing);
    }
  };
  return { state, refresh, loadMore };
}

export const initialFilters: Filters = { week: businessDate(Date.now()), lineId: "", status: "" };
export type { Workspace };
