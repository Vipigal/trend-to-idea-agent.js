// convex/trends.ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { confidenceValidator, sourceValidator } from "./schema";

// ============================================
// QUERIES
// ============================================

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

// ============================================
// MUTATIONS
// ============================================

export const create = mutation({
  args: {
    threadId: v.id("threads"),
    title: v.string(),
    summary: v.string(),
    whyItMatters: v.string(),
    confidence: confidenceValidator,
    sources: v.array(sourceValidator),
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
    trends: v.array(
      v.object({
        title: v.string(),
        summary: v.string(),
        whyItMatters: v.string(),
        confidence: confidenceValidator,
        sources: v.array(sourceValidator),
      })
    ),
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
