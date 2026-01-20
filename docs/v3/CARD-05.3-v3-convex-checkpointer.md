# CARD-05.3-v3: Convex Checkpointer

## 🎯 Objetivo

Implementar um checkpointer customizado para Convex que permita usar `interrupt()` e `Command(resume)` do LangGraph, habilitando HITL real sem re-execução de nodes.

## 📋 Contexto

O LangGraph requer um checkpointer para:
1. Salvar estado do grafo a cada superstep
2. Permitir `interrupt()` pausar execução
3. Permitir `Command(resume)` continuar de onde parou

O Convex não tem checkpointer nativo, então criamos um customizado.

## 📦 Packages a Instalar

```bash
npm install @langchain/langgraph-checkpoint
```

## 📁 Arquivos a Criar

- `convex/schema.ts` (adicionar tabela checkpoints)
- `convex/checkpoints.ts` (mutations e queries)
- `convex/lib/ConvexCheckpointer.ts` (implementação)

## 💻 Implementação

### 1. Atualizar convex/schema.ts

Adicionar tabela de checkpoints:

```typescript
// Adicionar ao schema.ts existente

// Checkpoint metadata
export const checkpointMetadataValidator = v.object({
  source: v.string(), // "input" | "loop" | "update"
  step: v.number(),
  writes: v.optional(v.any()),
  parents: v.optional(v.any()),
});

// Adicionar tabela
checkpoints: defineTable({
  // Thread identifier (matches LangGraph thread_id)
  threadId: v.string(),
  
  // Checkpoint identifier
  checkpointId: v.string(),
  
  // Parent checkpoint (for history traversal)
  parentCheckpointId: v.optional(v.string()),
  
  // Checkpoint namespace (for subgraphs)
  checkpointNs: v.string(),
  
  // The actual checkpoint data (serialized)
  checkpoint: v.string(), // JSON serialized
  
  // Metadata about the checkpoint
  metadata: v.string(), // JSON serialized
  
  // Pending writes (for fault tolerance)
  pendingWrites: v.optional(v.string()), // JSON serialized
  
  // Timestamps
  createdAt: v.number(),
})
  .index("by_thread", ["threadId"])
  .index("by_thread_checkpoint", ["threadId", "checkpointNs", "checkpointId"])
  .index("by_thread_ns", ["threadId", "checkpointNs"]),

// Pending writes table (separate for atomic updates)
checkpointWrites: defineTable({
  threadId: v.string(),
  checkpointId: v.string(),
  checkpointNs: v.string(),
  taskId: v.string(),
  channel: v.string(),
  value: v.string(), // JSON serialized
  createdAt: v.number(),
})
  .index("by_checkpoint", ["threadId", "checkpointNs", "checkpointId"]),
```

### 2. Criar convex/checkpoints.ts

```typescript
// convex/checkpoints.ts
import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";

// ============================================
// INTERNAL QUERIES (for checkpointer)
// ============================================

export const getCheckpoint = internalQuery({
  args: {
    threadId: v.string(),
    checkpointNs: v.string(),
    checkpointId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.checkpointId) {
      // Get specific checkpoint
      return await ctx.db
        .query("checkpoints")
        .withIndex("by_thread_checkpoint", (q) =>
          q
            .eq("threadId", args.threadId)
            .eq("checkpointNs", args.checkpointNs)
            .eq("checkpointId", args.checkpointId)
        )
        .first();
    } else {
      // Get latest checkpoint for thread
      const checkpoints = await ctx.db
        .query("checkpoints")
        .withIndex("by_thread_ns", (q) =>
          q.eq("threadId", args.threadId).eq("checkpointNs", args.checkpointNs)
        )
        .order("desc")
        .take(1);
      
      return checkpoints[0] || null;
    }
  },
});

export const listCheckpoints = internalQuery({
  args: {
    threadId: v.string(),
    checkpointNs: v.string(),
    limit: v.optional(v.number()),
    before: v.optional(v.string()), // checkpointId for pagination
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("checkpoints")
      .withIndex("by_thread_ns", (q) =>
        q.eq("threadId", args.threadId).eq("checkpointNs", args.checkpointNs)
      )
      .order("desc");

    const checkpoints = await query.take(args.limit || 100);
    
    // Filter by 'before' if provided
    if (args.before) {
      const beforeIndex = checkpoints.findIndex(c => c.checkpointId === args.before);
      if (beforeIndex >= 0) {
        return checkpoints.slice(beforeIndex + 1);
      }
    }
    
    return checkpoints;
  },
});

export const getCheckpointWrites = internalQuery({
  args: {
    threadId: v.string(),
    checkpointNs: v.string(),
    checkpointId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("checkpointWrites")
      .withIndex("by_checkpoint", (q) =>
        q
          .eq("threadId", args.threadId)
          .eq("checkpointNs", args.checkpointNs)
          .eq("checkpointId", args.checkpointId)
      )
      .collect();
  },
});

// ============================================
// INTERNAL MUTATIONS (for checkpointer)
// ============================================

export const putCheckpoint = internalMutation({
  args: {
    threadId: v.string(),
    checkpointId: v.string(),
    parentCheckpointId: v.optional(v.string()),
    checkpointNs: v.string(),
    checkpoint: v.string(),
    metadata: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if exists (upsert)
    const existing = await ctx.db
      .query("checkpoints")
      .withIndex("by_thread_checkpoint", (q) =>
        q
          .eq("threadId", args.threadId)
          .eq("checkpointNs", args.checkpointNs)
          .eq("checkpointId", args.checkpointId)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        checkpoint: args.checkpoint,
        metadata: args.metadata,
        parentCheckpointId: args.parentCheckpointId,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("checkpoints", {
        ...args,
        createdAt: Date.now(),
      });
    }
  },
});

export const putCheckpointWrites = internalMutation({
  args: {
    threadId: v.string(),
    checkpointId: v.string(),
    checkpointNs: v.string(),
    writes: v.array(
      v.object({
        taskId: v.string(),
        channel: v.string(),
        value: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Delete existing writes for this checkpoint
    const existing = await ctx.db
      .query("checkpointWrites")
      .withIndex("by_checkpoint", (q) =>
        q
          .eq("threadId", args.threadId)
          .eq("checkpointNs", args.checkpointNs)
          .eq("checkpointId", args.checkpointId)
      )
      .collect();

    for (const write of existing) {
      await ctx.db.delete(write._id);
    }

    // Insert new writes
    for (const write of args.writes) {
      await ctx.db.insert("checkpointWrites", {
        threadId: args.threadId,
        checkpointId: args.checkpointId,
        checkpointNs: args.checkpointNs,
        taskId: write.taskId,
        channel: write.channel,
        value: write.value,
        createdAt: Date.now(),
      });
    }
  },
});

// ============================================
// PUBLIC QUERIES (for debugging/UI)
// ============================================

export const getThreadHistory = query({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("checkpoints")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(20);
  },
});
```

### 3. Criar convex/lib/ConvexCheckpointer.ts

```typescript
// convex/lib/ConvexCheckpointer.ts
"use node";

import {
  BaseCheckpointSaver,
  Checkpoint,
  CheckpointMetadata,
  CheckpointTuple,
  PendingWrite,
  CheckpointListOptions,
} from "@langchain/langgraph-checkpoint";
import { RunnableConfig } from "@langchain/core/runnables";
import { SerializerProtocol } from "@langchain/langgraph-checkpoint";
import { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Custom serializer for Convex
 * Handles serialization of complex LangGraph state
 */
class ConvexSerializer implements SerializerProtocol {
  dumpsTyped(data: unknown): [string, Uint8Array] {
    const json = JSON.stringify(data, (_, value) => {
      // Handle special types
      if (value instanceof Uint8Array) {
        return { __type: "Uint8Array", data: Array.from(value) };
      }
      if (value instanceof Map) {
        return { __type: "Map", data: Array.from(value.entries()) };
      }
      if (value instanceof Set) {
        return { __type: "Set", data: Array.from(value) };
      }
      return value;
    });
    return ["json", new TextEncoder().encode(json)];
  }

  loadsTyped(type: string, data: Uint8Array): unknown {
    if (type !== "json") {
      throw new Error(`Unknown serialization type: ${type}`);
    }
    const json = new TextDecoder().decode(data);
    return JSON.parse(json, (_, value) => {
      if (value && typeof value === "object" && "__type" in value) {
        switch (value.__type) {
          case "Uint8Array":
            return new Uint8Array(value.data);
          case "Map":
            return new Map(value.data);
          case "Set":
            return new Set(value.data);
        }
      }
      return value;
    });
  }
}

/**
 * Convex Checkpointer for LangGraph
 * 
 * Saves checkpoints to Convex database, enabling:
 * - interrupt() for HITL
 * - Command(resume) for continuation
 * - Fault tolerance
 * - Time travel debugging
 */
export class ConvexCheckpointer extends BaseCheckpointSaver {
  private ctx: ActionCtx;
  private serde: ConvexSerializer;

  constructor(ctx: ActionCtx) {
    super();
    this.ctx = ctx;
    this.serde = new ConvexSerializer();
  }

  /**
   * Get a checkpoint tuple for a given config
   */
  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id as string;
    const checkpointNs = (config.configurable?.checkpoint_ns as string) || "";
    const checkpointId = config.configurable?.checkpoint_id as string | undefined;

    if (!threadId) {
      return undefined;
    }

    const checkpoint = await this.ctx.runQuery(internal.checkpoints.getCheckpoint, {
      threadId,
      checkpointNs,
      checkpointId,
    });

    if (!checkpoint) {
      return undefined;
    }

    // Get pending writes
    const writes = await this.ctx.runQuery(internal.checkpoints.getCheckpointWrites, {
      threadId,
      checkpointNs,
      checkpointId: checkpoint.checkpointId,
    });

    // Deserialize
    const [, checkpointBytes] = this.serde.dumpsTyped(null);
    const deserializedCheckpoint = this.serde.loadsTyped(
      "json",
      new TextEncoder().encode(checkpoint.checkpoint)
    ) as Checkpoint;

    const deserializedMetadata = this.serde.loadsTyped(
      "json",
      new TextEncoder().encode(checkpoint.metadata)
    ) as CheckpointMetadata;

    const pendingWrites: PendingWrite[] = writes.map((w) => [
      w.taskId,
      w.channel,
      this.serde.loadsTyped("json", new TextEncoder().encode(w.value)),
    ]);

    return {
      config: {
        configurable: {
          thread_id: threadId,
          checkpoint_ns: checkpointNs,
          checkpoint_id: checkpoint.checkpointId,
        },
      },
      checkpoint: deserializedCheckpoint,
      metadata: deserializedMetadata,
      parentConfig: checkpoint.parentCheckpointId
        ? {
            configurable: {
              thread_id: threadId,
              checkpoint_ns: checkpointNs,
              checkpoint_id: checkpoint.parentCheckpointId,
            },
          }
        : undefined,
      pendingWrites,
    };
  }

  /**
   * List checkpoints for a thread
   */
  async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions
  ): AsyncGenerator<CheckpointTuple> {
    const threadId = config.configurable?.thread_id as string;
    const checkpointNs = (config.configurable?.checkpoint_ns as string) || "";

    if (!threadId) {
      return;
    }

    const checkpoints = await this.ctx.runQuery(internal.checkpoints.listCheckpoints, {
      threadId,
      checkpointNs,
      limit: options?.limit,
      before: options?.before?.configurable?.checkpoint_id as string | undefined,
    });

    for (const checkpoint of checkpoints) {
      const deserializedCheckpoint = this.serde.loadsTyped(
        "json",
        new TextEncoder().encode(checkpoint.checkpoint)
      ) as Checkpoint;

      const deserializedMetadata = this.serde.loadsTyped(
        "json",
        new TextEncoder().encode(checkpoint.metadata)
      ) as CheckpointMetadata;

      yield {
        config: {
          configurable: {
            thread_id: threadId,
            checkpoint_ns: checkpointNs,
            checkpoint_id: checkpoint.checkpointId,
          },
        },
        checkpoint: deserializedCheckpoint,
        metadata: deserializedMetadata,
        parentConfig: checkpoint.parentCheckpointId
          ? {
              configurable: {
                thread_id: threadId,
                checkpoint_ns: checkpointNs,
                checkpoint_id: checkpoint.parentCheckpointId,
              },
            }
          : undefined,
      };
    }
  }

  /**
   * Save a checkpoint
   */
  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    newVersions: Record<string, number>
  ): Promise<RunnableConfig> {
    const threadId = config.configurable?.thread_id as string;
    const checkpointNs = (config.configurable?.checkpoint_ns as string) || "";
    const parentCheckpointId = config.configurable?.checkpoint_id as string | undefined;

    if (!threadId) {
      throw new Error("thread_id is required in config");
    }

    // Serialize
    const [, checkpointBytes] = this.serde.dumpsTyped(checkpoint);
    const [, metadataBytes] = this.serde.dumpsTyped(metadata);

    const checkpointId = checkpoint.id;

    await this.ctx.runMutation(internal.checkpoints.putCheckpoint, {
      threadId,
      checkpointId,
      parentCheckpointId,
      checkpointNs,
      checkpoint: new TextDecoder().decode(checkpointBytes),
      metadata: new TextDecoder().decode(metadataBytes),
    });

    return {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: checkpointId,
      },
    };
  }

  /**
   * Save pending writes (for fault tolerance)
   */
  async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string
  ): Promise<void> {
    const threadId = config.configurable?.thread_id as string;
    const checkpointNs = (config.configurable?.checkpoint_ns as string) || "";
    const checkpointId = config.configurable?.checkpoint_id as string;

    if (!threadId || !checkpointId) {
      return;
    }

    const serializedWrites = writes.map(([tid, channel, value]) => ({
      taskId: tid,
      channel,
      value: JSON.stringify(value),
    }));

    await this.ctx.runMutation(internal.checkpoints.putCheckpointWrites, {
      threadId,
      checkpointId,
      checkpointNs,
      writes: serializedWrites,
    });
  }
}

/**
 * Factory function to create checkpointer in action context
 */
export function createConvexCheckpointer(ctx: ActionCtx): ConvexCheckpointer {
  return new ConvexCheckpointer(ctx);
}
```

## ✅ Acceptance Criteria

1. [ ] Tabela `checkpoints` adicionada ao schema
2. [ ] Tabela `checkpointWrites` adicionada ao schema
3. [ ] `ConvexCheckpointer` implementa `BaseCheckpointSaver`
4. [ ] Métodos `getTuple`, `list`, `put`, `putWrites` funcionam
5. [ ] Serialização/deserialização preserva tipos complexos
6. [ ] `npx convex dev` sincroniza sem erros

## 🛑 Stop Conditions

```bash
# 1. Verificar schema atualizado
grep -q "checkpoints:" convex/schema.ts && echo "✅ checkpoints table" || echo "❌ missing"
grep -q "checkpointWrites:" convex/schema.ts && echo "✅ checkpointWrites table" || echo "❌ missing"

# 2. Verificar checkpointer
test -f convex/lib/ConvexCheckpointer.ts && echo "✅ ConvexCheckpointer exists" || echo "❌ missing"

# 3. Verificar queries/mutations
grep -q "getCheckpoint" convex/checkpoints.ts && echo "✅ getCheckpoint" || echo "❌ missing"
grep -q "putCheckpoint" convex/checkpoints.ts && echo "✅ putCheckpoint" || echo "❌ missing"

# 4. Verificar package instalado
npm list @langchain/langgraph-checkpoint 2>/dev/null | grep -q "checkpoint" && echo "✅ package installed" || echo "❌ missing"

# 5. Compilação
npx tsc --noEmit 2>&1 | grep -q "error" && echo "❌ TypeScript errors" || echo "✅ TypeScript OK"
```

## 📝 Notas

- O checkpointer é criado dentro de cada action com `createConvexCheckpointer(ctx)`
- Serialização customizada para lidar com Map, Set, Uint8Array
- Índices otimizados para queries frequentes (by_thread_checkpoint)
- `pendingWrites` separado para atomicidade

## 🔗 Próximo Card

CARD-07-v3: Graph Refactor com interrupt()
