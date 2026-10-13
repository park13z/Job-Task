import { useCallback, useEffect, useState } from "react";
import { TeamSettingsNavigation, teamSections, type TeamSection } from "./TeamSettingsNavigation";
import { DisplayDevices } from "./DisplayDevices";
import type { JobTemplate, Line, Role, User } from "../shared/contracts";
import { api } from "../lib/api";
import { friendlyError } from "../lib/operation";
import { Button, Input, Label, Select } from "../components/ui";

const roles: { value: Role; label: string }[] = [
  { value: "manager", label: "Manager" }, { value: "supervisor", label: "Supervisor" },
  { value: "line_leader", label: "Line leader" }, { value: "assistant", label: "Assistant" },
];
const heading = (eyebrow: string, title: string, subtitle: string) => <div className="mb-5">
  <p className="section-eyebrow">{eyebrow}</p><h3 className="mt-1 text-lg font-extrabold">{title}</h3>
  <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
</div>;

export function TeamSettings({ lines, refresh, actorId, section, onSectionSelect }: {
  lines: Line[]; refresh: () => Promise<void>; actorId: string;
  section: TeamSection; onSectionSelect: (section: TeamSection) => void;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [templates, setTemplates] = useState<JobTemplate[]>([]);
  const [name, setName] = useState(""); const [username, setUsername] = useState("");
  const [newUserPassword,setNewUserPassword]=useState(""); const [role, setRole] = useState<Role>("line_leader");
  const [lineCode, setLineCode] = useState(""); const [lineName, setLineName] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [newTemplateLineIds, setNewTemplateLineIds] = useState<string[]>([]);
  const [templateEditLineIds, setTemplateEditLineIds] = useState<string[]>([]);
  const [catalogFilter, setCatalogFilter] = useState("");

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [confirmTemporaryRemoval,setConfirmTemporaryRemoval]=useState(false);
  const [editingLine, setEditingLine] = useState<Line | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<JobTemplate | null>(null);
  const [templateEditName, setTemplateEditName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const reload = useCallback(async () => {
    const [people, catalog] = await Promise.all([api.users(), api.jobTemplates()]);
    setUsers(people.data.users); setTemplates(catalog.data.templates);
  }, []);
  useEffect(() => { void reload().catch(error => setMessage(friendlyError(error))); }, [reload]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setMessage("");
    try { await action(); await Promise.all([reload(), refresh()]); setMessage("Saved successfully"); }
    catch (error) { setMessage(friendlyError(error)); }
    finally { setBusy(false); }
  };
  const executors = users.filter(user => user.active && (user.role === "line_leader" || user.role === "assistant"));
  const activeSection = teamSections.find(item => item.id === section)!;
  const activeLines = lines.filter(line => line.active);
  const effectiveCatalogFilter = catalogFilter || activeLines[0]?.id || "unassigned";
  const catalogEntries = templates.filter(template => effectiveCatalogFilter === "all" ||
    (effectiveCatalogFilter === "unassigned" ? template.lineIds.length === 0 :
      template.lineIds.includes(effectiveCatalogFilter)));
  const unassignedCount = templates.filter(template => template.lineIds.length === 0).length;
  const toggleLine = (current: string[], lineId: string) =>
    current.includes(lineId) ? current.filter(value => value !== lineId) : [...current, lineId];


  return <section className="space-y-5">
    <h2 className="sr-only">Workspace settings</h2>
    <p className="section-description">Choose a section to manage. Each area has its own workspace.</p>
    <div className="grid items-start gap-5 lg:grid-cols-[225px_minmax(0,1fr)]">
      <TeamSettingsNavigation selected={section} onSelect={next => {
        onSectionSelect(next);
        setMessage("");
        setEditingUser(null);
        setEditingLine(null);
        setEditingTemplate(null);
      }}/>
      <div className="min-w-0 space-y-5" aria-label={activeSection.name}>
        {message && <p role="status" className="rounded-lg border border-border bg-white px-4 py-3 text-sm font-semibold">{message}</p>}
        {section === "users" && <>
          <div className="form-panel p-5">{heading("USERS / CREATE", "Add user", "Create an account and give the user their temporary password privately.")}
            <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="new-user-name">Name</Label><Input id="new-user-name" value={name} maxLength={100} onChange={event => setName(event.target.value)}/></div>
              <div><Label htmlFor="new-user-username">Username</Label><Input id="new-user-username" autoComplete="off" minLength={2} maxLength={32} value={username} onChange={event => setUsername(event.target.value.toLowerCase())}/></div>
              <div><span className="mb-1.5 block text-xs font-bold text-[#536a76]">Role</span><Select label="New user role" value={role} onValueChange={value => setRole(value as Role)} options={roles}/></div>
              <div><Label htmlFor="new-user-password">Initial password (8+ characters)</Label>
                <Input id="new-user-password" type="password" autoComplete="new-password" minLength={8} maxLength={128}
                  value={newUserPassword} onChange={event=>setNewUserPassword(event.target.value)}/></div></div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Only Managers can create accounts or reset passwords.</p>
              <Button disabled={busy || !name.trim() || !username.trim() || newUserPassword.length<8} onClick={() => void run(async () => { await api.createUser({ name: name.trim(), username: username.trim(), role, password:newUserPassword }); setName(""); setUsername(""); setNewUserPassword(""); })}>Add user</Button></div>
          </div>
          <div className="form-panel p-5">{heading("USERS / ROSTER", "Team members", "Edit individual accounts without leaving this page.")}
            {users.length === 0 && <p className="text-sm text-muted-foreground">No users found.</p>}
            <div className="space-y-2">{users.map(user => <div key={user.id} className="rounded-xl border border-border bg-[#fafcfc] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="font-bold">{user.name} <span className="text-xs font-normal text-muted-foreground">· {user.active ? "Active" : "Inactive"}</span></p><p className="break-all text-xs text-muted-foreground">{user.username} · {roles.find(item => item.value === user.role)?.label}</p></div>
                <Button variant="outline" onClick={() => setEditingUser(current => current?.id === user.id ? null : user)}>{editingUser?.id === user.id ? "Close" : "Edit user"}</Button></div>
              {user.username === "temp" && user.id !== actorId && users.some(u=>u.id!==user.id && u.active && u.role==="manager") &&
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {!confirmTemporaryRemoval ? <Button variant="outline" disabled={busy} onClick={()=>setConfirmTemporaryRemoval(true)}>Remove Temp account</Button> :
                    <><span className="text-sm text-destructive">Permanently remove Temp and revoke its session?</span>
                      <Button disabled={busy} onClick={()=>void run(async()=>{await api.removeTemporaryUser(user.id);setConfirmTemporaryRemoval(false);setEditingUser(null);})}>Confirm remove Temp</Button>
                      <Button variant="outline" onClick={()=>setConfirmTemporaryRemoval(false)}>Cancel</Button></>}
                </div>}
              {editingUser?.id === user.id && <UserEdit key={user.id} user={user} busy={busy} save={data => void run(async () => { await api.editUser(user.id,data); setEditingUser(null); })} resetPassword={password => void run(async()=>{await api.resetPassword(user.id,password); setEditingUser(null);})}/>}
            </div>)}</div>
          </div>
        </>}
        {section === "lines" && <>
          <div className="form-panel p-5">{heading("LINES / CREATE", "Add production line", "Create a line for production planning and team assignment.")}
            <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="new-line-code">Line code</Label><Input id="new-line-code" maxLength={40} value={lineCode} onChange={event => setLineCode(event.target.value)}/></div>
              <div><Label htmlFor="new-line-name">Line name</Label><Input id="new-line-name" maxLength={100} value={lineName} onChange={event => setLineName(event.target.value)}/></div></div>
            <div className="mt-4 text-right"><Button disabled={busy || !lineCode.trim() || !lineName.trim()} onClick={() => void run(async () => { await api.createLine({code:lineCode.trim(),name:lineName.trim()}); setLineCode(""); setLineName(""); })}>Add line</Button></div>
          </div>
          <div className="form-panel p-5">{heading("LINES / DIRECTORY", "Production lines", "Manage one line at a time.")}
            <div className="space-y-2">{lines.map(line => <div key={line.id} className="rounded-xl border border-border bg-[#fafcfc] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold">{line.code} · {line.name}</p><p className="text-xs text-muted-foreground">{line.active ? "Active" : "Inactive"} · {line.memberIds.length} assigned</p></div>
                <Button variant="outline" onClick={() => setEditingLine(current => current?.id === line.id ? null : line)}>{editingLine?.id === line.id ? "Close" : "Edit line"}</Button></div>
              {editingLine?.id === line.id && <LineEdit key={line.id} line={line} busy={busy} save={data => void run(async () => { await api.editLine(line.id,data); setEditingLine(null); })}/>}
            </div>)}</div>
          </div>
        </>}
        {section === "members" && <div className="form-panel p-5">{heading("LINE MEMBERS / ASSIGNMENTS", "Assign people to lines", "Add or remove members without changing the user account.")}
          {executors.length === 0 && <p className="text-sm text-muted-foreground">Add a Line Leader or Assistant in Users first.</p>}
          <div className="space-y-4">{lines.map(line => <div key={line.id} className="rounded-xl border border-border p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><strong>{line.code} · {line.name}</strong><span className="text-xs text-muted-foreground">{line.active ? "Active" : "Inactive"}</span></div>
            <div className="divide-y divide-border">{executors.map(user => <div key={user.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span className="text-sm">{user.name} · {roles.find(item => item.value === user.role)?.label}</span>
              <Button variant="outline" disabled={busy} onClick={() => void run(() => api.member(line.id,user.id,!line.memberIds.includes(user.id)))}>{line.memberIds.includes(user.id) ? "Remove" : "Add member"}</Button></div>)}</div>
          </div>)}</div>
        </div>}
        {section === "displays" && <DisplayDevices />}
        {section === "catalog" && <>
          <div className="form-panel p-5">
            {heading("JOB LIST / STANDARD TASKS", "Add a reusable job", "Assign jobs to their production lines. A job may belong to more than one line.")}
            <Label htmlFor="job-template-name">Job name</Label>
            <Input id="job-template-name" maxLength={200} placeholder="e.g. Pack 8x341g LOB Sugar"
              value={templateName} onChange={event => setTemplateName(event.target.value)}/>
            <JobLineChoices lines={activeLines} selected={newTemplateLineIds}
              onChange={lineId => setNewTemplateLineIds(current => toggleLine(current, lineId))}
              heading="Available on production lines"/>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Select at least one line. You can always type a custom task in Fill Task.</p>
              <Button disabled={busy || !templateName.trim() || newTemplateLineIds.length === 0}
                onClick={() => void run(async () => {
                  await api.createJobTemplate({ name: templateName.trim(), lineIds: newTemplateLineIds });
                  setTemplateName(""); setNewTemplateLineIds([]);
                })}>Add to Job List</Button>
            </div>
          </div>
          <div className="form-panel p-5">
            {heading("JOB LIST / CATALOG", "Saved jobs by line", "Select a line to view its jobs. Existing tasks are not changed when you edit these names.")}
            <div className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div><span className="mb-1.5 block text-xs font-bold text-[#536a76]">Production line</span>
                <Select label="Filter Job List by line" value={effectiveCatalogFilter}
                  onValueChange={setCatalogFilter}
                  options={[...lines.map(line => ({ value: line.id, label: line.code + " · " + line.name + (line.active ? "" : " (inactive)") })),
                    { value: "unassigned", label: "Unassigned jobs" }, { value: "all", label: "All saved jobs" }]}/>
              </div>
              <span className="rounded-lg border border-border bg-muted px-3 py-3 text-xs font-semibold text-muted-foreground">
                {catalogEntries.length} job{catalogEntries.length === 1 ? "" : "s"} · {unassignedCount} unassigned
              </span>
            </div>
            {unassignedCount > 0 && <p className="mb-4 rounded-lg border border-[#eedba8] bg-[#fff8e7] px-3 py-2 text-xs text-[#775921]">
              {unassignedCount} older job{unassignedCount === 1 ? "" : "s"} still need a production line. Select Unassigned jobs to assign them.
            </p>}
            {catalogEntries.length === 0 && <p className="py-5 text-sm text-muted-foreground">No saved jobs for this selection. Create one above or choose another line.</p>}
            <div className="space-y-2">{catalogEntries.map(template => <div key={template.id} className="rounded-xl border border-border bg-[#fafcfc] p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words font-bold">{template.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{template.active ? "Active" : "Inactive"} · {
                    template.lineIds.length ? template.lineIds.map(lineId => lines.find(line => line.id === lineId)?.code ?? "Unknown line").join(", ") : "Unassigned"
                  }</p>
                </div>
                <Button variant="outline" onClick={() => {
                  const next=editingTemplate?.id === template.id ? null : template;
                  setEditingTemplate(next); setTemplateEditName(next?.name ?? "");
                  setTemplateEditLineIds(next?.lineIds.filter(id => activeLines.some(line => line.id === id)) ?? []);
                }}>{editingTemplate?.id === template.id ? "Close" : "Edit"}</Button>
              </div>
              {editingTemplate?.id === template.id && <div className="mt-4 space-y-3 border-t border-border pt-4">
                <Label htmlFor="edit-job-template-name">Job name</Label>
                <Input id="edit-job-template-name" maxLength={200} value={templateEditName}
                  onChange={event => setTemplateEditName(event.target.value)}/>
                <JobLineChoices lines={activeLines} selected={templateEditLineIds}
                  onChange={lineId => setTemplateEditLineIds(current => toggleLine(current, lineId))}
                  heading="Assigned production lines"/>
                {template.lineIds.some(id => !activeLines.some(line => line.id === id)) &&
                  <p className="text-xs text-[#775921]">Assignments to inactive lines are removed when saving line choices.</p>}
                <div className="flex flex-wrap gap-2">
                  <Button disabled={busy || !templateEditName.trim()}
                    onClick={() => void run(async () => {
                      await api.editJobTemplate(template.id, { expectedVersion: template.version,
                        name: templateEditName.trim(), lineIds: templateEditLineIds });
                      setEditingTemplate(null);
                    })}>Save changes</Button>
                  <Button variant="outline" disabled={busy} onClick={() => void run(async () => {
                    await api.editJobTemplate(template.id, {expectedVersion:template.version,active:!template.active});
                    setEditingTemplate(null);
                  })}>{template.active ? "Deactivate" : "Activate"}</Button>
                </div>
              </div>}
            </div>)}</div>
          </div>
        </>}
      </div>
    </div>
  </section>;
}

function UserEdit({ user, busy, save, resetPassword }: { user: User; busy: boolean; save: (body: unknown) => void; resetPassword:(password:string)=>void }) {
  const [name,setName]=useState(user.name); const [role,setRole]=useState<Role>(user.role); const [active,setActive]=useState(user.active);const [password,setPassword]=useState("");
  return <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
    <div><Label htmlFor="edit-user-name">Name</Label><Input id="edit-user-name" value={name} onChange={event=>setName(event.target.value)}/></div>
    <div><span className="mb-1.5 block text-xs font-bold text-[#536a76]">Role</span><Select label="Edit user role" value={role} onValueChange={value=>setRole(value as Role)} options={roles}/></div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={event=>setActive(event.target.checked)}/> Active</label>
    <div className="flex justify-end"><Button disabled={busy || !name.trim()} onClick={()=>save({expectedVersion:user.version,name:name.trim(),role,active})}>Save user</Button></div>
    <div className="sm:col-span-2 border-t border-border pt-3">
      <Label htmlFor="reset-user-password">Set new password (8+ characters)</Label>
      <div className="flex flex-wrap gap-2"><Input id="reset-user-password" type="password" autoComplete="new-password" maxLength={128}
        value={password} onChange={event=>setPassword(event.target.value)}/>
        <Button variant="outline" disabled={busy||password.length<8} onClick={()=>resetPassword(password)}>Reset password</Button>
      </div>
    </div>
  </div>;
}
function LineEdit({ line, busy, save }: { line: Line; busy: boolean; save: (body: unknown) => void }) {
  const [name,setName]=useState(line.name); const [active,setActive]=useState(line.active);
  return <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
    <div><Label htmlFor="edit-line-name">Line name</Label><Input id="edit-line-name" value={name} onChange={event=>setName(event.target.value)}/></div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={event=>setActive(event.target.checked)}/> Active</label>
    <div className="sm:col-span-2 flex justify-end"><Button disabled={busy||!name.trim()} onClick={()=>save({name:name.trim(),active})}>Save line</Button></div>
  </div>;
}

function JobLineChoices({ lines, selected, onChange, heading }: {
  lines: Line[]; selected: string[]; onChange: (lineId: string) => void; heading: string;
}) {
  return <fieldset className="mt-4 rounded-xl border border-border bg-[#f8fbfb] p-3">
    <legend className="px-1 text-xs font-bold text-[#536a76]">{heading}</legend>
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      {lines.map(line => <label key={line.id} className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm">
        <input type="checkbox" checked={selected.includes(line.id)} onChange={() => onChange(line.id)}/>
        <span className="min-w-0 break-words font-semibold">{line.code} · {line.name}</span>
      </label>)}
    </div>
    {lines.length === 0 && <p className="text-sm text-muted-foreground">Create an active production line first.</p>}
  </fieldset>;
}
