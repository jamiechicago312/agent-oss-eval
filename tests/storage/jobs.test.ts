import { describe, expect, it } from "vitest";
import { runDurableWork } from "../../src/core/jobs.js";
import { CancellationError, InvalidInputError } from "../../src/core/errors.js";
import { SqliteSnapshotStore } from "../../src/storage/sqlite.js";

describe("durable analysis jobs", () => {
  it("resumes at the next item without duplicates", async () => {
    const store = new SqliteSnapshotStore(":memory:");
    const seen: number[] = [];
    const first = await runDurableWork({ store, repository: "o/r", requestedWindow: "90d", selectedWindow: "90d",
      items: [1, 2, 3, 4], maxItems: 2, process: async (item) => { seen.push(item); return item * 10; } });
    expect(first.status).toBe("paused");
    expect(first.completedItems).toBe(2);
    const resumed = await runDurableWork({ store, repository: "o/r", requestedWindow: "90d", selectedWindow: "90d",
      items: [1, 2, 3, 4], jobId: first.id, process: async (item) => { seen.push(item); return item * 10; } });
    expect(resumed.status).toBe("completed");
    expect(resumed.payload.results).toEqual([10, 20, 30, 40]);
    expect(seen).toEqual([1, 2, 3, 4]);
    store.close();
  });

  it("persists cancellation and permits continuation with a new budget", async () => {
    const store = new SqliteSnapshotStore(":memory:");
    const controller = new AbortController(); controller.abort();
    let jobId = "";
    try {
      await runDurableWork({ store, jobId: "cancel-me", repository: "o/r", requestedWindow: "30d", selectedWindow: "30d",
        items: [1], signal: controller.signal, process: async (item) => item });
    } catch (error) { expect(error).toBeInstanceOf(InvalidInputError); }
    const planned = await runDurableWork({ store, repository: "o/r", requestedWindow: "30d", selectedWindow: "30d",
      items: [1, 2], maxItems: 1, process: async (item) => item });
    jobId = planned.id;
    const cancelledController = new AbortController(); cancelledController.abort();
    await expect(runDurableWork({ store, jobId, repository: "o/r", requestedWindow: "30d", selectedWindow: "30d",
      items: [1, 2], signal: cancelledController.signal, process: async (item) => item })).rejects.toBeInstanceOf(CancellationError);
    expect(store.getJob(jobId)?.status).toBe("cancelled");
    const continued = await runDurableWork({ store, jobId, repository: "o/r", requestedWindow: "30d", selectedWindow: "30d",
      items: [1, 2], process: async (item) => item });
    expect(continued.status).toBe("completed");
    store.close();
  });

  it("rejects changed plans and persists across database reopen", async () => {
    const store = new SqliteSnapshotStore(":memory:");
    const job = await runDurableWork({ store, repository: "o/r", requestedWindow: "90d", selectedWindow: "30d",
      items: [1, 2], maxItems: 1, process: async (item) => item });
    await expect(runDurableWork({ store, jobId: job.id, repository: "o/r", requestedWindow: "90d", selectedWindow: "30d",
      items: [1, 2, 3], process: async (item) => item })).rejects.toBeInstanceOf(InvalidInputError);
    store.close();
  });
});
