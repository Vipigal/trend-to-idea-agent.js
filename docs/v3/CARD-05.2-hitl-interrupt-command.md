# CARD-05.2: HITL com interrupt() e Command

## 🎯 Objetivo

Implementar o fluxo HITL (Human-in-the-Loop) usando `interrupt()` do LangGraph para pausar o grafo e `Command({ resume: ... })` para retomá-lo, evitando re-execução desnecessária de nodes.

## 📋 Dependências

- ✅ CARD-05.1 (Convex Checkpointer)
- ✅ CARD-04 (Research Nodes)
- ✅ CARD-02 (Convex Functions)

## 📋 Contexto

### Como funciona o HITL no LangGraph?

```
                  ┌─────────────────┐
                  │  plan_research  │
                  └────────┬────────┘
                           │
                  ┌────────▼────────┐
                  │     search      │
                  └────────┬────────┘
                           │
                  ┌────────▼────────┐
                  │   synthesize    │
                  └────────┬────────┘
                           │
          ┌────────────────▼───────────────┐
          │        await_approval          │
          │   ┌─────────────────────┐      │
          │   │  interrupt({...})   │ ◀─── │ PAUSA AQUI
          │   └─────────────────────┘      │
          └────────────────┬───────────────┘
                           │
                 [AGUARDA USUÁRIO]
                           │
    ┌──────────────────────┼──────────────────────┐
    │                      │                      │
    ▼                      ▼                      ▼
 APPROVE              REFINE               RESTART
 Command({           Command({            (delete checkpoints
   resume: {           resume: {           + re-execute)
     action: "approved"  action: "refine",
   }                     feedback: "..."
 })                    }
                       })
```

### O que acontece internamente?

1. **interrupt()** salva o estado atual no checkpointer e retorna imediatamente
2. O grafo fica "pausado" no checkpoint
3. Quando chamamos `graph.invoke(Command({ resume: {...} }), config)`:
   - O checkpointer carrega o estado salvo
   - O código APÓS `interrupt()` executa com o valor do resume
   - O grafo continua de onde parou

### ⚠️ IMPORTANTE: Código ANTES do interrupt() re-executa!

```typescript
async function awaitApprovalNode(state) {
  // ❌ Este código RE-EXECUTA quando resumido
  console.log("This runs again on resume!");
  
  const decision = interrupt({ trends: state.trends });
  
  // ✅ Este código só executa APÓS resume
  return { hitlStatus: decision.action };
}
```

---

## 📁 Arquivos a Criar/Modificar

1. `convex/agents/nodes/awaitApproval.ts` - Novo arquivo com interrupt()
2. `convex/agents/nodes/index.ts` - Atualizar exports
3. `convex/actions/research.ts` - Refatorar para usar checkpointer
4. `convex/actions/hitl.ts` - Actions para approve/refine/restart
5. `convex/threads.ts` - Simplificar mutations de HITL

---

## 💻 Implementação

### 1. Criar convex/agents/nodes/awaitApproval.ts

```typescript
// convex/agents/nodes/awaitApproval.ts
"use node";

import { interrupt } from "@langchain/langgraph";
import { AgentStateType } from "../state";

/**
 * Estrutura retornada pelo interrupt para o usuário decidir
 */
export interface HITLInterruptValue {
  trends: Array<{
    title: string;
    summary: string;
    whyItMatters: string;
    confidence: string;
    sources: Array<{ url: string; title: string }>;
  }>;
  message: string;
  options: string[];
}

/**
 * Estrutura esperada no Command({ resume: ... })
 */
export interface HITLResumeValue {
  action: "approved" | "refine" | "restart";
  feedback?: string; // Usado quando action === "refine"
}

/**
 * Await Approval Node
 * 
 * Este node usa interrupt() para pausar o grafo e aguardar
 * decisão do usuário. O grafo retoma quando Command({ resume: ... })
 * é invocado.
 * 
 * IMPORTANTE:
 * - Código ANTES de interrupt() re-executa no resume
 * - Mantenha o mínimo de lógica antes do interrupt()
 * - A lógica principal deve vir APÓS interrupt()
 */
export const awaitApprovalNode = async (
  state: AgentStateType
): Promise<Partial<AgentStateType>> => {
  console.log("[AWAIT_APPROVAL] Preparing HITL checkpoint...");
  console.log(`[AWAIT_APPROVAL] Trends count: ${state.trends?.length || 0}`);

  // ============================================
  // INTERRUPT - PAUSA AQUI
  // ============================================
  // O valor passado para interrupt() é retornado ao chamador
  // quando o grafo "pausa". Usamos para mostrar as trends na UI.
  const decision = interrupt<HITLInterruptValue, HITLResumeValue>({
    trends: state.trends.map((t) => ({
      title: t.title,
      summary: t.summary,
      whyItMatters: t.whyItMatters,
      confidence: t.confidence,
      sources: t.sources.map((s) => ({ url: s.url, title: s.title })),
    })),
    message: "Research complete! Please review the trends and decide how to proceed.",
    options: ["approved", "refine", "restart"],
  });

  // ============================================
  // CÓDIGO APÓS INTERRUPT - EXECUTA NO RESUME
  // ============================================
  console.log("[AWAIT_APPROVAL] Resumed with decision:", decision);

  // Processar a decisão do usuário
  switch (decision.action) {
    case "approved":
      return {
        hitlStatus: "approved",
        currentStep: "await_approval",
        error: null,
      };

    case "refine":
      return {
        hitlStatus: "refine",
        refinementFeedback: decision.feedback || "",
        currentStep: "await_approval",
        error: null,
        // Limpar trends para re-gerar
        trends: [],
        searchResults: [],
      };

    case "restart":
      return {
        hitlStatus: "restart",
        currentStep: "await_approval",
        error: null,
        // Limpar tudo
        trends: [],
        searchResults: [],
        researchPlan: null,
        refinementFeedback: null,
      };

    default:
      return {
        hitlStatus: "pending",
        error: `Unknown HITL action: ${decision.action}`,
      };
  }
};
```

### 2. Atualizar convex/agents/nodes/index.ts

```typescript
// convex/agents/nodes/index.ts
export { planResearchNode } from "./plan";
export { searchNode } from "./search";
export { synthesizeNode } from "./synthesize";
export { awaitApprovalNode, type HITLResumeValue, type HITLInterruptValue } from "./awaitApproval";
export { generateIdeasNode } from "./generateIdeas";
```

### 3. Criar convex/actions/hitl.ts

```typescript
// convex/actions/hitl.ts
"use node";

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal, api } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { Command } from "@langchain/langgraph";
import { workflow } from "../agents/graph";
import { ConvexCheckpointer } from "../lib/ConvexCheckpointer";
import { StreamTypeEnum, StreamEventTypeEnum } from "../schema";
import type { HITLResumeValue } from "../agents/nodes/awaitApproval";

/**
 * Resume graph execution after HITL decision
 * 
 * This action:
 * 1. Creates a Command with the user's decision
 * 2. Loads the graph with checkpointer
 * 3. Invokes the graph to continue from interrupt point
 * 4. Streams events to streamEvents table
 */
export const resumeAfterApproval = internalAction({
  args: {
    threadId: v.id("threads"),
    decision: v.object({
      action: v.union(
        v.literal("approved"),
        v.literal("refine"),
        v.literal("restart")
      ),
      feedback: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const { threadId, decision } = args;
    console.log(`[HITL] Resuming thread ${threadId} with decision:`, decision);

    try {
      // Get thread to verify state
      const thread = await ctx.runQuery(internal.threads.get, { threadId });
      if (!thread) {
        throw new Error("Thread not found");
      }

      // For "restart", we delete checkpoints and re-run from scratch
      if (decision.action === "restart") {
        console.log("[HITL] Restart requested, clearing checkpoints...");
        
        // Delete checkpoints
        await ctx.runMutation(internal.checkpoints.deleteCheckpoints, {
          threadId: threadId,
        });

        // Delete existing trends and ideas
        await ctx.runMutation(internal.trends.deleteByThread, { threadId });
        await ctx.runMutation(internal.ideas.deleteByThread, { threadId });

        // Update thread status
        await ctx.runMutation(internal.threads.updateStatus, {
          threadId,
          status: "idle",
        });

        // Clear stream events
        await ctx.runMutation(internal.streamEvents.clearByThread, {
          threadId,
          streamType: StreamTypeEnum.Research,
        });

        return { 
          success: true, 
          action: "restart",
          message: "Thread reset. Ready for new research." 
        };
      }

      // For "approve" or "refine", resume from checkpoint
      const checkpointer = new ConvexCheckpointer(ctx);
      const graph = workflow.compile({ checkpointer });

      // Create the resume command
      const resumeValue: HITLResumeValue = {
        action: decision.action,
        feedback: decision.feedback,
      };

      const command = new Command({ resume: resumeValue });

      // Config to identify the thread
      const config = {
        configurable: {
          thread_id: threadId,
        },
      };

      // Update thread status before resuming
      if (decision.action === "approved") {
        await ctx.runMutation(internal.threads.updateStatus, {
          threadId,
          status: "generating_ideas",
        });
      } else if (decision.action === "refine") {
        await ctx.runMutation(internal.threads.updateStatus, {
          threadId,
          status: "planning",
        });
        
        // Save refinement feedback to thread
        await ctx.runMutation(internal.threads.setRefinementFeedback, {
          threadId,
          feedback: decision.feedback || "",
        });
      }

      // Get current sequence for stream events
      let sequence = await ctx.runQuery(internal.streamEvents.getLastSequence, {
        threadId,
        streamType: decision.action === "approved" 
          ? StreamTypeEnum.Ideas 
          : StreamTypeEnum.Research,
      });

      // Helper to add stream event
      const addEvent = async (
        eventType: StreamEventTypeEnum,
        node?: string,
        data?: unknown
      ) => {
        sequence++;
        await ctx.runMutation(internal.streamEvents.add, {
          threadId,
          streamType: decision.action === "approved" 
            ? StreamTypeEnum.Ideas 
            : StreamTypeEnum.Research,
          eventType,
          node,
          data,
          sequence,
        });
      };

      // Stream graph execution
      console.log("[HITL] Invoking graph with Command...");
      
      for await (const chunk of await graph.stream(command, {
        ...config,
        streamMode: "updates",
      })) {
        // Process each node update
        for (const [nodeName, nodeOutput] of Object.entries(chunk)) {
          console.log(`[HITL] Node ${nodeName} completed`);
          
          await addEvent(StreamEventTypeEnum.NodeStart, nodeName);

          // Handle specific node outputs
          if (nodeName === "generate_ideas" && nodeOutput) {
            const output = nodeOutput as { ideas?: unknown[] };
            if (output.ideas) {
              for (const idea of output.ideas) {
                await addEvent(StreamEventTypeEnum.Idea, nodeName, idea);
              }
            }
          }

          if (nodeName === "synthesize" && nodeOutput) {
            const output = nodeOutput as { trends?: unknown[] };
            if (output.trends) {
              // Save trends to database
              await ctx.runMutation(internal.trends.createBatch, {
                threadId,
                trends: output.trends as any[],
              });
              
              for (const trend of output.trends) {
                await addEvent(StreamEventTypeEnum.Trend, nodeName, trend);
              }
            }
          }

          await addEvent(StreamEventTypeEnum.NodeEnd, nodeName);
        }
      }

      // Update final status
      const finalStatus = decision.action === "approved" ? "completed" : "awaiting_approval";
      await ctx.runMutation(internal.threads.updateStatus, {
        threadId,
        status: finalStatus,
      });

      await addEvent(StreamEventTypeEnum.Complete);

      console.log(`[HITL] Completed with status: ${finalStatus}`);

      return {
        success: true,
        action: decision.action,
        message: `Graph resumed with action: ${decision.action}`,
      };
    } catch (error) {
      console.error("[HITL] Error:", error);
      
      await ctx.runMutation(internal.threads.updateStatus, {
        threadId,
        status: "error",
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// ============================================
// PUBLIC ACTIONS (chamadas pelo frontend)
// ============================================

export const approve = action({
  args: {
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    return await ctx.runAction(internal.actions.hitl.resumeAfterApproval, {
      threadId: args.threadId,
      decision: { action: "approved" },
    });
  },
});

export const refine = action({
  args: {
    threadId: v.id("threads"),
    feedback: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.runAction(internal.actions.hitl.resumeAfterApproval, {
      threadId: args.threadId,
      decision: { action: "refine", feedback: args.feedback },
    });
  },
});

export const restart = action({
  args: {
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    return await ctx.runAction(internal.actions.hitl.resumeAfterApproval, {
      threadId: args.threadId,
      decision: { action: "restart" },
    });
  },
});
```

### 4. Atualizar convex/actions/research.ts

Modificar a action de research para usar o checkpointer:

```typescript
// convex/actions/research.ts
"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { workflow } from "../agents/graph";
import { ConvexCheckpointer } from "../lib/ConvexCheckpointer";
import { StreamTypeEnum, StreamEventTypeEnum } from "../schema";
import { getNodeStartMessage, getStatusForNode, isMainGraphNode } from "../lib/streamHelpers";

/**
 * Run research graph with checkpointer
 * 
 * This action:
 * 1. Compiles graph with ConvexCheckpointer
 * 2. Streams execution, saving events to streamEvents
 * 3. Pauses at await_approval (via interrupt())
 * 4. Can be resumed later via HITL actions
 */
export const runResearchWithCheckpointer = internalAction({
  args: {
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    const { threadId } = args;
    console.log(`[RESEARCH] Starting research for thread ${threadId}`);

    try {
      // Get thread data
      const thread = await ctx.runQuery(internal.threads.get, { threadId });
      if (!thread) {
        throw new Error("Thread not found");
      }

      // Clear previous stream events
      await ctx.runMutation(internal.streamEvents.clearByThread, {
        threadId,
        streamType: StreamTypeEnum.Research,
      });

      // Create checkpointer and compile graph
      const checkpointer = new ConvexCheckpointer(ctx);
      const graph = workflow.compile({ checkpointer });

      // Config for this thread
      const config = {
        configurable: {
          thread_id: threadId,
        },
      };

      // Initial state
      const initialState = {
        userPrompt: thread.userPrompt,
        threadId: threadId,
        refinementFeedback: thread.refinementFeedback || null,
      };

      // Track sequence for events
      let sequence = 0;

      // Helper to add stream event
      const addEvent = async (
        eventType: StreamEventTypeEnum,
        node?: string,
        data?: unknown
      ) => {
        sequence++;
        await ctx.runMutation(internal.streamEvents.add, {
          threadId,
          streamType: StreamTypeEnum.Research,
          eventType,
          node,
          data,
          sequence,
        });
      };

      // Update status to planning
      await ctx.runMutation(internal.threads.updateStatus, {
        threadId,
        status: "planning",
      });

      await addEvent(StreamEventTypeEnum.NodeStart, "start");

      // Stream graph execution
      console.log("[RESEARCH] Starting graph stream...");
      
      let currentNode = "";
      let tokenBuffer = "";
      const TOKEN_BUFFER_SIZE = 10;

      for await (const chunk of await graph.stream(initialState, {
        ...config,
        streamMode: ["messages", "updates"],
      })) {
        // Handle different chunk types
        if (Array.isArray(chunk)) {
          // Messages stream - contains tokens
          for (const msg of chunk) {
            if (msg.content && typeof msg.content === "string") {
              tokenBuffer += msg.content;
              
              // Flush buffer periodically
              if (tokenBuffer.length >= TOKEN_BUFFER_SIZE) {
                await addEvent(StreamEventTypeEnum.Token, currentNode, { 
                  token: tokenBuffer 
                });
                tokenBuffer = "";
              }
            }
          }
        } else if (typeof chunk === "object") {
          // Updates stream - contains node completions
          for (const [nodeName, nodeOutput] of Object.entries(chunk)) {
            if (!isMainGraphNode(nodeName)) continue;

            // Flush remaining tokens
            if (tokenBuffer) {
              await addEvent(StreamEventTypeEnum.Token, currentNode, { 
                token: tokenBuffer 
              });
              tokenBuffer = "";
            }

            // Node transition
            if (nodeName !== currentNode) {
              if (currentNode) {
                await addEvent(StreamEventTypeEnum.NodeEnd, currentNode);
              }
              
              currentNode = nodeName;
              await addEvent(StreamEventTypeEnum.NodeStart, currentNode, {
                message: getNodeStartMessage(currentNode),
              });

              // Update thread status
              const status = getStatusForNode(currentNode);
              if (status) {
                await ctx.runMutation(internal.threads.updateStatus, {
                  threadId,
                  status,
                });
              }
            }

            // Handle specific node outputs
            const output = nodeOutput as Record<string, unknown>;

            if (nodeName === "plan_research" && output.researchPlan) {
              await addEvent(StreamEventTypeEnum.Plan, nodeName, output.researchPlan);
            }

            if (nodeName === "search" && output.searchResults) {
              await addEvent(StreamEventTypeEnum.SearchResults, nodeName, {
                count: (output.searchResults as unknown[]).length,
              });
            }

            if (nodeName === "synthesize" && output.trends) {
              // Save trends to database
              await ctx.runMutation(internal.trends.createBatch, {
                threadId,
                trends: output.trends as any[],
              });

              for (const trend of output.trends as unknown[]) {
                await addEvent(StreamEventTypeEnum.Trend, nodeName, trend);
              }
            }

            // await_approval node - graph will pause here due to interrupt()
            if (nodeName === "await_approval") {
              console.log("[RESEARCH] Reached await_approval - graph will pause");
              await addEvent(StreamEventTypeEnum.NodeEnd, nodeName);
            }
          }
        }
      }

      // Final cleanup
      if (tokenBuffer) {
        await addEvent(StreamEventTypeEnum.Token, currentNode, { 
          token: tokenBuffer 
        });
      }

      if (currentNode) {
        await addEvent(StreamEventTypeEnum.NodeEnd, currentNode);
      }

      // Check final state - if we reached await_approval, status should be awaiting_approval
      const finalThread = await ctx.runQuery(internal.threads.get, { threadId });
      
      if (finalThread?.status === "awaiting_approval") {
        await addEvent(StreamEventTypeEnum.Complete, undefined, {
          message: "Research complete. Awaiting approval.",
        });
      }

      console.log(`[RESEARCH] Completed. Final status: ${finalThread?.status}`);

      return {
        success: true,
        status: finalThread?.status,
      };
    } catch (error) {
      console.error("[RESEARCH] Error:", error);

      await ctx.runMutation(internal.threads.updateStatus, {
        threadId,
        status: "error",
      });

      // Log error event
      await ctx.runMutation(internal.streamEvents.add, {
        threadId,
        streamType: StreamTypeEnum.Research,
        eventType: StreamEventTypeEnum.Error,
        data: { message: error instanceof Error ? error.message : "Unknown error" },
        sequence: 999999,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// Keep the old action name for backward compatibility
export const runResearchGraph = runResearchWithCheckpointer;
```

### 5. Adicionar mutations necessárias

Adicionar ao `convex/threads.ts`:

```typescript
// Adicionar a convex/threads.ts

export const setRefinementFeedback = mutation({
  args: {
    threadId: v.id("threads"),
    feedback: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.threadId, {
      refinementFeedback: args.feedback,
      updatedAt: Date.now(),
    });
  },
});
```

Adicionar ao `convex/streamEvents.ts` (ou criar se não existir):

```typescript
// convex/streamEvents.ts
import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { streamTypeValidator, streamEventTypeValidator } from "./schema";

export const add = internalMutation({
  args: {
    threadId: v.id("threads"),
    streamType: streamTypeValidator,
    eventType: streamEventTypeValidator,
    node: v.optional(v.string()),
    data: v.optional(v.any()),
    sequence: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("streamEvents", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const clearByThread = internalMutation({
  args: {
    threadId: v.id("threads"),
    streamType: streamTypeValidator,
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("streamEvents")
      .withIndex("by_thread_type", (q) =>
        q.eq("threadId", args.threadId).eq("streamType", args.streamType)
      )
      .collect();

    for (const event of events) {
      await ctx.db.delete(event._id);
    }
  },
});

export const getLastSequence = internalQuery({
  args: {
    threadId: v.id("threads"),
    streamType: streamTypeValidator,
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("streamEvents")
      .withIndex("by_thread_sequence", (q) =>
        q.eq("threadId", args.threadId).eq("streamType", args.streamType)
      )
      .order("desc")
      .take(1);

    return events[0]?.sequence || 0;
  },
});

export const getByThread = query({
  args: {
    threadId: v.id("threads"),
    streamType: streamTypeValidator,
    afterSequence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let events = await ctx.db
      .query("streamEvents")
      .withIndex("by_thread_sequence", (q) =>
        q.eq("threadId", args.threadId).eq("streamType", args.streamType)
      )
      .order("asc")
      .collect();

    if (args.afterSequence !== undefined) {
      events = events.filter((e) => e.sequence > args.afterSequence!);
    }

    return events;
  },
});
```

---

## ✅ Acceptance Criteria

1. [ ] `awaitApprovalNode` usa `interrupt()` para pausar
2. [ ] `HITLResumeValue` e `HITLInterruptValue` types definidos
3. [ ] `convex/actions/hitl.ts` implementa `approve`, `refine`, `restart`
4. [ ] `resumeAfterApproval` usa `Command({ resume: ... })`
5. [ ] Research action usa checkpointer e salva estado
6. [ ] StreamEvents são criados durante execução
7. [ ] `restart` limpa checkpoints e permite re-executar

## 🛑 Stop Conditions

```bash
# 1. Verificar arquivos
test -f convex/agents/nodes/awaitApproval.ts && echo "✅ awaitApproval.ts" || echo "❌ missing"
test -f convex/actions/hitl.ts && echo "✅ hitl.ts" || echo "❌ missing"

# 2. Verificar uso de interrupt
grep -q "interrupt<" convex/agents/nodes/awaitApproval.ts && echo "✅ Uses interrupt()" || echo "❌ missing"

# 3. Verificar uso de Command
grep -q "new Command" convex/actions/hitl.ts && echo "✅ Uses Command" || echo "❌ missing"

# 4. Verificar exports de HITL actions
grep -q "export const approve" convex/actions/hitl.ts && echo "✅ approve exported" || echo "❌ missing"
grep -q "export const refine" convex/actions/hitl.ts && echo "✅ refine exported" || echo "❌ missing"
grep -q "export const restart" convex/actions/hitl.ts && echo "✅ restart exported" || echo "❌ missing"

# 5. TypeScript
npx tsc --noEmit 2>&1 | grep -q "error" && echo "❌ TypeScript errors" || echo "✅ TypeScript OK"
```

**Card concluído quando todos os checks passam ✅**

---

## 📝 Notas Técnicas

### Por que usar `interrupt()` em vez de condicional com END?

| Approach | Prós | Contras |
|----------|------|---------|
| `interrupt()` | Estado preservado, resume sem re-exec, fault tolerant | Requer checkpointer |
| Condicional + END | Simples, sem dependências | Re-executa tudo, perde estado |

### O que acontece quando "refine"?

1. `Command({ resume: { action: "refine", feedback: "..." } })` é enviado
2. `awaitApprovalNode` retorna com `hitlStatus: "refine"`
3. Router direciona para `plan_research`
4. `plan_research` vê `refinementFeedback` no state
5. Gera novo plano incorporando o feedback
6. Fluxo continua até `await_approval` novamente

### E quando "restart"?

`restart` é diferente - ele **não usa Command**. Ele:
1. Deleta checkpoints do thread
2. Deleta trends/ideas existentes
3. Reseta thread status para "idle"
4. O frontend deve iniciar uma nova execução

---

## 🔗 Próximo Card

CARD-06-v3: Ideas Node (streaming ready)
