import { v } from "convex/values";
import { query, internalQuery, internalMutation } from "./_generated/server";
import {
  streamTypeValidator,
  streamEventTypeValidator,
} from "./schema";

export const getByThread = query({
  args: {
    threadId: v.id("threads"),
    streamType: streamTypeValidator,
    afterSequence: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("streamEvents"),
      _creationTime: v.number(),
      threadId: v.id("threads"),
      streamType: streamTypeValidator,
      eventType: streamEventTypeValidator,
      node: v.optional(v.string()),
      data: v.optional(v.any()),
      sequence: v.number(),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    let events = await ctx.db
      .query("streamEvents")
      .withIndex("by_thread_sequence", (q) =>
        q.eq("threadId", args.threadId).eq("streamType", args.streamType)
      )
      .collect();

    if (args.afterSequence !== undefined) {
      events = events.filter((e) => e.sequence > args.afterSequence!);
    }

    return events.sort((a, b) => a.sequence - b.sequence);
  },
});

export const getLatestSequence = internalQuery({
  args: {
    threadId: v.id("threads"),
    streamType: streamTypeValidator,
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("streamEvents")
      .withIndex("by_thread_sequence", (q) =>
        q.eq("threadId", args.threadId).eq("streamType", args.streamType)
      )
      .order("desc")
      .first();

    return events?.sequence ?? -1;
  },
});

export const createInternal = internalMutation({
  args: {
    threadId: v.id("threads"),
    streamType: streamTypeValidator,
    eventType: streamEventTypeValidator,
    node: v.optional(v.string()),
    data: v.optional(v.any()),
  },
  returns: v.id("streamEvents"),
  handler: async (ctx, args) => {
    const latestSequence = await ctx.db
      .query("streamEvents")
      .withIndex("by_thread_sequence", (q) =>
        q.eq("threadId", args.threadId).eq("streamType", args.streamType)
      )
      .order("desc")
      .first();

    const sequence = (latestSequence?.sequence ?? -1) + 1;

    return await ctx.db.insert("streamEvents", {
      threadId: args.threadId,
      streamType: args.streamType,
      eventType: args.eventType,
      node: args.node,
      data: args.data,
      sequence,
      createdAt: Date.now(),
    });
  },
});

export const createBatchInternal = internalMutation({
  args: {
    threadId: v.id("threads"),
    streamType: streamTypeValidator,
    events: v.array(
      v.object({
        eventType: streamEventTypeValidator,
        node: v.optional(v.string()),
        data: v.optional(v.any()),
      })
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const latestEvent = await ctx.db
      .query("streamEvents")
      .withIndex("by_thread_sequence", (q) =>
        q.eq("threadId", args.threadId).eq("streamType", args.streamType)
      )
      .order("desc")
      .first();

    let sequence = (latestEvent?.sequence ?? -1) + 1;
    const now = Date.now();

    for (const event of args.events) {
      await ctx.db.insert("streamEvents", {
        threadId: args.threadId,
        streamType: args.streamType,
        eventType: event.eventType,
        node: event.node,
        data: event.data,
        sequence,
        createdAt: now,
      });
      sequence++;
    }

    return null;
  },
});

export const clearByThread = internalMutation({
  args: {
    threadId: v.id("threads"),
    streamType: streamTypeValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("streamEvents")
      .withIndex("by_thread_type", (q) =>
        q.eq("threadId", args.threadId).eq("streamType", args.streamType)
      )
      .collect();

    for (const event of events) {
      await ctx.db.delete(event._id);
    }

    return null;
  },
});
