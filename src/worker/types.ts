import type { User } from "../shared/contracts";

export interface Env {
  DB: D1Database;
  USER_LIMIT: string;
  LOCAL_HTTP_SESSION?: string;
  ASSETS?: Fetcher;
}

export type App = { Bindings: Env; Variables: { actor: User; at: number } };
