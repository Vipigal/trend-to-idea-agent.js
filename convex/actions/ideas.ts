"use node";

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { generateIdeasStreaming } from "../agents/nodes/generateIdeas";
import { TrendState, BrandContextState } from "../agents/state";
import { ThreadStatusEnum, PlatformEnum } from "../schema";

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

export const runIdeasGeneration = internalAction({
  args: {
    threadId: v.id("threads"),
  },
  handler: async (ctx, args) => {
    console.log(
      "[IDEAS_ACTION] Starting idea generation for thread:",
      args.threadId
    );

    try {
      const trends = await ctx.runQuery(internal.trends.getByThreadInternal, {
        threadId: args.threadId,
      });

      if (!trends || trends.length === 0) {
        throw new Error("No trends found for this thread");
      }

      await ctx.runMutation(internal.threads.updateStatusInternal, {
        threadId: args.threadId,
        status: ThreadStatusEnum.GeneratingIdeas,
      });

      const trendData: TrendState[] = trends.map((t) => ({
        title: t.title,
        summary: t.summary,
        whyItMatters: t.whyItMatters,
        confidence: t.confidence,
        sources: t.sources,
      }));

      const allIdeas: Array<{
        trendId: Id<"trends">;
        platform: PlatformEnum;
        hook: string;
        format: string;
        angle: string;
        description: string;
      }> = [];

      for await (const event of generateIdeasStreaming(
        trendData,
        DEFAULT_BRAND_CONTEXT
      )) {
        if (event.type === "idea" && event.idea) {
          const trendId = trends[event.idea.trendIndex]._id;
          allIdeas.push({
            trendId,
            platform: event.idea.platform,
            hook: event.idea.hook,
            format: event.idea.format,
            angle: event.idea.angle,
            description: event.idea.description,
          });
        }
      }

      for (const idea of allIdeas) {
        await ctx.runMutation(internal.ideas.createInternal, {
          threadId: args.threadId,
          trendId: idea.trendId,
          platform: idea.platform,
          hook: idea.hook,
          format: idea.format,
          angle: idea.angle,
          description: idea.description,
        });
      }

      await ctx.runMutation(internal.threads.updateStatusInternal, {
        threadId: args.threadId,
        status: ThreadStatusEnum.Completed,
      });

      return {
        success: true,
        ideasCount: allIdeas.length,
      };
    } catch (error) {
      console.error("[IDEAS_ACTION] Error:", error);

      await ctx.runMutation(internal.threads.updateStatusInternal, {
        threadId: args.threadId,
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
  handler: async (ctx, args) => {
    const thread = await ctx.runQuery(internal.threads.getInternal, {
      threadId: args.threadId,
    });

    if (!thread) {
      throw new Error("Thread not found");
    }

    const validStatuses = [
      ThreadStatusEnum.GeneratingIdeas,
      ThreadStatusEnum.AwaitingApproval,
    ];

    if (!validStatuses.includes(thread.status as ThreadStatusEnum)) {
      throw new Error(`Invalid thread status: ${thread.status}`);
    }

    await ctx.runMutation(internal.ideas.deleteByThreadInternal, {
      threadId: args.threadId,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.actions.ideas.runIdeasGeneration,
      {
        threadId: args.threadId,
      }
    );

    return { started: true };
  },
});
