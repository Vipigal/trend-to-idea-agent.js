// convex/checkpoints.ts
import { v } from "convex/values";
import {
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";

// ============================================
// INTERNAL QUERIES (for checkpointer)
// ============================================

export const getCheckpoint = internalQuery({
  args: {
    threadId: v.string(),
    checkpointNs: v.string(),
    checkpointId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.checkpointId) {
      return await ctx.db
        .query("checkpoints")
        .withIndex("by_thread_checkpoint", (q) =>
          q
            .eq("threadId", args.threadId)
            .eq("checkpointNs", args.checkpointNs)
            .eq("checkpointId", args.checkpointId as string)
        )
        .first();
    }

    const checkpoints = await ctx.db
      .query("checkpoints")
      .withIndex("by_thread_ns", (q) =>
        q.eq("threadId", args.threadId).eq("checkpointNs", args.checkpointNs)
      )
      .order("desc")
      .take(1);

    return checkpoints[0] || null;
  },
});

export const listCheckpoints = internalQuery({
  args: {
    threadId: v.string(),
    checkpointNs: v.string(),
    limit: v.optional(v.number()),
    before: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const query = ctx.db
      .query("checkpoints")
      .withIndex("by_thread_ns", (q) =>
        q.eq("threadId", args.threadId).eq("checkpointNs", args.checkpointNs)
      )
      .order("desc");

    const checkpoints = await query.take(args.limit || 100);

    if (args.before) {
      const beforeIndex = checkpoints.findIndex(
        (c) => c.checkpointId === args.before
      );
      if (beforeIndex >= 0) {
        return checkpoints.slice(beforeIndex + 1);
      }
    }

    return checkpoints;
  },
});

export const getCheckpointWrites = internalQuery({
  args: {
    threadId: v.string(),
    checkpointNs: v.string(),
    checkpointId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("checkpointWrites")
      .withIndex("by_checkpoint", (q) =>
        q
          .eq("threadId", args.threadId)
          .eq("checkpointNs", args.checkpointNs)
          .eq("checkpointId", args.checkpointId)
      )
      .collect();
  },
});

// ============================================
// INTERNAL MUTATIONS (for checkpointer)
// ============================================

export const putCheckpoint = internalMutation({
  args: {
    threadId: v.string(),
    checkpointId: v.string(),
    parentCheckpointId: v.optional(v.string()),
    checkpointNs: v.string(),
    checkpoint: v.string(),
    metadata: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("checkpoints")
      .withIndex("by_thread_checkpoint", (q) =>
        q
          .eq("threadId", args.threadId)
          .eq("checkpointNs", args.checkpointNs)
          .eq("checkpointId", args.checkpointId)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        checkpoint: args.checkpoint,
        metadata: args.metadata,
        parentCheckpointId: args.parentCheckpointId,
      });
      return existing._id;
    }

    return await ctx.db.insert("checkpoints", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const putCheckpointWrites = internalMutation({
  args: {
    threadId: v.string(),
    checkpointId: v.string(),
    checkpointNs: v.string(),
    writes: v.array(
      v.object({
        taskId: v.string(),
        idx: v.number(),
        channel: v.string(),
        value: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const write of args.writes) {
      const existing = await ctx.db
        .query("checkpointWrites")
        .withIndex("by_checkpoint_task", (q) =>
          q
            .eq("threadId", args.threadId)
            .eq("checkpointNs", args.checkpointNs)
            .eq("checkpointId", args.checkpointId)
            .eq("taskId", write.taskId)
            .eq("idx", write.idx)
        )
        .first();

      if (!existing) {
        await ctx.db.insert("checkpointWrites", {
          threadId: args.threadId,
          checkpointId: args.checkpointId,
          checkpointNs: args.checkpointNs,
          taskId: write.taskId,
          idx: write.idx,
          channel: write.channel,
          value: write.value,
          createdAt: now,
        });
      }
    }
  },
});

export const deleteCheckpoints = internalMutation({
  args: {
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const checkpoints = await ctx.db
      .query("checkpoints")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();

    for (const checkpoint of checkpoints) {
      await ctx.db.delete(checkpoint._id);
    }

    const writes = await ctx.db
      .query("checkpointWrites")
      .filter((q) => q.eq(q.field("threadId"), args.threadId))
      .collect();

    for (const write of writes) {
      await ctx.db.delete(write._id);
    }
  },
});

// ============================================
// PUBLIC QUERIES (for debugging/UI)
// ============================================

export const getCheckpointHistory = query({
  args: {
    threadId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("checkpoints")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(args.limit || 10);
  },
});
