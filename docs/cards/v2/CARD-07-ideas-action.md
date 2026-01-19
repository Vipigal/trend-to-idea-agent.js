# CARD-07: Ideas Action & HTTP Streaming - Sidebar (REVISADO)

## 📝 Mudanças para Streaming Real

### O que mudou
- HTTP endpoint usa `generateIdeasStreaming()` generator
- Cada ideia é enviada via SSE assim que é gerada
- Ideias são salvas no banco incrementalmente
- Consistente com padrão de streaming do CARD-05

---

## 🎯 Objetivo

Criar a Action e HTTP endpoint para streaming de ideias na **sidebar separada**, demonstrando o requisito de "sub-agent em superfície UI diferente".

## 📋 Dependências

- ✅ CARD-05 (Research Action - padrão de streaming)
- ✅ CARD-06 (Ideas Node)

## 📁 Arquivos a Criar/Modificar

- `convex/actions/ideas.ts`
- Atualizar `convex/http.ts` (adicionar rota de ideas)

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

// Brand context padrão (Gallium)
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
 * Internal action para executar geração de ideias SEM streaming
 * Usado como fallback
 */
export const runIdeasGeneration = internalAction({
  args: {
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    console.log("[IDEAS_ACTION] Starting idea generation for thread:", args.threadId);

    try {
      // Buscar trends do banco
      const trends = await ctx.runQuery(internal.trends.getByThread, {
        threadId: args.threadId,
      });

      if (!trends || trends.length === 0) {
        throw new Error("No trends found for this thread");
      }

      // Atualizar status
      await ctx.runMutation(internal.threads.updateStatus, {
        threadId: args.threadId,
        status: "generating_ideas",
      });

      // Converter para tipo Trend
      const trendData: Trend[] = trends.map((t) => ({
        title: t.title,
        summary: t.summary,
        whyItMatters: t.whyItMatters,
        confidence: t.confidence,
        sources: t.sources,
      }));

      // Coletar todas as ideias
      const allIdeas: Array<{
        trendId: Id<"trends">;
        platform: "linkedin" | "twitter" | "tiktok" | "instagram";
        hook: string;
        format: string;
        angle: string;
        description: string;
      }> = [];

      // Executar generator e coletar resultados
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

      // Salvar todas as ideias no banco
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

      // Atualizar status
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
 * Action pública para iniciar geração de ideias
 * Chamada após HITL approval
 */
export const startIdeasGeneration = action({
  args: {
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    // Verificar status do thread
    const thread = await ctx.runQuery(internal.threads.get, {
      threadId: args.threadId,
    });

    if (!thread) {
      throw new Error("Thread not found");
    }

    if (thread.status !== "generating_ideas" && thread.status !== "awaiting_approval") {
      throw new Error(`Invalid thread status: ${thread.status}`);
    }

    // Limpar ideias existentes (para re-geração)
    await ctx.runMutation(internal.ideas.deleteByThread, {
      threadId: args.threadId,
    });

    // Agendar geração
    await ctx.scheduler.runAfter(0, internal.actions.ideas.runIdeasGeneration, {
      threadId: args.threadId,
    });

    return { started: true };
  },
});
```

### Adicionar rota em convex/http.ts

Adicionar as rotas de streaming de ideias no arquivo `http.ts`:

```typescript
// Adicionar no convex/http.ts, APÓS as rotas de research

import { generateIdeasStreaming } from "./agents/nodes/generateIdeas";
import { Trend, BrandContext } from "./agents/state";

// Brand context padrão
const DEFAULT_BRAND_CONTEXT: BrandContext = {
  name: "Gallium",
  voice: "Clear, sharp, slightly edgy, technical but human.",
  targetAudience: "Founders, growth leads, and small marketing teams",
  values: ["Speed", "Leverage", "Rigor", "Systems thinking"],
  doList: ["Concrete takeaways", "Strong opinions", "Punchy hooks"],
  dontList: ["Corporate speak", "Vague platitudes", "Excessive emojis"],
};

/**
 * HTTP endpoint para streaming de ideias (SIDEBAR)
 * 
 * POST /api/streamIdeas
 * Body: { threadId: string }
 * 
 * Retorna: Server-Sent Events com ideias individuais
 * 
 * IMPORTANTE: Este é um endpoint SEPARADO do /api/streamResearch
 * para demonstrar o requisito de "sub-agent em superfície UI diferente"
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

    // Verificar thread e buscar trends
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

    // Converter trends para formato esperado
    const trendData: Trend[] = trends.map((t) => ({
      title: t.title,
      summary: t.summary,
      whyItMatters: t.whyItMatters,
      confidence: t.confidence,
      sources: t.sources,
    }));

    const sse = createSSEEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: SSEEvent) => {
          controller.enqueue(sse.encode(event));
        };

        try {
          // Atualizar status
          await ctx.runMutation(internal.threads.updateStatus, {
            threadId: threadId as Id<"threads">,
            status: "generating_ideas",
          });

          // Enviar evento de início
          send({ 
            type: "start", 
            threadId, 
            trendsCount: trends.length,
            platforms: ["linkedin", "twitter", "tiktok"],
          });

          let ideasCount = 0;

          // =============================================
          // 👇 STREAMING REAL DE IDEIAS
          // =============================================
          for await (const event of generateIdeasStreaming(trendData, DEFAULT_BRAND_CONTEXT)) {
            switch (event.type) {
              case "status":
                send({
                  type: "node_start",
                  node: "generate_ideas",
                  message: event.message,
                  trendIndex: event.trendIndex,
                  trendTitle: event.trendTitle,
                });
                break;

              case "llm_start":
                send({
                  type: "llm_start",
                  platform: event.platform,
                  trendIndex: event.trendIndex,
                  message: event.message,
                });
                break;

              case "llm_end":
                send({
                  type: "llm_end",
                  platform: event.platform,
                  trendIndex: event.trendIndex,
                });
                break;

              case "idea":
                if (event.idea) {
                  ideasCount++;
                  
                  // Salvar ideia no banco IMEDIATAMENTE
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

                  // Enviar ideia para o frontend
                  send({
                    type: "idea",
                    idea: {
                      ...event.idea,
                      trendTitle: event.trendTitle,
                    },
                    ideasCount,
                  });
                }
                break;

              case "error":
                send({
                  type: "error",
                  message: event.message,
                });
                break;

              case "complete":
                // Handled below
                break;
            }
          }

          // Atualizar status para completed
          await ctx.runMutation(internal.threads.updateStatus, {
            threadId: threadId as Id<"threads">,
            status: "completed",
          });

          send({
            type: "complete",
            ideasCount,
          });

          send({ type: "done" });
          controller.close();

        } catch (error) {
          console.error("[HTTP] Ideas stream error:", error);
          
          send({
            type: "error",
            message: error instanceof Error ? error.message : "Unknown error",
          });
          
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
 * CORS preflight para ideas
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
 * Endpoint de polling para ideias (fallback)
 */
http.route({
  path: "/api/ideas",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const threadId = url.searchParams.get("threadId");
    const platform = url.searchParams.get("platform");

    if (!threadId) {
      return new Response(JSON.stringify({ error: "threadId required" }), {
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
```

## 📊 Sequência de Eventos SSE (Sidebar)

```
→ { type: "start", threadId: "abc123", trendsCount: 5, platforms: [...] }

→ { type: "node_start", node: "generate_ideas", message: "Processing trend: AI in Marketing", trendIndex: 0, trendTitle: "AI in Marketing" }

→ { type: "llm_start", platform: "linkedin", trendIndex: 0, message: "Generating linkedin ideas..." }
→ { type: "llm_end", platform: "linkedin", trendIndex: 0 }
→ { type: "idea", idea: { platform: "linkedin", hook: "...", ... }, ideasCount: 1 }
→ { type: "idea", idea: { platform: "linkedin", hook: "...", ... }, ideasCount: 2 }

→ { type: "llm_start", platform: "twitter", trendIndex: 0, message: "Generating twitter ideas..." }
→ { type: "llm_end", platform: "twitter", trendIndex: 0 }
→ { type: "idea", idea: { platform: "twitter", hook: "...", ... }, ideasCount: 3 }
→ { type: "idea", idea: { platform: "twitter", hook: "...", ... }, ideasCount: 4 }

... (mais trends e plataformas)

→ { type: "complete", ideasCount: 24 }
→ { type: "done" }
```

## ✅ Acceptance Criteria

1. [ ] `convex/actions/ideas.ts` implementa `runIdeasGeneration` e `startIdeasGeneration`
2. [ ] `/api/streamIdeas` é um endpoint **separado** de `/api/streamResearch`
3. [ ] Cada evento `type: "idea"` contém uma ideia completa
4. [ ] Ideas são salvas no banco **durante** o streaming
5. [ ] Thread status atualizado para "completed" ao finalizar
6. [ ] `/api/ideas` disponível como fallback de polling

## 🛑 Stop Conditions

```bash
# 1. Verificar arquivo
test -f convex/actions/ideas.ts && echo "✅ ideas.ts exists" || echo "❌ ideas.ts missing"

# 2. Verificar exports
grep -q "export const runIdeasGeneration" convex/actions/ideas.ts && echo "✅ runIdeasGeneration exported" || echo "❌ missing"
grep -q "export const startIdeasGeneration" convex/actions/ideas.ts && echo "✅ startIdeasGeneration exported" || echo "❌ missing"

# 3. Verificar rotas HTTP separadas
grep -q '"/api/streamIdeas"' convex/http.ts && echo "✅ streamIdeas route exists" || echo "❌ missing"
grep -q '"/api/streamResearch"' convex/http.ts && echo "✅ streamResearch route exists" || echo "❌ missing"

# 4. Contar rotas (deve ter pelo menos 4: streamResearch, streamIdeas, status, ideas)
grep -c "http.route" convex/http.ts | xargs -I {} test {} -ge 4 && echo "✅ Multiple routes" || echo "❌ Missing routes"

# 5. Compilação
npx tsc --noEmit 2>&1 | grep -q "error" && echo "❌ TypeScript errors" || echo "✅ TypeScript OK"
```

**Card concluído quando todos os checks passam ✅**

## 📝 Notas Importantes

### Por que endpoints separados?
- Requisito explícito: "sub-agent em superfície UI diferente"
- `/api/streamResearch` → Chat principal (pesquisa)
- `/api/streamIdeas` → Sidebar (ideias)
- Demonstra arquitetura de múltiplos agentes com streams independentes

### Salvamento incremental
Cada ideia é salva no banco **assim que é gerada**, não apenas no final. Isso garante:
- Recuperação em caso de falha
- UI pode mostrar ideias conforme chegam via `useQuery`
- Consistência entre stream e banco
