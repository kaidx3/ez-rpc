# @ez-rpc/router

[![npm](https://img.shields.io/npm/v/@ez-rpc/router)](https://www.npmjs.com/package/@ez-rpc/router)
[![license](https://img.shields.io/npm/l/@ez-rpc/router)](https://github.com/Bunch-Projects/ezRPC/blob/main/LICENSE)

An Express router that validates inputs and outputs against your Zod schemas automatically. You write the handler logic — it handles the validation, error responses, deduplication, and queuing.

## Install

```bash
npm install @ez-rpc/router express zod
npm install --save-dev @types/express
```

## Usage

Define your endpoints as a plain object with Zod schemas, then pass them to `createRouter`:

```ts
// contract/user.ts
import { z } from "zod";
import type { Endpoint } from "@ez-rpc/core";

export const userEndpoints = {
  getUsers: {
    output: z.array(UserSchema),
  } satisfies Endpoint,
  createUser: {
    input: z.object({ name: z.string(), email: z.string().email() }),
    output: UserSchema,
  } satisfies Endpoint,
} as const;

// server/routes/user.ts
import { createRouter } from "@ez-rpc/router";
import { userEndpoints } from "../../contract/user";

export const userRouter = createRouter(userEndpoints, authMiddleware).implement({
  getUsers: {
    handler: async (_input, req) => getUsersFromDB(req.pool),
  },
  createUser: {
    handler: async (input, req) => createUserInDB(req.pool, input),
  },
});

app.use("/user", userRouter);
```

For each route, the router validates the request body before calling your handler and validates the return value before sending the response. A bad input is a `400`. A schema mismatch on the output is a `500`. Both use the same Zod schemas your client is typed against — so compile-time and runtime stay in agreement.

## Concurrency queuing

Plug in a `createConcurrencyQueue` from `@ez-rpc/concurrency` to cap concurrent executions per route:

```ts
import { createConcurrencyQueue } from "@ez-rpc/concurrency";

const reportQueue = createConcurrencyQueue({ globalCap: 4, perUserCap: 1 });

const router = createRouter(reportEndpoints, authMiddleware).implement({
  generateReport: {
    handler: generateReportHandler,
    queue: { queue: reportQueue, key: (input) => input.projectId },
  },
});
```

## Other features

- **In-flight deduplication** — identical concurrent requests resolve from one promise instead of hitting your handler multiple times
- **NDJSON streaming** — mark an endpoint `streaming: true` and write rows as they come; the client reassembles them
- **HMAC signature verification** — validates signed requests from `@ez-rpc/client`
- **`createDBServiceHandler`** — one-liner adapter for `@ez-rpc/mssql` services:

```ts
import { createDBServiceHandler } from "@ez-rpc/router";

const userRouter = createRouter(userEndpoints, authMiddleware).implement({
  getUsers: { handler: createDBServiceHandler(getUsersService) },
});
```

## Full docs

See the [ez-rpc README](https://github.com/Bunch-Projects/ezRPC) for streaming, signing, and more.
