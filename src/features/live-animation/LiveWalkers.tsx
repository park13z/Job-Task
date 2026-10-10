import { useEffect, useRef } from "react";
import carrierFrames from "./frames/crate-carrier.png";
import cartFrames from "./frames/cart-pusher.png";
import checkerFrames from "./frames/clipboard-checker.png";
import "./live-walkers.css";

/**
 * Canvas player for three complete-frame character animations.
 *
 * The images contain twelve fully composed 103x80 frames per character.
 * Legs are joined at their original hip points IN THE SOURCE FRAMES, not
 * transformed or cropped by CSS at runtime. No per-job animations are created.
 *
 * The Live board controls only whether this component exists; none of its
 * network requests, job counts, timers or state transitions are used here.
 */
const FRAME_WIDTH = 103;
const FRAME_HEIGHT = 80;
const FRAME_COUNT = 12;
const STRIDE_MS = 1280;
const ROUTE_MS = 36_000;

const CAST = [
  { id: "crate-carrier", src: carrierFrames, phase: 0.00, strideOffset: 0 },
  { id: "cart-pusher", src: cartFrames, phase: 0.19, strideOffset: 4 },
  { id: "clipboard-checker", src: checkerFrames, phase: 0.39, strideOffset: 8 },
] as const;

type LoadedCharacter = { image: HTMLImageElement; id: string; phase: number; strideOffset: number };

/** Render into a transparent canvas; CSS only positions and sizes the canvas. */
export function LiveWalkers() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const frames: (LoadedCharacter | null)[] = [null, null, null];
    let frameId = 0;
    let disposed = false;
    let startedAt: number | null = null;
    let logicalWidth = 0;
    let logicalHeight = 0;
    let pixelRatio = 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
      logicalWidth = Math.max(0, rect.width);
      logicalHeight = Math.max(0, rect.height);
      const realWidth = Math.max(1, Math.round(logicalWidth * ratio));
      const realHeight = Math.max(1, Math.round(logicalHeight * ratio));
      if (canvas.width !== realWidth || canvas.height !== realHeight) {
        canvas.width = realWidth;
        canvas.height = realHeight;
      }
      pixelRatio = ratio;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.imageSmoothingEnabled = false; // preserve small-source pixel art
    };

    function draw(timestamp: number) {
      if (disposed || !context || !canvas) return;
      if (startedAt === null) startedAt = timestamp;
      // Time continues smoothly regardless of Live API polling/re-rendering.
      const elapsed = timestamp - startedAt;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, logicalWidth, logicalHeight);
      context.imageSmoothingEnabled = false;

      const spriteWidth = Number.parseFloat(
        getComputedStyle(canvas).getPropertyValue("--live-frame-width")
      ) || 94;
      const drawWidth = Math.max(1, spriteWidth);
      const drawHeight = drawWidth * FRAME_HEIGHT / FRAME_WIDTH;
      const distance = Math.max(0, logicalWidth - drawWidth);
      const availableY = Math.max(0, logicalHeight - drawHeight);
      const centerY = Math.max(0, availableY / 2);
      const reduced = motion.matches;

      CAST.forEach((character, index) => {
        const loaded = frames[index];
        if (!loaded) return;
        const phase = reduced ? character.phase : (elapsed / ROUTE_MS + character.phase) % 1;
        const turningBack = !reduced && phase >= 0.5;
        const route = reduced ? character.phase : phase <= 0.5 ? phase * 2 : (1 - phase) * 2;
        const x = Math.round(Math.max(0, route * distance));
        // A few px of vertical separation keeps passing sprites identifiable,
        // without modifying task rows or putting animation into the layout.
        const offset = index === 0 ? -Math.min(5, availableY * 0.14)
          : index === 2 ? Math.min(5, availableY * 0.14) : 0;
        const y = Math.round(Math.max(0, Math.min(availableY, centerY + offset)));
        const frame = reduced ? 0 :
          (Math.floor(elapsed / STRIDE_MS * FRAME_COUNT + character.strideOffset) % FRAME_COUNT);

        context.save();
        if (turningBack) {
          context.translate(x + drawWidth, y);
          context.scale(-1, 1); // whole precomposed actor + equipment turn together
        } else {
          context.translate(x, y);
        }
        context.drawImage(
          loaded.image,
          frame * FRAME_WIDTH, 0, FRAME_WIDTH, FRAME_HEIGHT,
          0, 0, drawWidth, drawHeight
        );
        context.restore();
      });

      // Reduced-motion users see three complete, still silhouettes.
      if (!reduced) frameId = window.requestAnimationFrame(draw);
    }

    function restart() {
      window.cancelAnimationFrame(frameId);
      resize();
      frameId = window.requestAnimationFrame(draw);
    }

    const observer = new ResizeObserver(restart);
    observer.observe(canvas);
    const onVisibility = () => {
      if (document.visibilityState === "visible") restart();
      else window.cancelAnimationFrame(frameId);
    };
    const onMotionChange = () => restart();
    const onResize = () => restart();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", onResize);
    motion.addEventListener("change", onMotionChange);
    resize();

    CAST.forEach((character, index) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        if (disposed) return;
        if (image.naturalWidth !== FRAME_WIDTH * FRAME_COUNT || image.naturalHeight !== FRAME_HEIGHT) {
          console.error("Live Animation: incorrect frame sheet for", character.id);
          return;
        }
        frames[index] = { image, ...character };
        restart();
      };
      image.onerror = () => {
        if (!disposed) console.error("Live Animation: frame sheet failed to load", character.id);
      };
      image.src = character.src;
    });

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      motion.removeEventListener("change", onMotionChange);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <div className="live-worker-track" data-animation="canvas-frames" data-cast-size={CAST.length}>
    <canvas ref={canvasRef} className="live-worker-canvas" data-frame-count={FRAME_COUNT}
      aria-hidden="true" role="presentation" />
  </div>;
}
