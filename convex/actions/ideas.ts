"use node";

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc } from "../_generated/dataModel";
import { generateIdeasForPlatformStreaming } from "../agents/nodes/generateIdeas";
import { TrendState, BrandContextState } from "../agents/state";
import {
  PlatformEnum,
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

const PLATFORMS: PlatformEnum[] = [
  PlatformEnum.LinkedIn,
  PlatformEnum.Twitter,
  PlatformEnum.TikTok,
];

export const generateIdeasCoordinator = internalAction({
  args: {
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    const { threadId } = args;
    console.log(`[IDEAS:COORD] Starting coordinator for thread ${threadId}`);

    const trends = await ctx.runQuery(internal.trends.getByThreadInternal, {
      threadId,
    });

    if (!trends || trends.length === 0) {
      throw new Error("No trends found for this thread");
    }

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
      node: "generate_ideas_coordinator",
      data: {
        message: "Starting parallel ideas generation...",
        trendsCount: trends.length,
        platforms: PLATFORMS,
        totalPlatforms: PLATFORMS.length,
      },
    });

    for (const platform of PLATFORMS) {
      await ctx.scheduler.runAfter(
        0,
        internal.actions.ideas.generateIdeasForPlatform,
        {
          threadId,
          platform,
        }
      );
    }

    console.log(`[IDEAS:COORD] Scheduled ${PLATFORMS.length} platform workers`);
  },
});

export const generateIdeasForPlatform = internalAction({
  args: {
    threadId: v.id("threads"),
    platform: v.string(),
  },
  handler: async (ctx, args) => {
    const { threadId, platform } = args;
    const platformEnum = platform as PlatformEnum;
    console.log(`[IDEAS:${platform}] Worker started`);

    try {
      const trends = await ctx.runQuery(internal.trends.getByThreadInternal, {
        threadId,
      });

      if (!trends || trends.length === 0) {
        throw new Error("No trends found");
      }

      const trendData: TrendState[] = trends.map((t: Doc<"trends">) => ({
        title: t.title,
        summary: t.summary,
        whyItMatters: t.whyItMatters,
        confidence: t.confidence,
        sources: t.sources,
      }));

      let platformIdeasCount = 0;

      for await (const event of generateIdeasForPlatformStreaming(
        platformEnum,
        trendData,
        DEFAULT_BRAND_CONTEXT
      )) {
        switch (event.type) {
          case "status":
            await ctx.runMutation(internal.streamEvents.createInternal, {
              threadId,
              streamType: StreamTypeEnum.Ideas,
              eventType: StreamEventTypeEnum.Token,
              node: `generate_ideas_${platform}`,
              data: {
                message: event.message,
                platform,
              },
            });
            break;

          case "idea":
            if (event.idea) {
              platformIdeasCount++;

              const trendIds = event.idea.trendIndices
                .filter((idx) => idx >= 0 && idx < trends.length)
                .map((idx) => trends[idx]._id);

              const safeTrendIds =
                trendIds.length > 0 ? trendIds : trends.map((t) => t._id);

              const trendTitles = event.idea.trendIndices
                .filter((idx) => idx >= 0 && idx < trends.length)
                .map((idx) => trends[idx].title);

              const ideaId = await ctx.runMutation(
                internal.ideas.createInternal,
                {
                  threadId,
                  trendIds: safeTrendIds,
                  platform: platformEnum,
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
                node: `generate_ideas_${platform}`,
                data: {
                  ideaId,
                  platform,
                  trendTitles,
                  hook: event.idea.hook,
                  format: event.idea.format,
                  angle: event.idea.angle,
                  description: event.idea.description,
                  platformIdeasCount,
                },
              });

              console.log(
                `[IDEAS:${platform}] Saved idea ${platformIdeasCount}: "${event.idea.hook.substring(0, 40)}..."`
              );
            }
            break;

          case "error":
            await ctx.runMutation(internal.streamEvents.createInternal, {
              threadId,
              streamType: StreamTypeEnum.Ideas,
              eventType: StreamEventTypeEnum.Error,
              node: `generate_ideas_${platform}`,
              data: {
                message: event.message,
                platform,
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
        eventType: StreamEventTypeEnum.Complete,
        node: `generate_ideas_${platform}`,
        data: {
          platform,
          ideasCount: platformIdeasCount,
          message: `${platform} complete: ${platformIdeasCount} ideas`,
        },
      });

      console.log(`[IDEAS:${platform}] Done. ${platformIdeasCount} ideas.`);

      const allEvents = await ctx.runQuery(
        internal.streamEvents.getByThreadInternal,
        {
          threadId,
          streamType: StreamTypeEnum.Ideas,
        }
      );

      const completedPlatforms = allEvents.filter(
        (e) =>
          e.eventType === StreamEventTypeEnum.Complete &&
          e.data?.platform !== undefined
      );

      if (completedPlatforms.length >= PLATFORMS.length) {
        await ctx.runMutation(internal.threads.updateStatusInternal, {
          threadId,
          status: ThreadStatusEnum.Completed,
        });
        console.log(
          `[IDEAS:${platform}] All platforms done. Thread completed.`
        );
      }
    } catch (error) {
      console.error(`[IDEAS:${platform}] Error:`, error);

      await ctx.runMutation(internal.streamEvents.createInternal, {
        threadId,
        streamType: StreamTypeEnum.Ideas,
        eventType: StreamEventTypeEnum.Error,
        node: `generate_ideas_${platform}`,
        data: {
          message: error instanceof Error ? error.message : "Unknown error",
          platform,
        },
      });
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
      internal.actions.ideas.generateIdeasCoordinator,
      { threadId: args.threadId }
    );

    return {
      started: true,
      message: "Ideas generation started (parallel)",
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
      internal.actions.ideas.generateIdeasCoordinator,
      { threadId: args.threadId }
    );

    return {
      started: true,
      message: "Ideas regeneration started (parallel)",
    };
  },
});
