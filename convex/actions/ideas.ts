"use node";

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc } from "../_generated/dataModel";
import { generateIdeasStreaming } from "../agents/nodes/generateIdeas";
import { TrendState, BrandContextState } from "../agents/state";
import {
  ThreadStatusEnum,
  StreamTypeEnum,
  StreamEventTypeEnum,
} from "../schema";

const DEFAULT_BRAND_CONTEXT: BrandContextState = {
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

export const generateIdeasWithStreaming = internalAction({
  args: {
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    const { threadId } = args;
    console.log(`[IDEAS] Starting idea generation for thread ${threadId}`);

    try {
      const trends = await ctx.runQuery(internal.trends.getByThreadInternal, {
        threadId,
      });

      if (!trends || trends.length === 0) {
        throw new Error("No trends found for this thread");
      }

      const trendData: TrendState[] = trends.map((t: Doc<"trends">) => ({
        title: t.title,
        summary: t.summary,
        whyItMatters: t.whyItMatters,
        confidence: t.confidence,
        sources: t.sources,
      }));

      await ctx.runMutation(internal.ideas.deleteByThreadInternal, { threadId });

      await ctx.runMutation(internal.streamEvents.clearByThread, {
        threadId,
        streamType: StreamTypeEnum.Ideas,
      });

      await ctx.runMutation(internal.threads.updateStatusInternal, {
        threadId,
        status: ThreadStatusEnum.GeneratingIdeas,
      });

      await ctx.runMutation(internal.streamEvents.createInternal, {
        threadId,
        streamType: StreamTypeEnum.Ideas,
        eventType: StreamEventTypeEnum.NodeStart,
        node: "generate_ideas",
        data: {
          message: "Starting idea generation...",
          trendsCount: trends.length,
          platforms: ["linkedin", "twitter", "tiktok"],
        },
      });

      let ideasCount = 0;

      for await (const event of generateIdeasStreaming(
        trendData,
        DEFAULT_BRAND_CONTEXT
      )) {
        switch (event.type) {
          case "status":
            await ctx.runMutation(internal.streamEvents.createInternal, {
              threadId,
              streamType: StreamTypeEnum.Ideas,
              eventType: StreamEventTypeEnum.Token,
              node: "generate_ideas",
              data: {
                message: event.message,
                platform: event.platform,
                trendIndex: event.trendIndex,
              },
            });
            break;

          case "idea":
            if (event.idea) {
              ideasCount++;

              const trendDoc = trends[event.idea.trendIndex];
              if (!trendDoc) {
                console.warn(
                  `[IDEAS] Trend not found for index ${event.idea.trendIndex}`
                );
                continue;
              }

              const ideaId = await ctx.runMutation(
                internal.ideas.createInternal,
                {
                  threadId,
                  trendId: trendDoc._id,
                  platform: event.idea.platform,
                  hook: event.idea.hook,
                  format: event.idea.format,
                  angle: event.idea.angle,
                  description: event.idea.description,
                }
              );

              await ctx.runMutation(internal.streamEvents.createInternal, {
                threadId,
                streamType: StreamTypeEnum.Ideas,
                eventType: StreamEventTypeEnum.Idea,
                node: "generate_ideas",
                data: {
                  ideaId,
                  platform: event.idea.platform,
                  trendIndex: event.idea.trendIndex,
                  trendTitle: trendDoc.title,
                  hook: event.idea.hook,
                  format: event.idea.format,
                  angle: event.idea.angle,
                  description: event.idea.description,
                  ideasCount,
                },
              });

              console.log(
                `[IDEAS] Saved idea ${ideasCount}: "${event.idea.hook.substring(0, 40)}..."`
              );
            }
            break;

          case "error":
            await ctx.runMutation(internal.streamEvents.createInternal, {
              threadId,
              streamType: StreamTypeEnum.Ideas,
              eventType: StreamEventTypeEnum.Error,
              node: "generate_ideas",
              data: {
                message: event.message,
              },
            });
            break;

          case "complete":
            break;
        }
      }

      await ctx.runMutation(internal.streamEvents.createInternal, {
        threadId,
        streamType: StreamTypeEnum.Ideas,
        eventType: StreamEventTypeEnum.NodeEnd,
        node: "generate_ideas",
      });

      await ctx.runMutation(internal.streamEvents.createInternal, {
        threadId,
        streamType: StreamTypeEnum.Ideas,
        eventType: StreamEventTypeEnum.Complete,
        data: {
          ideasCount,
          message: `Generated ${ideasCount} content ideas`,
        },
      });

      await ctx.runMutation(internal.threads.updateStatusInternal, {
        threadId,
        status: ThreadStatusEnum.Completed,
      });

      console.log(`[IDEAS] Completed. Generated ${ideasCount} ideas.`);

      return {
        success: true,
        ideasCount,
      };
    } catch (error) {
      console.error("[IDEAS] Error:", error);

      await ctx.runMutation(internal.streamEvents.createInternal, {
        threadId,
        streamType: StreamTypeEnum.Ideas,
        eventType: StreamEventTypeEnum.Error,
        data: {
          message: error instanceof Error ? error.message : "Unknown error",
        },
      });

      await ctx.runMutation(internal.threads.updateStatusInternal, {
        threadId,
        status: ThreadStatusEnum.Error,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

export const startIdeasGeneration = action({
  args: {
    threadId: v.id("threads"),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ started: boolean; message: string; trendsCount: number }> => {
    const thread = await ctx.runQuery(internal.threads.getInternal, {
      threadId: args.threadId,
    });

    if (!thread) {
      throw new Error("Thread not found");
    }

    const validStatuses = [
      ThreadStatusEnum.GeneratingIdeas,
      ThreadStatusEnum.AwaitingApproval,
      ThreadStatusEnum.Completed,
    ];

    if (!validStatuses.includes(thread.status as ThreadStatusEnum)) {
      throw new Error(
        `Cannot generate ideas in status: ${thread.status}. Expected one of: ${validStatuses.join(", ")}`
      );
    }

    const trendsResult = await ctx.runQuery(
      internal.trends.getByThreadInternal,
      {
        threadId: args.threadId,
      }
    );

    if (!trendsResult || trendsResult.length === 0) {
      throw new Error("No trends found. Run research first.");
    }

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
      trendsCount: trendsResult.length,
    };
  },
});

export const regenerateIdeas = action({
  args: {
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.runQuery(internal.threads.getInternal, {
      threadId: args.threadId,
    });

    if (!thread) {
      throw new Error("Thread not found");
    }

    if (thread.status !== ThreadStatusEnum.Completed) {
      throw new Error(`Cannot regenerate ideas in status: ${thread.status}`);
    }

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
