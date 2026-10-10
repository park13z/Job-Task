# Live Character Animation

This directory is the **presentation-only** animation system used by the Live board. It has no API, database, session, task/status, or timer dependency. `LiveBoard` renders `<LiveWalkers />` once **only while there is at least one in-progress job**, regardless of job count. Nothing in this folder changes job state.

## Layers and responsibilities

- `LiveWalkers.tsx`: the fixed cast of three characters. Each owns four visual layers: stationary upper body, independently animated left boot, independently animated right boot, and foreground equipment.
- `live-worker-sheet.png`: existing 309×80 source sheet, containing three 103×80 *still illustrations*, not animation frames.
- `live-walkers.css`: character-specific polygon masks; spatial route, footsteps, gait timing, stacking order, density-aware sizing, and reduced-motion behavior.
- `live-board.css` stays responsible for the table layout and each task's separate loading/progress indicator.

The crate, cart/boxes/wheels and clipboard must stay attached to the moving **character** but must **not** inherit the independent leg motions. Each prop sits on an equipment layer over the legs. The cart-pusher has different leg masks because the wheels occupy the lower-right of that sprite. Left and right boots alternate horizontally and vertically within the 1.28-second gait.

## Tuning

- `live-walk-aisle`: 36-second out-and-back route (previously 15 seconds), with walkers staggered by −12 and −24 seconds.
- `--live-gait-duration`: 1.28-second two-step cycle. Change this independently of the horizontal route.
- Per-character `clip-path` and `transform-origin` values are based on each original image cell. Avoid copying leg masks between characters.
- Responsive variants change only character size. Row density, job counts, full-screen auto-scroll, and API logic are owned by the Live board.

## Limits / next-quality gate

The current sheet is **single-pose artwork**. CSS masks and translations can create an alternating gait, but cannot reconstruct unseen leg pixels, correctly articulate knees, or replicate the full walk cycle in the YouTube reference without new source art. A production-quality frame-animation upgrade should replace the still poses with 6–8 carefully drawn sequential frames *per character* (or individually drawn rigging layers with correct transparent overlap), preserving the separate equipment layers. Check for limb detachment, shoe/hip alignment, prop stability, cart wheels, turning behavior, full-screen density and reduced-motion preferences at every frame.

Run `npm run check` and inspect Live both on the dev LAN and the fixture Browser tests. No production deploy/push is part of this animation work.
