import { test, expect } from "@playwright/test";

test("Job page validates one In Progress per line and explains blocked Start and Resume", async ({ page }) => {
  // Create a test-only production line to isolate this test from other files
  // sharing the same in-memory backend fixture.
  const suffix = crypto.randomUUID().slice(0, 8);
  const lineResponse = await page.request.post("/api/lines", { data: {
    code: "QA-" + suffix, name: "QA Single Line " + suffix,
  } });
  expect(lineResponse.status()).toBe(201);
  const line = (await lineResponse.json()).data.line as { id: string };
  const changes = await page.request.get("/api/changes");
  expect(changes.ok()).toBe(true);
  const workDate = (await changes.json()).data.businessDate as string;
  const firstTitle = "QA line first " + suffix;
  const secondTitle = "QA line second " + suffix;
  const create = await page.request.post("/api/jobs", {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: { items: [
      { title: firstTitle, workDate, lineId: line.id },
      { title: secondTitle, workDate, lineId: line.id },
    ] },
  });
  expect(create.status()).toBe(201);
  await page.goto("/job");
  const first = page.locator("article.task-card").filter({ has: page.getByRole("heading", { name: firstTitle, exact: true }) });
  const second = page.locator("article.task-card").filter({ has: page.getByRole("heading", { name: secondTitle, exact: true }) });
  await expect(first).toHaveCount(1);
  await expect(second).toHaveCount(1);
  await first.getByRole("button", { name: "Start", exact: true }).click();
  await expect(first.locator("span.rounded-full")).toHaveText("In progress");
  await expect(second.getByRole("button", { name: /Start unavailable/ })).toBeDisabled();
  await expect(second.getByText(/This line is already running/)).toContainText(firstTitle);
  await first.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(first.locator("span.rounded-full")).toHaveText("Paused");
  await expect(second.getByRole("button", { name: "Start", exact: true })).toBeEnabled();
  await second.getByRole("button", { name: "Start", exact: true }).click();
  await expect(second.locator("span.rounded-full")).toHaveText("In progress");
  await expect(first.getByRole("button", { name: /Resume unavailable/ })).toBeDisabled();
  await expect(first.getByText(/This line is already running/)).toContainText(secondTitle);
  await second.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("dialog", { name: "Confirm completion" }).getByRole("button", { name: "Confirm Done" }).click();
  await expect(first.getByRole("button", { name: "Resume", exact: true })).toBeEnabled();
  await first.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(first.locator("span.rounded-full")).toHaveText("In progress");
  await first.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("dialog", { name: "Confirm completion" }).getByRole("button", { name: "Confirm Done" }).click();
  await expect(first.locator("span.rounded-full")).toHaveText("Done");
});
