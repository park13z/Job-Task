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
  await expect(page.locator(".live-lane h3")).toHaveText(["DONE", "In Progressing", "Paused Today", "Waiting Queue"]);
  await expect(page.getByRole("region", { name: "In Progressing" }).locator(".live-worker-pacer")).toHaveCount(3);
  await expect(page.locator(".live-progress-track")).toHaveCount(2);
  await expect(page.locator(".live-column-headings").first()).toContainText("End Time");
  await expect(page.locator(".live-lane-inProgress .live-column-headings")).toContainText("Est. End");
  await expect(page.locator(".live-lane-inProgress .live-column-headings")).toContainText("Progress");
  await expect(page.locator(".live-progress-track").first()).toHaveText("");
  const pace = await page.locator(".live-worker-pacer").first().evaluate(element => ({
    animation: getComputedStyle(element).animationName,
    duration: getComputedStyle(element).animationDuration,
    parent: element.closest(".live-worker-track")?.parentElement?.className,
  }));
  expect(pace.animation).toContain("live-walk-aisle");
  expect(pace.duration).toBe("36s");
  expect(pace.parent).toContain("live-lane-tasks");
  const worker = board.locator(".live-worker").first();
  await expect(worker).toHaveJSProperty("tagName", "SPAN");
  const sprite = await worker.evaluate(element => ({
    background: getComputedStyle(element.querySelector(".live-worker-upper")!).backgroundImage,
    size: getComputedStyle(element.querySelector(".live-worker-upper")!).backgroundSize,
    animation: getComputedStyle(element.querySelector(".live-worker-upper")!).animationName,
    legGait: getComputedStyle(element.querySelector(".live-worker-leg-left")!).animationName,
    height: element.getBoundingClientRect().height,
  }));
  expect(sprite.background).toContain("live-worker-sheet");
  expect(sprite.size).not.toBe("auto");
  expect(sprite.animation).toBe("none");
  expect(sprite.legGait).toContain("live-left-step");
  await expect(board.locator(".live-worker-0")).toHaveCount(1);
  await expect(board.locator(".live-worker-1")).toHaveCount(1);
  await expect(board.locator(".live-worker-2")).toHaveCount(1);
  await expect(board.locator(".live-worker-equipment")).toHaveCount(3);
  // Equipment is attached to the carrier/cart/checker, never animated with a leg.
  const rigs = await board.locator(".live-worker").evaluateAll(characters => characters.map(character => {
    const top = getComputedStyle(character.querySelector(".live-worker-upper")!);
    const equipment = getComputedStyle(character.querySelector(".live-worker-equipment")!);
    const left = getComputedStyle(character.querySelector(".live-worker-leg-left")!);
    const right = getComputedStyle(character.querySelector(".live-worker-leg-right")!);
    return {
      equipmentAnimation: equipment.animationName,
      equipmentTransform: equipment.transform,
      topAnimation: top.animationName,
      leftGait: left.animationName,
      rightGait: right.animationName,
      leftDuration: left.animationDuration,
      rightDuration: right.animationDuration,
      masks: [top.clipPath, left.clipPath, right.clipPath, equipment.clipPath],
    };
  }));
  expect(rigs).toHaveLength(3);
  for (const rig of rigs) {
    expect(rig.equipmentAnimation).toBe("none");
    expect(rig.equipmentTransform).toBe("none");
    expect(rig.topAnimation).toBe("none");
    expect(rig.leftGait).toBe("live-left-step");
    expect(rig.rightGait).toBe("live-right-step");
    expect(rig.leftDuration).toBe("1.28s");
    expect(rig.rightDuration).toBe("1.28s");
    expect(rig.masks.every(mask => mask.startsWith("polygon("))).toBe(true);
  }
  // Per-character boots must swap stride positions, not simply rotate in place.
  const alternating = await board.locator(".live-worker").evaluateAll(characters => characters.map(character => {
    const leg = character.querySelector(".live-worker-leg-left")!;
    const animation = leg.getAnimations()[0];
    if (!animation) return false;
    animation.pause();
    animation.currentTime = 0;
    const first = getComputedStyle(leg).transform;
    animation.currentTime = 640; // 50% of one 1280ms gait.
    const opposite = getComputedStyle(leg).transform;
    animation.play();
    return first !== opposite;
  }));
  expect(alternating).toEqual([true, true, true]);
  // The three walkers overlay the entire In Progress lane instead of being repeated per job.
  const laneOverlay = await board.locator(".live-lane-inProgress").evaluate(lane => {
    const tasks = lane.querySelector<HTMLElement>(".live-lane-tasks");
    const track = tasks?.querySelector<HTMLElement>(":scope > .live-worker-track");
    if (!tasks || !track) return false;
    return getComputedStyle(tasks).position === "relative"
      && getComputedStyle(track).position === "absolute"
      && track.getBoundingClientRect().height >= tasks.getBoundingClientRect().height - 1
      && tasks.querySelectorAll(".live-worker-pacer").length === 3
      && tasks.querySelectorAll(".live-task .live-worker-pacer").length === 0;
  });
  expect(laneOverlay).toBe(true);
  const firstLeg = board.locator(".live-worker-leg-left").first();
  const firstStep = await firstLeg.evaluate(el => getComputedStyle(el).transform);
  await page.waitForTimeout(150);
  const secondStep = await firstLeg.evaluate(el => getComputedStyle(el).transform);
  expect(secondStep).not.toBe(firstStep); // Feet really step, not just the whole character bobbing.
  const workerOffsets = await board.locator(".live-lane-inProgress .live-worker-pacer").evaluateAll(
    elements => elements.slice(0, 3).map(element => getComputedStyle(element).transform)
  );
  expect(new Set(workerOffsets).size).toBe(3);
  expect(sprite.height).toBeGreaterThanOrEqual(30); // Ultra density deliberately reduces sprite size.
  const spriteUrl = sprite.background.match(/url\(["']?([^"')]+)["']?\)/)?.[1];
  expect(spriteUrl).toBeTruthy();
  const spriteFetch = await page.request.get(spriteUrl!);
  expect(spriteFetch.status()).toBe(200);
  expect(spriteFetch.headers()["content-type"]).toContain("image/png");

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
    await expect(inProgress.locator(".live-worker-pacer")).toHaveCount(activeCount === 0 ? 0 : 3);
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
});
