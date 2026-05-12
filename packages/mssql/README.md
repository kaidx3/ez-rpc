# @ez-rpc/mssql

[![npm](https://img.shields.io/npm/v/@ez-rpc/mssql)](https://www.npmjs.com/package/@ez-rpc/mssql)
[![license](https://img.shields.io/npm/l/@ez-rpc/mssql)](https://github.com/Bunch-Projects/ezRPC/blob/main/LICENSE)

A thin wrapper around `mssql` that adds two things you'd otherwise write yourself on every project: automatic column name mapping and Zod output validation.

This is a standalone package. It works with ez-rpc but has no dependency on any other ez-rpc package — if all you want is typed, validated MSSQL queries with automatic camelCase mapping, this installs on its own.

## Install

```bash
npm install @ez-rpc/mssql mssql zod
npm install --save-dev @types/mssql
```

## The problem it solves

SQL Server uses `PascalCase` column names. Your TypeScript interfaces use `camelCase`. The standard approach is either aliasing every column in SQL (`FirstName AS firstName`) or manually mapping results in application code. Both are tedious and error-prone.

`createDBService` handles the mapping automatically. Write your Zod schema in camelCase, write your SQL however the DB uses it, and the mapping is applied for you — memoized per result set shape so there's no per-row overhead.

## Usage

```ts
import { createDBService } from "@ez-rpc/mssql";
import { z } from "zod";

const UserSchema = z.object({
  id: z.string(),
  firstName: z.string(), // maps from DB column "FirstName", "first_name", or "FIRST_NAME"
  email: z.string().email(),
});

export const getUsersByOrg = createDBService<{ orgId: string }>()
  .query((req, params) =>
    req.query`SELECT * FROM dbo.view_Users WHERE OrgID = ${params.orgId}`
  )
  .output(z.array(UserSchema));

// In a handler:
const users = await getUsersByOrg(req.pool, { orgId: "123" });
// users is User[], fully typed, Zod-validated
```

If the DB returns a shape that doesn't match your schema, you get a typed error — not `undefined` creeping through at runtime.

## Audit logging

Chain `.log("actionName")` on any service to run a logger on each call. Register the logger once at startup:

```ts
import { registerServiceCallLogger, setCurrentUserIndexProvider } from "@ez-rpc/mssql";
import { getCurrentUserIndex } from "@ez-rpc/router";

setCurrentUserIndexProvider(getCurrentUserIndex);

registerServiceCallLogger(async (ctx, { userId, action }) => {
  await ctx.request().query`
    INSERT INTO dbo.AuditLog (UserID, Action, CreatedAt)
    VALUES (${userId}, ${action}, GETDATE())
  `;
});

// Then on any service:
export const getUsersByOrg = createDBService<{ orgId: string }>()
  .query((req, params) => req.query`SELECT * FROM dbo.view_Users WHERE OrgID = ${params.orgId}`)
  .output(z.array(UserSchema))
  .log("getUsers");
```

## Full docs

See the [ez-rpc README](https://github.com/Bunch-Projects/ezRPC).
