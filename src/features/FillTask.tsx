import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { bulkJobInputSchema, editJobInputSchema, type Job, type Line, type JobTemplate } from "../shared/contracts";
import { addDays, mondayWeekRange } from "../shared/time";
import { api, ApiError } from "../lib/api";
import { friendlyError, operationKey, type Pending } from "../lib/operation";
import { Button, Dialog, Input, Label, Select, Textarea } from "../components/ui";

type Row = { id: string; workDate: string; lineId: string; title: string; description: string; targetSkids: string };
const makeRow = (date: string, lineId: string): Row => ({ id: crypto.randomUUID(), workDate: date, lineId, title: "", description: "", targetSkids: "" });
function formBody(row: Row) { return { workDate: row.workDate, lineId: row.lineId, title: row.title, description: row.description, ...(row.targetSkids ? { targetSkids: Number(row.targetSkids) } : {}) }; }
function FieldError({ message, id }: { message?: string; id: string }) { return message ? <p id={id} className="mt-1 text-sm text-destructive">{message}</p> : null; }

export function FillTask({ week, lines, jobs, refresh }: { week: string; lines: Line[]; jobs: Job[]; refresh: () => Promise<void> }) {
  const range = mondayWeekRange(week);
  const activeLines = lines.filter(line => line.active);
  const [rows, setRows] = useState<Row[]>([makeRow(range.from, activeLines[0]?.id ?? "")]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<JobTemplate[]>([]);
  const [templateError, setTemplateError] = useState("");
  const [choices, setChoices] = useState<Record<string,string>>({});
  useEffect(() => {
    const abort = new AbortController();
    void api.jobTemplates(abort.signal).then(response => { if (!abort.signal.aborted) setTemplates(response.data.templates.filter(item => item.active)); })
      .catch(error => { if (!abort.signal.aborted) setTemplateError(friendlyError(error)); });
    return () => abort.abort();
  }, []);

  const pending = useRef<Pending | null>(null);
  const [editing, setEditing] = useState<Job | null>(null);
  const [editRow, setEditRow] = useState<Row | null>(null);
  const editPending = useRef<Pending | null>(null);
  useEffect(() => { setRows([makeRow(range.from, activeLines[0]?.id ?? "")]); setChoices({}); pending.current = null; setErrors({}); }, [range.from]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(range.from, i));
  const nextOrder = Math.max(0, ...jobs.filter(job => job.workDate >= range.from && job.workDate <= range.to).map(job => job.dayOrder)) + 1;
  const update = (id: string, field: keyof Row, value: string) => { setRows(current => current.map(row => row.id === id ? { ...row, [field]: value } : row)); setErrors({}); };
  const changeLine = (row: Row, edit: boolean, lineId: string) => {
    const selected = templates.find(item => item.id === choices[row.id]);
    const clearSelected = selected !== undefined && !selected.lineIds.includes(lineId);
    if (clearSelected) setChoices(current => ({ ...current, [row.id]: "manual" }));
    if (edit) setEditRow(current => current && {
      ...current, lineId, title: clearSelected ? "" : current.title,
    });
    else {
      setRows(current => current.map(item => item.id === row.id ? {
        ...item, lineId, title: clearSelected ? "" : item.title,
      } : item));
      setErrors({});
    }
  };
  const choose = (row: Row, edit: boolean, selected: string) => {
    setChoices(current => ({ ...current, [row.id]: selected }));
    if (selected === "manual") return;
    const template = templates.find(item => item.id === selected && item.lineIds.includes(row.lineId));
    if (!template) return;
    if (edit) setEditRow(current => current && { ...current, title: template.name });
    else update(row.id, "title", template.name);
  };
  const typeTitle = (row: Row, edit: boolean, value: string) => {
    setChoices(current => ({ ...current, [row.id]: "manual" }));
    if (edit) setEditRow(current => current && { ...current, title: value });
    else update(row.id, "title", value);
  };
  const save = async () => {
    const body = { items: rows.map(formBody) };
    const parsed = bulkJobInputSchema.safeParse(body);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) fields[issue.path.join(".")] = issue.message;
      setErrors(fields); setMessage("Please check the highlighted fields."); return;
    }
    pending.current = operationKey(pending.current, parsed.data);
    setBusy(true); setMessage("");
    try {
      await api.createJobs(parsed.data, pending.current.key);
      pending.current = null; setRows([makeRow(range.from, activeLines[0]?.id ?? "")]); setChoices({}); setErrors({}); setMessage("Tasks saved successfully"); await refresh();
    } catch (error) {
      if (error instanceof ApiError) setErrors(error.fields);
      setMessage(friendlyError(error));
      if (error instanceof ApiError && error.status === 409) { pending.current = null; await refresh(); }
    } finally { setBusy(false); }
  };
  const openEdit = (job: Job) => { setChoices(current => ({ ...current, [job.id]: "manual" })); setEditing(job); setEditRow({ id: job.id, workDate: job.workDate, lineId: job.lineId, title: job.title, description: job.description, targetSkids: job.targetSkids === null ? "" : String(job.targetSkids) }); setErrors({}); setMessage(""); editPending.current = null; };
  const saveEdit = async () => {
    if (!editing || !editRow) return;
    const body = { expectedVersion: editing.version, ...formBody(editRow), targetSkids: editRow.targetSkids ? Number(editRow.targetSkids) : null };
    const parsed = editJobInputSchema.safeParse(body);
    if (!parsed.success) { setErrors(Object.fromEntries(parsed.error.issues.map(issue => [issue.path.join("."), issue.message]))); setMessage("Please check the highlighted fields."); return; }
    editPending.current = operationKey(editPending.current, parsed.data); setBusy(true);
    try { await api.editJob(editing.id, parsed.data, editPending.current.key); editPending.current = null; setEditing(null); setEditRow(null); setMessage("Task updated successfully"); await refresh(); }
    catch (error) { if (error instanceof ApiError) setErrors(error.fields); setMessage(friendlyError(error)); if (error instanceof ApiError && error.status === 409) { editPending.current = null; setEditing(null); setEditRow(null); await refresh(); } }
    finally { setBusy(false); }
  };
  const rowForm = (row: Row, edit = false) => <div className="form-panel overflow-hidden" key={row.id}>
    <div className="form-panel-heading">
      <div className="flex items-center gap-3">
        <span className="task-sequence !h-[36px] !w-[36px] !text-xs">{edit ? editing?.dayOrder : nextOrder + rows.indexOf(row)}</span>
        <div><p className="text-[10px] font-extrabold tracking-[.1em] text-primary">{edit ? "EDIT PENDING TASK" : "NEW PRODUCTION TASK"}</p><p className="text-xs text-muted-foreground">Set the date and line; weekly sequence is automatic</p></div>
      </div>
      {!edit && rows.length > 1 && <Button type="button" variant="outline" className="!min-h-[36px] !px-3" onClick={() => setRows(current => current.filter(item => item.id !== row.id))}><Trash2 size={15} aria-hidden="true" /> Remove row</Button>}
    </div>
    <div className="form-panel-body grid gap-4 sm:grid-cols-2 lg:grid-cols-[180px_minmax(0,1fr)_132px]">
      <div><Label htmlFor={row.id + "-date"}>Work date</Label><Select value={row.workDate} onValueChange={value => edit ? setEditRow(current => current && { ...current, workDate: value }) : update(row.id, "workDate", value)} label="Work date" options={days.map(day => ({ value: day, label: day }))} /><FieldError id={row.id + "-date-error"} message={errors[edit ? "workDate" : "items." + rows.indexOf(row) + ".workDate"]} /></div>
      <div><Label htmlFor={row.id + "-line"}>Line</Label><Select value={row.lineId || activeLines[0]?.id || ""} onValueChange={value => changeLine(row, edit, value)} label="Line" options={activeLines.map(line => ({ value: line.id, label: line.code + " · " + line.name }))} /><FieldError id={row.id + "-line-error"} message={errors[edit ? "lineId" : "items." + rows.indexOf(row) + ".lineId"]} /></div>
      <div><p className="text-xs font-semibold text-muted-foreground">Weekly order</p><p className="mt-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm font-bold">{edit ? "#" + editing?.dayOrder : "#" + (nextOrder + rows.indexOf(row)) + " (preview)"}</p><p className="mt-1 text-[11px] text-muted-foreground">Assigned automatically when saved</p></div>
      <div className="sm:col-span-2 lg:col-span-3">
        <Label htmlFor={row.id + "-template"}>Choose from Job List (optional)</Label>
        <Select label={"Choose from Job List" + (edit ? " edit" : " row " + String(rows.indexOf(row) + 1))} value={choices[row.id] ?? "manual"}
          onValueChange={value => choose(row, edit, value)}
          options={[{ value: "manual", label: "Custom task — type your own" }, ...templates.filter(template => template.lineIds.includes(row.lineId)).map(template => ({ value: template.id, label: template.name }))]} />
        <p className="mt-1.5 text-xs text-muted-foreground">{templateError ? "Job List unavailable; you can still type your task." :
          templates.some(template => template.lineIds.includes(row.lineId))
            ? "Only saved jobs assigned to this line are listed. You can edit the name below."
            : "No saved jobs assigned to this line. You can still type your own task."}</p>
      </div>
      <div className="sm:col-span-2 lg:col-span-3"><Label htmlFor={row.id + "-title"}>Task</Label><Textarea id={row.id + "-title"} rows={2} maxLength={200} placeholder="Select a saved job above or type your own" value={row.title} onChange={event => typeTitle(row, edit, event.target.value)} aria-invalid={Boolean(errors[edit ? "title" : "items." + rows.indexOf(row) + ".title"])} /><FieldError id={row.id + "-title-error"} message={errors[edit ? "title" : "items." + rows.indexOf(row) + ".title"]} /></div>
      <div className="sm:col-span-2 lg:col-span-2"><Label htmlFor={row.id + "-description"}>Description (optional)</Label><Textarea id={row.id + "-description"} rows={2} maxLength={2000} placeholder="Additional instructions for the line" value={row.description} onChange={event => edit ? setEditRow(current => current && { ...current, description: event.target.value }) : update(row.id, "description", event.target.value)} /><FieldError id={row.id + "-description-error"} message={errors[edit ? "description" : "items." + rows.indexOf(row) + ".description"]} /></div>
      <div><Label htmlFor={row.id + "-skids"}>Target skids</Label><Input id={row.id + "-skids"} type="number" min="1" placeholder="Optional" value={row.targetSkids} onChange={event => edit ? setEditRow(current => current && { ...current, targetSkids: event.target.value }) : update(row.id, "targetSkids", event.target.value)} /><FieldError id={row.id + "-skids-error"} message={errors[edit ? "targetSkids" : "items." + rows.indexOf(row) + ".targetSkids"]} /></div>
    </div>
  </div>;

  return <section className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="section-eyebrow">WEEKLY PLANNING</p><h2 className="section-title mt-1">Fill Task</h2><p className="section-description">Plan tasks for the selected week. Task numbers restart at 1 each Monday and continue across all lines.</p></div>
      <span className="rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold text-muted-foreground">Up to 10 tasks per save</span>
    </div>
    {activeLines.length === 0 ? <div className="app-empty-state">No active lines yet. A manager can add lines in Team Settings.</div> : <>
      <div className="space-y-3">{rows.map(row => rowForm(row))}</div>
      <div className="surface-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div><p className="text-sm font-bold text-foreground">{rows.length} task {rows.length === 1 ? "row" : "rows"} ready to plan</p><p className="mt-1 text-xs text-muted-foreground">All tasks are saved together when you confirm.</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={rows.length >= 10 || busy} onClick={() => setRows(current => [...current, makeRow(range.from, activeLines[0]?.id ?? "")])}><Plus size={17} aria-hidden="true" /> Add row</Button><Button disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save tasks"}</Button></div>
      </div>
    </>}
    {message && <p role="alert" className="rounded-xl border border-border bg-white px-4 py-3 text-sm font-semibold">{message}</p>}
    <div className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4"><div><p className="section-eyebrow">REVIEW & UPDATE</p><h3 className="mt-1 text-base font-extrabold">Editable tasks</h3></div><span className="rounded-lg bg-muted px-3 py-2 text-xs font-bold text-muted-foreground">{jobs.filter(job => job.status === "todo").length} pending</span></div>
      {jobs.filter(job => job.status === "todo").length === 0 ? <p className="p-6 text-sm text-muted-foreground">No pending tasks this week</p> : <div className="divide-y divide-border">{jobs.filter(job => job.status === "todo").map(job => <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div className="flex min-w-0 items-center gap-3"><div className="task-sequence">{job.dayOrder}</div><div><p className="task-meta">{job.workDate} · {lines.find(line => line.id === job.lineId)?.code}</p><p className="mt-1 text-sm font-semibold">{job.title}</p></div></div><Button variant="outline" onClick={() => openEdit(job)}>Edit task</Button></div>)}</div>}
    </div>
    <Dialog open={editing !== null} onOpenChange={open => { if (!open) { setEditing(null); setEditRow(null); } }} title="Edit pending task">{editRow && <div className="space-y-4">{rowForm(editRow, true)}{message && <p role="alert" className="text-sm text-destructive">{message}</p>}<Button disabled={busy} onClick={() => void saveEdit()}>{busy ? "Saving…" : "Save changes"}</Button></div>}</Dialog>
  </section>;
}
