import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { Button } from "../components/ui";
import { formatInstant } from "../shared/time";

type Device = Awaited<ReturnType<typeof api.displayDevices>>["data"]["devices"][number];

function describeBrowser(ua: string) {
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" :
    /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Macintosh|Mac OS/.test(ua) ? "Mac" :
    /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "Unknown OS";
  return browser + " · " + os;
}
export function DisplayDevices() {
  const [devices,setDevices] = useState<Device[]>([]);
  const [error,setError] = useState("");
  const [busy,setBusy] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const result = await api.displayDevices();
    setDevices(result.data.devices); setError("");
  }, []);
  useEffect(() => {
    void reload().catch(error => setError(String(error)));
    const timer = window.setInterval(() => void reload().catch(error => setError(String(error))), 15000);
    return () => window.clearInterval(timer);
  }, [reload]);
  const act = async (device:Device, action:"approve"|"reject"|"revoke") => {
    setBusy(device.id); setError("");
    try { await api.decideDisplay(device.id,action); await reload(); }
    catch(error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(null); }
  };
  const pending = devices.filter(device=>device.status==="pending");
  return <section className="space-y-4">
    <div className="form-panel p-5">
      <p className="section-eyebrow">LIVE / DISPLAY APPROVAL</p>
      <h3 className="mt-1 text-lg font-extrabold">Live Displays</h3>
      <p className="mt-2 text-sm text-muted-foreground">Open the permanent address <code>/display/live</code> on any screen. It requests access automatically; approve each browser here. No login or pairing code is required on the display.</p>
      <Button variant="outline" className="mt-3" onClick={() => void reload().catch(error => setError(String(error)))}>Refresh Requests</Button>
    </div>
    {error && <p role="alert" className="rounded-lg border p-3 text-red-700">{error}</p>}
    <div className="form-panel p-5">
      <h4 className="text-base font-bold">Waiting for Approval ({pending.length})</h4>
      {pending.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No pending display requests.</p>}
      <div className="mt-3 space-y-3">{pending.map(device => <div key={device.id} className="rounded-xl border bg-[#fafcfc] p-4">
        <p className="font-bold">{describeBrowser(device.browser)}</p>
        <p className="mt-1 break-words text-xs text-muted-foreground">{device.browser}</p>
        <p className="mt-1 text-xs text-muted-foreground">Requested: {formatInstant(device.createdAt)}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={busy!==null} onClick={() => void act(device,"approve")}>Approve</Button>
          <Button variant="outline" disabled={busy!==null} onClick={() => void act(device,"reject")}>Reject</Button>
        </div>
      </div>)}</div>
    </div>
    <div className="form-panel p-5">
      <h4 className="text-base font-bold">Approved Displays</h4>
      <div className="mt-3 space-y-3">{devices.filter(device=>device.status==="approved").map(device => <div key={device.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
        <div><p className="font-bold">{describeBrowser(device.browser)}</p><p className="text-xs text-muted-foreground">Approved {device.approvedAt ? formatInstant(device.approvedAt) : ""} · {device.approvedBy ?? "Manager"}</p></div>
        <Button variant="outline" disabled={busy!==null} onClick={() => void act(device,"revoke")}>Revoke</Button>
      </div>)}</div>
    </div>
  </section>;
}
