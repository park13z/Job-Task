import { expect, test } from "@playwright/test";

test("dashboard schedule row retains its job details after component extraction", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Fill Task" }).click();
  await page.getByLabel("Task", { exact: true }).fill("Dashboard row regression task");
  await page.getByRole("button", { name: "Save tasks" }).click();
  await expect(page.getByText("Tasks saved successfully")).toBeVisible();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  const row = page.locator("article").filter({ hasText: "Dashboard row regression task" });
  await expect(row).toBeVisible();
  await expect(row.getByText("Dashboard row regression task")).toBeVisible();
  await expect(row.getByText("Active", { exact: false })).toBeVisible();
  await expect(row.getByText("First started")).toBeVisible();
  await expect(row.getByText("Last paused")).toBeVisible();
  await expect(row.getByText("Last resumed")).toBeVisible();
});
