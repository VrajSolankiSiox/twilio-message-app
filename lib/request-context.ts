import { AsyncLocalStorage } from "node:async_hooks";

/** Set by the standalone API process so route handlers do not call Next cookies(). */
export const requestContext = new AsyncLocalStorage<{ token: string | null }>();
