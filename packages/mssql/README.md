# @ez-rpc/mssql

[![npm](https://img.shields.io/npm/v/@ez-rpc/mssql)](https://www.npmjs.com/package/@ez-rpc/mssql)
[![license](https://img.shields.io/npm/l/@ez-rpc/mssql)](https://github.com/Bunch-Projects/ezRPC/blob/main/LICENSE)

MSSQL adapter for ezRPC. Wraps `mssql` queries with automatic `PascalCase`/`snake_case` → `camelCase` key mapping and Zod output validation, so DB column names and schema property names don't need to match.

## Install

```bash
npm install @ez-rpc/mssql mssql zod
npm install --save-dev @types/mssql
```

## Usage

```ts
import { createDBService } from "@ez-rpc/mssql";
import { z } from "zod";

const UserSchema = z.object({
  id: z.string(),
  firstName: z.string(),   // auto-maps from DB column "FirstName" or "first_name"
  email: z.string().email(),
});

export const getUsersByOrg = createDBService<{ orgId: string }>()
  .query((req, params) =>
    req.query`SELECT * FROM dbo.view_Users WHERE OrgID = ${params.orgId}`
  )
  .output(z.array(UserSchema));

// In your handler:
const users = await getUsersByOrg(req.pool, { orgId: "123" });
// → User[] with camelCase keys, validated by Zod
```

## Key features

- **Automatic key mapping** — DB columns `FirstName`, `first_name`, or `FIRST_NAME` all map to `firstName`. Mapping is memoized per result set shape.
- **Zod output validation** — schema mismatches surface as a `500` with a clear error, not silent type drift
- **Builder API** — chain `.query()`, `.output()`, and optionally `.log()` for audit logging
- **Injectable context** — call `setCurrentUserIndexProvider(fn)` at startup to wire in the current user for audit logs, with no circular dependency on `@ez-rpc/router`

## Audit logging

```ts
import { registerServiceCallLogger, setCurrentUserIndexProvider } from "@ez-rpc/mssql";
import { getCurrentUserIndex } from "@ez-rpc/router";

// Wire up user context once at startup:
setCurrentUserIndexProvider(getCurrentUserIndex);

// Register a logger once at startup:
registerServiceCallLogger(async (ctx, { userId, action }) => {
  await ctx.request().query`
    INSERT INTO dbo.ServiceCallLogs (UserID, Action, CreatedAt)
    VALUES (${userId}, ${action}, GETDATE())
  `;
});

// Then per-service:
export const getUsersByOrg = createDBService<{ orgId: string }>()
  .query((req, params) => req.query`SELECT * FROM dbo.view_Users WHERE OrgID = ${params.orgId}`)
  .output(z.array(UserSchema))
  .log("getUsers");
```

## Full docs

See the [ezRPC monorepo README](https://github.com/Bunch-Projects/ezRPC) for the full architecture guide.
