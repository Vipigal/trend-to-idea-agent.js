import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { PlatformEnum, ThreadStatusEnum } from "./schema";

const http = httpRouter();

http.route({
  path: "/api/streamResearch",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const { threadId } = body as { threadId: string };

    if (!threadId) {
      return new Response(JSON.stringify({ error: "threadId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const thread = await ctx.runQuery(internal.threads.getInternal, {
      threadId: threadId as Id<"threads">,
    });

    if (!thread) {
      return new Response(JSON.stringify({ error: "Thread not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          await ctx.runMutation(internal.threads.updateStatusInternal, {
            threadId: threadId as Id<"threads">,
            status: ThreadStatusEnum.Planning,
          });

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "start", threadId })}\n\n`
            )
          );

          const result = await ctx.runAction(
            internal.actions.research.runResearchGraph,
            {
              threadId: threadId as Id<"threads">,
              userPrompt: thread.userPrompt,
              refinementFeedback: thread.refinementFeedback,
            }
          );

          if (result.success) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "complete",
                  trends: result.trends,
                })}\n\n`
              )
            );
          } else {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "error",
                  message: result.error,
                })}\n\n`
              )
            );
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
          );
          controller.close();
        } catch (error) {
          console.error("[HTTP] Stream error:", error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                message:
                  error instanceof Error ? error.message : "Unknown error",
              })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }),
});

http.route({
  path: "/api/researchStatus",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const threadId = url.searchParams.get("threadId");

    if (!threadId) {
      return new Response(JSON.stringify({ error: "threadId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const thread = await ctx.runQuery(internal.threads.getInternal, {
      threadId: threadId as Id<"threads">,
    });

    if (!thread) {
      return new Response(JSON.stringify({ error: "Thread not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const trends = await ctx.runQuery(internal.trends.getByThreadInternal, {
      threadId: threadId as Id<"threads">,
    });

    return new Response(
      JSON.stringify({
        status: thread.status,
        trends,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }),
});

http.route({
  path: "/api/streamResearch",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

http.route({
  path: "/api/streamIdeas",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const { threadId } = body as { threadId: string };

    if (!threadId) {
      return new Response(JSON.stringify({ error: "threadId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const thread = await ctx.runQuery(internal.threads.getInternal, {
      threadId: threadId as Id<"threads">,
    });

    if (!thread) {
      return new Response(JSON.stringify({ error: "Thread not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const trends = await ctx.runQuery(internal.trends.getByThreadInternal, {
      threadId: threadId as Id<"threads">,
    });

    if (!trends || trends.length === 0) {
      return new Response(JSON.stringify({ error: "No trends found" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          await ctx.runMutation(internal.threads.updateStatusInternal, {
            threadId: threadId as Id<"threads">,
            status: ThreadStatusEnum.GeneratingIdeas,
          });

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "start", trendsCount: trends.length })}\n\n`
            )
          );

          const result = await ctx.runAction(
            internal.actions.ideas.runIdeasGeneration,
            {
              threadId: threadId as Id<"threads">,
            }
          );

          if (result.success) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "complete",
                  ideasCount: result.ideasCount,
                })}\n\n`
              )
            );
          } else {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "error",
                  message: result.error,
                })}\n\n`
              )
            );
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
          );
          controller.close();
        } catch (error) {
          console.error("[HTTP] Ideas stream error:", error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                message:
                  error instanceof Error ? error.message : "Unknown error",
              })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }),
});

http.route({
  path: "/api/streamIdeas",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }),
});

http.route({
  path: "/api/ideas",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const threadId = url.searchParams.get("threadId");
    const platform = url.searchParams.get("platform");

    if (!threadId) {
      return new Response(JSON.stringify({ error: "threadId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (
      platform &&
      !Object.values(PlatformEnum).includes(platform as PlatformEnum)
    ) {
      return new Response(JSON.stringify({ error: "Invalid platform" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let ideas;
    if (platform) {
      ideas = await ctx.runQuery(internal.ideas.getByPlatformInternal, {
        threadId: threadId as Id<"threads">,
        platform: platform as PlatformEnum,
      });
    } else {
      ideas = await ctx.runQuery(internal.ideas.getByThreadInternal, {
        threadId: threadId as Id<"threads">,
      });
    }

    return new Response(JSON.stringify({ ideas }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }),
});

export default http;
