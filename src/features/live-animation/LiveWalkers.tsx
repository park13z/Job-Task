import "./live-walkers.css";

/**
 * Purely decorative animation system for the Live board.
 *
 * Business logic decides only whether this component is mounted. Job count,
 * job updates, network requests, and session state never affect the walkers.
 * Each character uses a separate source-sprite mask, leg gait and stationary
 * equipment layer. Keep the fixed cast of three, regardless of active jobs.
 */
const cast = [
  { variant: 0, role: "crate-carrier" },
  { variant: 1, role: "cart-pusher" },
  { variant: 2, role: "clipboard-checker" },
] as const;

function Character({ variant }: { variant: (typeof cast)[number]["variant"] }) {
  return <span className={"live-worker live-worker-" + variant}>
    <span className="live-worker-upper" />
    <span className="live-worker-leg live-worker-leg-left" />
    <span className="live-worker-leg live-worker-leg-right" />
    <span className="live-worker-equipment" />
  </span>;
}

export function LiveWalkers() {
  return <div className="live-worker-track" aria-hidden="true" data-animation="lane-walkers">
    {cast.map(({ variant, role }) =>
      <div className={"live-worker-pacer live-worker-pacer-" + variant} data-character={role} key={variant}>
        <Character variant={variant} />
      </div>
    )}
  </div>;
}
