# CARD-05.1: Convex Checkpointer para LangGraph

## 🎯 Objetivo

Implementar um checkpointer customizado que persiste o estado do LangGraph no Convex, habilitando:
- Fault tolerance (recuperar de crashes)
- HITL real com `interrupt()` e `Command(resume=...)`
- Time travel (debug de estados anteriores)

## 📋 Dependências

- ✅ CARD-01 (Schema)
- ✅ CARD-03 (LangGraph Setup)
- ✅ CARD-05-v2 (Research Action funcionando)

## 📦 Packages Necessários

```bash
npm install @langchain/langgraph-checkpoint
```

## 📁 Arquivos a Criar/Modificar

1. `convex/schema.ts` - Adicionar tabela `checkpoints`
2. `convex/checkpoints.ts` - CRUD para checkpoints
3. `convex/lib/ConvexCheckpointer.ts` - Implementação do checkpointer
4. `convex/agents/graph.ts` - Compilar grafo com checkpointer

---

## 💻 Implementação

### 1. Atualizar convex/schema.ts

Adicionar a tabela de checkpoints:

```typescript
// Adicionar ao schema.ts existente, dentro de defineSchema({...})

  // ============================================
  // CHECKPOINTS - Estado do LangGraph
  // ============================================
  checkpoints: defineTable({
    // Thread identifier (maps to LangGraph thread_id)
    threadId: v.string(),
    
    // Checkpoint identifier
    checkpointId: v.string(),
    
    // Parent checkpoint (for history traversal)
    parentCheckpointId: v.optional(v.string()),
    
    // Checkpoint namespace (for subgraphs)
    checkpointNs: v.string(),
    
    // The actual checkpoint data (serialized)
    checkpoint: v.string(), // JSON stringified
    
    // Metadata about this checkpoint
    metadata: v.string(), // JSON stringified
    
    // Timestamps
    createdAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_thread_checkpoint", ["threadId", "checkpointId"])
    .index("by_thread_ns", ["threadId", "checkpointNs"])
    .index("by_thread_ns_checkpoint", ["threadId", "checkpointNs", "checkpointId"]),

  // ============================================
  // CHECKPOINT_WRITES - Pending writes para fault tolerance
  // ============================================
  checkpointWrites: defineTable({
    threadId: v.string(),
    checkpointId: v.string(),
    checkpointNs: v.string(),
    taskId: v.string(),
    idx: v.number(),
    channel: v.string(),
    value: v.string(), // JSON stringified
    createdAt: v.number(),
  })
    .index("by_checkpoint", ["threadId", "checkpointNs", "checkpointId"])
    .index("by_checkpoint_task", ["threadId", "checkpointNs", "checkpointId", "taskId", "idx"]),
```

### 2. Criar convex/checkpoints.ts

```typescript
// convex/checkpoints.ts
import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";

// ============================================
// INTERNAL QUERIES (para o checkpointer)
// ============================================

export const getCheckpoint = internalQuery({
  args: {
    threadId: v.string(),
    checkpointNs: v.string(),
    checkpointId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.checkpointId) {
      // Buscar checkpoint específico
      return await ctx.db
        .query("checkpoints")
        .withIndex("by_thread_ns_checkpoint", (q) =>
          q
            .eq("threadId", args.threadId)
            .eq("checkpointNs", args.checkpointNs)
            .eq("checkpointId", args.checkpointId)
        )
        .first();
    }
    
    // Buscar checkpoint mais recente
    const checkpoints = await ctx.db
      .query("checkpoints")
      .withIndex("by_thread_ns", (q) =>
        q.eq("threadId", args.threadId).eq("checkpointNs", args.checkpointNs)
      )
      .order("desc")
      .take(1);
    
    return checkpoints[0] || null;
  },
});

export const listCheckpoints = internalQuery({
  args: {
    threadId: v.string(),
    checkpointNs: v.string(),
    limit: v.optional(v.number()),
    before: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("checkpoints")
      .withIndex("by_thread_ns", (q) =>
        q.eq("threadId", args.threadId).eq("checkpointNs", args.checkpointNs)
      )
      .order("desc");

    const checkpoints = await query.take(args.limit || 100);
    
    // Filtrar por "before" se especificado
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
// INTERNAL MUTATIONS (para o checkpointer)
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
    // Verificar se já existe (upsert)
    const existing = await ctx.db
      .query("checkpoints")
      .withIndex("by_thread_ns_checkpoint", (q) =>
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
    }

    return await ctx.db.insert("checkpoints", {
      ...args,
      createdAt: Date.now(),
    });
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
        idx: v.number(),
        channel: v.string(),
        value: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    for (const write of args.writes) {
      // Check if exists
      const existing = await ctx.db
        .query("checkpointWrites")
        .withIndex("by_checkpoint_task", (q) =>
          q
            .eq("threadId", args.threadId)
            .eq("checkpointNs", args.checkpointNs)
            .eq("checkpointId", args.checkpointId)
            .eq("taskId", write.taskId)
            .eq("idx", write.idx)
        )
        .first();

      if (!existing) {
        await ctx.db.insert("checkpointWrites", {
          threadId: args.threadId,
          checkpointId: args.checkpointId,
          checkpointNs: args.checkpointNs,
          taskId: write.taskId,
          idx: write.idx,
          channel: write.channel,
          value: write.value,
          createdAt: now,
        });
      }
    }
  },
});

export const deleteCheckpoints = internalMutation({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    // Delete all checkpoints for thread
    const checkpoints = await ctx.db
      .query("checkpoints")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();

    for (const checkpoint of checkpoints) {
      await ctx.db.delete(checkpoint._id);
    }

    // Delete all writes for thread
    const writes = await ctx.db
      .query("checkpointWrites")
      .filter((q) => q.eq(q.field("threadId"), args.threadId))
      .collect();

    for (const write of writes) {
      await ctx.db.delete(write._id);
    }
  },
});

// ============================================
// PUBLIC QUERIES (para debug/UI)
// ============================================

export const getCheckpointHistory = query({
  args: {
    threadId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("checkpoints")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(args.limit || 10);
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
  CheckpointPendingWrite,
} from "@langchain/langgraph-checkpoint";
import type { RunnableConfig } from "@langchain/core/runnables";
import { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Serde helpers para serialização
 */
const serde = {
  stringify: (obj: unknown): string => {
    return JSON.stringify(obj, (_, value) => {
      // Handle special types
      if (value instanceof Map) {
        return { __type: "Map", value: Array.from(value.entries()) };
      }
      if (value instanceof Set) {
        return { __type: "Set", value: Array.from(value) };
      }
      return value;
    });
  },
  
  parse: (str: string): unknown => {
    return JSON.parse(str, (_, value) => {
      if (value && typeof value === "object") {
        if (value.__type === "Map") {
          return new Map(value.value);
        }
        if (value.__type === "Set") {
          return new Set(value.value);
        }
      }
      return value;
    });
  },
};

/**
 * Extract thread_id and checkpoint_ns from config
 */
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

/**
 * Convex Checkpointer for LangGraph
 * 
 * Persists graph state to Convex database, enabling:
 * - Human-in-the-loop with interrupt() and Command(resume=...)
 * - Fault tolerance (resume from crashes)
 * - Time travel debugging
 * 
 * Usage:
 * ```typescript
 * const checkpointer = new ConvexCheckpointer(ctx);
 * const graph = workflow.compile({ checkpointer });
 * ```
 */
export class ConvexCheckpointer extends BaseCheckpointSaver {
  private ctx: ActionCtx;

  constructor(ctx: ActionCtx) {
    super();
    this.ctx = ctx;
  }

  /**
   * Get a checkpoint tuple by config
   */
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

    // Get pending writes
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

    // Build config for this checkpoint
    const checkpointConfig: RunnableConfig = {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: doc.checkpointId,
      },
    };

    // Build parent config if exists
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

  /**
   * List checkpoints matching config
   */
  async *list(
    config: RunnableConfig,
    options?: {
      limit?: number;
      before?: RunnableConfig;
      filter?: Record<string, unknown>;
    }
  ): AsyncGenerator<CheckpointTuple> {
    const { threadId, checkpointNs } = getConfigValues(config);
    
    const beforeId = options?.before?.configurable?.checkpoint_id as string | undefined;

    const docs = await this.ctx.runQuery(internal.checkpoints.listCheckpoints, {
      threadId,
      checkpointNs,
      limit: options?.limit,
      before: beforeId,
    });

    for (const doc of docs) {
      // Get pending writes for each checkpoint
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

  /**
   * Save a checkpoint
   */
  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    newVersions: Record<string, number>
  ): Promise<RunnableConfig> {
    const { threadId, checkpointNs } = getConfigValues(config);
    const parentCheckpointId = config.configurable?.checkpoint_id as string | undefined;

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

  /**
   * Save pending writes for a checkpoint
   */
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
}
```

### 4. Atualizar convex/agents/graph.ts

```typescript
// convex/agents/graph.ts
import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState, AgentStateType } from "./state";
import {
  planResearchNode,
  searchNode,
  synthesizeNode,
  awaitApprovalNode,
  generateIdeasNode,
} from "./nodes";

// ============================================
// ROUTING FUNCTIONS
// ============================================

const routeAfterApproval = (state: AgentStateType): string => {
  console.log("[ROUTER] HITL status:", state.hitlStatus);
  
  switch (state.hitlStatus) {
    case "approved":
      return "generate_ideas";
    case "refine":
      return "plan_research";
    case "restart":
      return "plan_research";
    case "pending":
    default:
      return END;
  }
};

// ============================================
// GRAPH DEFINITION
// ============================================

const workflow = new StateGraph(AgentState)
  .addNode("plan_research", planResearchNode)
  .addNode("search", searchNode)
  .addNode("synthesize", synthesizeNode)
  .addNode("await_approval", awaitApprovalNode)
  .addNode("generate_ideas", generateIdeasNode)
  
  .addEdge(START, "plan_research")
  .addEdge("plan_research", "search")
  .addEdge("search", "synthesize")
  .addEdge("synthesize", "await_approval")
  
  .addConditionalEdges(
    "await_approval",
    routeAfterApproval,
    {
      plan_research: "plan_research",
      generate_ideas: "generate_ideas",
      [END]: END,
    }
  )
  
  .addEdge("generate_ideas", END);

/**
 * Export the workflow for compilation with checkpointer
 * 
 * IMPORTANT: Do NOT compile here! The graph must be compiled
 * with the checkpointer in the action context.
 * 
 * Usage in action:
 * ```typescript
 * import { workflow } from "../agents/graph";
 * import { ConvexCheckpointer } from "../lib/ConvexCheckpointer";
 * 
 * const checkpointer = new ConvexCheckpointer(ctx);
 * const graph = workflow.compile({ checkpointer });
 * ```
 */
export { workflow };

// For backward compatibility (without checkpointer)
export const graph = workflow.compile();
```

---

## ✅ Acceptance Criteria

1. [ ] Tabela `checkpoints` criada no schema
2. [ ] Tabela `checkpointWrites` criada no schema
3. [ ] `ConvexCheckpointer` implementa `BaseCheckpointSaver`
4. [ ] Checkpointer serializa/deserializa corretamente Map e Set
5. [ ] `workflow` exportado sem compilar (para uso com checkpointer)
6. [ ] `graph` exportado compilado (para backward compatibility)

## 🛑 Stop Conditions

```bash
# 1. Verificar que tabelas existem no schema
grep -q "checkpoints:" convex/schema.ts && echo "✅ checkpoints table" || echo "❌ missing"
grep -q "checkpointWrites:" convex/schema.ts && echo "✅ checkpointWrites table" || echo "❌ missing"

# 2. Verificar que checkpointer existe
test -f convex/lib/ConvexCheckpointer.ts && echo "✅ ConvexCheckpointer exists" || echo "❌ missing"

# 3. Verificar que implementa BaseCheckpointSaver
grep -q "extends BaseCheckpointSaver" convex/lib/ConvexCheckpointer.ts && echo "✅ extends BaseCheckpointSaver" || echo "❌ missing"

# 4. Verificar exports do graph
grep -q "export { workflow }" convex/agents/graph.ts && echo "✅ workflow exported" || echo "❌ missing"

# 5. Verificar package instalado
npm list @langchain/langgraph-checkpoint 2>/dev/null | grep -q "checkpoint" && echo "✅ checkpoint package" || echo "❌ missing"

# 6. TypeScript compilation
npx tsc --noEmit 2>&1 | grep -q "error" && echo "❌ TypeScript errors" || echo "✅ TypeScript OK"

# 7. Convex sync
npx convex dev --once 2>&1 | grep -q "error" && echo "❌ Convex errors" || echo "✅ Convex synced"
```

**Card concluído quando todos os checks passam ✅**

---

## 📝 Notas Técnicas

### Por que separar `checkpoints` e `checkpointWrites`?

O LangGraph usa pending writes para fault tolerance. Quando um node falha, os writes de outros nodes que completaram são preservados. Manter em tabela separada permite:
- Queries mais eficientes
- Não precisar atualizar o checkpoint inteiro para adicionar writes

### Serialização de tipos especiais

O LangGraph usa `Map` e `Set` internamente. O JSON padrão não suporta esses tipos, então implementamos um serde customizado que preserva o tipo.

### Por que exportar `workflow` sem compilar?

O checkpointer precisa do contexto da action (`ctx`) para fazer queries/mutations. Se compilássemos o grafo no módulo, não teríamos acesso ao contexto. Por isso:

```typescript
// ❌ Errado - compila sem checkpointer
export const graph = workflow.compile();

// ✅ Correto - compila na action com checkpointer
const checkpointer = new ConvexCheckpointer(ctx);
const graph = workflow.compile({ checkpointer });
```

---

## 🔗 Próximo Card

CARD-05.2: HITL com interrupt() e Command
