# @ez-rpc/client

[![npm](https://img.shields.io/npm/v/@ez-rpc/client)](https://www.npmjs.com/package/@ez-rpc/client)
[![license](https://img.shields.io/npm/l/@ez-rpc/client)](https://github.com/Bunch-Projects/ezRPC/blob/main/LICENSE)

A typed fetch client that derives its types directly from your Zod schemas — no codegen, no manual interface definitions. Pass it the same endpoint map you gave `createRouter` on the server, and every method on the returned client is fully typed: correct argument types, correct return type, red squiggles if something's wrong.

Works in the browser, Next.js (both client and server components), and any environment with `fetch`.

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
  appSecret: process.env.NEXT_PUBLIC_APP_SECRET, // optional — enables HMAC signing
});

const { data: users } = await userApi.getUsers();
const { data: newUser } = await userApi.createUser({ name: "Alice", email: "alice@example.com" });
```

The argument type of `createUser` is inferred from the `input` schema in your contract. The type of `data` is inferred from the `output` schema. Change either one on the server and TypeScript will tell you immediately on the client.

Every response is an `ApiResponse<T>`:

```ts
type ApiResponse<T> =
  | { success: true;  status: number; data: T }
  | { success: false; status: number; error: string }
```

## Other features

- **In-flight deduplication** — identical concurrent calls share one request instead of hitting the server multiple times
- **Retry with exponential backoff** — 1 retry by default, configurable
- **5-minute timeout** by default
- **HMAC-SHA-256 signing** — when `appSecret` is set, every request is signed and the server middleware verifies it
- **NDJSON streaming** — for streaming endpoints, pass `onProgress` to receive rows as they arrive:

```ts
const { data: rows } = await reportApi.streamReport(input, {
  onProgress: (count) => setRowCount(count),
});
```

## Full docs

See the [ez-rpc README](https://github.com/Bunch-Projects/ezRPC).
