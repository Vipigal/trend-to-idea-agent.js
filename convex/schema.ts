// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export enum ThreadStatusEnum {
  Idle = "idle",
  Planning = "planning",
  Searching = "searching",
  Synthesizing = "synthesizing",
  AwaitingApproval = "awaiting_approval",
  GeneratingIdeas = "generating_ideas",
  Completed = "completed",
  Error = "error",
}
export const threadStatusValidator = v.union(
  ...Object.values(ThreadStatusEnum).map(v.literal)
);

export enum MessageRoleEnum {
  User = "user",
  Assistant = "assistant",
  System = "system",
}
export const messagesRoleValidator = v.union(
  ...Object.values(MessageRoleEnum).map(v.literal)
);

export enum MessageTypeEnum {
  UserInput = "user_input",
  StatusUpdate = "status_update",
  ResearchResult = "research_result",
  Error = "error",
}
export const messageTypeValidator = v.union(
  ...Object.values(MessageTypeEnum).map(v.literal)
);

export enum StreamTypeEnum {
  Research = "research",
  Ideas = "ideas",
}
export const streamTypeValidator = v.union(
  ...Object.values(StreamTypeEnum).map(v.literal)
);

export enum StreamEventTypeEnum {
  NodeStart = "node_start",
  NodeEnd = "node_end",
  Token = "token",
  Plan = "plan",
  SearchResults = "search_results",
  Trend = "trend",
  Idea = "idea",
  Complete = "complete",
  Error = "error",
}
export const streamEventTypeValidator = v.union(
  ...Object.values(StreamEventTypeEnum).map(v.literal)
);

export enum ConfidenceEnum {
  High = "high",
  Medium = "medium",
  Low = "low",
}
export const confidenceValidator = v.union(
  ...Object.values(ConfidenceEnum).map(v.literal)
);

export const sourceValidator = v.object({
  url: v.string(),
  title: v.string(),
  snippet: v.optional(v.string()),
  publishedAt: v.optional(v.string()),
});

export enum PlatformEnum {
  LinkedIn = "linkedin",
  Twitter = "twitter",
  TikTok = "tiktok",
  Instagram = "instagram",
}
export const platformValidator = v.union(
  ...Object.values(PlatformEnum).map(v.literal)
);

export default defineSchema({
  threads: defineTable({
    title: v.string(),

    status: threadStatusValidator,

    userPrompt: v.string(),

    refinementFeedback: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_createdAt", ["createdAt"]),

  messages: defineTable({
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

    createdAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_thread_and_time", ["threadId", "createdAt"]),

  trends: defineTable({
    threadId: v.id("threads"),

    title: v.string(),
    summary: v.string(),
    whyItMatters: v.string(),

    confidence: confidenceValidator,

    sources: v.array(sourceValidator),

    order: v.number(),

    createdAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_thread_and_order", ["threadId", "order"]),

  ideas: defineTable({
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

    createdAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_platform", ["threadId", "platform"]),

  streamState: defineTable({
    threadId: v.id("threads"),

    streamType: streamTypeValidator,

    content: v.string(),

    isComplete: v.boolean(),

    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_thread_type", ["threadId", "streamType"]),

  streamEvents: defineTable({
    threadId: v.id("threads"),

    streamType: streamTypeValidator,

    eventType: streamEventTypeValidator,

    node: v.optional(v.string()),

    data: v.optional(v.any()),

    sequence: v.number(),

    createdAt: v.number(),
  })
    .index("by_thread_type", ["threadId", "streamType"])
    .index("by_thread_sequence", ["threadId", "streamType", "sequence"]),

  // ============================================
  // CHECKPOINTS - LangGraph state persistence
  // ============================================
  checkpoints: defineTable({
    threadId: v.string(),
    checkpointId: v.string(),
    parentCheckpointId: v.optional(v.string()),
    checkpointNs: v.string(),
    checkpoint: v.string(),
    metadata: v.string(),
    createdAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_thread_checkpoint", ["threadId", "checkpointNs", "checkpointId"])
    .index("by_thread_ns", ["threadId", "checkpointNs"]),

  checkpointWrites: defineTable({
    threadId: v.string(),
    checkpointId: v.string(),
    checkpointNs: v.string(),
    taskId: v.string(),
    idx: v.number(),
    channel: v.string(),
    value: v.string(),
    createdAt: v.number(),
  })
    .index("by_checkpoint", ["threadId", "checkpointNs", "checkpointId"])
    .index("by_checkpoint_task", [
      "threadId",
      "checkpointNs",
      "checkpointId",
      "taskId",
      "idx",
    ]),
});
