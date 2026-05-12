# @ez-rpc/core

[![npm](https://img.shields.io/npm/v/@ez-rpc/core)](https://www.npmjs.com/package/@ez-rpc/core)
[![license](https://img.shields.io/npm/l/@ez-rpc/core)](https://github.com/Bunch-Projects/ezRPC/blob/main/LICENSE)

Shared types for the ez-rpc ecosystem. Zero dependencies — safe to import anywhere: browser, edge, SSR, Node.js.

If you're using ez-rpc in a monorepo, this is the only package your shared contract files need. `@ez-rpc/router` and `@ez-rpc/client` both depend on it, so you don't install it separately unless you're only working with the types.

## Install

```bash
npm install @ez-rpc/core zod
```

## What's in here

**`Endpoint`** describes a single API endpoint — input schema, output schema, whether it streams, timeout, retry config. You use this type with `satisfies` when defining your contract:

```ts
import { z } from "zod";
import type { Endpoint } from "@ez-rpc/core";

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

This object is then passed to `createRouter` on the server and `createApiClient` on the client. Both infer their types from it — that's where the end-to-end type safety comes from.

**`ApiResponse<T>`** is the response envelope both the router and client use:

```ts
type ApiResponse<T> =
  | { success: true;  status: number; data: T }
  | { success: false; status: number; error: string }
```

**Error factories** (`createServiceError`, `isServiceError`) give you typed errors that the router knows how to serialize consistently.

## Full docs

See the [ez-rpc README](https://github.com/Bunch-Projects/ezRPC) for the full guide.
