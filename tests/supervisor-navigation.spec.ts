import { test, expect } from "@playwright/test";

test("Supervisor can add lines and saved jobs without seeing Manager-only tools", async ({page}) => {
  await page.context().addCookies([{name:"e2e_user",value:"supervisor",url:"http://127.0.0.1:4174"}]);
  await page.goto("/team-settings/lines");
  await expect(page.getByRole("heading",{name:"Add production line"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Add line"})).toBeVisible();
  const sections=page.getByRole("navigation",{name:"Team settings sections"});
  await expect(sections.getByRole("button",{name:/Users|Line Members|Live Displays/})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Edit line"})).toHaveCount(0);
  await sections.getByRole("button",{name:/Job List/}).click();
  await expect(page).toHaveURL(/\/team-settings\/job-list$/);
  await expect(page.getByRole("button",{name:"Add to Job List"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Edit",exact:true})).toHaveCount(0);

  await page.goto("/team-settings/displays");
  await expect(page).toHaveURL(/\/team-settings\/lines$/);
  await page.goto("/team-settings/users");
  await expect(page).toHaveURL(/\/team-settings\/lines$/);
  await page.goto("/fill-task");
  await expect(page.getByRole("heading",{name:"Fill Task"})).toBeVisible();
});
