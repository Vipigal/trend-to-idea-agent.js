# CARD-02: Convex Functions (Queries & Mutations)

## 🎯 Objetivo

Implementar todas as queries e mutations básicas do Convex para CRUD de threads, messages, trends e ideas.

## 📋 Dependências

- ✅ CARD-01 (Schema)

## 📁 Arquivos a Criar

- `convex/threads.ts`
- `convex/messages.ts`
- `convex/trends.ts`
- `convex/ideas.ts`

## 💻 Implementação

### convex/threads.ts

```typescript
// convex/threads.ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================
// QUERIES
// ============================================

export const get = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.threadId);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("threads")
      .withIndex("by_createdAt")
      .order("desc")
      .take(20);
  },
});

export const getByStatus = query({
  args: { status: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("threads")
      .withIndex("by_status", (q) => q.eq("status", args.status as any))
      .collect();
  },
});

// ============================================
// MUTATIONS
// ============================================

export const create = mutation({
  args: { userPrompt: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    const threadId = await ctx.db.insert("threads", {
      title: args.userPrompt.slice(0, 60) + (args.userPrompt.length > 60 ? "..." : ""),
      status: "idle",
      userPrompt: args.userPrompt,
      createdAt: now,
      updatedAt: now,
    });

    // Criar mensagem inicial do usuário
    await ctx.db.insert("messages", {
      threadId,
      role: "user",
      content: args.userPrompt,
      messageType: "user_input",
      createdAt: now,
    });

    return threadId;
  },
});

export const updateStatus = mutation({
  args: {
    threadId: v.id("threads"),
    status: v.union(
      v.literal("idle"),
      v.literal("planning"),
      v.literal("searching"),
      v.literal("synthesizing"),
      v.literal("awaiting_approval"),
      v.literal("generating_ideas"),
      v.literal("completed"),
      v.literal("error")
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.threadId, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

export const approve = mutation({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new Error("Thread not found");
    if (thread.status !== "awaiting_approval") {
      throw new Error("Thread is not awaiting approval");
    }

    await ctx.db.patch(args.threadId, {
      status: "generating_ideas",
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const refine = mutation({
  args: {
    threadId: v.id("threads"),
    feedback: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new Error("Thread not found");

    await ctx.db.patch(args.threadId, {
      status: "planning",
      refinementFeedback: args.feedback,
      updatedAt: Date.now(),
    });

    // Adicionar feedback como mensagem
    await ctx.db.insert("messages", {
      threadId: args.threadId,
      role: "user",
      content: args.feedback,
      messageType: "user_input",
      metadata: { step: "refinement" },
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const restart = mutation({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new Error("Thread not found");

    // Deletar trends e ideas existentes
    const trends = await ctx.db
      .query("trends")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();
    
    for (const trend of trends) {
      await ctx.db.delete(trend._id);
    }

    const ideas = await ctx.db
      .query("ideas")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();
    
    for (const idea of ideas) {
      await ctx.db.delete(idea._id);
    }

    await ctx.db.patch(args.threadId, {
      status: "idle",
      refinementFeedback: undefined,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
```

### convex/messages.ts

```typescript
// convex/messages.ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getByThread = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_thread_and_time", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .collect();
  },
});

export const create = mutation({
  args: {
    threadId: v.id("threads"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    messageType: v.union(
      v.literal("user_input"),
      v.literal("status_update"),
      v.literal("research_result"),
      v.literal("error")
    ),
    metadata: v.optional(v.object({
      step: v.optional(v.string()),
      progress: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const updateContent = mutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      content: args.content,
    });
  },
});
```

### convex/trends.ts

```typescript
// convex/trends.ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getByThread = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("trends")
      .withIndex("by_thread_and_order", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .collect();
  },
});

export const create = mutation({
  args: {
    threadId: v.id("threads"),
    title: v.string(),
    summary: v.string(),
    whyItMatters: v.string(),
    confidence: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
    sources: v.array(v.object({
      url: v.string(),
      title: v.string(),
      snippet: v.optional(v.string()),
      publishedAt: v.optional(v.string()),
    })),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("trends", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const createBatch = mutation({
  args: {
    threadId: v.id("threads"),
    trends: v.array(v.object({
      title: v.string(),
      summary: v.string(),
      whyItMatters: v.string(),
      confidence: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
      sources: v.array(v.object({
        url: v.string(),
        title: v.string(),
        snippet: v.optional(v.string()),
        publishedAt: v.optional(v.string()),
      })),
    })),
  },
  handler: async (ctx, args) => {
    const trendIds = [];
    const now = Date.now();

    for (let i = 0; i < args.trends.length; i++) {
      const trend = args.trends[i];
      const trendId = await ctx.db.insert("trends", {
        threadId: args.threadId,
        ...trend,
        order: i,
        createdAt: now,
      });
      trendIds.push(trendId);
    }

    return trendIds;
  },
});

export const deleteByThread = mutation({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const trends = await ctx.db
      .query("trends")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();

    for (const trend of trends) {
      await ctx.db.delete(trend._id);
    }
  },
});
```

### convex/ideas.ts

```typescript
// convex/ideas.ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getByThread = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("ideas")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();
  },
});

export const getByPlatform = query({
  args: {
    threadId: v.id("threads"),
    platform: v.union(
      v.literal("linkedin"),
      v.literal("twitter"),
      v.literal("tiktok"),
      v.literal("instagram")
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("ideas")
      .withIndex("by_platform", (q) =>
        q.eq("threadId", args.threadId).eq("platform", args.platform)
      )
      .collect();
  },
});

export const create = mutation({
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
    variants: v.optional(v.array(v.object({
      hook: v.string(),
      angle: v.string(),
    }))),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("ideas", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const deleteByThread = mutation({
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
```

## ✅ Acceptance Criteria

1. [ ] `convex/threads.ts` implementa: get, list, create, updateStatus, approve, refine, restart
2. [ ] `convex/messages.ts` implementa: getByThread, create, updateContent
3. [ ] `convex/trends.ts` implementa: getByThread, create, createBatch, deleteByThread
4. [ ] `convex/ideas.ts` implementa: getByThread, getByPlatform, create, deleteByThread
5. [ ] Todos os arquivos compilam sem erros TypeScript
6. [ ] `npx convex dev` sincroniza sem erros

## 🛑 Stop Conditions

```bash
# 1. Verificar que todos os arquivos existem
for file in threads messages trends ideas; do
  test -f "convex/${file}.ts" && echo "✅ ${file}.ts exists" || echo "❌ ${file}.ts missing"
done

# 2. Verificar compilação TypeScript
npx tsc --noEmit 2>&1 | grep -q "error" && echo "❌ TypeScript errors" || echo "✅ TypeScript OK"

# 3. Verificar que Convex sincroniza
npx convex dev --once 2>&1 | grep -q "error" && echo "❌ Convex errors" || echo "✅ Convex synced"

# 4. Verificar funções exportadas (threads.ts como exemplo)
grep -c "export const" convex/threads.ts | xargs -I {} test {} -ge 7 && echo "✅ threads.ts has 7+ exports" || echo "❌ Missing exports in threads.ts"
```

**Card concluído quando todos os checks passam ✅**

## 📝 Notas

- Mutations de `approve`, `refine`, `restart` são os controles do HITL
- `createBatch` em trends é para salvar todas as trends de uma vez (performance)
- Todas as queries usam índices para performance
