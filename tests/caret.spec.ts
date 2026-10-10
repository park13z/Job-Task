import { expect, test } from "@playwright/test";

test("the caret stays hidden on display content across application pages", async ({ page }) => {
  await page.goto("/");
  const pages = ["Dashboard", "Fill Task", "Job", "Live", "Team Settings", "User Profile"];
  for (const name of pages) {
    await page.getByRole("button", { name, exact: true }).click();
    const title = page.locator(".app-topbar-title");
    await expect(title).toBeVisible();
    await expect(title).toHaveCSS("caret-color", "rgba(0, 0, 0, 0)");
    await expect(title).toHaveCSS("cursor", "default");
    await expect(page.locator("body")).toHaveCSS("caret-color", "rgba(0, 0, 0, 0)");
    // Hide the insertion caret, but preserve ability to copy/select read-only text.
    expect(await title.evaluate(element => getComputedStyle(element).userSelect)).not.toBe("none");
    const field = page.locator('input:not([type="hidden"]), textarea').first();
    if (await field.count()) {
      await expect(field).toHaveCSS("caret-color", /rgb\(/);
      await expect(field).toHaveCSS("cursor", "text");
    }
  }
  await page.getByRole("button", { name: "Change password" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox").first()).toHaveCSS("caret-color", /rgb\(/);
  await expect(dialog.locator("p").first()).toHaveCSS("caret-color", "rgba(0, 0, 0, 0)");
});

test("the sign-in form keeps the caret in real text fields only", async ({ page }) => {
  await page.context().addCookies([{ name: "e2e_user", value: "anon", url: "http://127.0.0.1:4174" }]);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  const username = page.getByLabel("Username");
  await expect(username).toHaveCSS("caret-color", /rgb\(/);
  await expect(username).toHaveCSS("cursor", "text");
  await username.fill("sample-user");
  await expect(username).toHaveValue("sample-user");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toHaveCSS("caret-color", "rgba(0, 0, 0, 0)");
});
