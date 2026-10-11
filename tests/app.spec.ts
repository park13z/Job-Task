import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("manager creates a task; line leader and assistant complete it", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Job Task" })).toBeVisible();
  await page.getByRole("button", { name: "Fill Task" }).click();
  await expect(page.getByText("Weekly order").first()).toBeVisible();
  await page.getByLabel("Task", { exact: true }).fill("Pack 8 skids - browser test");
  await page.getByRole("button", { name: "Save tasks" }).click();
  await expect(page.getByText("Tasks saved successfully")).toBeVisible();
  await page.context().addCookies([{ name: "e2e_user", value: "leader", url: new URL(page.url()).origin }]);
  await page.reload();
  await page.getByRole("button", { name: "Job", exact: true }).click();
  const task = page.locator("article.task-card").filter({ hasText: "Pack 8 skids - browser test" });
  await expect(task).toHaveCount(1);
  await expect(task.getByRole("button", { name: "Start", exact: true })).toBeEnabled();
  await task.getByRole("button", { name: "Start", exact: true }).click();
  await expect(task.locator("span.rounded-full")).toHaveText("In progress");
  await expect(task.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
  await task.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(task.locator("span.rounded-full")).toHaveText("Paused");
  await expect(task.getByRole("button", { name: "Resume", exact: true })).toBeEnabled();
  await expect(task.getByRole("button", { name: "Done", exact: true })).toHaveCount(0);
  // Reload before resuming to ensure the pause really reached the D1 backend.
  await page.reload();
  await page.getByRole("button", { name: "Job", exact: true }).click();
  await expect(task.locator("span.rounded-full")).toHaveText("Paused");
  await page.context().addCookies([{ name: "e2e_user", value: "assistant", url: new URL(page.url()).origin }]);
  await page.reload();
  await page.getByRole("button", { name: "Job", exact: true }).click();
  await task.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(task.locator("span.rounded-full")).toHaveText("In progress");
  await expect(task.getByRole("button", { name: "Pause", exact: true })).toBeEnabled();
  await task.getByRole("button", { name: "Done", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Confirm completion" });
  await expect(dialog).toBeVisible();
  await expect(task.locator("span.rounded-full")).toHaveText("In progress");
  await dialog.getByRole("button", { name: "Confirm Done" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(task.locator("span.rounded-full")).toHaveText("Done");
  await expect(task.getByRole("button", { name: "Pause", exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Job", exact: true }).click();
  await expect(task.locator("span.rounded-full")).toHaveText("Done");
});

test("manager dashboard meets automated accessibility checks on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter(item => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);
});

test("manager and supervisor can operate any active line in the English UI", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Fill Task" }).click();
  await expect(page.getByText("Weekly order").first()).toBeVisible();
  await page.getByLabel("Task", { exact: true }).fill("Manager and supervisor shared task");
  await page.getByRole("button", { name: "Save tasks" }).click();
  await expect(page.getByText("Tasks saved successfully")).toBeVisible();
  await page.getByRole("button", { name: "Job", exact: true }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.context().addCookies([{ name: "e2e_user", value: "supervisor", url: new URL(page.url()).origin }]);
  await page.reload();
  await page.getByRole("button", { name: "Job", exact: true }).click();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Confirm Done" }).click();
  const jobCard = page.locator("article").filter({ hasText: "Manager and supervisor shared task" });
  await expect(jobCard.locator("span.rounded-full")).toHaveText("Done");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("User Profile replaces sidebar password action and keeps username read-only", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "User Profile" })).toBeVisible();
  await page.getByRole("button", { name: "User Profile" }).click();
  await expect(page.getByRole("heading", { name: "User Profile" })).toBeVisible();
  await expect(page.getByText("Your username cannot be changed.")).toBeVisible();
  await expect(page.locator('[aria-label="Username (cannot be changed)"]')).toHaveText("manager");
  await expect(page.getByRole("textbox", { name: /username/i })).toHaveCount(0);
  const name = page.getByRole("textbox", { name: "Change name" });
  await name.fill("Shift Manager");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("status")).toContainText("Name updated successfully.");
  await expect(page.locator(".surface-card").getByText("Shift Manager")).toBeVisible();
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("dialog", { name: "Change password" })).toBeVisible();
  await expect(page.getByLabel("Current password")).toBeVisible();
  await expect(page.getByLabel("New password (8+ characters)")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog", { name: "Change password" })).toHaveCount(0);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter(item => ["critical", "serious"].includes(item.impact ?? ""))).toEqual([]);
});

test("Live board shows today's queue and starts, ignores Dashboard week and enters full screen", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await page.getByRole("button", { name: "Fill Task" }).click();
  const today = await page.evaluate(async () => {
    const response = (await (await fetch("/api/changes")).json()) as { data: { businessDate: string } };
    return response.data.businessDate;
  });
  await page.getByRole("combobox", { name: "Work date" }).click();
  await page.getByRole("option", { name: today }).click();
  await expect(page.getByText("Weekly order").first()).toBeVisible();
  await page.getByLabel("Task", { exact: true }).fill("Live queue from today");
  await page.getByRole("button", { name: "Save tasks" }).click();
  await expect(page.getByText("Tasks saved successfully")).toBeVisible();
  // Two different tasks must occupy separate full-width horizontal rows.
  await page.getByRole("combobox", { name: "Work date" }).click();
  await page.getByRole("option", { name: today }).click();
  await expect(page.getByText("Weekly order").first()).toBeVisible();
  await page.getByLabel("Task", { exact: true }).fill("Second live queue");
  await page.getByRole("button", { name: "Save tasks" }).click();
  await expect(page.getByText("Tasks saved successfully")).toBeVisible();
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Live Job Board" })).toBeVisible();
  const queue = page.getByRole("region", { name: "Waiting Queue" });
  await expect(queue.locator("article.live-task")).toHaveCount(2);
  const sections = await page.locator(".live-lane").evaluateAll(nodes => nodes.map(node => {
    const { x, y, width } = node.getBoundingClientRect();
    return { x, y, width };
  }));
  expect(sections).toHaveLength(4);
  await expect(page.locator(".live-lane h3")).toHaveText(["DONE", "In Progressing", "Paused Today", "Waiting Queue"]);
  for (let i = 1; i < sections.length; i++) {
    expect(sections[i].y).toBeGreaterThan(sections[i - 1].y);
    expect(Math.abs(sections[i].x - sections[0].x)).toBeLessThan(2);
    expect(Math.abs(sections[i].width - sections[0].width)).toBeLessThan(2);
  }
  const queueRows = await queue.locator("article.live-task").evaluateAll(nodes => nodes.map(node => {
    const { x, y, width, height } = node.getBoundingClientRect();
    return { x, y, width, height };
  }));
  expect(queueRows[1].y).toBeGreaterThanOrEqual(queueRows[0].y + queueRows[0].height - 2);
  expect(Math.abs(queueRows[1].x - queueRows[0].x)).toBeLessThan(2);
  expect(queueRows[0].width).toBeGreaterThan(sections[1].width * .95);
  await expect(page.getByRole("region", { name: "Waiting Queue" }).getByText("Live queue from today")).toBeVisible();
  await expect(page.getByRole("region", { name: "In Progressing" }).getByText("Live queue from today")).toHaveCount(0);
  await expect(page.getByLabel("SELECT WEEK")).toHaveCount(0);
  await page.getByRole("button", { name: "Full screen" }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.getAttribute("aria-label"))).toBe("Live jobs today");
  const fullscreenRows = await page.locator(".live-lane").evaluateAll(nodes => nodes.map(node => ({
    x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y,
  })));
  expect(fullscreenRows[1].y).toBeGreaterThan(fullscreenRows[0].y);
  expect(Math.abs(fullscreenRows[1].x - fullscreenRows[0].x)).toBeLessThan(2);
  await page.getByRole("button", { name: "Exit full screen" }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
  await page.getByRole("button", { name: "Job", exact: true }).click();
  await page.locator("article").filter({ hasText: "Live queue from today" }).getByRole("button", { name: "Start", exact: true }).click();
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect(page.getByRole("region", { name: "In Progressing" }).getByText("Live queue from today")).toBeVisible();
  await expect(page.getByRole("region", { name: "Waiting Queue" }).getByText("Live queue from today")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Waiting Queue" }).getByText("Second live queue")).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const mobileRows = await page.getByRole("region", { name: "Waiting Queue" }).locator("article.live-task").evaluateAll(nodes => nodes.map(node => ({
    width: node.getBoundingClientRect().width, x: node.getBoundingClientRect().x,
  })));
  expect(mobileRows).toHaveLength(1);
  expect(mobileRows[0].width).toBeGreaterThan(280);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter(issue => ["serious", "critical"].includes(issue.impact ?? ""))).toEqual([]);
});

test("dashboard lets users jump directly to an ISO week and use the shared week controls", async ({ page }) => {
  await page.goto("/");
  const week = page.getByLabel("SELECT WEEK");
  await expect(week).toHaveAttribute("type", "week");
  const initial = await week.inputValue();
  await week.fill("2026-W53");
  await expect(week).toHaveValue("2026-W53");
  await expect(page.locator(".app-week-range")).toContainText("Dec 28, 2026");
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(week).toHaveValue("2027-W01");
  await page.getByRole("button", { name: "Previous week" }).click();
  await expect(week).toHaveValue("2026-W53");
  await page.getByRole("button", { name: "This week" }).click();
  await expect(week).toHaveValue(initial);
});

test("responsive operations console fits mobile, laptop and desktop without horizontal overflow", async ({ page }) => {
  test.setTimeout(90_000);
  for (const width of [375, 1366, 1920]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 1080 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Previous week" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Filter by line" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.getByRole("button", { name: "Fill Task" }).click();
    await expect(page.getByText("Weekly order").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.getByRole("button", { name: "Job", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Job", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
});

test("team settings uses separate full-page sections and Job List supports manual edits", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Team Settings" }).click();
  await expect(page.getByRole("heading", { name: "Team Settings" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Team settings sections" })).toBeVisible();
  await page.getByRole("button", { name: /Production Lines/ }).click();
  await expect(page.getByRole("heading", { name: "Add production line" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Team members" })).toHaveCount(0);
  await page.getByRole("button", { name: /Job List/ }).click();
  await expect(page.getByRole("heading", { name: "Add a reusable job" })).toBeVisible();
  await page.getByLabel("Job name", { exact: true }).fill("Saved job from catalog");
  await page.getByRole("checkbox", { name: /CKT1A/ }).first().check();
  await page.getByRole("button", { name: "Add to Job List" }).click();
  await expect(page.getByText("Saved job from catalog")).toBeVisible();
  await page.getByRole("button", { name: "Fill Task" }).click();
  await expect(page.getByText("Weekly order").first()).toBeVisible();
  await page.getByRole("combobox", { name: "Choose from Job List row 1" }).click();
  await page.getByRole("option", { name: "Saved job from catalog" }).click();
  await expect(page.getByLabel("Task", { exact: true })).toHaveValue("Saved job from catalog");
  await page.getByLabel("Task", { exact: true }).fill("Edited task after choosing from list");
  await page.getByRole("button", { name: "Save tasks" }).click();
  await expect(page.getByText("Tasks saved successfully")).toBeVisible();
  await page.getByRole("button", { name: "Job", exact: true }).click();
  await expect(page.getByText("Edited task after choosing from list")).toBeVisible();
  await page.getByRole("button", { name: "Team Settings" }).click();
  await page.getByRole("button", { name: /Job List/ }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Deactivate" }).click();
  await page.getByRole("button", { name: "Fill Task" }).click();
  await page.getByRole("combobox", { name: "Choose from Job List row 1" }).click();
  await expect(page.getByRole("option", { name: "Saved job from catalog" })).toHaveCount(0);
  await page.getByRole("option", { name: "Custom task — type your own" }).click();
  await page.getByLabel("Task", { exact: true }).fill("Entirely manual task");
  await expect(page.getByLabel("Task", { exact: true })).toHaveValue("Entirely manual task");
});

test("Team Settings sections remain usable and accessible on a 375px phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByRole("button", { name: "Team Settings" }).click();
  await expect(page.getByRole("heading", { name: "Team Settings" })).toBeVisible();
  await page.getByRole("button", { name: /Line Members/ }).click();
  await expect(page.getByRole("heading", { name: "Assign people to lines" })).toBeVisible();
  await page.getByRole("button", { name: /Job List/ }).click();
  await expect(page.getByRole("heading", { name: "Add a reusable job" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations.filter(issue => ["serious","critical"].includes(issue.impact ?? ""))).toEqual([]);
});

test("Job List filters saved jobs to the selected production line", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", {name:"Team Settings"}).click();
  await page.getByRole("button", {name:/Job List/}).click();

  await page.getByLabel("Job name", {exact:true}).fill("A-only packing");
  await page.getByRole("checkbox", {name:/CKT1A/}).first().check();
  await page.getByRole("button", {name:"Add to Job List"}).click();
  await expect(page.getByText("A-only packing")).toBeVisible();

  await page.getByLabel("Job name", {exact:true}).fill("B-only packing");
  await page.getByRole("checkbox", {name:/CKT1B/}).first().check();
  await page.getByRole("button", {name:"Add to Job List"}).click();
  await expect(page.getByText("B-only packing")).toHaveCount(0);

  await page.getByRole("combobox", {name:"Filter Job List by line"}).click();
  await page.getByRole("option", {name:/CKT1B/}).click();
  await expect(page.getByText("B-only packing")).toBeVisible();
  await expect(page.getByText("A-only packing")).toHaveCount(0);

  await page.getByRole("button", {name:"Fill Task"}).click();
  const picker = page.getByRole("combobox", {name:"Choose from Job List row 1"});
  await picker.click();
  await expect(page.getByRole("option", {name:"A-only packing"})).toBeVisible();
  await expect(page.getByRole("option", {name:"B-only packing"})).toHaveCount(0);
  await page.getByRole("option", {name:"A-only packing"}).click();
  await expect(page.getByLabel("Task", {exact:true})).toHaveValue("A-only packing");

  await page.getByRole("combobox", {name:"Line",exact:true}).click();
  await page.getByRole("option", {name:/CKT1B/}).click();
  await expect(page.getByLabel("Task", {exact:true})).toHaveValue("");
  await picker.click();
  await expect(page.getByRole("option", {name:"A-only packing"})).toHaveCount(0);
  await expect(page.getByRole("option", {name:"B-only packing"})).toBeVisible();
  await page.getByRole("option", {name:"B-only packing"}).click();
  await expect(page.getByLabel("Task", {exact:true})).toHaveValue("B-only packing");
  await page.getByLabel("Task", {exact:true}).fill("Custom name for B");
  await page.getByRole("combobox", {name:"Line",exact:true}).click();
  await page.getByRole("option", {name:/CKT1A/}).click();
  await expect(page.getByLabel("Task", {exact:true})).toHaveValue("Custom name for B");
});

test("Job Task shows username login, signs in and signs out",async({page})=>{
  await page.context().addCookies([{name:"e2e_user",value:"anon",url:"http://127.0.0.1:4173"}]);
  await page.goto("/");
  await expect(page.getByRole("heading",{name:"Welcome back"})).toBeVisible();
  await expect(page.getByLabel("Username")).toBeVisible();
  await page.getByLabel("Username").fill("manager");
  await page.getByLabel("Password",{exact:true}).fill("LocalTestPassword123!");
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Dashboard"})).toBeVisible();
  await page.getByRole("button",{name:"Sign out"}).click();
  await expect(page.getByRole("heading",{name:"Welcome back"})).toBeVisible();
});

test("Sign in accepts two-character usernames such as Ex", async ({ page }) => {
  await page.context().addCookies([{ name: "e2e_user", value: "anon", url: "http://127.0.0.1:4173" }]);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  const username = page.getByLabel("Username");
  await expect(username).toHaveAttribute("minlength", "2");
  await username.fill("Ex");
  await page.getByLabel("Password", { exact: true }).fill("Incorrect123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid username or password.");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});


test("Login text caret stays in editable fields, not on headings or empty panel", async ({ page }) => {
  await page.context().addCookies([{ name: "e2e_user", value: "anon", url: "http://127.0.0.1:4173" }]);
  await page.goto("/");
  const heading = page.getByRole("heading", { name: "Welcome back" });
  const username = page.getByLabel("Username");
  const password = page.getByLabel("Password", { exact: true });
  await expect(heading).toBeVisible();
  await expect(heading).toHaveCSS("user-select", "none");
  await expect(username).toHaveCSS("user-select", "text");
  await expect(password).toHaveCSS("user-select", "text");
  await username.fill("Ex");
  await expect(username).toBeFocused();
  await heading.click();
  await expect(username).not.toBeFocused();
  await username.click();
  await expect(username).toBeFocused();
  await password.click();
  await expect(password).toBeFocused();
});

test("Job Task credits its original developer in the footer", async ({ page }) => {
  await page.goto("/");
  const footer = page.locator("footer.app-footer");
  await expect(footer).toContainText("Sanongboon Poona / Truly Green Farms");
  await expect(footer).toContainText("© 2026");
  await expect(footer).toContainText("MIT License");
});
