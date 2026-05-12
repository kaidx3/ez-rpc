# ezRPC

Type-safe, contract-first RPC for Express + Next.js monorepos.

Define Zod schemas once. Get validated server routes and typed fetch clients automatically — no code generation, no runtime magic, no `any`.

---

## Packages

This is a monorepo. Install only what you need:

| Package | Description | npm |
|---|---|---|
| `ez-rpc` | Umbrella — re-exports everything | [![npm](https://img.shields.io/npm/v/ez-rpc)](https://www.npmjs.com/package/ez-rpc) |
| `@ez-rpc/core` | Shared types + error factories. Zero deps, browser-safe | [![npm](https://img.shields.io/npm/v/@ez-rpc/core)](https://www.npmjs.com/package/@ez-rpc/core) |
| `@ez-rpc/router` | Type-safe Express router (Zod validation, dedup, queuing) | [![npm](https://img.shields.io/npm/v/@ez-rpc/router)](https://www.npmjs.com/package/@ez-rpc/router) |
| `@ez-rpc/client` | Typed fetch client (HMAC signing, retry, NDJSON streaming) | [![npm](https://img.shields.io/npm/v/@ez-rpc/client)](https://www.npmjs.com/package/@ez-rpc/client) |
| `@ez-rpc/mssql` | MSSQL adapter (auto key mapping, Zod validation) | [![npm](https://img.shields.io/npm/v/@ez-rpc/mssql)](https://www.npmjs.com/package/@ez-rpc/mssql) |
| `@ez-rpc/concurrency` | Async concurrency queue (global/per-user/per-key caps). Zero deps | [![npm](https://img.shields.io/npm/v/@ez-rpc/concurrency)](https://www.npmjs.com/package/@ez-rpc/concurrency) |

---

## Core Idea

```
contract (Zod schemas + endpoint flags)
    ↓                        ↓
createRouter (server)    createApiClient (client)
    ↓                        ↓
Express routes           Typed fetch functions
validated in+out         auto-signed + deduped
```

The schemas are the single source of truth. Every HTTP boundary is validated against them — inputs on the way in, outputs on the way out.

---

## Installation

```bash
# Grab the umbrella (pulls in everything)
npm install ez-rpc zod

# Or install only what you need:
npm install @ez-rpc/core zod
npm install @ez-rpc/router express zod
npm install @ez-rpc/client zod
npm install @ez-rpc/mssql mssql zod
npm install @ez-rpc/concurrency   # zero deps
```

---

## Quick Start

### 1. Define a contract

```ts
// contract/user.ts
import { z } from "zod";
import type { Endpoint } from "ez-rpc";

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

export const userEndpoints = {
  getUsers: {
    output: z.array(UserSchema),
  } satisfies Endpoint,

  createUser: {
    input: CreateUserSchema,
    output: UserSchema,
  } satisfies Endpoint,
} as const;
```

### 2. Wire up the server

```ts
// server/routes/user.ts
import { createRouter } from "ez-rpc/server";
import { userEndpoints } from "../../contract/user";
import { getUsersService, createUserService } from "../services/user";

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

### 3. Use the client

```ts
// web-client/utils/api/userApi.ts
import { createApiClient } from "ez-rpc/client";
import { userEndpoints } from "../../contract/user";

export const userApi = createApiClient(userEndpoints, "/user");

// In a component:
const { data: users } = await userApi.getUsers();
const { data: newUser } = await userApi.createUser({ name: "Alice", email: "alice@example.com" });
```

---

## MSSQL Adapter

`createDBService` wraps MSSQL queries with automatic camelCase key mapping (DB column names → Zod schema keys) and output validation.

```ts
import { createDBService } from "ez-rpc/server";
import { z } from "zod";

const UserSchema = z.object({
  id: z.string(),
  firstName: z.string(),  // maps from DB's "FirstName" or "first_name" automatically
  email: z.string(),
});

export const getUsers = createDBService<{ orgId: string }>()
  .query((req, params) =>
    req.query`SELECT * FROM dbo.view_Users WHERE OrgID = ${params.orgId}`
  )
  .output(z.array(UserSchema));

// Usage in a handler:
const users = await getUsers(req.pool, { orgId: "123" });
```

Chain `.log()` to record service calls to your audit table (register a logger once at startup):

```ts
import { registerServiceCallLogger } from "ez-rpc/server";

registerServiceCallLogger(async (ctx, { userId, action }) => {
  await ctx.request().query`
    INSERT INTO dbo.ServiceCallLogs (UserID, Action, CreatedAt)
    VALUES (${userId}, ${action}, GETDATE())
  `;
});
```

---

## Concurrency Queuing

Prevent expensive queries from monopolizing the DB pool:

```ts
import { createConcurrencyQueue, createRouter } from "ez-rpc/server";

const reportQueue = createConcurrencyQueue({ globalCap: 4, perUserCap: 1 });

const router = createRouter(reportEndpoints, authMiddleware).implement({
  generateReport: {
    handler: generateReportHandler,
    queue: {
      queue: reportQueue,
      key: (input, req) => input.costCenterId,
    },
  },
});
```

---

## Streaming (NDJSON)

Mark an endpoint with `streaming: true` and write rows to the response as they arrive:

```ts
// Contract
export const bigReportEndpoints = {
  streamReport: {
    input: ReportInputSchema,
    output: ReportRowSchema,  // schema for one row
    streaming: true,
  },
} satisfies Record<string, Endpoint>;

// Server handler — write rows yourself
const handler = async (input, req, res) => {
  res.setHeader("Content-Type", "application/x-ndjson");
  for await (const row of streamFromDB(req.pool, input)) {
    res.write(JSON.stringify(row) + "\n");
  }
  res.end();
};

// Client — resolves to ApiResponse<ReportRow[]> once stream completes
const { data: rows } = await reportApi.streamReport(input, {
  onProgress: (count) => setRowCount(count),
  onStatusMessage: (msg) => setStatus(msg),
});
```

---

## Request Signing

`createApiClient` automatically HMAC-signs every request using `SHA-256`. The server's `authorizeUser` middleware verifies the signature, timestamp, and Bearer token. Configure the shared secret:

```ts
// Client
const api = createApiClient(endpoints, "/user", {
  baseUrl: process.env.NEXT_PUBLIC_API_URL,
  appSecret: process.env.NEXT_PUBLIC_APP_SECRET,
});
```

```ts
// Server (via environment variable)
process.env.APP_SECRET = "your-secret";
```

---

## Key Features

| Feature | Details |
|---|---|
| **Input validation** | Zod schema validated on every POST; 400 on failure |
| **Output validation** | Return value validated before send; 500 on schema mismatch |
| **Key mapping** | DB `PascalCase`/`snake_case` → camelCase schema keys automatically |
| **Deduplication** | Identical concurrent requests resolved from one in-flight promise |
| **Retry + timeout** | 1 retry with exponential backoff, 5 min timeout by default |
| **Concurrency queuing** | Global, per-user, per-key caps via `createConcurrencyQueue` |
| **Streaming** | NDJSON streaming with progress callbacks |
| **Auth** | HMAC-SHA-256 request signing out of the box |
| **Type safety** | Full end-to-end inference, zero `any` |

---

## Package Exports

| Import | Use for |
|---|---|
| `ez-rpc` | Shared types only (`Endpoint`, `ApiResponse`) — safe in any context |
| `ezrpc/server` | Express router, DB service, middleware — Node.js only |
| `ezrpc/client` | Fetch client — browser and SSR safe |
# ez-rpc
