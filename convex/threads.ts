import { v } from "convex/values";
import {
  mutation,
  query,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import {
  MessageRoleEnum,
  MessageTypeEnum,
  ThreadStatusEnum,
  threadStatusValidator,
} from "./schema";

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
  args: { status: threadStatusValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("threads")
      .withIndex("by_status", (q) => q.eq("status", args.status))
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
      title:
        args.userPrompt.slice(0, 60) +
        (args.userPrompt.length > 60 ? "..." : ""),
      status: ThreadStatusEnum.Idle,
      userPrompt: args.userPrompt,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("messages", {
      threadId,
      role: MessageRoleEnum.User,
      content: args.userPrompt,
      messageType: MessageTypeEnum.UserInput,
      createdAt: now,
    });

    return threadId;
  },
});

export const updateStatus = mutation({
  args: {
    threadId: v.id("threads"),
    status: threadStatusValidator,
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

    if (thread.status !== ThreadStatusEnum.AwaitingApproval)
      throw new Error("Thread is not awaiting approval");

    await ctx.db.patch(args.threadId, {
      status: ThreadStatusEnum.GeneratingIdeas,
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
      status: ThreadStatusEnum.Planning,
      refinementFeedback: args.feedback,
      updatedAt: Date.now(),
    });

    await ctx.db.insert("messages", {
      threadId: args.threadId,
      role: MessageRoleEnum.User,
      content: args.feedback,
      messageType: MessageTypeEnum.UserInput,
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
      status: ThreadStatusEnum.Idle,
      refinementFeedback: undefined,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// ============================================
// INTERNAL FUNCTIONS (for actions)
// ============================================

export const getInternal = internalQuery({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.threadId);
  },
});

export const updateStatusInternal = internalMutation({
  args: {
    threadId: v.id("threads"),
    status: threadStatusValidator,
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.threadId, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});
