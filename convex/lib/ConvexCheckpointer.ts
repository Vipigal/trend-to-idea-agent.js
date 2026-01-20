"use node";

import {
  BaseCheckpointSaver,
  Checkpoint,
  CheckpointMetadata,
  CheckpointTuple,
  PendingWrite,
  CheckpointPendingWrite,
} from "@langchain/langgraph-checkpoint";
import type { RunnableConfig } from "@langchain/core/runnables";
import { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";

const serde = {
  stringify: (obj: unknown): string => {
    return JSON.stringify(obj, (_, value) => {
      if (value instanceof Map) {
        return { __type: "Map", value: Array.from(value.entries()) };
      }
      if (value instanceof Set) {
        return { __type: "Set", value: Array.from(value) };
      }
      if (value instanceof Uint8Array) {
        return { __type: "Uint8Array", value: Array.from(value) };
      }
      return value;
    });
  },

  parse: (str: string): unknown => {
    return JSON.parse(str, (_, value) => {
      if (value && typeof value === "object" && "__type" in value) {
        switch (value.__type) {
          case "Map":
            return new Map(value.value);
          case "Set":
            return new Set(value.value);
          case "Uint8Array":
            return new Uint8Array(value.value);
        }
      }
      return value;
    });
  },
};

function getConfigValues(config: RunnableConfig): {
  threadId: string;
  checkpointNs: string;
  checkpointId?: string;
} {
  const configurable = config.configurable || {};

  if (!configurable.thread_id) {
    throw new Error("thread_id is required in config.configurable");
  }

  return {
    threadId: configurable.thread_id as string,
    checkpointNs: (configurable.checkpoint_ns as string) || "",
    checkpointId: configurable.checkpoint_id as string | undefined,
  };
}

export class ConvexCheckpointer extends BaseCheckpointSaver {
  private ctx: ActionCtx;

  constructor(ctx: ActionCtx) {
    super();
    this.ctx = ctx;
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const { threadId, checkpointNs, checkpointId } = getConfigValues(config);

    const doc = await this.ctx.runQuery(internal.checkpoints.getCheckpoint, {
      threadId,
      checkpointNs,
      checkpointId,
    });

    if (!doc) {
      return undefined;
    }

    const writeDocs = await this.ctx.runQuery(
      internal.checkpoints.getCheckpointWrites,
      {
        threadId,
        checkpointNs,
        checkpointId: doc.checkpointId,
      }
    );

    const pendingWrites: CheckpointPendingWrite[] = writeDocs.map((w) => [
      w.taskId,
      w.channel,
      serde.parse(w.value),
    ]);

    const checkpointConfig: RunnableConfig = {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: doc.checkpointId,
      },
    };

    let parentConfig: RunnableConfig | undefined;
    if (doc.parentCheckpointId) {
      parentConfig = {
        configurable: {
          thread_id: threadId,
          checkpoint_ns: checkpointNs,
          checkpoint_id: doc.parentCheckpointId,
        },
      };
    }

    return {
      config: checkpointConfig,
      checkpoint: serde.parse(doc.checkpoint) as Checkpoint,
      metadata: serde.parse(doc.metadata) as CheckpointMetadata,
      parentConfig,
      pendingWrites,
    };
  }

  async *list(
    config: RunnableConfig,
    options?: {
      limit?: number;
      before?: RunnableConfig;
      filter?: Record<string, unknown>;
    }
  ): AsyncGenerator<CheckpointTuple> {
    const { threadId, checkpointNs } = getConfigValues(config);

    const beforeId = options?.before?.configurable?.checkpoint_id as
      | string
      | undefined;

    const docs = await this.ctx.runQuery(internal.checkpoints.listCheckpoints, {
      threadId,
      checkpointNs,
      limit: options?.limit,
      before: beforeId,
    });

    for (const doc of docs) {
      const writeDocs = await this.ctx.runQuery(
        internal.checkpoints.getCheckpointWrites,
        {
          threadId,
          checkpointNs,
          checkpointId: doc.checkpointId,
        }
      );

      const pendingWrites: CheckpointPendingWrite[] = writeDocs.map((w) => [
        w.taskId,
        w.channel,
        serde.parse(w.value),
      ]);

      const checkpointConfig: RunnableConfig = {
        configurable: {
          thread_id: threadId,
          checkpoint_ns: checkpointNs,
          checkpoint_id: doc.checkpointId,
        },
      };

      let parentConfig: RunnableConfig | undefined;
      if (doc.parentCheckpointId) {
        parentConfig = {
          configurable: {
            thread_id: threadId,
            checkpoint_ns: checkpointNs,
            checkpoint_id: doc.parentCheckpointId,
          },
        };
      }

      yield {
        config: checkpointConfig,
        checkpoint: serde.parse(doc.checkpoint) as Checkpoint,
        metadata: serde.parse(doc.metadata) as CheckpointMetadata,
        parentConfig,
        pendingWrites,
      };
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    _newVersions: Record<string, number>
  ): Promise<RunnableConfig> {
    const { threadId, checkpointNs } = getConfigValues(config);
    const parentCheckpointId = config.configurable?.checkpoint_id as
      | string
      | undefined;

    await this.ctx.runMutation(internal.checkpoints.putCheckpoint, {
      threadId,
      checkpointId: checkpoint.id,
      parentCheckpointId,
      checkpointNs,
      checkpoint: serde.stringify(checkpoint),
      metadata: serde.stringify(metadata),
    });

    return {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: checkpoint.id,
      },
    };
  }

  async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string
  ): Promise<void> {
    const { threadId, checkpointNs, checkpointId } = getConfigValues(config);

    if (!checkpointId) {
      throw new Error("checkpoint_id required for putWrites");
    }

    const formattedWrites = writes.map(([channel, value], idx) => ({
      taskId,
      idx,
      channel,
      value: serde.stringify(value),
    }));

    await this.ctx.runMutation(internal.checkpoints.putCheckpointWrites, {
      threadId,
      checkpointId,
      checkpointNs,
      writes: formattedWrites,
    });
  }

  async deleteThread(threadId: string): Promise<void> {
    await this.ctx.runMutation(internal.checkpoints.deleteCheckpoints, {
      threadId,
    });
  }
}

export function createConvexCheckpointer(ctx: ActionCtx): ConvexCheckpointer {
  return new ConvexCheckpointer(ctx);
}
