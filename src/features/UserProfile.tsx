import { useState, type FormEvent } from "react";
import { KeyRound, UserRound } from "lucide-react";
import type { User } from "../shared/contracts";
import { api } from "../lib/api";
import { Button, Input, Label } from "../components/ui";

export function UserProfile({ user, refresh, onChangePassword }: {
  user: User;
  refresh: () => Promise<void>;
  onChangePassword: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || name.trim() === user.name || busy) return;
    setBusy(true); setMessage(""); setError("");
    try {
      await api.changeName(name.trim(), user.version);
      await refresh();
      setMessage("Name updated successfully.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to change name.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="space-y-5">
    <h2 className="sr-only">Account details</h2>
    <p className="section-description">Manage your display name and password.</p>
    <div className="surface-card max-w-2xl space-y-6 p-5 sm:p-6">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <span className="rounded-xl bg-secondary p-3 text-primary"><UserRound size={24} aria-hidden="true" /></span>
        <div><p className="font-bold">{user.name}</p><p className="text-sm capitalize text-muted-foreground">{user.role.replace("_", " ")}</p></div>
      </div>
      <div>
        <p className="mb-1 text-xs font-bold text-muted-foreground">Username</p>
        <p className="rounded-lg border border-border bg-muted px-3 py-3 text-sm font-semibold" aria-label="Username (cannot be changed)">{user.username}</p>
        <p className="mt-1.5 text-xs text-muted-foreground">Your username cannot be changed.</p>
      </div>
      <form className="space-y-3" onSubmit={event => void save(event)}>
        <div>
          <Label htmlFor="profile-name">Change name</Label>
          <Input id="profile-name" value={name} maxLength={100} required onChange={event => setName(event.target.value)} />
        </div>
        {message && <p role="status" className="text-sm text-primary">{message}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy || !name.trim() || name.trim() === user.name}>{busy ? "Saving…" : "Save name"}</Button>
      </form>
      <div className="space-y-3 border-t border-border pt-5">
        <div><h3 className="text-base font-bold">Change password</h3><p className="mt-1 text-sm text-muted-foreground">Update your password using your current password.</p></div>
        <Button variant="outline" onClick={onChangePassword}><KeyRound size={16} aria-hidden="true" />Change password</Button>
      </div>
    </div>
  </section>;
}
