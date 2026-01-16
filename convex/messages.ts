import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { messageTypeValidator, messagesRoleValidator } from "./schema";

// ============================================
// QUERIES
// ============================================

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

// ============================================
// MUTATIONS
// ============================================

export const create = mutation({
  args: {
    threadId: v.id("threads"),
    role: messagesRoleValidator,
    content: v.string(),
    messageType: messageTypeValidator,
    metadata: v.optional(
      v.object({
        step: v.optional(v.string()),
        progress: v.optional(v.number()),
      })
    ),
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
