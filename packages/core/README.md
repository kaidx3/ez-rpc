# @ez-rpc/core

[![npm](https://img.shields.io/npm/v/@ez-rpc/core)](https://www.npmjs.com/package/@ez-rpc/core)
[![license](https://img.shields.io/npm/l/@ez-rpc/core)](https://github.com/Bunch-Projects/ezRPC/blob/main/LICENSE)

Shared types and error factories for the ezRPC ecosystem. Zero runtime dependencies — safe to import in browser, edge, SSR, and Node.js.

This is the only package your **shared contract files** need to import. Server and client packages both depend on it.

## Install

```bash
npm install @ez-rpc/core zod
```

## What's included

- **`Endpoint`** — the type that describes a single API endpoint (input schema, output schema, streaming flag, timeout, retry config)
- **`EndpointMap`** — a record of named `Endpoint` objects (what you export from a contract file)
- **`ApiResponse<T>`** — the standard response envelope used by `@ez-rpc/router` and `@ez-rpc/client`
- **Error factories** — `createServiceError`, `createRouteOutputValidationError`, `isServiceError`

## Usage

```ts
import { z } from "zod";
import type { Endpoint, EndpointMap } from "@ez-rpc/core";

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
    input: z.object({ name: z.string(), email: z.string().email() }),
    output: UserSchema,
  } satisfies Endpoint,
} satisfies EndpointMap;
```

These endpoint definitions are then passed to `createRouter` (server) and `createApiClient` (client) to produce validated routes and a typed fetch client with no duplication.

## Full docs

See the [ezRPC monorepo README](https://github.com/Bunch-Projects/ezRPC) for the full architecture guide, Quick Start, and all package docs.
