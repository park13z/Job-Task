import { test, expect } from "@playwright/test";

test("Fill Task keeps the selected work date after save and for subsequent rows", async ({ page }) => {
  await page.goto("/fill-task");
  const workDate = page.getByRole("combobox", { name: "Work date" });
  await expect(workDate).toHaveCount(1);
  await workDate.click();
  const day = page.getByRole("option").nth(3);
  const selected = (await day.innerText()).trim();
  await day.click();
  await expect(workDate).toContainText(selected);

  await page.getByRole("textbox", { name: "Task", exact: true }).fill("Keep selected date first save");
  await page.getByRole("button", { name: "Save tasks" }).click();
  await expect(page.getByText("Tasks saved successfully")).toBeVisible();
  await expect(workDate).toContainText(selected);
  await expect(page.getByRole("textbox", { name: "Task", exact: true })).toBeEmpty();

  await page.getByRole("button", { name: "Add row" }).click();
  await expect(workDate).toHaveCount(2);
  for (const select of await workDate.all()) await expect(select).toContainText(selected);
  await page.getByRole("button", { name: "Remove row" }).last().click();
  await expect(workDate).toHaveCount(1);

  await page.getByRole("textbox", { name: "Task", exact: true }).fill("Keep selected date second save");
  await page.getByRole("button", { name: "Save tasks" }).click();
  await expect(page.getByText("Tasks saved successfully")).toBeVisible();
  await expect(workDate).toContainText(selected);
  await expect(page.getByText("Keep selected date first save")).toBeVisible();
  await expect(page.getByText("Keep selected date second save")).toBeVisible();
});

test("a job scheduled next week can Start early and appears in Live In Progress", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Next week" }).click();
  await page.getByRole("button", { name: "Fill Task" }).click();
  await page.getByRole("textbox", { name: "Task", exact: true }).fill("Early start of next week's task");
  await page.getByRole("button", { name: "Save tasks" }).click();
  await expect(page.getByText("Tasks saved successfully")).toBeVisible();

  await page.getByRole("button", { name: "Job", exact: true }).click();
  const card = page.locator("article.task-card").filter({ has: page.locator("h3").filter({ hasText: "Early start of next week's task" }) });
  await expect(card).toHaveCount(1);
  await expect(card.getByRole("button", { name: "Start", exact: true })).toBeEnabled();
  await card.getByRole("button", { name: "Start", exact: true }).click();
  await expect(card.locator("span.rounded-full")).toHaveText("In progress");
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect(page.getByRole("region", { name: "In Progressing" })
    .getByText("Early start of next week's task")).toBeVisible();
  await expect(page.getByRole("region", { name: "Waiting Queue" })
    .getByText("Early start of next week's task")).toHaveCount(0);
  // Finish the fixture's job: don't block later cases running on the same line.
  await page.getByRole("button", { name: "Job", exact: true }).click();
  await card.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("dialog", { name: "Confirm completion" })
    .getByRole("button", { name: "Confirm Done" }).click();
  await expect(card.locator("span.rounded-full")).toHaveText("Done");
});
