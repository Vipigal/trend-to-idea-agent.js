# CARD-07-v3: Ideas Action + streamEvents

## 🎯 Objetivo

Criar a action de geração de ideias que salva os eventos na tabela `streamEvents` (com `streamType: "ideas"`), permitindo que o frontend consuma via `useQuery` reativo.

## 📋 Dependências

- ✅ CARD-05.1 (Checkpointer)
- ✅ CARD-05.2 (HITL com interrupt)
- ✅ CARD-06-v3 (Ideas Node)

## 📋 Contexto

### Arquitetura de Streaming para Ideas

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FLUXO DE IDEAS                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   1. User clica "Approve" no frontend                               │
│                   │                                                  │
│                   ▼                                                  │
│   2. Frontend chama action `hitl.approve`                           │
│                   │                                                  │
│                   ▼                                                  │
│   3. Action executa `Command({ resume: { action: "approved" }})`    │
│                   │                                                  │
│                   ▼                                                  │
│   4. Grafo continua para `generate_ideas` node                      │
│                   │                                                  │
│                   ▼                                                  │
│   5. Ideas são geradas e salvas em:                                 │
│      - `ideas` table (dados permanentes)                            │
│      - `streamEvents` table (eventos para UI)                       │
│                   │                                                  │
│                   ▼                                                  │
│   6. Frontend usa `useQuery(streamEvents.getByThread)` para         │
│      mostrar ideias em tempo real na sidebar                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Por que usar streamEvents para Ideas?

| Approach | Prós | Contras |
|----------|------|---------|
| HTTP SSE separado | Streaming "real" | Não funciona em Convex Actions |
| streamEvents | Usa Convex reactivity, consistente | Não é SSE puro |

Escolhemos `streamEvents` porque:
1. **Consistente** com research streaming
2. **Reactive** via `useQuery`
3. **Persistente** - não perde se reconectar
4. **Funciona** dentro de Convex Actions

---

## 📁 Arquivos a Criar/Modificar

1. `convex/actions/ideas.ts` - Action de geração de ideias
2. `convex/ideas.ts` - Adicionar mutations internas
3. `convex/schema.ts` - Verificar StreamTypeEnum inclui "ideas"

---

## 💻 Implementação

### 1. Verificar/Atualizar convex/schema.ts

Garantir que `StreamTypeEnum` inclui "ideas":

```typescript
// Em convex/schema.ts

export enum StreamTypeEnum {
  Research = "research",
  Ideas = "ideas",  // Deve existir
}

export const streamTypeValidator = v.union(
  v.literal(StreamTypeEnum.Research),
  v.literal(StreamTypeEnum.Ideas)
);
```

### 2. Atualizar convex/ideas.ts

Adicionar mutations internas para salvar ideias:

```typescript
// convex/ideas.ts
import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";

// Existing public queries/mutations...

// ============================================
// INTERNAL MUTATIONS (para actions)
// ============================================

export const createFromAction = internalMutation({
  args: {
    threadId: v.id("threads"),
    trendId: v.id("trends"),
    platform: v.union(
      v.literal("linkedin"),
      v.literal("twitter"),
      v.literal("tiktok"),
      v.literal("instagram")
    ),
    hook: v.string(),
    format: v.string(),
    angle: v.string(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("ideas", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const deleteByThreadInternal = internalMutation({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const ideas = await ctx.db
      .query("ideas")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();

    for (const idea of ideas) {
      await ctx.db.delete(idea._id);
    }
  },
});

// ============================================
// INTERNAL QUERIES
// ============================================

export const getByThreadInternal = internalQuery({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("ideas")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();
  },
});
```

### 3. Criar convex/actions/ideas.ts

```typescript
// convex/actions/ideas.ts
"use node";

import { v } from "convex/values";
import { internalAction, action } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { generateIdeasStreaming } from "../agents/nodes/generateIdeas";
import { StreamTypeEnum, StreamEventTypeEnum } from "../schema";
import { BrandContext, Trend } from "../agents/state";

// Brand context padrão (Gallium)
const DEFAULT_BRAND_CONTEXT: BrandContext = {
  name: "Gallium",
  voice:
    "Clear, sharp, slightly edgy, technical but human. No corporate fluff.",
  targetAudience:
    "Founders, growth leads, and small marketing teams who want to move faster with AI",
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
 * Internal action para gerar ideias com streaming
 *
 * Esta action:
 * 1. Busca trends da thread
 * 2. Usa generateIdeasStreaming para gerar ideias uma a uma
 * 3. Salva cada ideia em `ideas` table
 * 4. Emite eventos em `streamEvents` para a UI
 */
export const generateIdeasWithStreaming = internalAction({
  args: {
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    const { threadId } = args;
    console.log(`[IDEAS] Starting idea generation for thread ${threadId}`);

    try {
      // Buscar trends da thread
      const trends = await ctx.runQuery(internal.trends.getByThread, {
        threadId,
      });

      if (!trends || trends.length === 0) {
        throw new Error("No trends found for this thread");
      }

      // Converter para formato esperado pelo generator
      const trendData: Trend[] = trends.map((t) => ({
        title: t.title,
        summary: t.summary,
        whyItMatters: t.whyItMatters,
        confidence: t.confidence,
        sources: t.sources,
      }));

      // Limpar ideias anteriores (para re-geração)
      await ctx.runMutation(internal.ideas.deleteByThreadInternal, { threadId });

      // Limpar stream events anteriores
      await ctx.runMutation(internal.streamEvents.clearByThread, {
        threadId,
        streamType: StreamTypeEnum.Ideas,
      });

      // Atualizar status da thread
      await ctx.runMutation(internal.threads.updateStatus, {
        threadId,
        status: "generating_ideas",
      });

      // Sequência para ordenar eventos
      let sequence = 0;

      // Helper para adicionar evento
      const addEvent = async (
        eventType: StreamEventTypeEnum,
        node?: string,
        data?: unknown
      ) => {
        sequence++;
        await ctx.runMutation(internal.streamEvents.add, {
          threadId,
          streamType: StreamTypeEnum.Ideas,
          eventType,
          node,
          data,
          sequence,
        });
      };

      // Evento de início
      await addEvent(StreamEventTypeEnum.NodeStart, "generate_ideas", {
        message: "Starting idea generation...",
        trendsCount: trends.length,
        platforms: ["linkedin", "twitter", "tiktok"],
      });

      let ideasCount = 0;

      // Iterar pelo generator de ideias
      for await (const event of generateIdeasStreaming(
        trendData,
        DEFAULT_BRAND_CONTEXT
      )) {
        switch (event.type) {
          case "start":
            // Nova trend sendo processada
            await addEvent(StreamEventTypeEnum.NodeStart, "generate_ideas", {
              message: event.message,
              trendIndex: event.trendIndex,
              trendTitle: event.trendTitle,
            });
            break;

          case "platform_start":
            // Nova plataforma sendo processada
            await addEvent(StreamEventTypeEnum.Token, "generate_ideas", {
              message: event.message,
              platform: event.platform,
              trendIndex: event.trendIndex,
            });
            break;

          case "platform_end":
            // Plataforma concluída
            break;

          case "idea":
            // Nova ideia gerada!
            if (event.idea) {
              ideasCount++;

              // Encontrar o trendId correspondente
              const trendDoc = trends[event.idea.trendIndex];
              if (!trendDoc) {
                console.warn(
                  `[IDEAS] Trend not found for index ${event.idea.trendIndex}`
                );
                continue;
              }

              // Salvar ideia no banco
              const ideaId = await ctx.runMutation(
                internal.ideas.createFromAction,
                {
                  threadId,
                  trendId: trendDoc._id,
                  platform: event.idea.platform as any,
                  hook: event.idea.hook,
                  format: event.idea.format,
                  angle: event.idea.angle,
                  description: event.idea.description,
                }
              );

              // Emitir evento para UI
              await addEvent(StreamEventTypeEnum.Idea, "generate_ideas", {
                ideaId,
                platform: event.idea.platform,
                trendIndex: event.idea.trendIndex,
                trendTitle: event.trendTitle,
                hook: event.idea.hook,
                format: event.idea.format,
                angle: event.idea.angle,
                description: event.idea.description,
                ideasCount,
              });

              console.log(
                `[IDEAS] Saved idea ${ideasCount}: "${event.idea.hook.substring(0, 40)}..."`
              );
            }
            break;

          case "error":
            await addEvent(StreamEventTypeEnum.Error, "generate_ideas", {
              message: event.message,
              platform: event.platform,
              trendIndex: event.trendIndex,
            });
            break;

          case "complete":
            // Geração completa
            break;
        }
      }

      // Evento de conclusão
      await addEvent(StreamEventTypeEnum.NodeEnd, "generate_ideas");
      await addEvent(StreamEventTypeEnum.Complete, undefined, {
        ideasCount,
        message: `Generated ${ideasCount} content ideas`,
      });

      // Atualizar status da thread
      await ctx.runMutation(internal.threads.updateStatus, {
        threadId,
        status: "completed",
      });

      console.log(`[IDEAS] Completed. Generated ${ideasCount} ideas.`);

      return {
        success: true,
        ideasCount,
      };
    } catch (error) {
      console.error("[IDEAS] Error:", error);

      // Salvar erro como evento
      await ctx.runMutation(internal.streamEvents.add, {
        threadId,
        streamType: StreamTypeEnum.Ideas,
        eventType: StreamEventTypeEnum.Error,
        data: {
          message: error instanceof Error ? error.message : "Unknown error",
        },
        sequence: 999999,
      });

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

/**
 * Public action para iniciar geração de ideias
 * Chamada após aprovação do HITL
 */
export const startIdeasGeneration = action({
  args: {
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    // Verificar thread existe e está no status correto
    const thread = await ctx.runQuery(internal.threads.get, {
      threadId: args.threadId,
    });

    if (!thread) {
      throw new Error("Thread not found");
    }

    // Aceitar tanto "generating_ideas" quanto "awaiting_approval"
    // (para casos onde chamamos direto sem passar pelo HITL action)
    const validStatuses = ["generating_ideas", "awaiting_approval", "completed"];
    if (!validStatuses.includes(thread.status)) {
      throw new Error(
        `Cannot generate ideas in status: ${thread.status}. Expected one of: ${validStatuses.join(", ")}`
      );
    }

    // Verificar se existem trends
    const trends = await ctx.runQuery(internal.trends.getByThread, {
      threadId: args.threadId,
    });

    if (!trends || trends.length === 0) {
      throw new Error("No trends found. Run research first.");
    }

    // Agendar a action de geração
    await ctx.scheduler.runAfter(
      0,
      internal.actions.ideas.generateIdeasWithStreaming,
      {
        threadId: args.threadId,
      }
    );

    return {
      started: true,
      message: "Ideas generation started",
      trendsCount: trends.length,
    };
  },
});

/**
 * Action para re-gerar ideias (quando usuário quer mais opções)
 */
export const regenerateIdeas = action({
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

    if (thread.status !== "completed") {
      throw new Error(`Cannot regenerate ideas in status: ${thread.status}`);
    }

    // Deletar ideias existentes
    await ctx.runMutation(internal.ideas.deleteByThread, {
      threadId: args.threadId,
    });

    // Re-iniciar geração
    await ctx.scheduler.runAfter(
      0,
      internal.actions.ideas.generateIdeasWithStreaming,
      {
        threadId: args.threadId,
      }
    );

    return {
      started: true,
      message: "Ideas regeneration started",
    };
  },
});
```

---

## 📊 Formato dos Eventos em streamEvents

### Tipos de eventos para Ideas:

```typescript
// StreamTypeEnum.Ideas

// 1. Início da geração
{
  type: "node_start",
  node: "generate_ideas",
  data: {
    message: "Starting idea generation...",
    trendsCount: 5,
    platforms: ["linkedin", "twitter", "tiktok"]
  }
}

// 2. Nova trend sendo processada
{
  type: "node_start",
  node: "generate_ideas",
  data: {
    message: "Processing trend: AI in Marketing",
    trendIndex: 0,
    trendTitle: "AI in Marketing"
  }
}

// 3. Gerando para plataforma
{
  type: "token",
  node: "generate_ideas",
  data: {
    message: "Generating linkedin ideas...",
    platform: "linkedin",
    trendIndex: 0
  }
}

// 4. Ideia gerada
{
  type: "idea",
  node: "generate_ideas",
  data: {
    ideaId: "xxx",
    platform: "linkedin",
    trendIndex: 0,
    trendTitle: "AI in Marketing",
    hook: "Your marketing team is doing AI wrong...",
    format: "post",
    angle: "Contrarian take on AI adoption",
    description: "...",
    ideasCount: 1
  }
}

// 5. Conclusão
{
  type: "complete",
  data: {
    ideasCount: 18,
    message: "Generated 18 content ideas"
  }
}
```

---

## ✅ Acceptance Criteria

1. [ ] `generateIdeasWithStreaming` salva ideias em `ideas` table
2. [ ] Eventos salvos em `streamEvents` com `streamType: "ideas"`
3. [ ] Cada evento `type: "idea"` contém dados completos da ideia
4. [ ] Thread status atualizado para "completed" ao finalizar
5. [ ] `startIdeasGeneration` disponível como action pública
6. [ ] `regenerateIdeas` permite re-gerar ideias

## 🛑 Stop Conditions

```bash
# 1. Verificar arquivo existe
test -f convex/actions/ideas.ts && echo "✅ ideas.ts exists" || echo "❌ missing"

# 2. Verificar exports
grep -q "export const generateIdeasWithStreaming" convex/actions/ideas.ts && echo "✅ generateIdeasWithStreaming" || echo "❌ missing"
grep -q "export const startIdeasGeneration" convex/actions/ideas.ts && echo "✅ startIdeasGeneration" || echo "❌ missing"

# 3. Verificar uso de streamEvents
grep -q "StreamTypeEnum.Ideas" convex/actions/ideas.ts && echo "✅ Uses Ideas stream type" || echo "❌ missing"

# 4. Verificar mutations internas em ideas.ts
grep -q "createFromAction" convex/ideas.ts && echo "✅ createFromAction exists" || echo "❌ missing"

# 5. TypeScript
npx tsc --noEmit 2>&1 | grep -q "error" && echo "❌ TypeScript errors" || echo "✅ TypeScript OK"
```

**Card concluído quando todos os checks passam ✅**

---

## 📝 Notas Técnicas

### Por que `scheduler.runAfter(0, ...)`?

Usamos scheduler para executar a action "de fundo" e retornar imediatamente ao chamador. Isso evita timeout na action pública e permite que o frontend mostre feedback imediato.

### Relação entre Ideas Action e HITL Action

O fluxo normal é:
1. User clica "Approve"
2. `hitl.approve` é chamada
3. `hitl.resumeAfterApproval` executa `Command({ resume: ... })`
4. Grafo continua e `generate_ideas` node executa
5. Eventos são salvos em `streamEvents`

Para casos onde queremos re-gerar sem passar pelo grafo:
1. User clica "Regenerate Ideas"
2. `ideas.regenerateIdeas` é chamada
3. `generateIdeasWithStreaming` executa diretamente (sem o grafo)

---

## 🔗 Próximo Card

CARD-11-v3: Sidebar UI + useIdeasStream
