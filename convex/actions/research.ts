"use node";

import "../lib/langfuse/instrumentation";
import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { workflow } from "../agents/graph";
import { ConvexCheckpointer } from "../lib/ConvexCheckpointer";
import {
  ThreadStatusEnum,
  MessageRoleEnum,
  MessageTypeEnum,
  StreamTypeEnum,
  StreamEventTypeEnum,
} from "../schema";
import { getLangfuseHandler } from "../lib/langfuse/handler";
import { langfuseSpanProcessor } from "../lib/langfuse/instrumentation";
import { TrendState } from "../agents/state";
import {
  getNodeStartMessage,
  getStatusForNode,
  isMainGraphNode,
} from "../lib/streamHelpers";

interface MessageChunk {
  content?: string;
}

interface MessageMetadata {
  langgraph_node?: string;
}

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
      await ctx.runMutation(internal.streamEvents.clearByThread, {
        threadId: args.threadId,
        streamType: StreamTypeEnum.Research,
      });

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

      let currentNode = "";
      let lastStatus: ThreadStatusEnum | null = null;
      let finalTrends: TrendState[] = [];
      let tokenBuffer = "";

      const flushTokenBuffer = async () => {
        if (tokenBuffer) {
          await ctx.runMutation(internal.streamEvents.createInternal, {
            threadId: args.threadId,
            streamType: StreamTypeEnum.Research,
            eventType: StreamEventTypeEnum.Token,
            node: currentNode,
            data: { token: tokenBuffer },
          });
          tokenBuffer = "";
        }
      };

      const checkpointer = new ConvexCheckpointer(ctx);
      const graph = workflow.compile({ checkpointer });

      const eventStream = await graph.stream(
        {
          userPrompt: args.userPrompt,
          threadId: args.threadId,
          refinementFeedback: args.refinementFeedback || null,
        },
        {
          configurable: {
            thread_id: args.threadId,
          },
          streamMode: ["messages", "updates"],
          callbacks: [getLangfuseHandler(args.threadId)],
        }
      );

      for await (const streamChunk of eventStream) {
        if (!Array.isArray(streamChunk) || streamChunk.length !== 2) continue;

        const [streamMode, chunk] = streamChunk;

        if (streamMode === "messages") {
          const [messageChunk, metadata] = chunk as [
            MessageChunk,
            MessageMetadata
          ];
          const nodeName = metadata?.langgraph_node;

          if (
            nodeName &&
            isMainGraphNode(nodeName) &&
            nodeName !== currentNode
          ) {
            await flushTokenBuffer();
            currentNode = nodeName;

            await ctx.runMutation(internal.streamEvents.createInternal, {
              threadId: args.threadId,
              streamType: StreamTypeEnum.Research,
              eventType: StreamEventTypeEnum.NodeStart,
              node: currentNode,
              data: { message: getNodeStartMessage(currentNode) },
            });

            const status = getStatusForNode(currentNode);
            if (status && status !== lastStatus) {
              lastStatus = status;
              await ctx.runMutation(internal.threads.updateStatusInternal, {
                threadId: args.threadId,
                status: status,
              });
            }
          }

          if (messageChunk?.content && typeof messageChunk.content === "string") {
            tokenBuffer += messageChunk.content;

            if (tokenBuffer.length >= 10) {
              await flushTokenBuffer();
            }
          }
        } else if (streamMode === "updates") {
          const updateChunk = chunk as Record<string, unknown>;

          for (const [nodeName, nodeOutput] of Object.entries(updateChunk)) {
            if (!isMainGraphNode(nodeName)) continue;

            const output = nodeOutput as Record<string, unknown>;

            if (nodeName !== currentNode) {
              await flushTokenBuffer();
              currentNode = nodeName;

              await ctx.runMutation(internal.streamEvents.createInternal, {
                threadId: args.threadId,
                streamType: StreamTypeEnum.Research,
                eventType: StreamEventTypeEnum.NodeStart,
                node: currentNode,
                data: { message: getNodeStartMessage(currentNode) },
              });

              const status = getStatusForNode(currentNode);
              if (status && status !== lastStatus) {
                lastStatus = status;
                await ctx.runMutation(internal.threads.updateStatusInternal, {
                  threadId: args.threadId,
                  status: status,
                });
              }
            }

            if (nodeName === "plan_research" && output.researchPlan) {
              const plan = output.researchPlan as {
                keywords?: string[];
                timeframe?: string;
              };
              await ctx.runMutation(internal.streamEvents.createInternal, {
                threadId: args.threadId,
                streamType: StreamTypeEnum.Research,
                eventType: StreamEventTypeEnum.Plan,
                node: nodeName,
                data: {
                  keywords: plan.keywords || [],
                  timeframe: plan.timeframe || "",
                },
              });
            }

            if (nodeName === "search" && output.searchResults) {
              const results = output.searchResults as unknown[];
              await ctx.runMutation(internal.streamEvents.createInternal, {
                threadId: args.threadId,
                streamType: StreamTypeEnum.Research,
                eventType: StreamEventTypeEnum.SearchResults,
                node: nodeName,
                data: { count: results.length },
              });
            }

            if (nodeName === "synthesize" && output.trends) {
              finalTrends = output.trends as TrendState[];

              await ctx.runMutation(internal.trends.createBatchInternal, {
                threadId: args.threadId,
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
                  threadId: args.threadId,
                  streamType: StreamTypeEnum.Research,
                  eventType: StreamEventTypeEnum.Trend,
                  node: nodeName,
                  data: { trend },
                });
              }
            }

            await ctx.runMutation(internal.streamEvents.createInternal, {
              threadId: args.threadId,
              streamType: StreamTypeEnum.Research,
              eventType: StreamEventTypeEnum.NodeEnd,
              node: nodeName,
            });
          }
        }
      }

      await flushTokenBuffer();

      if (finalTrends.length === 0) {
        const thread = await ctx.runQuery(internal.threads.getInternal, {
          threadId: args.threadId,
        });
        if (thread?.status === ThreadStatusEnum.Error) {
          return { success: false, error: "Research failed" };
        }
      }

      await ctx.runMutation(internal.threads.updateStatusInternal, {
        threadId: args.threadId,
        status: ThreadStatusEnum.AwaitingApproval,
      });

      await ctx.runMutation(internal.streamEvents.createInternal, {
        threadId: args.threadId,
        streamType: StreamTypeEnum.Research,
        eventType: StreamEventTypeEnum.Complete,
        data: { trendsCount: finalTrends.length },
      });

      await ctx.runMutation(internal.messages.createInternal, {
        threadId: args.threadId,
        role: MessageRoleEnum.Assistant,
        content: `Research complete! Found ${finalTrends.length} trends. Please review and approve.`,
        messageType: MessageTypeEnum.ResearchResult,
        metadata: { step: ThreadStatusEnum.AwaitingApproval },
      });

      return {
        success: true,
        trends: finalTrends,
      };
    } catch (error) {
      console.error("[ACTION] Research graph error:", error);

      await ctx.runMutation(internal.threads.updateStatusInternal, {
        threadId: args.threadId,
        status: ThreadStatusEnum.Error,
      });

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      await ctx.runMutation(internal.streamEvents.createInternal, {
        threadId: args.threadId,
        streamType: StreamTypeEnum.Research,
        eventType: StreamEventTypeEnum.Error,
        data: { message: errorMessage },
      });

      await ctx.runMutation(internal.messages.createInternal, {
        threadId: args.threadId,
        role: MessageRoleEnum.Assistant,
        content: `Research failed: ${errorMessage}`,
        messageType: MessageTypeEnum.Error,
      });

      return { success: false, error: errorMessage };
    } finally {
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
