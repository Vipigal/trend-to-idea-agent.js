# CARD-05: Research Action & HTTP Streaming

## 🎯 Objetivo

Criar a Action do Convex que executa o graph de research e o HTTP endpoint para streaming dos resultados.

## 📋 Dependências

- ✅ CARD-01 (Schema)
- ✅ CARD-02 (Convex Functions)
- ✅ CARD-03 (LangGraph Setup)
- ✅ CARD-04 (Research Nodes)

## 📁 Arquivos a Criar/Modificar

- `convex/actions/research.ts`
- `convex/http.ts`

## 💻 Implementação

### convex/actions/research.ts

```typescript
// convex/actions/research.ts
"use node";

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { graph } from "../agents/graph";
import { Id } from "../_generated/dataModel";

/**
 * Internal action to run the research graph
 * Called by the HTTP streaming endpoint
 */
export const runResearchGraph = internalAction({
  args: {
    threadId: v.id("threads"),
    userPrompt: v.string(),
    refinementFeedback: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    trends?: any[];
    error?: string;
  }> => {
    console.log("[ACTION] Starting research graph for thread:", args.threadId);

    try {
      // Update thread status to planning
      await ctx.runMutation(internal.threads.updateStatus, {
        threadId: args.threadId,
        status: "planning",
      });

      // Add status message
      await ctx.runMutation(internal.messages.create, {
        threadId: args.threadId,
        role: "assistant",
        content: "🔍 Planning research strategy...",
        messageType: "status_update",
        metadata: { step: "plan" },
      });

      // Run the graph
      const result = await graph.invoke({
        userPrompt: args.userPrompt,
        threadId: args.threadId,
        refinementFeedback: args.refinementFeedback || null,
      });

      // Check for errors
      if (result.error) {
        await ctx.runMutation(internal.threads.updateStatus, {
          threadId: args.threadId,
          status: "error",
        });

        await ctx.runMutation(internal.messages.create, {
          threadId: args.threadId,
          role: "assistant",
          content: `❌ Error: ${result.error}`,
          messageType: "error",
        });

        return { success: false, error: result.error };
      }

      // Save trends to database
      if (result.trends && result.trends.length > 0) {
        await ctx.runMutation(internal.trends.createBatch, {
          threadId: args.threadId,
          trends: result.trends,
        });
      }

      // Update thread status to awaiting approval
      await ctx.runMutation(internal.threads.updateStatus, {
        threadId: args.threadId,
        status: "awaiting_approval",
      });

      // Add completion message
      await ctx.runMutation(internal.messages.create, {
        threadId: args.threadId,
        role: "assistant",
        content: `✅ Research complete! Found ${result.trends?.length || 0} trends. Please review and approve.`,
        messageType: "research_result",
        metadata: { step: "complete" },
      });

      return {
        success: true,
        trends: result.trends,
      };
    } catch (error) {
      console.error("[ACTION] Research graph error:", error);

      await ctx.runMutation(internal.threads.updateStatus, {
        threadId: args.threadId,
        status: "error",
      });

      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      await ctx.runMutation(internal.messages.create, {
        threadId: args.threadId,
        role: "assistant",
        content: `❌ Research failed: ${errorMessage}`,
        messageType: "error",
      });

      return { success: false, error: errorMessage };
    }
  },
});

/**
 * Streaming research action
 * Runs the graph and yields progress updates
 */
export const streamResearch = internalAction({
  args: {
    threadId: v.id("threads"),
    userPrompt: v.string(),
    refinementFeedback: v.optional(v.string()),
  },
  handler: async function* (ctx, args) {
    console.log("[STREAM] Starting streaming research...");

    try {
      // Yield initial status
      yield { type: "status", step: "plan", message: "Planning research strategy..." };

      await ctx.runMutation(internal.threads.updateStatus, {
        threadId: args.threadId,
        status: "planning",
      });

      // Stream the graph execution
      const stream = await graph.stream({
        userPrompt: args.userPrompt,
        threadId: args.threadId,
        refinementFeedback: args.refinementFeedback || null,
      });

      for await (const chunk of stream) {
        // Each chunk is keyed by node name
        const [nodeName, nodeOutput] = Object.entries(chunk)[0];

        switch (nodeName) {
          case "plan_research":
            yield { type: "status", step: "plan", message: "Research plan created" };
            if (nodeOutput.researchPlan) {
              yield {
                type: "plan",
                keywords: nodeOutput.researchPlan.keywords,
                timeframe: nodeOutput.researchPlan.timeframe,
              };
            }
            await ctx.runMutation(internal.threads.updateStatus, {
              threadId: args.threadId,
              status: "searching",
            });
            yield { type: "status", step: "search", message: "Searching for trends..." };
            break;

          case "search":
            const resultCount = nodeOutput.searchResults?.length || 0;
            yield { type: "status", step: "search", message: `Found ${resultCount} sources` };
            await ctx.runMutation(internal.threads.updateStatus, {
              threadId: args.threadId,
              status: "synthesizing",
            });
            yield { type: "status", step: "synthesize", message: "Analyzing sources..." };
            break;

          case "synthesize":
            const trends = nodeOutput.trends || [];
            yield { type: "status", step: "synthesize", message: `Identified ${trends.length} trends` };
            
            // Yield each trend as it's identified
            for (const trend of trends) {
              yield { type: "trend", trend };
            }
            break;

          case "await_approval":
            yield { type: "status", step: "complete", message: "Research complete" };
            yield { type: "hitl", status: "pending" };
            break;
        }

        // Check for errors
        if (nodeOutput.error) {
          yield { type: "error", message: nodeOutput.error };
          return;
        }
      }

      // Save trends to database
      const finalState = await graph.invoke({
        userPrompt: args.userPrompt,
        threadId: args.threadId,
        refinementFeedback: args.refinementFeedback || null,
      });

      if (finalState.trends && finalState.trends.length > 0) {
        await ctx.runMutation(internal.trends.createBatch, {
          threadId: args.threadId,
          trends: finalState.trends,
        });
      }

      await ctx.runMutation(internal.threads.updateStatus, {
        threadId: args.threadId,
        status: "awaiting_approval",
      });

      yield { type: "complete", trendsCount: finalState.trends?.length || 0 };
    } catch (error) {
      console.error("[STREAM] Error:", error);
      yield { type: "error", message: error instanceof Error ? error.message : "Unknown error" };
    }
  },
});

/**
 * Public action to start research (non-streaming)
 * Use this if streaming is not needed
 */
export const startResearch = action({
  args: {
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.runQuery(internal.threads.get, {
      threadId: args.threadId,
    });

    if (!thread) {
      throw new Error("Thread not found");
    }

    // Schedule the research action
    await ctx.scheduler.runAfter(0, internal.actions.research.runResearchGraph, {
      threadId: args.threadId,
      userPrompt: thread.userPrompt,
      refinementFeedback: thread.refinementFeedback,
    });

    return { started: true };
  },
});
```

### convex/http.ts

```typescript
// convex/http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const http = httpRouter();

/**
 * HTTP endpoint for streaming research
 * 
 * POST /api/streamResearch
 * Body: { threadId: string }
 * 
 * Returns: Server-Sent Events stream
 */
http.route({
  path: "/api/streamResearch",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Parse request body
    const body = await request.json();
    const { threadId } = body as { threadId: string };

    if (!threadId) {
      return new Response(JSON.stringify({ error: "threadId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get thread data
    const thread = await ctx.runQuery(internal.threads.get, {
      threadId: threadId as Id<"threads">,
    });

    if (!thread) {
      return new Response(JSON.stringify({ error: "Thread not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Create a readable stream for SSE
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Update status
          await ctx.runMutation(internal.threads.updateStatus, {
            threadId: threadId as Id<"threads">,
            status: "planning",
          });

          // Send initial event
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "start", threadId })}\n\n`)
          );

          // Run the research graph
          const result = await ctx.runAction(internal.actions.research.runResearchGraph, {
            threadId: threadId as Id<"threads">,
            userPrompt: thread.userPrompt,
            refinementFeedback: thread.refinementFeedback,
          });

          // Send result
          if (result.success) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: "complete",
                trends: result.trends,
              })}\n\n`)
            );
          } else {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: "error",
                message: result.error,
              })}\n\n`)
            );
          }

          // Close stream
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
          controller.close();
        } catch (error) {
          console.error("[HTTP] Stream error:", error);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: "error",
              message: error instanceof Error ? error.message : "Unknown error",
            })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }),
});

/**
 * Simple polling endpoint for research status
 * Use this as fallback if SSE has issues
 */
http.route({
  path: "/api/researchStatus",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const threadId = url.searchParams.get("threadId");

    if (!threadId) {
      return new Response(JSON.stringify({ error: "threadId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const thread = await ctx.runQuery(internal.threads.get, {
      threadId: threadId as Id<"threads">,
    });

    if (!thread) {
      return new Response(JSON.stringify({ error: "Thread not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const trends = await ctx.runQuery(internal.trends.getByThread, {
      threadId: threadId as Id<"threads">,
    });

    return new Response(
      JSON.stringify({
        status: thread.status,
        trends,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }),
});

/**
 * CORS preflight handler
 */
http.route({
  path: "/api/streamResearch",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

export default http;
```

### Adicionar internal exports

Criar/atualizar `convex/_internal.ts` ou adicionar exports internos:

```typescript
// No topo de convex/threads.ts, adicionar:
import { internalQuery, internalMutation } from "./_generated/server";

// Adicionar query interna para o HTTP action poder usar
export const getInternal = internalQuery({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.threadId);
  },
});
```

## ✅ Acceptance Criteria

1. [ ] `convex/actions/research.ts` implementa `runResearchGraph` e `startResearch`
2. [ ] `convex/http.ts` implementa endpoint `/api/streamResearch` com SSE
3. [ ] HTTP endpoint retorna `Content-Type: text/event-stream`
4. [ ] Eventos SSE seguem formato `data: {...}\n\n`
5. [ ] CORS headers configurados
6. [ ] Thread status é atualizado durante execução
7. [ ] Trends são salvos no banco após completar

## 🛑 Stop Conditions

```bash
# 1. Verificar que arquivos existem
test -f convex/actions/research.ts && echo "✅ research.ts exists" || echo "❌ research.ts missing"
test -f convex/http.ts && echo "✅ http.ts exists" || echo "❌ http.ts missing"

# 2. Verificar compilação
npx tsc --noEmit convex/actions/research.ts convex/http.ts 2>&1 | grep -q "error" && echo "❌ TypeScript errors" || echo "✅ TypeScript OK"

# 3. Verificar que Convex sincroniza
npx convex dev --once 2>&1 | grep -q "error" && echo "❌ Convex errors" || echo "✅ Convex synced"

# 4. Verificar HTTP route
grep -q "/api/streamResearch" convex/http.ts && echo "✅ streamResearch route exists" || echo "❌ streamResearch route missing"

# 5. Verificar SSE headers
grep -q "text/event-stream" convex/http.ts && echo "✅ SSE content-type set" || echo "❌ SSE content-type missing"

# 6. Testar endpoint (após convex dev estar rodando)
# curl -X POST http://localhost:3210/api/streamResearch -H "Content-Type: application/json" -d '{"threadId":"test"}'
```

**Card concluído quando todos os checks passam ✅**

## 📝 Notas

- HTTP Actions no Convex usam a URL `.convex.site` em produção
- SSE (Server-Sent Events) é usado para streaming real
- Fallback polling endpoint disponível em `/api/researchStatus`
- Actions internas usam `internal.` prefix para chamadas entre funções
- CORS está configurado para aceitar qualquer origem (ajustar em produção)
