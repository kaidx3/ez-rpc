# @ez-rpc/concurrency

[![npm](https://img.shields.io/npm/v/@ez-rpc/concurrency)](https://www.npmjs.com/package/@ez-rpc/concurrency)
[![license](https://img.shields.io/npm/l/@ez-rpc/concurrency)](https://github.com/Bunch-Projects/ezRPC/blob/main/LICENSE)

A small async concurrency queue with global, per-user, and per-key caps. Zero dependencies. Works in any Node.js project — no other ez-rpc packages required.

The use case: you have an endpoint that does something expensive — generates a report, kicks off a bulk export, runs a slow query. Without any throttling, 50 users hitting it at once will lock up your DB pool or spike your CPU. This package lets you cap how many run concurrently, with separate limits per user so one person can't starve everyone else.

## Install

```bash
npm install @ez-rpc/concurrency
```

## Usage

```ts
import { createConcurrencyQueue } from "@ez-rpc/concurrency";

const queue = createConcurrencyQueue({
  globalCap: 4,   // max 4 running at once across all users
  perUserCap: 1,  // each user gets at most 1 slot
});

const result = await queue.run(
  () => generateReport(params),
  { userId: req.user.id }
);
```

Requests beyond the cap wait in a FIFO queue and run as slots open. You can also scope limits by an arbitrary key — useful when the bottleneck is per-resource rather than per-user:

```ts
const queue = createConcurrencyQueue({ globalCap: 10, perKeyCap: 2 });

await queue.run(() => processFile(fileId), { key: fileId });
```

## API

### `createConcurrencyQueue(options)`

| Option | Type | Description |
|---|---|---|
| `globalCap` | `number` | Max total concurrent executions |
| `perUserCap` | `number?` | Max concurrent per `userId` |
| `perKeyCap` | `number?` | Max concurrent per `key` |

The returned queue has four methods:

- `.run(fn, context?)` — run `fn` when a slot is available, await the result
- `.status()` — `{ active: number, queued: number }` snapshot
- `.wouldQueue(context?)` — returns `true` if a new request would have to wait
- `.queuePosition(context?)` — how many requests are ahead in the queue

## With ez-rpc router

```ts
import { createConcurrencyQueue } from "@ez-rpc/concurrency";
import { createRouter } from "@ez-rpc/router";

const reportQueue = createConcurrencyQueue({ globalCap: 4, perUserCap: 1 });

const router = createRouter(reportEndpoints, authMiddleware).implement({
  generateReport: {
    handler: generateReportHandler,
    queue: { queue: reportQueue, key: (input) => input.projectId },
  },
});
```

## Full docs

See the [ez-rpc README](https://github.com/Bunch-Projects/ezRPC).
