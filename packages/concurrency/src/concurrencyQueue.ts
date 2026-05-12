/**
 * Generic async concurrency queue with global, per-user, and per-key caps.
 *
 * Wrap expensive async work (e.g. heavy DB queries, third-party API calls)
 * to prevent any single user or resource key from monopolizing the system.
 * Calls are queued FIFO and started as slots free up.
 *
 * Zero dependencies — safe to use in any Node.js project independently of ezRPC.
 *
 * @example
 * const queue = createConcurrencyQueue({ globalCap: 4, perUserCap: 1 });
 *
 * const result = await queue.run(() => heavyOperation(), {
 *   userId: "user-123",
 *   key: "resource-456",
 * });
 */
export interface ConcurrencyQueueOptions {
  /** Maximum total concurrent executions across all users and keys. */
  globalCap: number;
  /** Maximum concurrent executions per userId. Defaults to unlimited. */
  perUserCap?: number;
  /** Maximum concurrent executions per key. Defaults to unlimited. */
  perKeyCap?: number;
}

export interface ConcurrencyQueueRunOptions {
  userId: string;
  key: string;
}

export interface ConcurrencyQueueStatus {
  active: number;
  queued: number;
  globalCap: number;
  perUserCap: number;
}

export interface ConcurrencyQueue {
  /** Runs `fn` immediately if a slot is available, otherwise queues it FIFO. */
  run<T>(fn: () => Promise<T>, opts: ConcurrencyQueueRunOptions): Promise<T>;
  /** Returns the queue position of a waiting call (0-indexed), or -1 if not queued. */
  queuePosition(opts: ConcurrencyQueueRunOptions): number;
  /** Returns `true` if a call with these opts would have to wait. */
  wouldQueue(opts: ConcurrencyQueueRunOptions): boolean;
  /** Returns a snapshot of queue metrics. */
  status(): ConcurrencyQueueStatus;
}

interface QueueEntry {
  userId: string;
  key: string;
  execute: () => void;
}

export const createConcurrencyQueue = (options: ConcurrencyQueueOptions): ConcurrencyQueue => {
  const { globalCap, perUserCap = Infinity, perKeyCap = Infinity } = options;

  let active = 0;
  const perUser = new Map<string, number>();
  const perKey = new Map<string, number>();
  const queue: QueueEntry[] = [];

  const incr = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  const decr = (m: Map<string, number>, k: string) => {
    const next = (m.get(k) ?? 1) - 1;
    if (next <= 0) m.delete(k);
    else m.set(k, next);
  };

  const canAcquire = (userId: string, key: string) =>
    active < globalCap &&
    (perUser.get(userId) ?? 0) < perUserCap &&
    (perKey.get(key) ?? 0) < perKeyCap;

  const drain = () => {
    while (queue.length > 0) {
      let launched = false;
      for (let i = 0; i < queue.length; i++) {
        const entry = queue[i]!;
        if (canAcquire(entry.userId, entry.key)) {
          queue.splice(i, 1);
          entry.execute();
          launched = true;
          break;
        }
      }
      if (!launched || active >= globalCap) return;
    }
  };

  const run = <T>(fn: () => Promise<T>, opts: ConcurrencyQueueRunOptions): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const execute = () => {
        active++;
        incr(perUser, opts.userId);
        incr(perKey, opts.key);
        fn()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            active--;
            decr(perUser, opts.userId);
            decr(perKey, opts.key);
            drain();
          });
      };
      if (canAcquire(opts.userId, opts.key)) execute();
      else queue.push({ userId: opts.userId, key: opts.key, execute });
    });

  return {
    run,
    queuePosition: (opts) => queue.findIndex((e) => e.userId === opts.userId && e.key === opts.key),
    wouldQueue: (opts) => !canAcquire(opts.userId, opts.key),
    status: () => ({
      active,
      queued: queue.length,
      globalCap,
      perUserCap: perUserCap === Infinity ? -1 : perUserCap,
    }),
  };
};
