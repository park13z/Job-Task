import { expect, it } from "vitest";
import { createFixture } from "./harness/fixture";
import { successSchema, userDataSchema } from "../src/shared/contracts";

it("creates and edits a roster member with version controls", async () => {
  const f = await createFixture({seatBudget:"9"});
  try {
    const response = await f.request("/api/users", {user:"manager",body:{username:"extra",name:"Extra",role:"assistant",password:"ExtraUserPassword123!"}});
    expect(response.status).toBe(201);
    const user = successSchema(userDataSchema).parse(await response.json()).data.user;
    const update = await f.request("/api/users/"+user.id, {user:"manager",method:"PATCH",body:{expectedVersion:1,active:false}});
    expect(update.status).toBe(200);
    expect(successSchema(userDataSchema).parse(await update.json()).data.user.active).toBe(false);
    expect((await f.request("/api/users/"+user.id, {user:"manager",method:"PATCH",body:{expectedVersion:1,name:"Stale"}})).status).toBe(409);
  } finally { await f.close(); }
});
