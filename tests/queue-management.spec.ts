import { test, expect } from "@playwright/test";

test("Unlock permits mouse dragging, Undo unwinds each drop, Save needs reason, and Lock protects queue", async ({ page }) => {
  await page.goto("/fill-task");
  const stamp = crypto.randomUUID().slice(0,8);
  const titles = ["A","B","C"].map(letter => "Queue UX "+stamp+" "+letter);
  for (const title of titles) {
    await page.getByRole("textbox",{name:"Task",exact:true}).fill(title);
    await page.getByRole("button",{name:"Save tasks"}).click();
    await expect(page.getByText("Tasks saved successfully")).toBeVisible();
  }
  const rows = page.locator('[data-testid="queue-row"]');
  const a = rows.filter({hasText:titles[0]});
  const b = rows.filter({hasText:titles[1]});
  const c = rows.filter({hasText:titles[2]});
  await expect(a).toHaveCount(1);
  await expect(b).toHaveCount(1);
  await expect(c).toHaveCount(1);
  await expect(a).toHaveAttribute("data-drag-enabled","false");
  await page.getByRole("button",{name:"Unlock Queue"}).click();
  await expect(a).toHaveAttribute("data-drag-enabled","true");

  const position = async () => rows.allTextContents().then(all=>titles.map(t=>all.findIndex(line=>line.includes(t))));
  const initial = await position();
  const dragRow = async (from: typeof a, to: typeof a) => {
    await to.scrollIntoViewIfNeeded();
    await from.scrollIntoViewIfNeeded();
    const source=await from.getByTestId("drag-handle").boundingBox();
    const target=await to.getByTestId("drag-handle").boundingBox();
    if(!source||!target)throw new Error("Cannot drag invisible queue rows");
    await page.mouse.move(source.x+source.width/2,source.y+source.height/2);
    await page.mouse.down();
    await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:12});
    await page.mouse.up();
  };
  await dragRow(a,c);
  await expect.poll(position).not.toEqual(initial);
  await expect(page.getByTestId("queue-undo-btn")).toBeEnabled();
  await page.getByTestId("queue-undo-btn").click();
  await expect.poll(position).toEqual(initial);
  await expect(page.getByTestId("queue-undo-btn")).toBeDisabled();

  await dragRow(a,b);
  await dragRow(a,c);
  await dragRow(b,c);
  await expect(page.getByTestId("queue-undo-btn")).toContainText("(3)");
  await page.getByTestId("queue-undo-btn").click();
  await page.getByTestId("queue-undo-btn").click();
  await page.getByTestId("queue-undo-btn").click();
  await expect.poll(position).toEqual(initial);
  await dragRow(a,c);

  await page.getByRole("button",{name:"Lock Queue",exact:true}).click();
  await expect(page.getByRole("dialog",{name:"Unsaved queue changes"})).toBeVisible();
  await page.getByRole("button",{name:"Keep editing"}).click();
  await page.getByRole("button",{name:"Save",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Reason required"});
  await expect(dialog.getByRole("button",{name:"Confirm & Save"})).toBeDisabled();
  await dialog.getByTestId("queue-save-reason").fill("Production sequence adjusted");
  await dialog.getByRole("button",{name:"Confirm & Save"}).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button",{name:"Lock Queue",exact:true}).click();
  await expect(page.getByRole("button",{name:"Unlock Queue"})).toBeVisible();
  await expect(a).toHaveAttribute("data-drag-enabled","false");
});

test("Insert, Delete, Cancel and Recall all require reasons and preserve queue labels", async ({page}) => {
  await page.goto("/fill-task");
  const stamp = crypto.randomUUID().slice(0,8);
  const title = "Queue changes "+stamp;
  await page.getByRole("textbox",{name:"Task",exact:true}).fill(title);
  await page.getByRole("button",{name:"Save tasks"}).click();
  const base = page.locator('[data-testid="queue-row"]').filter({hasText:title});
  await expect(base).toHaveCount(1);

  await page.getByRole("button",{name:"Add Queue",exact:true}).click();
  const insertedTitle="Inserted rush "+stamp;
  await page.locator("#queue-new-title").fill(insertedTitle);
  await page.locator("#queue-above").fill("1");
  await page.getByRole("button",{name:"Insert & Confirm"}).click();
  let dialog=page.getByRole("dialog",{name:"Reason required"});
  await expect(dialog).toBeVisible();
  await dialog.getByTestId("queue-save-reason").fill("Urgent addition");
  await dialog.getByRole("button",{name:"Confirm & Save"}).click();
  const inserted = page.locator('[data-testid="queue-row"]').filter({hasText:insertedTitle});
  await expect(inserted).toContainText(/Inserted #\d+/);

  await base.getByRole("button",{name:"Cancel"}).click();
  dialog=page.getByRole("dialog",{name:"Reason required"});
  await dialog.getByTestId("queue-save-reason").fill("Customer cancelled");
  await dialog.getByRole("button",{name:"Confirm & Save"}).click();
  const cancelled=page.getByText(title).locator("..").locator("..");
  await expect(page.getByText("Cancelled · Job #").first()).toBeVisible();
  await expect(page.locator('[data-testid="queue-row"]').filter({hasText:title})).toHaveCount(0);
  const recall=page.getByRole("button",{name:"Recall Order"}).last();
  await recall.click();
  dialog=page.getByRole("dialog",{name:"Reason required"});
  await dialog.getByTestId("queue-save-reason").fill("Customer reactivated");
  await dialog.getByRole("button",{name:"Confirm & Save"}).click();
  await expect(base).toHaveCount(1);

  await base.getByRole("button",{name:"Delete"}).click();
  dialog=page.getByRole("dialog",{name:"Reason required"});
  await dialog.getByTestId("queue-save-reason").fill("Order cancelled permanently");
  await dialog.getByRole("button",{name:"Confirm & Save"}).click();
  await expect(base).toHaveCount(0);
  await expect(inserted).toHaveCount(1);
});

test("Inserting during an unlocked clean queue relocks and rehydrates the latest rows", async ({page}) => {
  await page.goto("/fill-task");
  const stamp=crypto.randomUUID().slice(0,8);
  const title="Unlock insert "+stamp;
  await page.getByRole("textbox",{name:"Task",exact:true}).fill(title);
  await page.getByRole("button",{name:"Save tasks"}).click();
  await expect(page.locator('[data-testid="queue-row"]').filter({hasText:title})).toHaveCount(1);

  await page.getByRole("button",{name:"Unlock Queue"}).click();
  await expect(page.getByRole("button",{name:"Lock Queue",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Add Queue",exact:true}).click();
  const added="During unlock "+stamp;
  await page.locator("#queue-new-title").fill(added);
  await page.getByRole("button",{name:"Insert & Confirm"}).click();
  const dialog=page.getByRole("dialog",{name:"Reason required"});
  await dialog.getByTestId("queue-save-reason").fill("Urgent order");
  await dialog.getByRole("button",{name:"Confirm & Save"}).click();

  const inserted=page.locator('[data-testid="queue-row"]').filter({hasText:added});
  await expect(page.getByRole("button",{name:"Unlock Queue"})).toBeVisible();
  await expect(inserted).toHaveCount(1);
  await expect(inserted).toHaveAttribute("data-drag-enabled","false");
  await page.getByRole("button",{name:"Unlock Queue"}).click();
  await expect(inserted).toHaveAttribute("data-drag-enabled","true");
  await expect(page.getByTestId("queue-undo-btn")).toBeDisabled();
});
