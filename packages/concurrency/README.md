# @ez-rpc/concurrency

[![npm](https://img.shields.io/npm/v/@ez-rpc/concurrency)](https://www.npmjs.com/package/@ez-rpc/concurrency)
[![license](https://img.shields.io/npm/l/@ez-rpc/concurrency)](https://github.com/Bunch-Projects/ezRPC/blob/main/LICENSE)

Async concurrency queue with global, per-user, and per-key caps. **Zero dependencies** — use it standalone in any Node.js project, no ezRPC required.

Useful for preventing expensive operations (DB queries, report generation, file processing) from overwhelming your server when many users hit them simultaneously.

## Install

```bash
npm install @ez-rpc/concurrency
```

## Usage

```ts
import { createConcurrencyQueue } from "@ez-rpc/concurrency";

const queue = createConcurrencyQueue({
  globalCap: 4,    // at most 4 concurrent executions across all users
  perUserCap: 1,   // each user can only run 1 at a time
  perKeyCap: 1,    // optional: at most 1 per arbitrary key (e.g. per-resource)
});

// Run something through the queue:
const result = await queue.run(
  () => doExpensiveWork(params),
  { userId: req.user.id, key: params.resourceId }
);
```

## API

### `createConcurrencyQueue(options)`

| Option | Type | Description |
|---|---|---|
| `globalCap` | `number` | Max total concurrent executions |
| `perUserCap` | `number?` | Max concurrent executions per `userId` |
| `perKeyCap` | `number?` | Max concurrent executions per `key` |

Returns a `ConcurrencyQueue` with:

- `.run(fn, { userId?, key? })` — enqueue and await `fn`
- `.queuePosition({ userId?, key? })` — how many are ahead of the next request
- `.wouldQueue({ userId?, key? })` — `true` if the next request would be queued (not immediate)
- `.status()` — snapshot of active/queued counts

FIFO within each cap tier. Requests that exceed a cap wait in memory until a slot opens.

## Integration with ezRPC router

```ts
import { createConcurrencyQueue, createRouter } from "@ez-rpc/router";

const reportQueue = createConcurrencyQueue({ globalCap: 4, perUserCap: 1 });

const router = createRouter(reportEndpoints, authMiddleware).implement({
  generateReport: {
    handler: generateReportHandler,
    queue: { queue: reportQueue, key: (input) => input.costCenterId },
  },
});
```

## Full docs

See the [ezRPC monorepo README](https://github.com/Bunch-Projects/ezRPC) for the full architecture guide.
