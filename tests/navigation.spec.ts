import { test, expect } from "@playwright/test";

test("each workspace tab has a shareable URL, and direct links survive reload", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
  const tabs = [
    ["Fill Task", "/fill-task", "Fill Task"],
    ["Job", "/job", "Job"],
    ["Live", "/live", "Live Job Board"],
    ["Dashboard", "/dashboard", "Dashboard"],
  ] as const;
  for (const [button, pathname, title] of tabs) {
    await page.getByRole("button", { name: button, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(pathname + "$"));
    await expect(page.getByRole("heading", { name: title, exact: true }).first()).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(new RegExp(pathname + "$"));
    await expect(page.getByRole("heading", { name: title, exact: true }).first()).toBeVisible();
  }
  await page.getByRole("button", { name: "User Profile" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "User Profile" })).toBeVisible();

  await page.getByRole("button", { name: "Team Settings" }).click();
  await expect(page).toHaveURL(/\/team-settings$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Team Settings" })).toBeVisible();

  // Back and Forward need to update page contents, not only the address bar.
  await page.goBack();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("heading", { name: "User Profile" })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/team-settings$/);
  await expect(page.getByRole("heading", { name: "Team Settings" })).toBeVisible();
});

test("direct deep link loads the right page even without prior navigation", async ({ page }) => {
  await page.goto("/live");
  await expect(page).toHaveURL(/\/live$/);
  await expect(page.getByRole("heading", { name: "Live Job Board" })).toBeVisible();
  await page.goto("/fill-task");
  await expect(page.getByRole("heading", { name: "Fill Task" })).toBeVisible();
  await page.goto("/job");
  await expect(page.getByRole("heading", { name: "Job", exact: true })).toBeVisible();

  // An unrecognized URL normalizes to the default page without a blank view.
  await page.goto("/this-is-not-a-page");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("role-limited URLs fall back to dashboard for non-planners", async ({ page }) => {
  await page.context().addCookies([{ name: "e2e_user", value: "leader", url: "http://127.0.0.1:4174" }]);
  await page.goto("/fill-task");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.goto("/team-settings");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.goto("/team-settings/lines");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.goto("/live");
  await expect(page.getByRole("heading", { name: "Live Job Board" })).toBeVisible();
});

test("Team Settings section URLs survive direct entry, reload, and history navigation", async ({ page }) => {
  await page.goto("/team-settings/lines");
  await expect(page).toHaveURL(/\/team-settings\/lines$/);
  await expect(page.getByRole("heading", { name: "Add production line" })).toBeVisible();
  const sections = page.getByRole("navigation", { name: "Team settings sections" });
  await sections.getByRole("button", { name: /Line Members/ }).click();
  await expect(page).toHaveURL(/\/team-settings\/members$/);
  await expect(page.getByRole("heading", { name: "Assign people to lines" })).toBeVisible();
  await sections.getByRole("button", { name: /Job List/ }).click();
  await expect(page).toHaveURL(/\/team-settings\/job-list$/);
  await page.reload();
  await expect(page).toHaveURL(/\/team-settings\/job-list$/);
  await expect(sections.getByRole("button", { name: /Job List/ })).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(page).toHaveURL(/\/team-settings\/members$/);
  await expect(page.getByRole("heading", { name: "Assign people to lines" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/team-settings\/lines$/);
  await expect(page.getByRole("heading", { name: "Add production line" })).toBeVisible();
  await sections.getByRole("button", { name: /Users/ }).click();
  await expect(page).toHaveURL(/\/team-settings\/users$/);
  await expect(page.getByRole("heading", { name: "Add user" })).toBeVisible();
});
