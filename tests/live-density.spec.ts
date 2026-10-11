import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

type JobStatus = "done" | "in_progress" | "paused" | "todo";

test("Live compresses every row according to screen height, keeps every job, and colors all four statuses", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  const me = (await (await page.request.get("/api/me")).json()) as {
    data: { user: { id: string }; lines: { id: string }[] };
  };
  const changes = (await (await page.request.get("/api/changes")).json()) as { data: { businessDate: string } };
  const today = changes.data.businessDate;
  const now = Date.now();
  const lineId = me.data.lines[0].id;

  const makeJob = (i: number, status: JobStatus) => {
    const started = status !== "todo";
    const done = status === "done";
    return {
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      title: `Job ${i + 1} · CKT long product order for screen scaling`,
      description: "",
      targetSkids: 8,
      dayOrder: i + 1,
      workDate: today,
      lineId, createdBy: me.data.user.id,
      version: started ? 2 : 1,
      createdAt: now - 120_000, updatedAt: started ? now - 10_000 : now - 120_000,
      startedAt: started ? now - 60_000 : null,
      completedAt: done ? now - 10_000 : null,
      lastPausedAt: status === "paused" ? now - 10_000 : null,
      lastResumedAt: null,
      overdue: false, activeMs: started ? 50_000 : 0, status,
    };
  };
  let count = 8;
  let allActive = false;
  await page.route("**/api/live", async route => {
    const statuses: JobStatus[] = ["done", "in_progress", "paused", "todo"];
    const jobs = Array.from({ length: count }, (_, i) => makeJob(i, allActive ? "in_progress" : statuses[i % 4]));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      data: {
        date: today,
        done: jobs.filter(job => job.status === "done"),
        inProgress: jobs.filter(job => job.status === "in_progress"),
        paused: jobs.filter(job => job.status === "paused"),
        queued: jobs.filter(job => job.status === "todo"),
      }, revision: 2,
    }) });
  });

  await page.getByRole("button", { name: "Live", exact: true }).click();
  const board = page.locator(".live-board");
  await expect(board.locator("article.live-task")).toHaveCount(8);
  await expect(page.locator(".live-lane h3")).toHaveText(["DONE", "In Progressing", "Paused", "Waiting Queue"]);
  await expect(page.getByRole("region", { name: "In Progressing" }).locator('[data-animation="canvas-frames"]')).toHaveCount(1);
  await expect(page.locator(".live-progress-track")).toHaveCount(2);
  await expect(page.locator(".live-column-headings").first()).toContainText("End Time");
  await expect(page.locator(".live-lane-inProgress .live-column-headings")).toContainText("Est. End");
  await expect(page.locator(".live-lane-inProgress .live-column-headings")).toContainText("Progress");
  await expect(page.locator(".live-progress-track").first()).toHaveText("");
  // One Canvas covers the In Progress lane and draws exactly three fully
  // composed sprites, never one character group per job row.
  const track = board.locator('.live-lane-inProgress [data-animation="canvas-frames"]');
  const canvas = track.locator('canvas.live-worker-canvas');
  await expect(track).toHaveCount(1);
  await expect(track).toHaveAttribute("data-cast-size", "3");
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toHaveAttribute("data-frame-count", "12");
  await expect(board.locator(".live-worker-pacer, .live-worker-leg")).toHaveCount(0);
  const overlay = await board.locator(".live-lane-inProgress").evaluate(lane => {
    const tasks = lane.querySelector<HTMLElement>(".live-lane-tasks");
    const trackNode = tasks?.querySelector<HTMLElement>(':scope > [data-animation="canvas-frames"]');
    const canvasNode = trackNode?.querySelector("canvas");
    if (!tasks || !trackNode || !canvasNode) return null;
    return {
      taskPosition: getComputedStyle(tasks).position,
      trackPosition: getComputedStyle(trackNode).position,
      trackAnimation: getComputedStyle(trackNode).animationName,
      canvasAnimation: getComputedStyle(canvasNode).animationName,
      height: trackNode.getBoundingClientRect().height,
      taskHeight: tasks.getBoundingClientRect().height,
      pixelWidth: canvasNode.width, pixelHeight: canvasNode.height,
    };
  });
  expect(overlay).toBeTruthy();
  expect(overlay!.taskPosition).toBe("relative");
  expect(overlay!.trackPosition).toBe("absolute");
  expect(overlay!.trackAnimation).toBe("none");
  expect(overlay!.canvasAnimation).toBe("none");
  expect(overlay!.height).toBeGreaterThanOrEqual(overlay!.taskHeight - 1);
  expect(overlay!.pixelWidth).toBeGreaterThan(0);
  expect(overlay!.pixelHeight).toBeGreaterThan(0);

  async function paintedPixels() {
    return canvas.evaluate(element => {
      const node = element as HTMLCanvasElement;
      const context = node.getContext("2d");
      if (!context) return 0;
      const pixels = context.getImageData(0, 0, node.width, node.height).data;
      let total = 0;
      for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 16) total++;
      return total;
    });
  }
  await expect.poll(paintedPixels).toBeGreaterThan(100);
  const firstCanvasFrame = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await page.waitForTimeout(300);
  const nextCanvasFrame = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  expect(nextCanvasFrame).not.toBe(firstCanvasFrame); // A real sequence, not a CSS shim.
  const frameRendering = await canvas.evaluate(element => {
    const node = element as HTMLCanvasElement;
    return { width: node.width, height: node.height, dpr: window.devicePixelRatio };
  });
  expect(frameRendering.width).toBeGreaterThan(100);
  expect(frameRendering.height).toBeGreaterThan(20);


  // Strong background separation on both the full-width rows and group bars.
  const colors = await page.locator(".live-lane").evaluateAll(sections => sections.map(section => ({
    header: getComputedStyle(section.querySelector(".live-lane-header")!).backgroundColor,
    row: getComputedStyle(section.querySelector(".live-task")!).backgroundColor,
    border: getComputedStyle(section.querySelector(".live-task")!).boxShadow,
  })));
  expect(new Set(colors.map(value => value.header)).size).toBe(4);
  expect(new Set(colors.map(value => value.row)).size).toBe(4);
  expect(new Set(colors.map(value => value.border)).size).toBe(4);
  const a11y = await new AxeBuilder({ page }).analyze();
  expect(a11y.violations.filter(item => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);

  for (const activeCount of [0, 1, 3, 10]) {
    allActive = true;
    count = activeCount;
    await page.getByRole("button", { name: "Refresh live board" }).click();
    const inProgress = board.locator(".live-lane-inProgress");
    await expect(inProgress.locator("article.live-task")).toHaveCount(activeCount);
    await expect(inProgress.locator('[data-animation="canvas-frames"]')).toHaveCount(activeCount === 0 ? 0 : 1);
    if (activeCount > 0) await expect(inProgress.locator('[data-animation="canvas-frames"]')).toHaveAttribute("data-cast-size", "3");
    // A single short row must not crop a sprite taller than that row.
    if (activeCount === 1) {
      const geometry = await inProgress.evaluate(lane => {
        const tasks = lane.querySelector<HTMLElement>(".live-lane-tasks")!;
        const track = lane.querySelector<HTMLElement>(".live-worker-track")!;
        const canvas = track.querySelector<HTMLCanvasElement>("canvas")!;
        const spriteWidth = parseFloat(getComputedStyle(track).getPropertyValue("--live-frame-width"));
        return {
          taskHeight: tasks.getBoundingClientRect().height,
          trackHeight: track.getBoundingClientRect().height,
          frameHeight: spriteWidth * 80 / 103,
          bottomOffset: Math.abs(track.getBoundingClientRect().bottom - tasks.getBoundingClientRect().bottom),
          laneOverflow: getComputedStyle(lane).overflow,
          canvasHeight: canvas.getBoundingClientRect().height,
        };
      });
      expect(geometry.frameHeight).toBeGreaterThan(geometry.taskHeight);
      expect(geometry.trackHeight).toBeGreaterThanOrEqual(geometry.frameHeight - 1);
      expect(geometry.canvasHeight).toBeGreaterThanOrEqual(geometry.frameHeight - 1);
      expect(geometry.bottomOffset).toBeLessThanOrEqual(1);
      expect(geometry.laneOverflow).toBe("visible");
    }
    await expect(board.locator("article.live-task")).toHaveCount(activeCount);
  }
  allActive = false;
  for (const scenario of [
    { width: 1920, height: 1080, jobs: 8 },
    { width: 1366, height: 768, jobs: 24 },
    { width: 1920, height: 1080, jobs: 52 },
  ]) {
    count = scenario.jobs;
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.getByRole("button", { name: "Refresh live board" }).click();
    await expect(board.locator("article.live-task")).toHaveCount(count);
    await page.getByRole("button", { name: "Full screen" }).click();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await expect.poll(() => board.getAttribute("data-density")).not.toBeNull();
    const measurements = await board.evaluate(element => {
      const items = [...element.querySelectorAll<HTMLElement>(".live-task")];
      return {
        total: items.length,
        mode: element.dataset.density,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        hidden: items.filter(item => item.offsetWidth === 0 || item.offsetHeight === 0).length,
        fontSize: parseFloat(getComputedStyle(items[0].querySelector("h4")!).fontSize),
      };
    });
    // Regression: Full screen once forced a five-column row under seven/eight-column headers.
    const deltas = await board.locator(".live-lane").evaluateAll(lanes =>
      lanes.flatMap(lane => {
        const head = lane.querySelector(".live-column-headings");
        const row = lane.querySelector(".live-task");
        if (!head || !row) return [];
        return Array.from(head.children, (cell, i) => {
          const h = cell.getBoundingClientRect(), r = row.children[i].getBoundingClientRect();
          return { x: Math.abs(h.x - r.x), width: Math.abs(h.width - r.width) };
        });
      })
    );
    expect(deltas.length).toBeGreaterThan(0);
    for (const delta of deltas) {
      expect(delta.x).toBeLessThanOrEqual(2);
      expect(delta.width).toBeLessThanOrEqual(2);
    }
    expect(measurements.total).toBe(count);
    expect(measurements.hidden).toBe(0);
    expect(measurements.fontSize).toBeGreaterThanOrEqual(12);
    expect(measurements.scrollHeight).toBeGreaterThanOrEqual(measurements.clientHeight);
    if (scenario.jobs === 52) {
      expect(measurements.mode).toBe("ultra");
      await expect(board.getByRole("status").last()).toContainText("Auto-scrolling to show all jobs");
    }
    await page.getByRole("button", { name: "Exit full screen" }).click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
  }
  // The Canvas respects OS accessibility settings, without using CSS limb
  // animations or leaving a requestAnimationFrame loop running indefinitely.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  await expect.poll(paintedPixels).toBeGreaterThan(100);
  await page.waitForTimeout(170); // allow the one-frame still render on media change
  const stillFrame = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
  await page.waitForTimeout(210);
  expect(await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL())).toBe(stillFrame);
});
