import { useState, type FormEvent } from "react";
import { LockKeyhole, Warehouse } from "lucide-react";
import { api } from "../lib/api";
import { Button, Input, Label } from "../components/ui";

export function SignIn({ onSuccess }: { onSuccess: () => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { await api.login(username.trim().toLowerCase(), password); setPassword(""); await onSuccess(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Sign in failed."); }
    finally { setBusy(false); }
  }
  return <main className="login-page flex min-h-screen items-center justify-center bg-[#f2f6f7] p-5">
    <div className="w-full max-w-[440px] rounded-2xl border border-border bg-white p-7 shadow-xl sm:p-10">
      <div className="mb-8 flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-xl bg-[#123940] text-white"><Warehouse size={27}/></div>
        <div><h1 className="text-2xl font-extrabold tracking-tight">Job Task</h1><p className="text-xs font-bold tracking-wider text-muted-foreground">PACKHOUSE OPERATIONS</p></div></div>
      <div className="mb-6"><div className="mb-2 flex items-center gap-2 text-primary"><LockKeyhole size={18}/><span className="text-xs font-extrabold uppercase tracking-widest">Secure sign in</span></div>
        <h2 className="text-2xl font-extrabold">Welcome back</h2><p className="mt-2 text-sm text-muted-foreground">Use your Job Task username and password.</p></div>
      <form className="space-y-4" onSubmit={event => void submit(event)}>
        <div><Label htmlFor="login-username">Username</Label><Input id="login-username" autoComplete="username" autoCapitalize="none" required minLength={2} maxLength={32} value={username} onChange={event=>setUsername(event.target.value)} /></div>
        <div><Label htmlFor="login-password">Password</Label><Input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={event=>setPassword(event.target.value)} /></div>
        {message && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-destructive">{message}</p>}
        <Button type="submit" disabled={busy || !username.trim() || !password} className="w-full justify-center">{busy ? "Signing in…" : "Sign in"}</Button>
      </form>
      <p className="mt-6 text-center text-xs text-muted-foreground">Ask your Manager for your account credentials.</p>
    </div>
  </main>;
}
