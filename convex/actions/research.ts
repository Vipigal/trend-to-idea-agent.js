"use node";

import '../lib/langfuse/instrumentation'
import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { graph } from "../agents/graph";
import {
  ThreadStatusEnum,
  MessageRoleEnum,
  MessageTypeEnum,
} from "../schema";
import { getLangfuseHandler } from "../lib/langfuse/handler";
import { langfuseSpanProcessor } from "../lib/langfuse/instrumentation";

export const runResearchGraph = internalAction({
  args: {
    threadId: v.id("threads"),
    userPrompt: v.string(),
    refinementFeedback: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    success: boolean;
    trends?: Array<{
      title: string;
      summary: string;
      whyItMatters: string;
      confidence: string;
      sources: Array<{
        url: string;
        title: string;
        snippet?: string;
        publishedAt?: string;
      }>;
    }>;
    error?: string;
  }> => {
    console.log("[ACTION] Starting research graph for thread:", args.threadId);

    try {
      await ctx.runMutation(internal.threads.updateStatusInternal, {
        threadId: args.threadId,
        status: ThreadStatusEnum.Planning,
      });

      await ctx.runMutation(internal.messages.createInternal, {
        threadId: args.threadId,
        role: MessageRoleEnum.Assistant,
        content: "Planning research strategy...",
        messageType: MessageTypeEnum.StatusUpdate,
        metadata: { step: ThreadStatusEnum.Planning },
      });

      const result = await graph.invoke({
        userPrompt: args.userPrompt,
        threadId: args.threadId,
        refinementFeedback: args.refinementFeedback || null,
      }, {callbacks: [getLangfuseHandler(args.threadId)]});

      if (result.error) {
        await ctx.runMutation(internal.threads.updateStatusInternal, {
          threadId: args.threadId,
          status: ThreadStatusEnum.Error,
        });

        await ctx.runMutation(internal.messages.createInternal, {
          threadId: args.threadId,
          role: MessageRoleEnum.Assistant,
          content: `Error: ${result.error}`,
          messageType: MessageTypeEnum.Error,
        });

        return { success: false, error: result.error };
      }

      if (result.trends && result.trends.length > 0) {
        await ctx.runMutation(internal.trends.createBatchInternal, {
          threadId: args.threadId,
          trends: result.trends,
        });
      }

      await ctx.runMutation(internal.threads.updateStatusInternal, {
        threadId: args.threadId,
        status: ThreadStatusEnum.AwaitingApproval,
      });

      await ctx.runMutation(internal.messages.createInternal, {
        threadId: args.threadId,
        role: MessageRoleEnum.Assistant,
        content: `Research complete! Found ${result.trends?.length || 0} trends. Please review and approve.`,
        messageType: MessageTypeEnum.ResearchResult,
        metadata: { step: ThreadStatusEnum.AwaitingApproval },
      });

      return {
        success: true,
        trends: result.trends,
      };
    } catch (error) {
      console.error("[ACTION] Research graph error:", error);

      await ctx.runMutation(internal.threads.updateStatusInternal, {
        threadId: args.threadId,
        status: ThreadStatusEnum.Error,
      });

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      await ctx.runMutation(internal.messages.createInternal, {
        threadId: args.threadId,
        role: MessageRoleEnum.Assistant,
        content: `Research failed: ${errorMessage}`,
        messageType: MessageTypeEnum.Error,
      });

      return { success: false, error: errorMessage };
    }
    finally{
      await langfuseSpanProcessor.forceFlush();
    }
  },
});

export const startResearch = action({
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

    await ctx.scheduler.runAfter(
      0,
      internal.actions.research.runResearchGraph,
      {
        threadId: args.threadId,
        userPrompt: thread.userPrompt,
        refinementFeedback: thread.refinementFeedback,
      }
    );

    return { started: true };
  },
});
