import { test, expect } from "@playwright/test";
import { TEST_PASSWORD } from "./harness/fixture";

test("unapproved browser waits until Manager approves; revocation hides Live", async ({ browser }) => {
  const screen = await browser.newPage();
  const manager = await browser.newPage();
  try {
    await screen.goto("/display/live");
    await expect(screen.getByText("Waiting for Manager Approval")).toBeVisible({timeout:20000});
    await manager.context().addCookies([{name:"e2e_user",value:"anon",url:"http://127.0.0.1:4174"}]);
    await manager.goto("/team-settings/displays");
    await manager.getByLabel("Username").fill("manager");
    await manager.getByLabel("Password",{exact:true}).fill(TEST_PASSWORD);
    await manager.getByRole("button",{name:"Sign in",exact:true}).click();
    await expect(manager.getByText(/Waiting for Approval \(\d+\)/)).toBeVisible({timeout:12000});
    await expect(manager.getByRole("button",{name:"Approve"}).first()).toBeVisible();
    const approvalResponse = manager.waitForResponse(response => response.url().includes("/api/display/devices/") && response.url().endsWith("/approve"));
    await manager.getByRole("button",{name:"Approve"}).first().click();
    const decision = await approvalResponse;
    expect(decision.status(), await decision.text()).toBe(200);
    await expect(manager.getByRole("button",{name:"Revoke"}).first()).toBeVisible({timeout:10000});
    await expect.poll(async () => { const response = await screen.request.get("/api/display/state"); const payload = await response.json(); return payload.data?.status; },{timeout:10000}).toBe("approved");
    await expect(screen.getByRole("heading",{name:"Live Job Board"})).toBeVisible({timeout:20000});
    await screen.reload();
    await expect(screen.getByRole("heading",{name:"Live Job Board"})).toBeVisible({timeout:12000});
    await manager.getByRole("button",{name:"Revoke"}).first().click();
    await expect(screen.getByText("Display access revoked")).toBeVisible({timeout:18000});
    await expect(screen.getByRole("heading",{name:"Live Job Board"})).toHaveCount(0);
  } finally {
    await screen.close();
    await manager.close();
  }
});
