import { v } from "convex/values";
import {
  mutation,
  query,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { platformValidator } from "./schema";

// ============================================
// QUERIES
// ============================================

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
    platform: platformValidator,
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

// ============================================
// MUTATIONS
// ============================================

export const create = mutation({
  args: {
    threadId: v.id("threads"),
    trendIds: v.array(v.id("trends")),
    platform: platformValidator,
    hook: v.string(),
    format: v.string(),
    angle: v.string(),
    description: v.string(),
    variants: v.optional(
      v.array(
        v.object({
          hook: v.string(),
          angle: v.string(),
        })
      )
    ),
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

// ============================================
// INTERNAL FUNCTIONS (for actions)
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

export const getByPlatformInternal = internalQuery({
  args: {
    threadId: v.id("threads"),
    platform: platformValidator,
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

export const createInternal = internalMutation({
  args: {
    threadId: v.id("threads"),
    trendIds: v.array(v.id("trends")),
    platform: platformValidator,
    hook: v.string(),
    format: v.string(),
    angle: v.string(),
    description: v.string(),
    variants: v.optional(
      v.array(
        v.object({
          hook: v.string(),
          angle: v.string(),
        })
      )
    ),
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
