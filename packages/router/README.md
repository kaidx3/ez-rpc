# @ez-rpc/router

[![npm](https://img.shields.io/npm/v/@ez-rpc/router)](https://www.npmjs.com/package/@ez-rpc/router)
[![license](https://img.shields.io/npm/l/@ez-rpc/router)](https://github.com/Bunch-Projects/ezRPC/blob/main/LICENSE)

Type-safe Express router with Zod input/output validation, in-flight request deduplication, and concurrency queuing. The server half of ezRPC.

Pass it your contract (a map of `Endpoint` objects with Zod schemas) and implement each handler. The router validates every request in and every response out automatically.

## Install

```bash
npm install @ez-rpc/router express zod
npm install --save-dev @types/express
```

## Quick start

```ts
// contract/user.ts
import { z } from "zod";
import type { Endpoint } from "@ez-rpc/core";

export const userEndpoints = {
  getUsers: { output: z.array(UserSchema) } satisfies Endpoint,
  createUser: { input: CreateUserSchema, output: UserSchema } satisfies Endpoint,
} as const;

// server/routes/user.ts
import { createRouter } from "@ez-rpc/router";
import { userEndpoints } from "../../contract/user";

export const userRouter = createRouter(userEndpoints, authMiddleware).implement({
  getUsers: {
    handler: async (_input, req) => getUsersService(req.pool),
  },
  createUser: {
    handler: async (input, req) => createUserService(req.pool, input),
  },
});

// server/index.ts
app.use("/user", userRouter);
```

Every `POST /user/getUsers` will:
1. Validate the request body against `getUsers.input` (if defined) — 400 on failure
2. Run your handler
3. Validate the return value against `getUsers.output` (if defined) — 500 on mismatch
4. Send `{ success: true, data: ... }`

## Key features

- **Zod validation** on every input and output — no `any`, no silent type drift
- **In-flight deduplication** — identical concurrent requests resolve from one promise
- **Concurrency queuing** — plug in a `createConcurrencyQueue` per-route
- **NDJSON streaming** — mark an endpoint `streaming: true`, write rows, client reassembles
- **HMAC signature verification** — middleware validates signed requests from `@ez-rpc/client`
- **`createDBServiceHandler`** — zero-boilerplate adapter for `@ez-rpc/mssql` services

## MSSQL shorthand

```ts
import { createDBServiceHandler } from "@ez-rpc/router";
import { getUsersService } from "../services/user";

const userRouter = createRouter(userEndpoints, authMiddleware).implement({
  getUsers: { handler: createDBServiceHandler(getUsersService) },
});
```

## Full docs

See the [ezRPC monorepo README](https://github.com/Bunch-Projects/ezRPC) for concurrency queuing, streaming, auth middleware setup, and more.
