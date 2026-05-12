# @ez-rpc/client

[![npm](https://img.shields.io/npm/v/@ez-rpc/client)](https://www.npmjs.com/package/@ez-rpc/client)
[![license](https://img.shields.io/npm/l/@ez-rpc/client)](https://github.com/Bunch-Projects/ezRPC/blob/main/LICENSE)

Typed fetch client for ezRPC servers. Pass it the same contract map you gave `createRouter` and get back a fully typed object where every key is a ready-to-call async function.

Works in the browser, Next.js (client and server components), and any environment with `fetch`.

## Install

```bash
npm install @ez-rpc/client zod
```

## Usage

```ts
import { createApiClient } from "@ez-rpc/client";
import { userEndpoints } from "../../contract/user";

export const userApi = createApiClient(userEndpoints, "/user", {
  baseUrl: process.env.NEXT_PUBLIC_API_URL,
  appSecret: process.env.NEXT_PUBLIC_APP_SECRET,  // optional: enables HMAC signing
});

// Fully typed — input/output inferred from your Zod schemas
const { data: users } = await userApi.getUsers();
const { data: newUser } = await userApi.createUser({ name: "Alice", email: "alice@example.com" });
```

The response shape is always `ApiResponse<T>`:
```ts
type ApiResponse<T> =
  | { success: true;  status: number; data: T;      meta?: Record<string, unknown> }
  | { success: false; status: number; error: string }
```

## Key features

- **Full type inference** — input and output types come directly from your Zod schemas, no code generation
- **HMAC-SHA-256 request signing** — verifiable by the server middleware in `@ez-rpc/router`
- **In-flight deduplication** — identical concurrent calls share one network request
- **Automatic retry with exponential backoff** — configurable, 1 retry by default
- **NDJSON streaming** — `onProgress` and `onStatusMessage` callbacks while rows stream in
- **5-minute timeout** by default, configurable per-client

## Streaming example

```ts
const { data: rows } = await reportApi.streamReport(input, {
  onProgress: (count) => setRowCount(count),
  onStatusMessage: (msg) => setStatus(msg),
});
```

## Full docs

See the [ezRPC monorepo README](https://github.com/Bunch-Projects/ezRPC) for the full architecture guide, signing setup, and streaming protocol details.
