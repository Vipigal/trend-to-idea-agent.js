"use node";

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Command } from "@langchain/langgraph";
import { workflow } from "../agents/graph";
import { ConvexCheckpointer } from "../lib/ConvexCheckpointer";
import {
  ThreadStatusEnum,
  StreamTypeEnum,
  StreamEventTypeEnum,
  MessageRoleEnum,
  MessageTypeEnum,
  PlatformEnum,
} from "../schema";
import type { HITLResumeValue } from "../agents/nodes/awaitApproval";
import { TrendState } from "../agents/state";

export const resumeAfterApproval = internalAction({
  args: {
    threadId: v.id("threads"),
    decision: v.object({
      action: v.union(
        v.literal("approved"),
        v.literal("refine"),
        v.literal("restart")
      ),
      feedback: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const { threadId, decision } = args;
    console.log(`[HITL] Resuming thread ${threadId} with decision:`, decision);

    try {
      const thread = await ctx.runQuery(internal.threads.getInternal, {
        threadId,
      });
      if (!thread) {
        throw new Error("Thread not found");
      }

      if (decision.action === "restart") {
        console.log("[HITL] Restart requested, clearing all state...");

        await ctx.runMutation(internal.checkpoints.deleteCheckpoints, {
          threadId: threadId,
        });

        await ctx.runMutation(internal.trends.deleteByThreadInternal, {
          threadId,
        });
        await ctx.runMutation(internal.ideas.deleteByThreadInternal, {
          threadId,
        });

        await ctx.runMutation(internal.threads.updateStatusInternal, {
          threadId,
          status: ThreadStatusEnum.Idle,
        });

        await ctx.runMutation(internal.streamEvents.clearByThread, {
          threadId,
          streamType: StreamTypeEnum.Research,
        });
        await ctx.runMutation(internal.streamEvents.clearByThread, {
          threadId,
          streamType: StreamTypeEnum.Ideas,
        });

        return {
          success: true,
          action: "restart",
          message: "Thread reset. Ready for new research.",
        };
      }

      const checkpointer = new ConvexCheckpointer(ctx);
      const graph = workflow.compile({ checkpointer });

      const resumeValue: HITLResumeValue = {
        action: decision.action,
        feedback: decision.feedback,
      };


      const command = new Command<HITLResumeValue, any, any>({ resume: resumeValue });

      const config = {
        configurable: {
          thread_id: threadId,
        },
      };

      if (decision.action === "approved") {
        await ctx.runMutation(internal.threads.updateStatusInternal, {
          threadId,
          status: ThreadStatusEnum.GeneratingIdeas,
        });

        await ctx.runMutation(internal.streamEvents.clearByThread, {
          threadId,
          streamType: StreamTypeEnum.Ideas,
        });
      } else if (decision.action === "refine") {
        await ctx.runMutation(internal.threads.updateStatusInternal, {
          threadId,
          status: ThreadStatusEnum.Planning,
        });

        await ctx.runMutation(internal.threads.setRefinementFeedbackInternal, {
          threadId,
          feedback: decision.feedback || "",
        });

        await ctx.runMutation(internal.messages.createInternal, {
          threadId,
          role: MessageRoleEnum.User,
          content: decision.feedback || "",
          messageType: MessageTypeEnum.UserInput,
          metadata: { step: "refinement" },
        });

        await ctx.runMutation(internal.trends.deleteByThreadInternal, {
          threadId,
        });

        await ctx.runMutation(internal.streamEvents.clearByThread, {
          threadId,
          streamType: StreamTypeEnum.Research,
        });
      }

      console.log("[HITL] Invoking graph with Command...");

      let finalTrends: TrendState[] = [];

      for await (const chunk of await graph.stream(command, {
        ...config,
        streamMode: "updates",
      })) {
        for (const [nodeName, nodeOutput] of Object.entries(chunk)) {
          console.log(`[HITL] Node ${nodeName} completed`);

          const output = nodeOutput as Record<string, unknown>;

          if (nodeName === "generate_ideas" && output.ideas) {
            const ideas = output.ideas as Array<{
              trendIndex: number;
              platform: string;
              hook: string;
              format: string;
              angle: string;
              description: string;
            }>;

            const trends = await ctx.runQuery(
              internal.trends.getByThreadInternal,
              { threadId }
            );

            for (const idea of ideas) {
              const trend = trends[idea.trendIndex];
              if (trend) {
                await ctx.runMutation(internal.ideas.createInternal, {
                  threadId,
                  trendId: trend._id,
                  platform: idea.platform as PlatformEnum,
                  hook: idea.hook,
                  format: idea.format,
                  angle: idea.angle,
                  description: idea.description,
                });

                await ctx.runMutation(internal.streamEvents.createInternal, {
                  threadId,
                  streamType: StreamTypeEnum.Ideas,
                  eventType: StreamEventTypeEnum.Idea,
                  node: nodeName,
                  data: {
                    platform: idea.platform,
                    trendTitle: trend.title,
                    hook: idea.hook,
                    format: idea.format,
                    angle: idea.angle,
                    description: idea.description,
                  },
                });
              }
            }
          }

          if (nodeName === "synthesize" && output.trends) {
            finalTrends = output.trends as TrendState[];

            await ctx.runMutation(internal.trends.createBatchInternal, {
              threadId,
              trends: finalTrends.map((t) => ({
                title: t.title,
                summary: t.summary,
                whyItMatters: t.whyItMatters,
                confidence: t.confidence,
                sources: t.sources,
              })),
            });

            for (const trend of finalTrends) {
              await ctx.runMutation(internal.streamEvents.createInternal, {
                threadId,
                streamType: StreamTypeEnum.Research,
                eventType: StreamEventTypeEnum.Trend,
                node: nodeName,
                data: { trend },
              });
            }
          }
        }
      }

      const finalStatus =
        decision.action === "approved"
          ? ThreadStatusEnum.Completed
          : ThreadStatusEnum.AwaitingApproval;

      await ctx.runMutation(internal.threads.updateStatusInternal, {
        threadId,
        status: finalStatus,
      });

      const streamType =
        decision.action === "approved"
          ? StreamTypeEnum.Ideas
          : StreamTypeEnum.Research;

      await ctx.runMutation(internal.streamEvents.createInternal, {
        threadId,
        streamType,
        eventType: StreamEventTypeEnum.Complete,
        data: {
          message:
            decision.action === "approved"
              ? "Ideas generation complete"
              : "Research complete",
        },
      });

      console.log(`[HITL] Completed with status: ${finalStatus}`);

      return {
        success: true,
        action: decision.action,
        message: `Graph resumed with action: ${decision.action}`,
      };
    } catch (error) {
      console.error("[HITL] Error:", error);

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

export const approve = action({
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

    if (thread.status !== ThreadStatusEnum.AwaitingApproval) {
      throw new Error(`Cannot approve thread in status: ${thread.status}`);
    }

    await ctx.scheduler.runAfter(0, internal.actions.hitl.resumeAfterApproval, {
      threadId: args.threadId,
      decision: { action: "approved" },
    });

    return { started: true, message: "Ideas generation started" };
  },
});

export const refine = action({
  args: {
    threadId: v.id("threads"),
    feedback: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.runQuery(internal.threads.getInternal, {
      threadId: args.threadId,
    });

    if (!thread) {
      throw new Error("Thread not found");
    }

    if (thread.status !== ThreadStatusEnum.AwaitingApproval) {
      throw new Error(`Cannot refine thread in status: ${thread.status}`);
    }

    await ctx.scheduler.runAfter(0, internal.actions.hitl.resumeAfterApproval, {
      threadId: args.threadId,
      decision: { action: "refine", feedback: args.feedback },
    });

    return { started: true, message: "Research refinement started" };
  },
});

export const restart = action({
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

    await ctx.scheduler.runAfter(0, internal.actions.hitl.resumeAfterApproval, {
      threadId: args.threadId,
      decision: { action: "restart" },
    });

    return { started: true, message: "Thread restart initiated" };
  },
});
