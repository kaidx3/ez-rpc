# @ez-rpc/ez-rpc

[![npm](https://img.shields.io/npm/v/@ez-rpc/ez-rpc)](https://www.npmjs.com/package/@ez-rpc/ez-rpc)
[![license](https://img.shields.io/npm/l/@ez-rpc/ez-rpc)](https://github.com/Bunch-Projects/ezRPC/blob/main/LICENSE)

@ez-rpc/ez-rpc is a lightweight RPC layer for monorepos with an Express API. Define your API once as Zod schemas and get a validated Express router on the server and a fully typed fetch client on the front end — no codegen, no duplicated types, no `any`.

This is the umbrella package. It re-exports everything from the ez-rpc ecosystem:

| Import | Contains |
|---|---|
| `@ez-rpc/ez-rpc` | Shared types (`Endpoint`, `ApiResponse`) — safe anywhere |
| `@ez-rpc/ez-rpc/server` | Express router, MSSQL adapter, concurrency queue — Node.js only |
| `@ez-rpc/ez-rpc/client` | Fetch client — browser and SSR safe |

## Install

```bash
npm install @ez-rpc/ez-rpc zod

# Peer dependencies — install what you use:
npm install express   # for @ez-rpc/ez-rpc/server
npm install mssql     # for createDBService
```

## Quick start

```ts
// contract/user.ts — imported by both server and client
import { z } from "zod";
import type { Endpoint } from "@ez-rpc/ez-rpc";

const UserSchema = z.object({ id: z.string(), name: z.string(), email: z.string().email() });

export const userEndpoints = {
  getUsers: { output: z.array(UserSchema) } satisfies Endpoint,
  createUser: {
    input: z.object({ name: z.string(), email: z.string().email() }),
    output: UserSchema,
  } satisfies Endpoint,
} as const;

// server/routes/user.ts
import { createRouter } from "@ez-rpc/ez-rpc/server";
import { userEndpoints } from "../../contract/user";

export const userRouter = createRouter(userEndpoints, authMiddleware).implement({
  getUsers:   { handler: async (_input, req) => getUsersFromDB(req.pool) },
  createUser: { handler: async (input, req)  => createUserInDB(req.pool, input) },
});
app.use("/user", userRouter);

// web-client/api/userApi.ts
import { createApiClient } from "@ez-rpc/ez-rpc/client";
import { userEndpoints } from "../../contract/user";

export const userApi = createApiClient(userEndpoints, "/user");

// fully typed — argument and return types come from your Zod schemas
const { data: users } = await userApi.getUsers();
const { data: newUser } = await userApi.createUser({ name: "Alice", email: "alice@example.com" });
```

## Install only what you need

```bash
npm install @ez-rpc/router express zod   # server only
npm install @ez-rpc/client zod           # client only
npm install @ez-rpc/mssql mssql zod      # MSSQL query wrapper (standalone)
npm install @ez-rpc/concurrency          # async concurrency queue (zero deps)
```

## Full docs

See the [ez-rpc README](https://github.com/Bunch-Projects/ezRPC) for streaming, concurrency queuing, HMAC signing, MSSQL key mapping, and more.
