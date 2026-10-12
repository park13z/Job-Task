import { useEffect, useRef, useState } from "react";
import { GripVertical, Lock, LockOpen, Plus, RotateCcw, Save, Trash2, Undo2 } from "lucide-react";
import { v4 as newUuid } from "uuid";
import type { Job, Line } from "../shared/contracts";
import { addDays, mondayWeekRange } from "../shared/time";
import { api, ApiError } from "../lib/api";
import { friendlyError } from "../lib/operation";
import { Button, Dialog, Input, Label, Select, Textarea } from "../components/ui";

type Confirm = { kind: "insert" } | { kind: "reorder" } | { kind: "lockDirty" } | { kind: "delete" | "cancel" | "recall"; job: Job };
type Draft = { title: string; description: string; targetSkids: string; above: string };
const emptyDraft = (): Draft => ({ title: "", description: "", targetSkids: "", above: "1" });

export function QueueManagement({ week, lines, jobs, revision, selectedDate, onEdit, refresh }: {
  week: string; lines: Line[]; jobs: Job[]; revision: number; selectedDate: string; onEdit: (job: Job) => void; refresh: () => Promise<void>;
}) {
  const range = mondayWeekRange(week);
  const activeLines = lines.filter(line => line.active);
  const [date, setDate] = useState(selectedDate);
  const [lineId, setLineId] = useState(activeLines[0]?.id ?? "");
  const [unlocked, setUnlocked] = useState(false);
  const [unlockRevision, setUnlockRevision] = useState(revision);
  const [history, setHistory] = useState<string[][]>([[]]);
  const [baseIds, setBaseIds] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [reason, setReason] = useState("");
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [scope, setScope] = useState<{date:string;lineId:string;jobs:Job[];revision:number}|null>(null);
  const drag = useRef<{id:string;pointerId:number;x:number;y:number;lastTarget:string|null}|null>(null);
  const [dropTarget,setDropTarget] = useState<string|null>(null);
  const ready = scope?.date === date && scope.lineId === lineId;
  const viewRevision = ready ? scope.revision : revision;
  const selected = (ready ? scope.jobs : jobs).filter(job => job.workDate === date && job.lineId === lineId && job.status === "todo")
    .sort((a,b) => a.queuePosition-b.queuePosition || a.dayOrder-b.dayOrder);
  const current = selected.filter(job => job.cancelledAt === null);
  const cancelled = selected.filter(job => job.cancelledAt !== null);
  const ids = current.map(job => job.id);
  const key = ids.join("|");
  const draftIds = history.at(-1) ?? ids;
  const dirty = draftIds.join("|") !== baseIds.join("|");
  const byId = new Map(current.map(job => [job.id,job]));
  const visible = draftIds.map(id => byId.get(id)).filter((job): job is Job => Boolean(job));
  const ordinaryCount = current.filter(job => job.insertedNumber === null).length;
  const days = Array.from({length:7},(_,i)=>addDays(range.from,i));

  useEffect(() => { setDate(range.from); setUnlocked(false); setHistory([[]]); setNewJobOpen(false); }, [range.from]);
  useEffect(() => { if (!unlocked) setDate(selectedDate); }, [selectedDate]);
  useEffect(() => {
    if (!lineId) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const full: Job[] = [];
        let cursor: string | null = null;
        do {
          const params = new URLSearchParams({from:date,to:date,lineId,limit:"100"});
          if (cursor) params.set("cursor",cursor);
          const page = await api.jobs(params,controller.signal);
          full.push(...page.data.jobs);
          cursor = page.data.nextCursor;
        } while (cursor && !controller.signal.aborted);
        const stamp = await api.changes(controller.signal);
        if (!controller.signal.aborted) setScope({date,lineId,jobs:full,revision:stamp.data.revision});
      } catch(error) {
        if (!controller.signal.aborted) {setScope(null);setMessage(friendlyError(error));}
      }
    };
    void load();
    return () => controller.abort();
  },[date,lineId,revision]);
  useEffect(() => { if (!unlocked) {setHistory([ids]);setBaseIds(ids);} }, [key,unlocked,date,lineId]);
  useEffect(() => {
    if (!dirty || !unlocked) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload",warn);
    return () => window.removeEventListener("beforeunload",warn);
  },[dirty,unlocked]);

  const chooseScope = (nextDate:string,nextLine:string) => {
    if (unlocked && dirty) { setMessage("Save or Undo and Lock Queue before changing date or line."); return; }
    setDate(nextDate); setLineId(nextLine); setUnlocked(false); setHistory([[]]); setNewJobOpen(false); setMessage("");
  };
  const reorder = (source:string,destination:string) => {
    if (!unlocked || source===destination) return;
    const result=[...draftIds];
    const from=result.indexOf(source), to=result.indexOf(destination);
    if(from<0 || to<0) return;
    result.splice(from,1);
    result.splice(to,0,source);
    if (result.join("|")!==draftIds.join("|")) setHistory(previous=>[...previous,result]);
  };
  const pointerTarget = (x:number,y:number) =>
    document.elementFromPoint(x,y)?.closest<HTMLElement>('[data-testid="queue-row"]')?.dataset.jobId ?? null;
  const openReason = (next:Confirm) => { setReason(""); setMessage(""); setConfirm(next); };
  const change = async () => {
    if (!confirm || confirm.kind === "lockDirty" || !reason.trim()) return;
    setBusy(true); setMessage("");
    try {
      const key = newUuid();
      if (confirm.kind === "reorder") {
        await api.reorderQueue({workDate:date,lineId,ids:draftIds,expectedRevision:unlockRevision,reason:reason.trim()},key);
        setHistory([[...draftIds]]);
        setBaseIds([...draftIds]);
        setUnlockRevision(viewRevision+1);
      } else if (confirm.kind === "insert") {
        const target = Number(draft.targetSkids);
        await api.insertQueue({job:{title:draft.title.trim(),description:draft.description,
          workDate:date,lineId,...(draft.targetSkids ? {targetSkids:target}: {})},
          aboveQueue:Number(draft.above),expectedRevision:viewRevision,reason:reason.trim()},key);
        setDraft(emptyDraft()); setNewJobOpen(false);
      } else {
        await api.queueJobAction(confirm.job.id,confirm.kind,{
          expectedVersion:confirm.job.version,expectedRevision:viewRevision,reason:reason.trim(),
        },key);
      }
      setConfirm(null); setReason("");
      setMessage("Queue change saved successfully.");
      await refresh();
    } catch (error) {
      setMessage(friendlyError(error));
      if (error instanceof ApiError && error.status === 409) {
        setUnlocked(false);
        await refresh();
      }
    } finally { setBusy(false); }
  };
  const ordinaryLabels = new Map<string,string>();
  let ordinal=0;
  for (const job of visible) ordinaryLabels.set(job.id, job.insertedNumber === null
    ? "Queue " + (++ordinal) : "Inserted #" + job.insertedNumber);

  return <section className="surface-card overflow-hidden" data-queue-state={unlocked?"unlocked":"locked"}>
    <div className="border-b border-border px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="text-base font-extrabold">Queue Management</h3>
          <p className="text-xs text-muted-foreground">Only Waiting Queue jobs can be reordered or deleted.</p></div>
        {unlocked ? <span className="inline-flex items-center gap-2 rounded-lg bg-amber-100 px-3 py-2 text-sm font-bold text-amber-900">
          <LockOpen size={16}/> Queue Unlocked</span> :
          <Button variant="outline" disabled={!ready} onClick={() => {
            setUnlocked(true);setUnlockRevision(viewRevision);setHistory([ids]);setBaseIds(ids);
          }} data-testid="queue-lock-toggle"><LockOpen size={16}/> Unlock Queue</Button>}
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        <div className="min-w-[170px] flex-1"><Label htmlFor="queue-date">Work date</Label>
          <Select label="Queue day" value={date} onValueChange={value => chooseScope(value,lineId)}
            options={days.map(value => ({value,label:value}))}/></div>
        <div className="min-w-[170px] flex-1"><Label htmlFor="queue-line">Production line</Label>
          <Select label="Queue production line" value={lineId} onValueChange={value => chooseScope(date,value)}
            options={activeLines.map(line => ({value:line.id,label:line.code+" · "+line.name}))}/></div>
        <div className="flex items-end"><Button variant="outline" disabled={busy || !ready || (unlocked && dirty)} onClick={() => {
          setDraft(emptyDraft());setNewJobOpen(true);setMessage("");
        }}><Plus size={16}/> Add Queue</Button></div>
      </div>
      {unlocked && <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="queue-edit-actions">
        <Button variant="outline" data-testid="queue-undo-btn" disabled={history.length <= 1 || busy}
          onClick={() => setHistory(old => old.slice(0,-1))}><Undo2 size={16}/> Undo {history.length > 1 ? "("+String(history.length-1)+")" : ""}</Button>
        <Button disabled={!dirty || busy} onClick={() => openReason({kind:"reorder"})}><Save size={16}/> Save</Button>
        <Button variant="outline" disabled={busy} onClick={() => dirty ? openReason({kind:"lockDirty"}) : setUnlocked(false)}><Lock size={16}/> Lock Queue</Button>
      </div>}
      {unlocked && <p className="mt-2 text-xs text-amber-800">Click and hold a Waiting Queue row to drag it up or down. Changes stay local until Save.</p>}
    </div>

    {newJobOpen && <div className="space-y-3 border-b border-border bg-slate-50 px-5 py-4">
      <h4 className="font-bold">Insert Queue</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label htmlFor="queue-new-title">Task / Product</Label>
          <Input id="queue-new-title" maxLength={200} value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))}/></div>
        <div><Label htmlFor="queue-above">Insert Above Queue #</Label>
          <Input id="queue-above" type="number" min={1} max={ordinaryCount+1} value={draft.above} onChange={e=>setDraft(d=>({...d,above:e.target.value}))}/></div>
        <div><Label htmlFor="queue-new-target">Target skids (optional)</Label>
          <Input id="queue-new-target" type="number" min={1} value={draft.targetSkids} onChange={e=>setDraft(d=>({...d,targetSkids:e.target.value}))}/></div>
        <div className="sm:col-span-2"><Label htmlFor="queue-new-description">Description (optional)</Label>
          <Textarea id="queue-new-description" maxLength={2000} rows={2} value={draft.description} onChange={e=>setDraft(d=>({...d,description:e.target.value}))}/></div>
      </div>
      <p className="text-xs text-muted-foreground">Queue 1–{ordinaryCount} are normal jobs. Use {ordinaryCount+1} to add after the last normal queue.</p>
      <div className="flex gap-2"><Button variant="outline" onClick={()=>setNewJobOpen(false)}>Close</Button>
        <Button disabled={busy || !draft.title.trim() || !Number.isInteger(Number(draft.above)) ||
          Number(draft.above)<1 || Number(draft.above)>ordinaryCount+1 ||
          (draft.targetSkids!=="" && (!Number.isInteger(Number(draft.targetSkids)) || Number(draft.targetSkids)<1))}
          onClick={()=>openReason({kind:"insert"})}>Insert & Confirm</Button></div>
    </div>}

    <div className="divide-y divide-border" aria-label="Waiting queue">
      {visible.length===0 && <p className="px-5 py-6 text-sm text-muted-foreground">No Waiting Queue jobs on this date and line.</p>}
      {visible.map(job => <div key={job.id} data-testid="queue-row" data-job-id={job.id} data-drag-enabled={unlocked&&!busy}
        onPointerDown={event=>{
          if(!unlocked||busy||event.button!==0||
            (event.target as Element).closest("button,input,textarea,[role='combobox']"))return;
          drag.current={id:job.id,pointerId:event.pointerId,x:event.clientX,y:event.clientY,lastTarget:null};
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event=>{
          if(!drag.current||drag.current.pointerId!==event.pointerId)return;
          const target=pointerTarget(event.clientX,event.clientY);
          if(target){drag.current.lastTarget=target;setDropTarget(target);}
          if(event.clientY<70)window.scrollBy(0,-18);
          else if(window.innerHeight-event.clientY<70)window.scrollBy(0,18);
        }}
        onPointerUp={event=>{
          const origin=drag.current;
          if(!origin || origin.pointerId!==event.pointerId)return;
          drag.current=null;setDropTarget(null);
          if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
          const destination=pointerTarget(event.clientX,event.clientY) ?? origin.lastTarget;
          if(destination && Math.hypot(event.clientX-origin.x,event.clientY-origin.y)>8)
            reorder(origin.id,destination);
        }}
        onPointerCancel={()=>{drag.current=null;setDropTarget(null);}}
        className={"flex flex-wrap items-center justify-between gap-3 px-5 py-3 " +
          (unlocked?"cursor-grab select-none touch-none hover:bg-emerald-50 active:cursor-grabbing ":"")+
          (dropTarget===job.id && drag.current?.id!==job.id?"outline outline-2 outline-emerald-500 ":"")+
          (job.insertedNumber!==null?"bg-emerald-50/70":"bg-white")}>
        <div className="flex min-w-0 items-center gap-3">
          <GripVertical data-testid="drag-handle" size={18} aria-hidden="true" className={unlocked?"text-slate-600":"text-slate-300"}/>
          <span className={"min-w-[88px] rounded-md px-2 py-1 text-center text-xs font-bold " +
            (job.insertedNumber!==null?"bg-emerald-100 text-emerald-800":"bg-slate-100 text-slate-700")}>
            {ordinaryLabels.get(job.id)}</span>
          <span className="min-w-0"><span className="block text-sm font-bold">{job.title}</span>
            <span className="text-xs text-muted-foreground">Job #{job.dayOrder}</span></span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy || !ready || (unlocked&&dirty)} onClick={()=>onEdit(job)}>Edit task</Button>
          <Button variant="outline" disabled={busy || !ready || (unlocked&&dirty)} onClick={()=>openReason({kind:"cancel",job})}>Cancel</Button>
          <Button variant="outline" disabled={busy || !ready || (unlocked&&dirty)} onClick={()=>openReason({kind:"delete",job})}>
            <Trash2 size={15}/> Delete</Button>
        </div>
      </div>)}
      {cancelled.map(job=><div key={job.id} className="flex flex-wrap items-center justify-between gap-3 bg-slate-700 px-5 py-4 text-white">
        <div><strong className="text-sm">{job.title}</strong><p className="text-xs text-slate-200">Cancelled · Job #{job.dayOrder}</p></div>
        <Button variant="outline" disabled={busy || !ready || (unlocked&&dirty)} onClick={()=>openReason({kind:"recall",job})}>
          <RotateCcw size={16}/> Recall Order</Button>
      </div>)}
    </div>
    {message && <p role="alert" className="border-t px-5 py-3 text-sm font-semibold">{message}</p>}
    <Dialog open={confirm !== null} title={confirm?.kind==="lockDirty" ? "Unsaved queue changes" : "Reason required"}
      onOpenChange={value=>{if(!value&&!busy)setConfirm(null);}}>
      {confirm?.kind==="lockDirty" ? <div className="space-y-4" data-testid="modal-dirty-confirm">
        <p>The queue order has unsaved changes. Save with a reason or discard them before locking.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={()=>setConfirm(null)}>Keep editing</Button>
          <Button variant="outline" onClick={()=>{setHistory([ids]);setBaseIds(ids);setUnlocked(false);setConfirm(null);}}>Discard & Lock</Button>
          <Button onClick={()=>openReason({kind:"reorder"})}>Save with Reason</Button>
        </div>
      </div> : confirm && <div className="space-y-4">
        <p className="text-sm">Confirm {confirm.kind === "reorder"?"reordering the waiting jobs":
          confirm.kind === "insert"?"inserting the new order":
          confirm.kind === "delete"?"deleting this Waiting Queue job permanently":
          confirm.kind === "cancel"?"cancelling this order":"recalling this order"}.</p>
        <div><Label htmlFor="queue-save-reason">Reason (required)</Label>
          <Textarea id="queue-save-reason" data-testid="queue-save-reason" rows={3} maxLength={2000}
            value={reason} onChange={event=>setReason(event.target.value)}
            placeholder="Enter the reason before confirming"/></div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={()=>setConfirm(null)}>Back</Button>
          <Button disabled={busy||!reason.trim()} onClick={()=>void change()}>{busy?"Saving…":"Confirm & Save"}</Button>
        </div>
      </div>}
    </Dialog>
  </section>;
}
