import { test, expect } from "@playwright/test";

test("Fill Task and Pause/Done work without secure-context-only randomUUID", async ({ page }) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const title = "HTTP LAN UUID regression " + suffix;
  const lineCode = "LAN-" + suffix;
  const createLine = await page.request.post("/api/lines", { data: { code: lineCode, name: "LAN UUID Test " + suffix } });
  expect(createLine.status()).toBe(201);
  // HTTP LAN IPs are not secure contexts: crypto.randomUUID and subtle are
  // undefined there, unlike 127.0.0.1. Simulate this before loading the app.
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, "randomUUID", { configurable: true, value: undefined });
    Object.defineProperty(Crypto.prototype, "subtle", { configurable: true, value: undefined });
  });
  await page.goto("/");
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe("undefined");
  expect(await page.evaluate(() => typeof crypto.getRandomValues)).toBe("function");

  await page.getByRole("button", { name: "Fill Task" }).click();
  await expect(page.getByText("Weekly order").first()).toBeVisible();
  await page.getByRole("combobox", { name: "Line", exact: true }).click();
  await page.getByRole("option", { name: new RegExp(lineCode) }).click();
  await page.getByLabel("Task", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Save tasks" }).click();
  await expect(page.getByText("Tasks saved successfully")).toBeVisible();

  await page.getByRole("button", { name: "Job", exact: true }).click();
  const job = page.locator("article.task-card").filter({ has: page.locator("h3").filter({ hasText: title }) });
  await expect(job).toHaveCount(1);
  await job.getByRole("button", { name: "Start", exact: true }).click();
  await expect(job.locator("span.rounded-full")).toHaveText("In progress");
  await job.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(job.locator("span.rounded-full")).toHaveText("Paused");
  await job.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(job.locator("span.rounded-full")).toHaveText("In progress");
  await job.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("dialog", { name: "Confirm completion" })
    .getByRole("button", { name: "Confirm Done" }).click();
  await expect(job.locator("span.rounded-full")).toHaveText("Done");

  await page.reload();
  await page.getByRole("button", { name: "Job", exact: true }).click();
  await expect(job.locator("span.rounded-full")).toHaveText("Done");
});
