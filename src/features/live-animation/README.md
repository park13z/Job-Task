# Live Character Animation — Canvas frame player

This directory owns **only visual decoration** for the Job Task Live board. Job status, API requests, dates, task rows, refresh cadence and user permissions remain outside of it.

When at least one task is in progress, `LiveBoard` mounts one `<LiveWalkers />` overlay. The overlay renders exactly **three** characters regardless of task count. It never adds task rows or modifies application state.

## Animation pipeline

```text
live-worker-sheet.png  (original transparent 309×80 illustration, 3 still poses)
            |
            v
scripts/generate-live-walk-frames.mjs  (offline binary asset generator)
            |
            +--> frames/crate-carrier.png      (12 × 103×80)
            +--> frames/cart-pusher.png        (12 × 103×80)
            +--> frames/clipboard-checker.png  (12 × 103×80)
                        |
                        v
LiveWalkers.tsx  (Canvas image-frame playback; exactly three characters)
                        |
                        v
LiveBoard.tsx --> In Progress lane
```

### What differs from the original CSS implementation

The old code cut boots out of a single still pose, moved these cut-outs with CSS transforms and left gaps between hips and legs. **That implementation was removed.**

The new generator creates **12 complete RGBA frames per character** in advance. For each frame, both legs are rasterized from fixed hip anchors through their knees to their ankles; the original head, torso, arms and equipment are composited back over the hips. The crate, cart wheels and clipboard are copied pixel-for-pixel from the source with no independent transforms.

The result is a coherent complete image that Canvas displays as one frame. Runtime CSS only controls the overlay's position/size; it does **not** animate legs, limbs or props.

### Playback values

- 12 frames per character; one gait cycle is 1,280ms (two alternating steps).
- One horizontal out-and-back route takes 36,000ms.
- Character phases are staggered; turning mirrors the **whole composed sprite**.
- The original 103×80 proportions are kept across high-density modes.
- Canvas is transparent, ignores pointer events and respects `prefers-reduced-motion`.
- Up to 2× device pixel ratio for a crisp display without excessive memory.
- Image frame updates are performed with `requestAnimationFrame`; no React state updates per frame.

### Build and verification

Run from the repository root:

```powershell
npm run animation:generate  # regenerate and overwrite only the three compiled binary sprite strips
npm run check:animation     # confirm generated source pixels match committed assets
npm run check               # TypeScript, build, schema, unit and browser tests
```

`sharp` is a development dependency used for generating the binary PNGs. The client does not import it.

The generator checks every frame's joint regions and confirms that opaque source pixels in each character's equipment area remain unchanged. The browser test verifies one Canvas regardless of 0/1/3/10 in-progress tasks, 12-frame metadata, actual painted pixels, motion across time and dense/full-screen layout.

## Art quality / limits

The supplied artwork has **one pose per character**, so the generated alternative leg poses use pixel-art geometry plus source colors rather than manually painted knee/foot shapes. This removes the detached-limb CSS bug and makes the feet alternate, but it is not equivalent to a professional 12-frame hand-drawn walk cycle.

For further artistic refinement, replace the three generated strips with hand-drawn 12-frame transparent pixel-art sheets of the **same dimensions and source coordinates**; keep the Canvas player and the Live business logic unchanged. If source art changes, update and review the generator's character-specific hip anchor/leg-clearance coordinates and equipment bounds before regeneration. Review every frame enlarged, especially the load-bearing foot, knee connections, cart wheels, reverse direction and any stray alpha pixels.

No deployment to Cloudflare or production D1 is part of this module.
