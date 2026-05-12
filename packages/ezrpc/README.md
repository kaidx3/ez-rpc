# ezrpc

[![npm](https://img.shields.io/npm/v/ez-rpc)](https://www.npmjs.com/package/ez-rpc)
[![license](https://img.shields.io/npm/l/ez-rpc)](https://github.com/Bunch-Projects/ezRPC/blob/main/LICENSE)

Type-safe, contract-first RPC for Express + Next.js monorepos.

Define Zod schemas once. Get validated server routes and a typed fetch client automatically — no code generation, no runtime magic, no `any`.

This is the umbrella package. It re-exports everything from the ezRPC ecosystem via three import paths:

| Import | Use for |
|---|---|
| `ez-rpc` | Shared types only — safe in browser, edge, or SSR |
| `ezrpc/server` | Express router, DB adapter, concurrency queue — Node.js only |
| `ezrpc/client` | Typed fetch client — browser and SSR safe |

## Install

```bash
npm install ez-rpc zod

# Peer deps (install what you use):
npm install express        # if using ezrpc/server
npm install mssql          # if using createDBService from ezrpc/server
```

## Quick start

```ts
// contract/user.ts — shared between server and client
import { z } from "zod";
import type { Endpoint } from "ez-rpc";

export const userEndpoints = {
  getUsers: { output: z.array(UserSchema) } satisfies Endpoint,
  createUser: { input: CreateSchema, output: UserSchema } satisfies Endpoint,
} as const;

// server/routes/user.ts
import { createRouter } from "ez-rpc/server";
import { userEndpoints } from "../../contract/user";

export const userRouter = createRouter(userEndpoints, authMiddleware).implement({
  getUsers:   { handler: async (_input, req) => getUsersService(req.pool) },
  createUser: { handler: async (input, req)  => createUserService(req.pool, input) },
});
app.use("/user", userRouter);

// web-client/api/userApi.ts
import { createApiClient } from "ez-rpc/client";
import { userEndpoints } from "../../contract/user";

export const userApi = createApiClient(userEndpoints, "/user");

// In a component — fully typed, no manual type annotations needed
const { data: users } = await userApi.getUsers();
```

## Selective installation

If you only need part of the ecosystem, install individual packages instead:

```bash
npm install @ez-rpc/core zod           # shared types only
npm install @ez-rpc/router express zod  # server-side router
npm install @ez-rpc/client zod          # fetch client
npm install @ez-rpc/mssql mssql zod     # MSSQL adapter
npm install @ez-rpc/concurrency         # async queue (zero deps)
```

## Full docs

See the [ezRPC monorepo README](https://github.com/Bunch-Projects/ezRPC) for the full feature guide: MSSQL key mapping, NDJSON streaming, concurrency queuing, HMAC signing, and more.
