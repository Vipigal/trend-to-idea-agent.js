# CARD-01: Database Schema

## 🎯 Objetivo

Definir o schema completo do banco de dados Convex com todas as tabelas necessárias para o fluxo do agente.

## 📋 Dependências

- Nenhuma (primeiro card)

## 📁 Arquivos a Criar

- `convex/schema.ts`

## 💻 Implementação

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ============================================
  // THREADS - Conversas/sessões do usuário
  // ============================================
  threads: defineTable({
    // Título gerado a partir do prompt
    title: v.string(),
    
    // Status da state machine
    status: v.union(
      v.literal("idle"),              // Aguardando input
      v.literal("planning"),          // Planejando pesquisa
      v.literal("searching"),         // Buscando no Tavily
      v.literal("synthesizing"),      // LLM analisando resultados
      v.literal("awaiting_approval"), // HITL checkpoint
      v.literal("generating_ideas"),  // Gerando ideias
      v.literal("completed"),         // Finalizado
      v.literal("error")              // Erro
    ),
    
    // Prompt original do usuário
    userPrompt: v.string(),
    
    // Feedback de refinamento (se houver)
    refinementFeedback: v.optional(v.string()),
    
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_createdAt", ["createdAt"]),

  // ============================================
  // MESSAGES - Mensagens do chat
  // ============================================
  messages: defineTable({
    threadId: v.id("threads"),
    
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system")
    ),
    
    content: v.string(),
    
    // Tipo de mensagem para renderização diferenciada
    messageType: v.union(
      v.literal("user_input"),        // Input do usuário
      v.literal("status_update"),     // "Searching...", "Analyzing..."
      v.literal("research_result"),   // Resultado da pesquisa
      v.literal("error")              // Mensagem de erro
    ),
    
    // Metadata opcional
    metadata: v.optional(v.object({
      step: v.optional(v.string()),
      progress: v.optional(v.number()),
    })),
    
    createdAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_thread_and_time", ["threadId", "createdAt"]),

  // ============================================
  // TRENDS - Tendências identificadas
  // ============================================
  trends: defineTable({
    threadId: v.id("threads"),
    
    // Conteúdo da trend
    title: v.string(),
    summary: v.string(),
    whyItMatters: v.string(),
    
    // Nível de confiança
    confidence: v.union(
      v.literal("high"),
      v.literal("medium"),
      v.literal("low")
    ),
    
    // Fontes com URLs
    sources: v.array(v.object({
      url: v.string(),
      title: v.string(),
      snippet: v.optional(v.string()),
      publishedAt: v.optional(v.string()),
    })),
    
    // Ordem de exibição
    order: v.number(),
    
    createdAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_thread_and_order", ["threadId", "order"]),

  // ============================================
  // IDEAS - Ideias de conteúdo geradas
  // ============================================
  ideas: defineTable({
    threadId: v.id("threads"),
    trendId: v.id("trends"),
    
    // Plataforma alvo
    platform: v.union(
      v.literal("linkedin"),
      v.literal("twitter"),
      v.literal("tiktok"),
      v.literal("instagram")
    ),
    
    // Conteúdo da ideia
    hook: v.string(),           // Frase de abertura
    format: v.string(),         // "post", "thread", "video", "carousel"
    angle: v.string(),          // Por que esse approach funciona
    description: v.string(),    // Descrição do conteúdo
    
    // Variantes opcionais
    variants: v.optional(v.array(v.object({
      hook: v.string(),
      angle: v.string(),
    }))),
    
    createdAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_trend", ["trendId"])
    .index("by_platform", ["threadId", "platform"]),

  // ============================================
  // STREAM_STATE - Estado do streaming
  // ============================================
  streamState: defineTable({
    threadId: v.id("threads"),
    
    streamType: v.union(
      v.literal("research"),
      v.literal("ideas")
    ),
    
    // Conteúdo acumulado do stream
    content: v.string(),
    
    // Status do stream
    isComplete: v.boolean(),
    
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_thread_type", ["threadId", "streamType"]),
});
```

## ✅ Acceptance Criteria

1. [ ] Arquivo `convex/schema.ts` existe
2. [ ] Schema define 5 tabelas: threads, messages, trends, ideas, streamState
3. [ ] Todos os campos têm tipos corretos com `v.` validators
4. [ ] Índices definidos para queries frequentes
5. [ ] `npx convex dev` roda sem erros de schema

## 🛑 Stop Conditions

Execute estes comandos para verificar conclusão:

```bash
# 1. Verificar que arquivo existe
test -f convex/schema.ts && echo "✅ schema.ts exists" || echo "❌ schema.ts missing"

# 2. Rodar Convex e verificar que schema é válido
npx convex dev --once 2>&1 | grep -q "error" && echo "❌ Schema errors" || echo "✅ Schema valid"

# 3. Verificar que todas as tabelas estão definidas
grep -c "defineTable" convex/schema.ts | grep -q "5" && echo "✅ 5 tables defined" || echo "❌ Missing tables"
```

**Card concluído quando todos os checks passam ✅**

## 📝 Notas

- O campo `status` em threads é a fonte de verdade para o estado da state machine
- `streamState` é usado para persistir chunks de streaming para recuperação
- Índices são otimizados para os queries mais frequentes (by_thread, by_status)
