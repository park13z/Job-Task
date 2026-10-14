import { useEffect, useState } from "react";
import { Activity, CalendarDays, ChevronLeft, ChevronRight, Clock3, LayoutDashboard, ListTodo, LogOut, MoreHorizontal, Radio, RefreshCw, Settings2, ShieldCheck, UserRound, Warehouse } from "lucide-react";
import { Button, Dialog, Input, Select } from "./components/ui";
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
import { addDays, formatBusinessDate, formatInstant, mondayWeekRange, businessDate, isoWeekStart, isoWeekValue, TORONTO_TIME_ZONE } from "./shared/time";
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
  displays: "/team-settings/displays",
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
  const [moreOpen, setMoreOpen] = useState(false);
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
    setMoreOpen(false);
    const path = pagePaths[target];
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
    if (target === "settings") setTeamSection(user?.role === "supervisor" ? "lines" : "users");
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
    if ((page === "fill" && !isPlanner(user.role)) || (page === "settings" && !isPlanner(user.role))) {
      window.history.replaceState(window.history.state, "", pagePaths.dashboard);
      setPage("dashboard");
    } else if (page === "settings" && user.role === "supervisor" && teamSection !== "lines" && teamSection !== "catalog") {
      window.history.replaceState(window.history.state, "", teamPaths.lines);
      setTeamSection("lines");
    }
  }, [page, teamSection, user]);
  const current = page === "settings" ? { label: "Team Settings", sub: "Manage workspace" } : page === "profile" ? { label: "User Profile", sub: "My account" } : navigation.find(item => item.id === page) ?? navigation[0];
  const syncedTime = state.kind === "ready" ? new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(state.value.syncedAt) : null;

  if(state.kind==="error"&&state.status===401)return <SignIn onSuccess={()=>refresh(true)}/>;
  return <div className="app-shell">
    <aside className="app-sidebar">
      <div className="app-brand">
        <div className="app-brand-mark" aria-hidden="true"><Warehouse size={23} strokeWidth={2} /></div>
        <div className="min-w-0">
          <div className="app-brand-title">Job Task</div>
          <p className="app-brand-caption">Production operations</p>
        </div>
      </div>
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
          <span className="app-nav-text"><strong>{item.id === "dashboard" ? <><span className="app-nav-full-label">Dashboard</span><span className="app-nav-short-label">Dash</span></> : item.label}</strong><small>{item.sub}</small></span>
        </Button>)}
        {user && <Dialog open={moreOpen} onOpenChange={setMoreOpen} title="Workspace menu" trigger={
          <Button variant="ghost" className={"app-nav-item app-more-button " + (page === "settings" || page === "profile" ? "is-active" : "")} aria-label="More">
            <MoreHorizontal size={20} aria-hidden="true" /><span className="app-nav-text"><strong>More</strong></span>
          </Button>
        }>
          <div className="space-y-2">
            <p className="mb-4 text-sm text-muted-foreground">{user.name} · {user.role.replace("_", " ")}</p>
            <Button variant="outline" className="w-full justify-start" onClick={() => navigate("profile")}><UserRound size={18} aria-hidden="true" />User Profile</Button>
            {isPlanner(user.role) && <Button variant="outline" className="w-full justify-start" onClick={() => navigate("settings")}><Settings2 size={18} aria-hidden="true" />Team Settings</Button>}
            <Button variant="ghost" className="w-full justify-start" onClick={() => { setMoreOpen(false); void api.logout().finally(() => void refresh(true)); }}><LogOut size={18} aria-hidden="true" />Sign out</Button>
          </div>
        </Dialog>}
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
        {user && isPlanner(user.role) && <Button variant="ghost" aria-current={page === "settings" ? "page" : undefined} className={"app-settings-button "+(page==="settings" ? "!bg-[#234c50] !text-white" : "")} aria-label="Team Settings" onClick={() => navigate("settings")}><Settings2 size={18} aria-hidden="true" /><span>Team Settings</span></Button>}
      </div>
    </aside>

    <main className="app-main">
      <header className="app-topbar">
        <div>
          <h1 className="app-topbar-title">{current.label}</h1>
          <div className="app-topbar-meta"><Clock3 size={14} aria-hidden="true" /><span>Toronto · {state.kind === "ready" ? formatBusinessDate(state.value.businessDate) : "America/Toronto"}</span></div>
        </div>
        {state.kind === "ready" && <div className="app-sync-bar">
          <span className="app-sync-indicator" title={"Last synced " + formatInstant(state.value.syncedAt)}><span className={state.stale ? "app-warning-dot" : "app-live-dot"} aria-hidden="true" />{state.stale ? "Data may be outdated" : <>Synced <time dateTime={new Date(state.value.syncedAt).toISOString()} aria-label={formatInstant(state.value.syncedAt)}>{syncedTime}</time></>}</span>
          <Button variant="ghost" className="app-refresh-button" aria-label="Refresh" onClick={() => void refresh()}><RefreshCw size={17} aria-hidden="true" /></Button>
        </div>}
      </header>

      <div className="app-content">
        {page !== "settings" && page !== "profile" && page !== "live" && <section className="app-toolbar" aria-label="Week and task filters">
          <div className="app-week-control">
            <span className="sr-only">Production week · Monday–Sunday</span>
            <div className="app-week-navigation">
              <Button variant="outline" aria-label="Previous week" className="app-icon-button" onClick={() => shiftWeek(-7)}><ChevronLeft size={19} /></Button>
              <span className="app-week-range"><span>{formatBusinessDate(range.from)}</span><span className="app-week-separator">–</span><span>{formatBusinessDate(range.to)}</span></span>
              <Button variant="outline" aria-label="Next week" className="app-icon-button" onClick={() => shiftWeek(7)}><ChevronRight size={19} /></Button>
              <Button variant="outline" className="app-this-week" aria-label="This week" title="This week" onClick={() => setFilters(current => ({ ...current, week: businessDate(Date.now()) }))}><CalendarDays size={17} aria-hidden="true" /><span>This week</span></Button>
            </div>
          </div>
          {page === "dashboard" && <div className="app-week-picker">
            <label className="sr-only" htmlFor="dashboard-week">Select week</label>
            <Input id="dashboard-week" type="week" value={isoWeekValue(filters.week)} onChange={event => {
              const week = isoWeekStart(event.target.value);
              if (week) setFilters(current => ({ ...current, week }));
            }} />
          </div>}
          {state.kind === "ready" && <>
            <div className="app-toolbar-filter"><Select label="Filter by line" value={filters.lineId || "all"} onValueChange={value => setFilters(current => ({ ...current, lineId: value === "all" ? "" : value }))} options={[{ value: "all", label: "All lines" }, ...state.value.lines.map(line => ({ value: line.id, label: line.code + " · " + line.name }))]} /></div>
            <div className="app-toolbar-filter"><Select label="Filter by status" value={filters.status || "all"} onValueChange={value => setFilters(current => ({ ...current, status: value === "all" ? "" : value }))} options={[{ value: "all", label: "All statuses" }, { value: "todo", label: "To do" }, { value: "in_progress", label: "In progress" }, { value: "paused", label: "Paused" }, { value: "done", label: "Done" }]} /></div>
          </>}
        </section>}

        {state.kind === "loading" ? <div role="status" className="app-empty-state"><RefreshCw className="animate-spin text-primary" size={24} /><p>Loading tasks…</p></div> : state.kind === "error" ? <div role="alert" className="app-empty-state"><ShieldCheck className="text-destructive" size={30} /><h2 className="font-semibold">{state.status === 403 ? "Access denied" : state.status === 503 ? "System unavailable" : "Unable to load data"}</h2><p className="text-sm text-muted-foreground">{state.message}</p><Button onClick={() => void refresh(true)}>Try again</Button></div> : <>
          {state.stale && <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#c2650a]/40 bg-card px-4 py-3 text-sm text-[#9a4a00]">{state.message ?? "Unable to sync data"} <Button variant="outline" onClick={() => void refresh()}>Try again</Button></div>}
          {page === "settings" && isPlanner(state.value.me.user.role) ? <TeamSettings lines={state.value.lines} refresh={refresh} actorId={state.value.me.user.id} actorRole={state.value.me.user.role} section={teamSection} onSectionSelect={navigateTeamSection} /> : page === "profile" ? <UserProfile key={state.value.me.user.id} user={state.value.me.user} refresh={refresh} onChangePassword={() => setChangePasswordOpen(true)} /> : page === "live" ? <LiveBoard lines={state.value.lines} /> : page === "dashboard" ? <Dashboard value={state.value} /> : page === "fill" && isPlanner(state.value.me.user.role) ? <FillTask week={filters.week} lines={state.value.lines} jobs={state.value.jobs} revision={state.value.revision} refresh={refresh} /> : <Jobs jobs={state.value.jobs} lines={state.value.lines} user={state.value.me.user} refresh={refresh} />}
          {page !== "settings" && page !== "profile" && page !== "live" && state.value.cursor && <div className="mt-6 text-center"><Button variant="outline" onClick={() => void loadMore()}>Load more tasks</Button></div>}
        </>}
        <footer className="app-footer"><span>Developed by Sanongboon Poona / Truly Green Farms · © 2026 · MIT License</span><span className="inline-flex items-center gap-1.5"><Activity size={13} aria-hidden="true" /> Local production schedule</span></footer>
      </div>
    </main>
    <ChangePassword open={changePasswordOpen} onClose={()=>setChangePasswordOpen(false)} onChanged={()=>refresh(true)}/>
  </div>;
}
