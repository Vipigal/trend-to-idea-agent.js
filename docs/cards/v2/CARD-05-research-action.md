# CARD-05: Research Action & HTTP Streaming (REVISADO)

## 📝 Revisão: Por que esta mudança?

### Problema da versão anterior

A implementação original usava `graph.invoke()` que:
- Executa o grafo **inteiro** e só retorna no final
- O "streaming" era fake - apenas enviávamos eventos após cada nó completar
- Usuário não via tokens do LLM aparecendo em tempo real

### Solução: `graph.streamEvents()`

O LangGraph oferece `streamEvents()` que emite eventos **durante** a execução:

| Evento | Quando dispara | O que contém |
|--------|----------------|--------------|
| `on_chain_start` | Nó inicia | Nome do nó |
| `on_llm_stream` | LLM emite token | Token individual |
| `on_llm_end` | LLM termina | Resposta completa |
| `on_tool_start` | Tool é chamada | Input da tool |
| `on_tool_end` | Tool retorna | Output da tool |
| `on_chain_end` | Nó termina | Output do nó |

### Mudanças necessárias

1. **Nodes LLM**: Adicionar `streaming: true` no modelo
2. **HTTP Action**: Usar `streamEvents()` em vez de `invoke()`
3. **Frontend**: Processar eventos granulares (tokens, tool calls)

---

## 🎯 Objetivo

Criar a Action do Convex que executa o graph de research com **streaming real** de tokens e eventos.

## 📋 Dependências

- ✅ CARD-01 (Schema)
- ✅ CARD-02 (Convex Functions)
- ✅ CARD-03 (LangGraph Setup)
- ✅ CARD-04 (Research Nodes)

## 📁 Arquivos a Criar/Modificar

- `convex/agents/nodes/plan.ts` (modificar - adicionar streaming)
- `convex/agents/nodes/synthesize.ts` (modificar - adicionar streaming)
- `convex/actions/research.ts`
- `convex/http.ts`
- `convex/lib/streamHelpers.ts` (novo)

## 💻 Implementação

### Modificar convex/agents/nodes/plan.ts

Adicionar `streaming: true` ao modelo:

```typescript
// convex/agents/nodes/plan.ts
"use node";

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { AgentStateType, ResearchPlan } from "../state";
import { PLAN_RESEARCH_PROMPT, REFINEMENT_PROMPT } from "../prompts";

// 👇 IMPORTANTE: streaming habilitado
const model = new ChatOpenAI({
  modelName: "gpt-4o",
  temperature: 0.3,
  streaming: true,
});

export const planResearchNode = async (
  state: AgentStateType
): Promise<Partial<AgentStateType>> => {
  console.log("[PLAN] Starting research planning...");

  try {
    let systemPrompt = PLAN_RESEARCH_PROMPT;
    let userContent = state.userPrompt;

    if (state.refinementFeedback && state.researchPlan) {
      systemPrompt = REFINEMENT_PROMPT
        .replace("{previousKeywords}", state.researchPlan.keywords.join(", "))
        .replace("{feedback}", state.refinementFeedback);
      userContent = `Original request: ${state.userPrompt}\nFeedback: ${state.refinementFeedback}`;
    }

    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userContent),
    ]);

    const content = response.content as string;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error("Failed to extract JSON from LLM response");
    }

    const plan: ResearchPlan = JSON.parse(jsonMatch[0]);
    console.log("[PLAN] Generated plan:", plan);

    return {
      researchPlan: plan,
      currentStep: "plan",
      error: null,
    };
  } catch (error) {
    console.error("[PLAN] Error:", error);
    return {
      error: `Planning failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      currentStep: "error",
    };
  }
};
```

### Modificar convex/agents/nodes/synthesize.ts

```typescript
// convex/agents/nodes/synthesize.ts
"use node";

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { AgentStateType, Trend } from "../state";
import { SYNTHESIZE_PROMPT } from "../prompts";

// 👇 IMPORTANTE: streaming habilitado
const model = new ChatOpenAI({
  modelName: "gpt-4o",
  temperature: 0.4,
  streaming: true,
});

// ... resto do código igual ao CARD-04
```

### Criar convex/lib/streamHelpers.ts

```typescript
// convex/lib/streamHelpers.ts

/**
 * Mensagens de status para cada nó
 */
export function getNodeStartMessage(node: string): string {
  const messages: Record<string, string> = {
    plan_research: "📋 Planning research strategy...",
    search: "🔍 Searching for trends with Tavily...",
    synthesize: "📊 Analyzing and synthesizing results...",
    await_approval: "✅ Research complete! Please review the trends.",
    generate_ideas: "💡 Generating content ideas...",
  };
  return messages[node] || `Processing ${node}...`;
}

/**
 * Mapear nó para status do thread
 */
export function getStatusForNode(node: string): string | null {
  const statuses: Record<string, string> = {
    plan_research: "planning",
    search: "searching",
    synthesize: "synthesizing",
    await_approval: "awaiting_approval",
    generate_ideas: "generating_ideas",
  };
  return statuses[node] || null;
}

/**
 * Tipos de eventos SSE
 */
export interface SSEEvent {
  type: 
    | "start"
    | "node_start"
    | "node_end"
    | "token"
    | "llm_complete"
    | "tool_start"
    | "tool_end"
    | "trend"
    | "idea"
    | "plan"
    | "search_results"
    | "complete"
    | "error"
    | "done";
  [key: string]: any;
}

/**
 * Criar encoder para SSE
 */
export function createSSEEncoder() {
  const encoder = new TextEncoder();
  return {
    encode: (data: SSEEvent) => 
      encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
  };
}
```

### convex/actions/research.ts

```typescript
// convex/actions/research.ts
"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { graph } from "../agents/graph";

/**
 * Internal action para executar research SEM streaming
 * Usado como fallback ou para testes
 */
export const runResearchGraph = internalAction({
  args: {
    threadId: v.id("threads"),
    userPrompt: v.string(),
    refinementFeedback: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    console.log("[ACTION] Starting research graph for thread:", args.threadId);

    try {
      await ctx.runMutation(internal.threads.updateStatus, {
        threadId: args.threadId,
        status: "planning",
      });

      // Executar grafo completo (sem streaming)
      const result = await graph.invoke({
        userPrompt: args.userPrompt,
        threadId: args.threadId,
        refinementFeedback: args.refinementFeedback || null,
      });

      if (result.error) {
        await ctx.runMutation(internal.threads.updateStatus, {
          threadId: args.threadId,
          status: "error",
        });
        return { success: false, error: result.error };
      }

      // Salvar trends
      if (result.trends && result.trends.length > 0) {
        await ctx.runMutation(internal.trends.createBatch, {
          threadId: args.threadId,
          trends: result.trends,
        });
      }

      await ctx.runMutation(internal.threads.updateStatus, {
        threadId: args.threadId,
        status: "awaiting_approval",
      });

      return { success: true, trends: result.trends };
    } catch (error) {
      console.error("[ACTION] Error:", error);
      await ctx.runMutation(internal.threads.updateStatus, {
        threadId: args.threadId,
        status: "error",
      });
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      };
    }
  },
});
```

### convex/http.ts (PRINCIPAL - STREAMING REAL)

```typescript
// convex/http.ts
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { graph } from "./agents/graph";
import { 
  getNodeStartMessage, 
  getStatusForNode, 
  createSSEEncoder,
  SSEEvent 
} from "./lib/streamHelpers";

const http = httpRouter();

/**
 * HTTP endpoint para streaming de research
 * 
 * POST /api/streamResearch
 * Body: { threadId: string }
 * 
 * Retorna: Server-Sent Events com streaming real de tokens
 */
http.route({
  path: "/api/streamResearch",
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

    // Buscar thread
    const thread = await ctx.runQuery(internal.threads.get, {
      threadId: threadId as Id<"threads">,
    });

    if (!thread) {
      return new Response(JSON.stringify({ error: "Thread not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const sse = createSSEEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: SSEEvent) => {
          controller.enqueue(sse.encode(event));
        };

        try {
          // Atualizar status inicial
          await ctx.runMutation(internal.threads.updateStatus, {
            threadId: threadId as Id<"threads">,
            status: "planning",
          });

          send({ type: "start", threadId });

          // =============================================
          // 👇 STREAMING REAL COM streamEvents()
          // =============================================
          const eventStream = graph.streamEvents(
            {
              userPrompt: thread.userPrompt,
              threadId: threadId,
              refinementFeedback: thread.refinementFeedback || null,
            },
            { 
              version: "v2",
              // Incluir eventos específicos para reduzir ruído
              includeTypes: [
                "on_chain_start",
                "on_chain_end", 
                "on_llm_stream",
                "on_llm_end",
                "on_tool_start",
                "on_tool_end",
              ],
            }
          );

          let currentNode = "";
          let lastStatus: string | null = null;

          for await (const event of eventStream) {
            const { event: eventType, name, data } = event;

            switch (eventType) {
              // ─────────────────────────────────────────
              // Quando um NÓ INICIA
              // ─────────────────────────────────────────
              case "on_chain_start": {
                // Filtrar apenas nós principais do grafo
                const mainNodes = ["plan_research", "search", "synthesize", "await_approval"];
                if (name && mainNodes.includes(name) && name !== currentNode) {
                  currentNode = name;
                  
                  send({
                    type: "node_start",
                    node: currentNode,
                    message: getNodeStartMessage(currentNode),
                  });

                  // Atualizar status do thread
                  const status = getStatusForNode(currentNode);
                  if (status && status !== lastStatus) {
                    lastStatus = status;
                    await ctx.runMutation(internal.threads.updateStatus, {
                      threadId: threadId as Id<"threads">,
                      status: status as any,
                    });
                  }
                }
                break;
              }

              // ─────────────────────────────────────────
              // Quando o LLM emite TOKENS (streaming real!)
              // ─────────────────────────────────────────
              case "on_llm_stream": {
                const chunk = data?.chunk;
                const token = chunk?.content || chunk?.text;
                
                if (token && typeof token === "string") {
                  send({
                    type: "token",
                    node: currentNode,
                    token: token,
                  });
                }
                break;
              }

              // ─────────────────────────────────────────
              // Quando o LLM TERMINA
              // ─────────────────────────────────────────
              case "on_llm_end": {
                send({
                  type: "llm_complete",
                  node: currentNode,
                });
                break;
              }

              // ─────────────────────────────────────────
              // Quando uma TOOL inicia (Tavily search)
              // ─────────────────────────────────────────
              case "on_tool_start": {
                send({
                  type: "tool_start",
                  tool: name || "unknown",
                  input: data?.input,
                });
                break;
              }

              // ─────────────────────────────────────────
              // Quando uma TOOL termina
              // ─────────────────────────────────────────
              case "on_tool_end": {
                const output = data?.output;
                send({
                  type: "tool_end",
                  tool: name || "unknown",
                  resultCount: Array.isArray(output) ? output.length : undefined,
                });
                break;
              }

              // ─────────────────────────────────────────
              // Quando um NÓ TERMINA
              // ─────────────────────────────────────────
              case "on_chain_end": {
                const mainNodes = ["plan_research", "search", "synthesize", "await_approval"];
                
                if (name && mainNodes.includes(name)) {
                  const output = data?.output;

                  // Se é o nó plan_research, enviar o plano
                  if (name === "plan_research" && output?.researchPlan) {
                    send({
                      type: "plan",
                      keywords: output.researchPlan.keywords,
                      timeframe: output.researchPlan.timeframe,
                    });
                  }

                  // Se é o nó search, enviar contagem de resultados
                  if (name === "search" && output?.searchResults) {
                    send({
                      type: "search_results",
                      count: output.searchResults.length,
                    });
                  }

                  // Se é o nó synthesize, salvar e enviar trends
                  if (name === "synthesize" && output?.trends) {
                    // Salvar trends no banco
                    await ctx.runMutation(internal.trends.createBatch, {
                      threadId: threadId as Id<"threads">,
                      trends: output.trends,
                    });

                    // Enviar cada trend individualmente
                    for (const trend of output.trends) {
                      send({ type: "trend", trend });
                    }
                  }

                  send({
                    type: "node_end",
                    node: name,
                  });
                }
                break;
              }
            }
          }

          // Atualizar status final
          await ctx.runMutation(internal.threads.updateStatus, {
            threadId: threadId as Id<"threads">,
            status: "awaiting_approval",
          });

          // Criar mensagem de conclusão
          await ctx.runMutation(internal.messages.create, {
            threadId: threadId as Id<"threads">,
            role: "assistant",
            content: "Research complete! Please review the trends above and approve to generate content ideas.",
            messageType: "research_result",
          });

          send({ type: "complete" });
          send({ type: "done" });

          controller.close();
        } catch (error) {
          console.error("[HTTP] Stream error:", error);
          
          // Atualizar status para erro
          await ctx.runMutation(internal.threads.updateStatus, {
            threadId: threadId as Id<"threads">,
            status: "error",
          });

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
 * Polling endpoint (fallback)
 */
http.route({
  path: "/api/researchStatus",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const threadId = url.searchParams.get("threadId");

    if (!threadId) {
      return new Response(JSON.stringify({ error: "threadId required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const thread = await ctx.runQuery(internal.threads.get, {
      threadId: threadId as Id<"threads">,
    });

    const trends = await ctx.runQuery(internal.trends.getByThread, {
      threadId: threadId as Id<"threads">,
    });

    return new Response(
      JSON.stringify({ status: thread?.status, trends }),
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
 * CORS preflight
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

## 📊 Sequência de Eventos SSE

O frontend receberá eventos nesta ordem:

```
→ { type: "start", threadId: "abc123" }

→ { type: "node_start", node: "plan_research", message: "📋 Planning..." }
→ { type: "token", node: "plan_research", token: "I" }
→ { type: "token", node: "plan_research", token: " will" }
→ { type: "token", node: "plan_research", token: " analyze" }
  ... (mais tokens)
→ { type: "llm_complete", node: "plan_research" }
→ { type: "plan", keywords: ["AI trends", "..."], timeframe: "past_week" }
→ { type: "node_end", node: "plan_research" }

→ { type: "node_start", node: "search", message: "🔍 Searching..." }
→ { type: "tool_start", tool: "tavily_search", input: {...} }
→ { type: "tool_end", tool: "tavily_search", resultCount: 15 }
→ { type: "search_results", count: 15 }
→ { type: "node_end", node: "search" }

→ { type: "node_start", node: "synthesize", message: "📊 Analyzing..." }
→ { type: "token", node: "synthesize", token: "Based" }
  ... (mais tokens)
→ { type: "llm_complete", node: "synthesize" }
→ { type: "trend", trend: { title: "...", summary: "..." } }
→ { type: "trend", trend: { title: "...", summary: "..." } }
→ { type: "node_end", node: "synthesize" }

→ { type: "complete" }
→ { type: "done" }
```

## ✅ Acceptance Criteria

1. [ ] Modelos LLM têm `streaming: true`
2. [ ] HTTP endpoint usa `graph.streamEvents()`
3. [ ] Eventos `on_llm_stream` emitem tokens individuais
4. [ ] Eventos `on_tool_start/end` capturam calls do Tavily
5. [ ] Trends são salvos no banco durante `on_chain_end` do synthesize
6. [ ] Thread status atualizado em tempo real
7. [ ] Fallback endpoint `/api/researchStatus` funciona

## 🛑 Stop Conditions

```bash
# 1. Verificar arquivos
test -f convex/http.ts && echo "✅ http.ts exists" || echo "❌ http.ts missing"
test -f convex/lib/streamHelpers.ts && echo "✅ streamHelpers.ts exists" || echo "❌ streamHelpers.ts missing"
test -f convex/actions/research.ts && echo "✅ research.ts exists" || echo "❌ research.ts missing"

# 2. Verificar uso de streamEvents
grep -q "streamEvents" convex/http.ts && echo "✅ Uses streamEvents" || echo "❌ Missing streamEvents"

# 3. Verificar streaming habilitado nos modelos
grep -q "streaming: true" convex/agents/nodes/plan.ts && echo "✅ plan.ts has streaming" || echo "❌ plan.ts missing streaming"
grep -q "streaming: true" convex/agents/nodes/synthesize.ts && echo "✅ synthesize.ts has streaming" || echo "❌ synthesize.ts missing streaming"

# 4. Verificar handlers de eventos
grep -q "on_llm_stream" convex/http.ts && echo "✅ Handles on_llm_stream" || echo "❌ Missing on_llm_stream handler"
grep -q "on_tool_start" convex/http.ts && echo "✅ Handles on_tool_start" || echo "❌ Missing on_tool_start handler"

# 5. Compilação
npx tsc --noEmit 2>&1 | grep -q "error" && echo "❌ TypeScript errors" || echo "✅ TypeScript OK"
```

**Card concluído quando todos os checks passam ✅**

## 📝 Notas de Migração

Se você já implementou a versão anterior:

1. Adicionar `streaming: true` em `plan.ts` e `synthesize.ts`
2. Criar `convex/lib/streamHelpers.ts`
3. Substituir a rota `/api/streamResearch` no `http.ts`
4. Atualizar o frontend hook (ver CARD-09 revisado)
