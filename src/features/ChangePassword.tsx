import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { Button, Dialog, Input, Label } from "../components/ui";

export function ChangePassword({open,onClose,onChanged}:{open:boolean;onClose:()=>void;onChanged:()=>Promise<void>}) {
  const [previous,setPrevious]=useState(""); const [next,setNext]=useState("");
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  async function submit(event:FormEvent) {
    event.preventDefault();setBusy(true);setError("");
    try{await api.changePassword(previous,next);setPrevious("");setNext("");onClose();await onChanged();}
    catch(e){setError(e instanceof Error?e.message:"Unable to change password");}
    finally{setBusy(false);}
  }
  return <Dialog open={open} onOpenChange={value=>{if(!value)onClose();}} title="Change password">
    <form className="space-y-4" onSubmit={event=>void submit(event)}>
      <div><Label htmlFor="old-password">Current password</Label><Input id="old-password" type="password" autoComplete="current-password" value={previous} required onChange={e=>setPrevious(e.target.value)}/></div>
      <div><Label htmlFor="new-password">New password (8+ characters)</Label><Input id="new-password" type="password" autoComplete="new-password" value={next} required minLength={8} maxLength={128} onChange={e=>setNext(e.target.value)}/></div>
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy||next.length<8}>{busy?"Saving…":"Change password"}</Button><Button type="button" variant="outline" onClick={onClose}>Cancel</Button></div>
    </form>
  </Dialog>;
}
