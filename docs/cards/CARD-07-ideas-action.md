# CARD-07: Ideas Action & HTTP Streaming (Sidebar)

## 🎯 Objetivo

Criar a Action e HTTP endpoint para streaming de ideias na sidebar, separado do chat principal.

## 📋 Dependências

- ✅ CARD-05 (Research Action)
- ✅ CARD-06 (Ideas Node)

## 📁 Arquivos a Criar/Modificar

- `convex/actions/ideas.ts`
- Atualizar `convex/http.ts`

## 💻 Implementação

### convex/actions/ideas.ts

```typescript
// convex/actions/ideas.ts
"use node";

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { generateIdeasStreaming } from "../agents/nodes/generateIdeas";
import { Trend, BrandContext } from "../agents/state";

// Default brand context (Gallium)
const DEFAULT_BRAND_CONTEXT: BrandContext = {
  name: "Gallium",
  voice: "Clear, sharp, slightly edgy, technical but human. No corporate fluff.",
  targetAudience: "Founders, growth leads, and small marketing teams who want to move faster with AI",
  values: ["Speed", "Leverage", "Rigor", "Systems thinking", "Modern taste"],
  doList: [
    "Concrete takeaways",
    "Strong opinions backed by evidence",
    "Punchy hooks",
    "'This actually works' energy",
    "Show don't tell",
  ],
  dontList: [
    "Corporate speak",
    "Vague platitudes",
    "Excessive emojis",
    "Clickbait without substance",
    "Being preachy",
  ],
};

/**
 * Internal action to run idea generation
 * Returns all ideas at once (non-streaming)
 */
export const runIdeasGeneration = internalAction({
  args: {
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    console.log("[IDEAS_ACTION] Starting idea generation for thread:", args.threadId);

    try {
      // Get trends from database
      const trends = await ctx.runQuery(internal.trends.getByThread, {
        threadId: args.threadId,
      });

      if (!trends || trends.length === 0) {
        throw new Error("No trends found for this thread");
      }

      // Update thread status
      await ctx.runMutation(internal.threads.updateStatus, {
        threadId: args.threadId,
        status: "generating_ideas",
      });

      // Convert to Trend type expected by generator
      const trendData: Trend[] = trends.map((t) => ({
        title: t.title,
        summary: t.summary,
        whyItMatters: t.whyItMatters,
        confidence: t.confidence,
        sources: t.sources,
      }));

      // Collect all ideas
      const allIdeas: Array<{
        trendId: Id<"trends">;
        platform: "linkedin" | "twitter" | "tiktok" | "instagram";
        hook: string;
        format: string;
        angle: string;
        description: string;
      }> = [];

      // Run streaming generator but collect results
      for await (const event of generateIdeasStreaming(trendData, DEFAULT_BRAND_CONTEXT)) {
        if (event.type === "idea" && event.idea) {
          const trendId = trends[event.idea.trendIndex]._id;
          allIdeas.push({
            trendId,
            platform: event.idea.platform as any,
            hook: event.idea.hook,
            format: event.idea.format,
            angle: event.idea.angle,
            description: event.idea.description,
          });
        }
      }

      // Save all ideas to database
      for (const idea of allIdeas) {
        await ctx.runMutation(internal.ideas.create, {
          threadId: args.threadId,
          trendId: idea.trendId,
          platform: idea.platform,
          hook: idea.hook,
          format: idea.format,
          angle: idea.angle,
          description: idea.description,
        });
      }

      // Update thread status
      await ctx.runMutation(internal.threads.updateStatus, {
        threadId: args.threadId,
        status: "completed",
      });

      return {
        success: true,
        ideasCount: allIdeas.length,
      };
    } catch (error) {
      console.error("[IDEAS_ACTION] Error:", error);

      await ctx.runMutation(internal.threads.updateStatus, {
        threadId: args.threadId,
        status: "error",
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Public action to start idea generation
 * Called after HITL approval
 */
export const startIdeasGeneration = action({
  args: {
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    // Verify thread is approved
    const thread = await ctx.runQuery(internal.threads.get, {
      threadId: args.threadId,
    });

    if (!thread) {
      throw new Error("Thread not found");
    }

    if (thread.status !== "generating_ideas" && thread.status !== "awaiting_approval") {
      throw new Error(`Invalid thread status: ${thread.status}`);
    }

    // Clear any existing ideas (for re-generation)
    await ctx.runMutation(internal.ideas.deleteByThread, {
      threadId: args.threadId,
    });

    // Schedule idea generation
    await ctx.scheduler.runAfter(0, internal.actions.ideas.runIdeasGeneration, {
      threadId: args.threadId,
    });

    return { started: true };
  },
});
```

### Atualizar convex/http.ts

Adicionar endpoint de streaming para ideias:

```typescript
// convex/http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { generateIdeasStreaming } from "./agents/nodes/generateIdeas";
import { Trend, BrandContext } from "./agents/state";

const http = httpRouter();

// ... (manter rotas existentes do CARD-05)

/**
 * HTTP endpoint for streaming ideas to sidebar
 * 
 * POST /api/streamIdeas
 * Body: { threadId: string }
 * 
 * Returns: Server-Sent Events stream with individual ideas
 */
http.route({
  path: "/api/streamIdeas",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const { threadId } = body as { threadId: string };

    if (!threadId) {
      return new Response(JSON.stringify({ error: "threadId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verify thread and get trends
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

    if (!trends || trends.length === 0) {
      return new Response(JSON.stringify({ error: "No trends found" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Default brand context
    const brandContext: BrandContext = {
      name: "Gallium",
      voice: "Clear, sharp, slightly edgy, technical but human. No corporate fluff.",
      targetAudience: "Founders, growth leads, and small marketing teams",
      values: ["Speed", "Leverage", "Rigor", "Systems thinking", "Modern taste"],
      doList: ["Concrete takeaways", "Strong opinions", "Punchy hooks"],
      dontList: ["Corporate speak", "Vague platitudes", "Excessive emojis"],
    };

    // Convert trends for generator
    const trendData: Trend[] = trends.map((t) => ({
      title: t.title,
      summary: t.summary,
      whyItMatters: t.whyItMatters,
      confidence: t.confidence,
      sources: t.sources,
    }));

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Update thread status
          await ctx.runMutation(internal.threads.updateStatus, {
            threadId: threadId as Id<"threads">,
            status: "generating_ideas",
          });

          // Send start event
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "start", trendsCount: trends.length })}\n\n`)
          );

          // Stream ideas
          for await (const event of generateIdeasStreaming(trendData, brandContext)) {
            // Send each event
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            );

            // Save idea to database if it's an idea event
            if (event.type === "idea" && event.idea) {
              const trendId = trends[event.idea.trendIndex]._id;
              await ctx.runMutation(internal.ideas.create, {
                threadId: threadId as Id<"threads">,
                trendId,
                platform: event.idea.platform as any,
                hook: event.idea.hook,
                format: event.idea.format,
                angle: event.idea.angle,
                description: event.idea.description,
              });
            }
          }

          // Update thread status to completed
          await ctx.runMutation(internal.threads.updateStatus, {
            threadId: threadId as Id<"threads">,
            status: "completed",
          });

          // Send done event
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
          );

          controller.close();
        } catch (error) {
          console.error("[HTTP] Ideas stream error:", error);
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
 * CORS preflight for ideas endpoint
 */
http.route({
  path: "/api/streamIdeas",
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

/**
 * Get ideas for a thread (polling fallback)
 */
http.route({
  path: "/api/ideas",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const threadId = url.searchParams.get("threadId");
    const platform = url.searchParams.get("platform");

    if (!threadId) {
      return new Response(JSON.stringify({ error: "threadId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let ideas;
    if (platform) {
      ideas = await ctx.runQuery(internal.ideas.getByPlatform, {
        threadId: threadId as Id<"threads">,
        platform: platform as any,
      });
    } else {
      ideas = await ctx.runQuery(internal.ideas.getByThread, {
        threadId: threadId as Id<"threads">,
      });
    }

    return new Response(JSON.stringify({ ideas }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }),
});

export default http;
```

## ✅ Acceptance Criteria

1. [ ] `convex/actions/ideas.ts` implementa `runIdeasGeneration` e `startIdeasGeneration`
2. [ ] `/api/streamIdeas` retorna SSE stream com ideias individuais
3. [ ] Cada evento `type: "idea"` contém uma ideia completa
4. [ ] Ideas são salvas no banco durante streaming
5. [ ] Thread status atualizado para "completed" após finalizar
6. [ ] `/api/ideas` disponível como fallback de polling
7. [ ] Stream é **separado** do `/api/streamResearch`

## 🛑 Stop Conditions

```bash
# 1. Verificar que arquivo existe
test -f convex/actions/ideas.ts && echo "✅ ideas.ts action exists" || echo "❌ ideas.ts action missing"

# 2. Verificar exports
grep -q "export const runIdeasGeneration" convex/actions/ideas.ts && echo "✅ runIdeasGeneration exported" || echo "❌ runIdeasGeneration not exported"
grep -q "export const startIdeasGeneration" convex/actions/ideas.ts && echo "✅ startIdeasGeneration exported" || echo "❌ startIdeasGeneration not exported"

# 3. Verificar HTTP routes
grep -q "/api/streamIdeas" convex/http.ts && echo "✅ streamIdeas route exists" || echo "❌ streamIdeas route missing"
grep -q "/api/ideas" convex/http.ts && echo "✅ ideas polling route exists" || echo "❌ ideas polling route missing"

# 4. Verificar que são endpoints separados
grep -c "http.route" convex/http.ts | xargs -I {} test {} -ge 4 && echo "✅ Multiple routes defined" || echo "❌ Missing routes"

# 5. Compilação TypeScript
npx tsc --noEmit convex/actions/ideas.ts 2>&1 | grep -q "error" && echo "❌ TypeScript errors" || echo "✅ TypeScript OK"
```

**Card concluído quando todos os checks passam ✅**

## 📝 Notas

- `/api/streamIdeas` é **separado** de `/api/streamResearch` - requisito explícito da tarefa
- Cada ideia é salva no banco assim que é gerada (streaming + persistence)
- Brand context está hardcoded (Gallium) - poderia ser dinâmico no futuro
- `generateIdeasStreaming` é uma generator function que yield eventos individuais
