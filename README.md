# @ez-rpc/ez-rpc

[![npm](https://img.shields.io/npm/v/@ez-rpc/ez-rpc)](https://www.npmjs.com/package/@ez-rpc/ez-rpc)
[![license](https://img.shields.io/npm/l/@ez-rpc/ez-rpc)](https://github.com/Bunch-Projects/ezRPC/blob/main/LICENSE)

ez-rpc is a lightweight RPC layer for monorepos with an Express API. You define your API as plain Zod schemas, and it handles the rest — validated routes on the server, a typed fetch client on the front end, no codegen required.

The problem it solves: in a TypeScript monorepo, your server and client are almost always out of sync. You change a response shape on the server and the client silently breaks — no red squiggles, no compile error, just a runtime surprise. ez-rpc fixes this by making the Zod schema the single source of truth for both sides. Your API client is fully typed from those schemas, so the moment something is out of sync you get a type error right in your editor. Runtime validation is there too, but the real win is catching it before you even run the code.

---

## Packages

| Package | Description | npm |
|---|---|---|
| [`@ez-rpc/ez-rpc`](https://www.npmjs.com/package/@ez-rpc/ez-rpc) | Umbrella — everything in one install | [![npm](https://img.shields.io/npm/v/@ez-rpc/ez-rpc)](https://www.npmjs.com/package/@ez-rpc/ez-rpc) |
| [`@ez-rpc/core`](https://www.npmjs.com/package/@ez-rpc/core) | Shared types. Zero deps, browser-safe | [![npm](https://img.shields.io/npm/v/@ez-rpc/core)](https://www.npmjs.com/package/@ez-rpc/core) |
| [`@ez-rpc/router`](https://www.npmjs.com/package/@ez-rpc/router) | Express router with Zod validation, dedup, queuing | [![npm](https://img.shields.io/npm/v/@ez-rpc/router)](https://www.npmjs.com/package/@ez-rpc/router) |
| [`@ez-rpc/client`](https://www.npmjs.com/package/@ez-rpc/client) | Typed fetch client with retry and streaming | [![npm](https://img.shields.io/npm/v/@ez-rpc/client)](https://www.npmjs.com/package/@ez-rpc/client) |
| [`@ez-rpc/mssql`](https://www.npmjs.com/package/@ez-rpc/mssql) | MSSQL query wrapper with automatic camelCase mapping | [![npm](https://img.shields.io/npm/v/@ez-rpc/mssql)](https://www.npmjs.com/package/@ez-rpc/mssql) |
| [`@ez-rpc/concurrency`](https://www.npmjs.com/package/@ez-rpc/concurrency) | Async concurrency queue with per-user and per-key caps. Zero deps | [![npm](https://img.shields.io/npm/v/@ez-rpc/concurrency)](https://www.npmjs.com/package/@ez-rpc/concurrency) |

---

## Installation

```bash
npm install @ez-rpc/ez-rpc zod

# Peer dependencies — install what you use:
npm install express        # server
npm install mssql          # if using createDBService
```

Or install only what you need:

```bash
npm install @ez-rpc/router express zod
npm install @ez-rpc/client zod
```

---

## Quick Start

### 1. Define your endpoints

This file lives in a shared location — both the server and client import it.

```ts
// contract/user.ts
import { z } from "zod";
import type { Endpoint } from "@ez-rpc/ez-rpc";

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

export const userEndpoints = {
  getUsers: {
    output: z.array(UserSchema),
  } satisfies Endpoint,

  createUser: {
    input: z.object({ name: z.string().min(1), email: z.string().email() }),
    output: UserSchema,
  } satisfies Endpoint,
} as const;
```

### 2. Mount the router

```ts
import { createRouter } from "@ez-rpc/ez-rpc/server";
import { userEndpoints } from "../../contract/user";

const userRouter = createRouter(userEndpoints, authMiddleware).implement({
  getUsers: {
    handler: async (_input, req) => getUsersFromDB(req.pool),
  },
  createUser: {
    handler: async (input, req) => createUserInDB(req.pool, input),
  },
});

app.use("/user", userRouter);
```

Inputs are validated before your handler runs. Return values are validated before they're sent. Both use the schemas from your contract — nothing to keep in sync.

### 3. Call from the client

```ts
import { createApiClient } from "@ez-rpc/ez-rpc/client";
import { userEndpoints } from "../../contract/user";

export const userApi = createApiClient(userEndpoints, "/user");

const { data: users } = await userApi.getUsers();
const { data: newUser } = await userApi.createUser({ name: "Alice", email: "alice@example.com" });
```

`userApi.getUsers()` and `userApi.createUser()` are fully typed — argument types and return types both come from the Zod schemas in your contract. No type assertions, no manual interface definitions.

---

## Concurrency Queuing

If you have endpoints that run expensive work — report generation, bulk exports, slow DB queries — you can cap how many run at once without any queue infrastructure.

```ts
import { createConcurrencyQueue } from "@ez-rpc/ez-rpc/server";

const reportQueue = createConcurrencyQueue({ globalCap: 4, perUserCap: 1 });

const router = createRouter(reportEndpoints, authMiddleware).implement({
  generateReport: {
    handler: generateReportHandler,
    queue: { queue: reportQueue, key: (input) => input.projectId },
  },
});
```

`perUserCap: 1` means each user can only have one in-flight report at a time. `globalCap: 4` caps the total. Requests beyond the cap wait in a FIFO queue in memory.

See [`@ez-rpc/concurrency`](https://www.npmjs.com/package/@ez-rpc/concurrency) — it has no dependencies and works standalone outside of ez-rpc if you want just the queue.

---

## NDJSON Streaming

For endpoints that return a lot of data, mark them `streaming: true` and write rows as they come in. The client collects everything and resolves when the stream closes.

```ts
// Contract
export const reportEndpoints = {
  streamReport: {
    input: ReportInputSchema,
    output: ReportRowSchema,
    streaming: true,
  },
} satisfies Record<string, Endpoint>;

// Server
const handler = async (input, req, res) => {
  res.setHeader("Content-Type", "application/x-ndjson");
  for await (const row of streamFromDB(req.pool, input)) {
    res.write(JSON.stringify(row) + "\n");
  }
  res.end();
};

// Client
const { data: rows } = await reportApi.streamReport(input, {
  onProgress: (count) => setRowCount(count),
});
```

---

## Request Signing

The client can HMAC-sign every request with a shared secret. The server middleware verifies the signature and timestamp before the handler runs.

```ts
// Client
const api = createApiClient(endpoints, "/reports", {
  baseUrl: process.env.NEXT_PUBLIC_API_URL,
  appSecret: process.env.NEXT_PUBLIC_APP_SECRET,
});

// Server reads from APP_SECRET env var automatically
```

---

## MSSQL

[`@ez-rpc/mssql`](https://www.npmjs.com/package/@ez-rpc/mssql) is a separate package that wraps `mssql` queries with Zod validation and automatic column name mapping. It's designed to work with ez-rpc but is completely independent — you can use it without any other ez-rpc packages.

```ts
import { createDBService } from "@ez-rpc/mssql";

export const getUsers = createDBService<{ orgId: string }>()
  .query((req, params) =>
    req.query`SELECT * FROM dbo.view_Users WHERE OrgID = ${params.orgId}`
  )
  .output(z.array(UserSchema)); // UserSchema uses camelCase — mapping is automatic
```

DB columns like `FirstName`, `first_name`, or `FIRST_NAME` all map to `firstName` in the result. See the [`@ez-rpc/mssql` README](https://www.npmjs.com/package/@ez-rpc/mssql) for full docs.

---

## Package Exports

| Import | Contains |
|---|---|
| `@ez-rpc/ez-rpc` | Shared types (`Endpoint`, `ApiResponse`) — safe anywhere |
| `@ez-rpc/ez-rpc/server` | Express router, DB service, concurrency queue — Node.js only |
| `@ez-rpc/ez-rpc/client` | Fetch client — browser and SSR safe |
