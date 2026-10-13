import { useEffect, useRef, useState } from "react";
import { Monitor, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { LiveBoard } from "./LiveBoard";

type Status = "loading" | "unregistered" | "pending" | "approved" | "rejected" | "revoked";
export function DisplayLive() {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const requesting = useRef(false);

  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const result = await api.displayState();
        if (!active) return;
        if (result.data.status === "unregistered" && !requesting.current) {
          requesting.current = true;
          try {
            const request = await api.displayRequest();
            if (active) setStatus(request.data.status);
          } finally { requesting.current = false; }
        } else {
          setStatus(result.data.status);
        }
        setError("");
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to contact Job Task.");
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 6000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  if (status === "approved") return <div className="min-h-screen bg-background p-3 sm:p-5"><LiveBoard lines={[]} display /></div>;
  return <main className="flex min-h-screen items-center justify-center bg-[#f4f6f7] p-5">
    <section className="w-full max-w-xl rounded-2xl border border-[#d5e4e7] bg-white p-8 text-center shadow-sm">
      <Monitor size={48} className="mx-auto mb-4 text-[#0e7668]" aria-hidden="true" />
      <h1 className="text-2xl font-extrabold">Job Task — Live Display</h1>
      <p className="mt-3 text-sm text-[#4d6370]">This is a read-only production board.</p>
      {(status === "loading" || status === "unregistered") && <p role="status" className="mt-6">Connecting this browser…</p>}
      {status === "pending" && <div role="status" className="mt-6">
        <h2 className="text-xl font-bold">Waiting for Manager Approval</h2>
        <p className="mt-3">Please call the Manager to approve this display in Job Task → Team Settings → Live Displays.</p>
        <p className="mt-3 text-sm text-[#4d6370]">This page will open Live automatically after approval. No code or login is needed.</p>
      </div>}
      {(status === "rejected" || status === "revoked") && <div className="mt-6">
        <h2 className="text-xl font-bold">Display access {status}</h2>
        <p className="mt-2 text-sm text-[#4d6370]">Contact the Manager if you need access.</p>
        <button className="mt-5 rounded-lg border px-4 py-2 font-semibold" onClick={() => {
          void api.displayRequest().then(result => { setStatus(result.data.status); setError(""); }).catch(reason => setError(String(reason)));
        }}>Request again</button>
      </div>}
      {error && <div role="alert" className="mt-5 text-sm text-red-700">{error}<button className="ml-3 inline-flex items-center gap-1 underline" onClick={()=>window.location.reload()}><RefreshCw size={14}/>Retry</button></div>}
    </section>
  </main>;
}
