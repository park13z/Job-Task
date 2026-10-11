import { useEffect, useState } from "react";
import { Activity, CalendarDays, ChevronLeft, ChevronRight, Clock3, LayoutDashboard, ListTodo, Radio, RefreshCw, Settings2, ShieldCheck, UserRound, Warehouse } from "lucide-react";
import { Button, Input, Select } from "./components/ui";
import { api } from "./lib/api";
import { SignIn } from "./features/SignIn";
import { ChangePassword } from "./features/ChangePassword";
import { UserProfile } from "./features/UserProfile";
import { Dashboard } from "./features/Dashboard";
import { FillTask } from "./features/FillTask";
import { Jobs } from "./features/Jobs";
import { LiveBoard } from "./features/LiveBoard";
import { TeamSettings } from "./features/TeamSettings";
import type { TeamSection } from "./features/TeamSettingsNavigation";
import { initialFilters, useWorkspace } from "./hooks/useWorkspace";
import { addDays, formatBusinessDate, formatInstant, mondayWeekRange, businessDate, isoWeekStart, isoWeekValue } from "./shared/time";
import { isPlanner } from "./shared/workflow";

type Page = "dashboard" | "fill" | "jobs" | "live" | "settings" | "profile";
const pagePaths: Record<Page, string> = {
  dashboard: "/dashboard",
  fill: "/fill-task",
  jobs: "/job",
  live: "/live",
  settings: "/team-settings",
  profile: "/profile",
};
const teamPaths: Record<TeamSection, string> = {
  users: "/team-settings/users",
  lines: "/team-settings/lines",
  members: "/team-settings/members",
  catalog: "/team-settings/job-list",
};
function teamSectionFromPath(path: string): TeamSection {
  return (Object.keys(teamPaths) as TeamSection[]).find(section => teamPaths[section] === path) ?? "users";
}
function pageFromPath(path: string): Page {
  if (Object.values(teamPaths).includes(path)) return "settings";
  return (Object.keys(pagePaths) as Page[]).find(page => pagePaths[page] === path) ?? "dashboard";
}
const navigation = [
  { id: "dashboard", label: "Dashboard", sub: "Overview", icon: LayoutDashboard },
  { id: "fill", label: "Fill Task", sub: "Plan work", icon: CalendarDays },
  { id: "jobs", label: "Job", sub: "Task execution", icon: ListTodo },
  { id: "live", label: "Live", sub: "Today only", icon: Radio },
] as const;

export default function App() {
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState<Page>(() => pageFromPath(window.location.pathname));
  const [teamSection, setTeamSection] = useState<TeamSection>(() => teamSectionFromPath(window.location.pathname));
  useEffect(() => {
    // History API keeps the requested tab in the URL without refreshing data.
    // popstate is necessary for Back/Forward and direct deep-link navigation.
    const syncFromAddress = () => {
      const resolved = pageFromPath(window.location.pathname);
      const nestedSettings = Object.values(teamPaths).includes(window.location.pathname);
      if (!nestedSettings && window.location.pathname !== pagePaths[resolved]) {
        window.history.replaceState(window.history.state, "", pagePaths[resolved]);
      }
      setPage(resolved);
      setTeamSection(teamSectionFromPath(window.location.pathname));
    };
    syncFromAddress();
    window.addEventListener("popstate", syncFromAddress);
    return () => window.removeEventListener("popstate", syncFromAddress);
  }, []);
  const navigate = (target: Page) => {
    const path = pagePaths[target];
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
    if (target === "settings") setTeamSection("users");
    setPage(target);
  };
  const navigateTeamSection = (section: TeamSection) => {
    const path = teamPaths[section];
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
    setTeamSection(section);
  };
  const [changePasswordOpen,setChangePasswordOpen]=useState(false);
  const { state, refresh, loadMore } = useWorkspace(filters);
  const range = mondayWeekRange(filters.week);
  const shiftWeek = (days: number) => setFilters(current => ({ ...current, week: addDays(current.week, days) }));
  const user = state.kind === "ready" ? state.value.me.user : null;
  useEffect(() => {
    // URL entry must not bypass the existing role-based page visibility.
    // The server still enforces every permission on API routes.
    if (!user) return;
    if ((page === "fill" && !isPlanner(user.role)) || (page === "settings" && user.role !== "manager")) {
      window.history.replaceState(window.history.state, "", pagePaths.dashboard);
      setPage("dashboard");
    }
  }, [page, user]);
  const current = page === "settings" ? { label: "Team Settings", sub: "Manage workspace" } : page === "profile" ? { label: "User Profile", sub: "My account" } : navigation.find(item => item.id === page) ?? navigation[0];

  if(state.kind==="error"&&state.status===401)return <SignIn onSuccess={()=>refresh(true)}/>;
  return <div className="app-shell">
    <aside className="app-sidebar">
      <div className="app-brand">
        <div className="app-brand-mark" aria-hidden="true"><Warehouse size={23} strokeWidth={2} /></div>
        <div className="min-w-0">
          <h1 className="app-brand-title">Job Task</h1>
          <p className="app-brand-caption">PRODUCTION OPERATIONS</p>
        </div>
      </div>
      <div className="app-side-label">WORKSPACE</div>
      <nav aria-label="Main navigation" className="app-nav">
        {navigation.filter(item => item.id !== "fill" || !user || isPlanner(user.role)).map(item => <Button
          key={item.id}
          variant="ghost"
          className={"app-nav-item " + (page === item.id ? "is-active" : "")}
          aria-label={item.label}
          aria-current={page === item.id ? "page" : undefined}
          onClick={() => navigate(item.id)}
        >
          <item.icon size={20} strokeWidth={1.9} aria-hidden="true" />
          <span className="app-nav-text"><strong>{item.label}</strong><small>{item.sub}</small></span>
        </Button>)}
      </nav>
      <div className="app-sidebar-foot">
        <div className="app-profile">
          <div className="app-avatar" aria-hidden="true">{(user?.name ?? "JT").slice(0, 2).toUpperCase()}</div>
          <div className="min-w-0"><div className="truncate text-sm font-semibold">{user?.name ?? "Job Task"}</div><div className="truncate text-xs text-white/60">{user?.role.replace("_", " ") ?? "Operations workspace"}</div></div>
        </div>
        {user && <div className="space-y-1 border-t border-[#31515b] pt-2">
          <Button variant="ghost" aria-label="User Profile" aria-current={page === "profile" ? "page" : undefined} className={"app-settings-button " + (page === "profile" ? "!bg-[#234c50] !text-white" : "")} onClick={() => navigate("profile")}><UserRound size={18} aria-hidden="true" /><span>User Profile</span></Button>
          <Button variant="ghost" className="app-settings-button" onClick={()=>void api.logout().finally(()=>void refresh(true))}>Sign out</Button>
        </div>}
        {user?.role === "manager" && <Button variant="ghost" aria-current={page === "settings" ? "page" : undefined} className={"app-settings-button "+(page==="settings" ? "!bg-[#234c50] !text-white" : "")} aria-label="Team Settings" onClick={() => navigate("settings")}><Settings2 size={18} aria-hidden="true" /><span>Team Settings</span></Button>}
      </div>
    </aside>

    <main className="app-main">
      <header className="app-topbar">
        <div>
          <p className="app-eyebrow">OPERATIONS / {current.sub.toUpperCase()}</p>
          <div className="flex flex-wrap items-center gap-3"><p className="app-topbar-title">{current.label === "Job" ? "Job execution" : current.label}</p><span className="app-workspace-tag"><span className="app-live-dot" /> PACKHOUSE</span></div>
        </div>
        <div className="app-topbar-meta"><Clock3 size={16} aria-hidden="true" /><span>Toronto time</span><span className="app-topbar-divider" /><strong>{state.kind === "ready" ? formatBusinessDate(state.value.businessDate) : "America/Toronto"}</strong></div>
      </header>

      <div className="app-content">
        {page !== "settings" && page !== "profile" && page !== "live" && <section className="app-toolbar" aria-label="Week and task filters">
          <div className="app-week-control">
            <span className="app-control-label">PRODUCTION WEEK · MON–SUN</span>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" aria-label="Previous week" className="app-icon-button" onClick={() => shiftWeek(-7)}><ChevronLeft size={19} /></Button>
              <span className="app-week-range">{formatBusinessDate(range.from)} <span className="text-muted-foreground">–</span> {formatBusinessDate(range.to)}</span>
              <Button variant="outline" aria-label="Next week" className="app-icon-button" onClick={() => shiftWeek(7)}><ChevronRight size={19} /></Button>
            </div>
          </div>
          {page === "dashboard" && <div className="app-week-picker">
            <label className="app-control-label" htmlFor="dashboard-week">SELECT WEEK</label>
            <Input id="dashboard-week" type="week" value={isoWeekValue(filters.week)} onChange={event => {
              const week = isoWeekStart(event.target.value);
              if (week) setFilters(current => ({ ...current, week }));
            }} />
          </div>}
          <Button variant="outline" className="app-this-week" onClick={() => setFilters(current => ({ ...current, week: businessDate(Date.now()) }))}>This week</Button>
          {state.kind === "ready" && <>
            <div className="app-toolbar-filter"><span className="app-control-label">PRODUCTION LINE</span><Select label="Filter by line" value={filters.lineId || "all"} onValueChange={value => setFilters(current => ({ ...current, lineId: value === "all" ? "" : value }))} options={[{ value: "all", label: "All lines" }, ...state.value.lines.map(line => ({ value: line.id, label: line.code + " · " + line.name }))]} /></div>
            <div className="app-toolbar-filter"><span className="app-control-label">TASK STATUS</span><Select label="Filter by status" value={filters.status || "all"} onValueChange={value => setFilters(current => ({ ...current, status: value === "all" ? "" : value }))} options={[{ value: "all", label: "All statuses" }, { value: "todo", label: "To do" }, { value: "in_progress", label: "In progress" }, { value: "paused", label: "Paused" }, { value: "done", label: "Done" }]} /></div>
          </>}
        </section>}

        {state.kind === "loading" ? <div role="status" className="app-empty-state"><RefreshCw className="animate-spin text-primary" size={24} /><p>Loading tasks…</p></div> : state.kind === "error" ? <div role="alert" className="app-empty-state"><ShieldCheck className="text-destructive" size={30} /><h2 className="font-semibold">{state.status === 403 ? "Access denied" : state.status === 503 ? "System unavailable" : "Unable to load data"}</h2><p className="text-sm text-muted-foreground">{state.message}</p><Button onClick={() => void refresh(true)}>Try again</Button></div> : <>
          <div className="app-sync-bar">
            <span className="inline-flex items-center gap-2"><span className={state.stale ? "app-warning-dot" : "app-live-dot"} /><span className="font-medium">{state.stale ? "Data may be outdated" : "System up to date"}</span><span className="app-sync-divider">·</span><span>Last synced {formatInstant(state.value.syncedAt)}</span></span>
            <Button variant="ghost" className="app-refresh-button" onClick={() => void refresh()}><RefreshCw size={15} aria-hidden="true" />Refresh</Button>
          </div>
          {state.stale && <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-card px-4 py-3 text-sm text-destructive">{state.message ?? "Unable to sync data"} <Button variant="outline" onClick={() => void refresh()}>Try again</Button></div>}
          {page === "settings" && state.value.me.user.role === "manager" ? <TeamSettings lines={state.value.lines} refresh={refresh} actorId={state.value.me.user.id} section={teamSection} onSectionSelect={navigateTeamSection} /> : page === "profile" ? <UserProfile key={state.value.me.user.id} user={state.value.me.user} refresh={refresh} onChangePassword={() => setChangePasswordOpen(true)} /> : page === "live" ? <LiveBoard lines={state.value.lines} /> : page === "dashboard" ? <Dashboard value={state.value} /> : page === "fill" && isPlanner(state.value.me.user.role) ? <FillTask week={filters.week} lines={state.value.lines} jobs={state.value.jobs} refresh={refresh} /> : <Jobs jobs={state.value.jobs} lines={state.value.lines} user={state.value.me.user} businessDate={state.value.businessDate} refresh={refresh} />}
          {page !== "settings" && page !== "profile" && page !== "live" && state.value.cursor && <div className="mt-6 text-center"><Button variant="outline" onClick={() => void loadMore()}>Load more tasks</Button></div>}
        </>}
        <footer className="app-footer"><span>Developed by Sanongboon Poona / Truly Green Farms · © 2026 · MIT License</span><span className="inline-flex items-center gap-1.5"><Activity size={13} aria-hidden="true" /> America/Toronto · Local production schedule</span></footer>
      </div>
    </main>
    <ChangePassword open={changePasswordOpen} onClose={()=>setChangePasswordOpen(false)} onChanged={()=>refresh(true)}/>
  </div>;
}
