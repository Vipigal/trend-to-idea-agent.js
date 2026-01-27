# Parallel Ideas Generation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor ideas generation to run 3 platform agents (LinkedIn, Twitter, TikTok) in parallel, each condensing ALL trends into 2-5 connected ideas, with real-time streaming per platform.

**Architecture:** Replace the sequential trend×platform loop with a coordinator that schedules 3 independent Convex internalActions (one per platform) via `ctx.scheduler.runAfter(0, ...)`. Each platform action receives all trends, makes a single LLM call to generate condensed cross-trend ideas, and writes stream events + persisted ideas independently. The frontend detects completion by counting `platform_complete` stream events (3 = done). The schema changes from `trendId: v.id("trends")` to `trendIds: v.array(v.id("trends"))` to support multi-trend ideas.

**Tech Stack:** Convex (actions, mutations, scheduler), OpenAI GPT-4o with structured output (Zod), React + Convex reactive queries.

---

## Key Design Decisions

1. **Parallel via `ctx.scheduler.runAfter(0, ...)`** — 3 independent Convex actions, true parallelism
2. **Condensed ideas** — each platform gets ALL trends and produces min 2, max 5 ideas that connect trends together
3. **Schema: `trendIds` array** — replaces single `trendId`, idiomatic for Convex (small bounded array, no joins needed)
4. **Completion detection** — each platform emits a `platform_complete` event; frontend counts 3 to mark done
5. **Independent rendering** — Twitter ideas can appear before TikTok finishes; each platform's cards render as they arrive
6. **Progress indicator** — footer shows `(N/M ideas generated)` updated in real-time, plus per-platform streaming indicators

---

### Task 1: Update Schema — `trendId` to `trendIds`

**Files:**
- Modify: `convex/schema.ts:142-166` (ideas table)

**Step 1: Change the ideas table schema**

Replace the single `trendId` field with an array:

```typescript
// In convex/schema.ts, ideas table definition
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
```

Notes:
- Remove the `by_trend` index (no longer single trend)
- Remove the `trendId` field, add `trendIds: v.array(v.id("trends"))`
- Keep `by_thread` and `by_platform` indexes

**Step 2: Run `npx convex dev` to validate schema**

Run: `npx convex dev`
Expected: Schema push succeeds (or prompts for destructive migration if existing data — accept it in dev)

**Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: change ideas schema from trendId to trendIds array"
```

---

### Task 2: Update Ideas CRUD Functions

**Files:**
- Modify: `convex/ideas.ts` (all create functions and queries)

**Step 1: Update all create/createInternal mutations**

Change `trendId: v.id("trends")` to `trendIds: v.array(v.id("trends"))` in the args for both `create` and `createInternal`:

```typescript
// For both create and createInternal, change args:
export const create = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("ideas", {
      ...args,
      createdAt: Date.now(),
    });
  },
});
```

Apply the same change to `createInternal`.

**Step 2: Remove `getByPlatformInternal` and `getByPlatform` if they use `by_trend` index**

These queries use `by_platform` index which is still valid, so keep them. But verify they don't reference `trendId`.

**Step 3: Run `npx convex dev` to validate**

Run: `npx convex dev`
Expected: Functions compile cleanly.

**Step 4: Commit**

```bash
git add convex/ideas.ts
git commit -m "feat: update ideas CRUD to use trendIds array"
```

---

### Task 3: Update IdeaState Type and LangGraph State

**Files:**
- Modify: `convex/agents/state.ts:29-36` (IdeaState interface)

**Step 1: Change IdeaState to use trendIndices array**

```typescript
export interface IdeaState {
  trendIndices: number[];
  platform: PlatformEnum;
  hook: string;
  format: string;
  angle: string;
  description: string;
}
```

Change `trendIndex: number` to `trendIndices: number[]`. This aligns with the new condensed model where one idea references multiple trends.

**Step 2: Run `npx convex dev` to validate**

**Step 3: Commit**

```bash
git add convex/agents/state.ts
git commit -m "feat: update IdeaState to use trendIndices array"
```

---

### Task 4: Rewrite the Ideas Prompt for Condensed Generation

**Files:**
- Modify: `convex/agents/prompts.ts:86-122` (getIdeasPrompt function)

**Step 1: Rewrite `getIdeasPrompt` to accept all trends**

The prompt now receives ALL trends and asks the LLM to generate condensed ideas that connect them:

```typescript
export const getIdeasPrompt = (
  brandContext: BrandContextState,
  platform: string,
  trends: { title: string; summary: string; whyItMatters: string; index: number }[]
) => `You are a content strategist for ${brandContext.name}.

## Brand Voice
${brandContext.voice}

## Target Audience
${brandContext.targetAudience}

## Core Values
${brandContext.values.map((v) => `- ${v}`).join("\n")}

## Content Guidelines
DO:
${brandContext.doList.map((d) => `- ${d}`).join("\n")}

DON'T:
${brandContext.dontList.map((d) => `- ${d}`).join("\n")}

## Platform: ${platform.toUpperCase()}
${getPlatformGuidelines(platform)}

## Discovered Trends
${trends.map((t) => `${t.index + 1}. **${t.title}** — ${t.summary} (Why it matters: ${t.whyItMatters})`).join("\n")}

## Your Task
Analyze ALL the trends above and generate ${platform} content ideas.

Rules:
- Generate between 2 and 5 ideas
- Each idea MUST connect one or more trends into a compelling narrative
- Prefer ideas that weave multiple trends together over ideas about a single trend
- For each idea, list which trend numbers (1-indexed) it draws from in the trendIndices field
- Every idea should be immediately actionable

For each idea provide:
{
  "hook": "The opening line that stops the scroll (max 15 words)",
  "format": "post | thread | video | carousel | story",
  "angle": "Why this specific take will resonate with the audience",
  "description": "What the content will cover (2-3 sentences)",
  "trendIndices": [1, 3]
}

Be concrete and specific.
`;
```

Note the signature change: it now takes `trends` as a third parameter.

**Step 2: Commit**

```bash
git add convex/agents/prompts.ts
git commit -m "feat: rewrite ideas prompt for condensed multi-trend generation"
```

---

### Task 5: Rewrite generateIdeas Node — Per-Platform Function

**Files:**
- Modify: `convex/agents/nodes/generateIdeas.ts` (complete rewrite)

**Step 1: Replace the file contents**

The new file exports a single-platform generator function (no more nested loops):

```typescript
"use node";

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { IdeaState, TrendState, BrandContextState } from "../state";
import { getIdeasPrompt } from "../prompts";
import { PlatformEnum } from "../../schema";

const IdeaSchema = z.object({
  hook: z.string().describe("The opening line that stops the scroll"),
  format: z
    .enum(["post", "thread", "video", "carousel", "story", "reel", "script"])
    .describe("Content format"),
  angle: z.string().describe("Why this specific take will resonate"),
  description: z.string().describe("What the content will cover"),
  trendIndices: z
    .array(z.number())
    .describe("1-indexed trend numbers this idea draws from"),
});

const IdeasResponseSchema = z.object({
  ideas: z
    .array(IdeaSchema)
    .min(2)
    .max(5)
    .describe("Array of 2-5 content ideas connecting multiple trends"),
});

type IdeasResponse = z.infer<typeof IdeasResponseSchema>;

const baseModel = new ChatOpenAI({
  modelName: "gpt-4o",
  temperature: 0.7,
});

const structuredModel = baseModel.withStructuredOutput(IdeasResponseSchema, {
  name: "generate_content_ideas",
  strict: true,
});

export async function* generateIdeasForPlatformStreaming(
  platform: PlatformEnum,
  trends: TrendState[],
  brandContext: BrandContextState
): AsyncGenerator<{
  type: "status" | "idea" | "complete" | "error";
  platform: PlatformEnum;
  idea?: IdeaState;
  message?: string;
  totalIdeas?: number;
}> {
  console.log(`[IDEAS:${platform}] Starting generation for ${platform}...`);

  yield {
    type: "status",
    platform,
    message: `Starting ${platform} ideas generation...`,
  };

  const trendsWithIndex = trends.map((t, i) => ({
    title: t.title,
    summary: t.summary,
    whyItMatters: t.whyItMatters,
    index: i,
  }));

  const systemPrompt = getIdeasPrompt(brandContext, platform, trendsWithIndex);

  const trendsContext = trends
    .map(
      (t, i) =>
        `${i + 1}. ${t.title}: ${t.summary} — Why it matters: ${t.whyItMatters}`
    )
    .join("\n");

  try {
    const response = (await structuredModel.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(
        `Generate ${platform} content ideas based on these ${trends.length} trends:\n\n${trendsContext}`
      ),
    ])) as IdeasResponse;

    let count = 0;
    for (const ideaData of response.ideas) {
      // Convert 1-indexed from LLM to 0-indexed for internal use
      const trendIndices = ideaData.trendIndices.map((i) => i - 1);

      const idea: IdeaState = {
        trendIndices,
        platform,
        hook: ideaData.hook,
        format: ideaData.format,
        angle: ideaData.angle,
        description: ideaData.description,
      };

      count++;
      yield { type: "idea", platform, idea };
    }

    yield {
      type: "complete",
      platform,
      totalIdeas: count,
      message: `Generated ${count} ${platform} ideas`,
    };
  } catch (error) {
    console.error(`[IDEAS:${platform}] Error:`, error);
    yield {
      type: "error",
      platform,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
```

Key changes:
- Removed `generateIdeasNode` (the sync LangGraph node version) — the graph node for ideas is no longer used in the graph since ideas are generated via the coordinator action
- Removed the nested trend×platform loop
- New function `generateIdeasForPlatformStreaming` takes a single platform + all trends
- `trendIndices` is an array (1-indexed from LLM, converted to 0-indexed internally)
- Each invocation is one LLM call

**Step 2: Verify the LangGraph graph.ts**

Check `convex/agents/graph.ts` — the `generate_ideas` node may reference the old `generateIdeasNode`. Since ideas are now generated outside the graph (via the coordinator action), the graph should end at `await_approval`. If the graph routes to `generate_ideas` on approval, that routing should instead just end the graph (the coordinator handles ideas separately).

Look at the current routing in `graph.ts`:
- If `hitlStatus === "approved"` routes to `generate_ideas`, change it to route to `END`
- The `generate_ideas` node registration can be removed from the graph

**Step 3: Run `npx convex dev` to validate**

**Step 4: Commit**

```bash
git add convex/agents/nodes/generateIdeas.ts convex/agents/graph.ts
git commit -m "feat: rewrite generateIdeas for single-platform condensed generation"
```

---

### Task 6: Rewrite Ideas Action — Coordinator + Per-Platform Workers

**Files:**
- Modify: `convex/actions/ideas.ts` (complete rewrite)

This is the core change. The file needs three exports:

1. `startIdeasGeneration` — public action (unchanged interface, kicks off coordinator)
2. `generateIdeasCoordinator` — internalAction that clears old data and schedules 3 platform workers
3. `generateIdeasForPlatform` — internalAction that runs one platform's generation and writes events
4. `regenerateIdeas` — public action (unchanged interface)

**Step 1: Write the new file**

```typescript
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
  voice: "Clear, sharp, slightly edgy, technical but human. No corporate fluff.",
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

// --- Coordinator: clears old data, schedules 3 parallel platform actions ---
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

    // Clear previous ideas and stream events
    await ctx.runMutation(internal.ideas.deleteByThreadInternal, { threadId });
    await ctx.runMutation(internal.streamEvents.clearByThread, {
      threadId,
      streamType: StreamTypeEnum.Ideas,
    });

    // Update thread status
    await ctx.runMutation(internal.threads.updateStatusInternal, {
      threadId,
      status: ThreadStatusEnum.GeneratingIdeas,
    });

    // Emit coordinator start event
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

    // Schedule 3 independent platform actions in parallel
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

// --- Per-platform worker: generates ideas for one platform, writes events ---
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

              // Map trendIndices to actual trend doc IDs
              const trendIds = event.idea.trendIndices
                .filter((idx) => idx >= 0 && idx < trends.length)
                .map((idx) => trends[idx]._id);

              // Fallback: if LLM returned bad indices, use all trends
              const safeTrendIds = trendIds.length > 0 ? trendIds : trends.map((t) => t._id);

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

      // Emit platform_complete event
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

      // Check if all platforms are done
      // Query for platform_complete events
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
        // All platforms done — mark thread as completed
        await ctx.runMutation(internal.threads.updateStatusInternal, {
          threadId,
          status: ThreadStatusEnum.Completed,
        });
        console.log(`[IDEAS:${platform}] All platforms done. Thread completed.`);
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

// --- Public actions (unchanged interface) ---
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
      { threadId: args.threadId }
    );

    if (!trendsResult || trendsResult.length === 0) {
      throw new Error("No trends found. Run research first.");
    }

    // Schedule the coordinator (which will schedule platform workers)
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
```

**IMPORTANT:** This file references `internal.streamEvents.getByThreadInternal` which does NOT currently exist. We need to add it in Task 7.

**Step 2: Run `npx convex dev` to validate**

Expected: May fail until Task 7 adds the missing internal query.

**Step 3: Commit**

```bash
git add convex/actions/ideas.ts
git commit -m "feat: rewrite ideas action with coordinator + parallel platform workers"
```

---

### Task 7: Add `getByThreadInternal` to streamEvents

**Files:**
- Modify: `convex/streamEvents.ts`

**Step 1: Add the internal query**

Add this function alongside the existing exports in `convex/streamEvents.ts`:

```typescript
export const getByThreadInternal = internalQuery({
  args: {
    threadId: v.id("threads"),
    streamType: streamTypeValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("streamEvents")
      .withIndex("by_thread_sequence", (q) =>
        q.eq("threadId", args.threadId).eq("streamType", args.streamType)
      )
      .collect();
  },
});
```

Don't forget to add `internalQuery` to the import from `./_generated/server` if not already there.

**Step 2: Run `npx convex dev` to validate**

**Step 3: Commit**

```bash
git add convex/streamEvents.ts
git commit -m "feat: add getByThreadInternal to streamEvents"
```

---

### Task 8: Update HTTP Endpoint for Ideas Streaming

**Files:**
- Modify: `convex/http.ts:169-277` (streamIdeas handler)

**Step 1: Update the handler to call the coordinator**

The HTTP endpoint currently calls `generateIdeasWithStreaming` (which no longer exists). Change it to call `generateIdeasCoordinator`:

```typescript
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

    // Schedule the coordinator — it runs async, frontend uses reactive queries
    await ctx.runAction(internal.actions.ideas.generateIdeasCoordinator, {
      threadId: threadId as Id<"threads">,
    });

    return new Response(
      JSON.stringify({
        started: true,
        message: "Ideas generation started (parallel)",
        trendsCount: trends.length,
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
```

**Design note:** The HTTP endpoint no longer returns an SSE stream because the 3 platform workers run independently via the scheduler. The frontend already uses Convex reactive queries (`useQuery(api.streamEvents.getByThread, ...)`) to get real-time updates. The HTTP endpoint just kicks off the coordinator and returns immediately. This is simpler and more reliable than trying to aggregate 3 parallel SSE streams into one.

If the frontend currently uses `fetch()` to the SSE endpoint and relies on the stream response, the calling code may need updating to just call the action directly or handle the non-streaming JSON response. Check how the frontend triggers ideas generation — it may already use `useAction(api.actions.ideas.startIdeasGeneration)` which doesn't use the HTTP endpoint at all.

**Step 2: Run `npx convex dev` to validate**

**Step 3: Commit**

```bash
git add convex/http.ts
git commit -m "feat: update HTTP ideas endpoint to use coordinator"
```

---

### Task 9: Update Frontend Hook — `useIdeasStream`

**Files:**
- Modify: `src/hooks/useIdeasStream.ts`

This is the most critical frontend change. The hook needs to:
1. Track per-platform completion independently
2. Map `trendTitles` (array) instead of single `trendTitle`
3. Count platform_complete events to determine overall completion
4. Expose per-platform streaming state

**Step 1: Rewrite the hook**

```typescript
import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Platform } from "../lib/constants";
import { PLATFORMS, THREAD_STATUS } from "../lib/constants";
import { StreamTypeEnum } from "../../convex/schema";

interface StreamIdea {
  ideaId?: string;
  platform: Platform;
  trendTitles: string[];
  hook: string;
  format: string;
  angle: string;
  description: string;
  platformIdeasCount?: number;
}

interface PlatformStatus {
  isStreaming: boolean;
  isComplete: boolean;
  ideasCount: number;
  error: string | null;
}

interface IdeasStreamState {
  isStreaming: boolean;
  isComplete: boolean;
  currentStatus: string | null;
  ideas: StreamIdea[];
  ideasCount: number;
  error: string | null;
  platformStatuses: Record<Platform, PlatformStatus>;
}

export function useIdeasStream(threadId: Id<"threads"> | null) {
  const thread = useQuery(api.threads.get, threadId ? { threadId } : "skip");

  const streamEvents = useQuery(
    api.streamEvents.getByThread,
    threadId ? { threadId, streamType: StreamTypeEnum.Ideas } : "skip"
  );

  const persistedIdeas = useQuery(
    api.ideas.getByThread,
    threadId ? { threadId } : "skip"
  );

  const trends = useQuery(
    api.trends.getByThread,
    threadId ? { threadId } : "skip"
  );

  const state = useMemo<IdeasStreamState>(() => {
    const defaultPlatformStatus: PlatformStatus = {
      isStreaming: false,
      isComplete: false,
      ideasCount: 0,
      error: null,
    };

    const defaultState: IdeasStreamState = {
      isStreaming: false,
      isComplete: false,
      currentStatus: null,
      ideas: [],
      ideasCount: 0,
      error: null,
      platformStatuses: {
        linkedin: { ...defaultPlatformStatus },
        twitter: { ...defaultPlatformStatus },
        tiktok: { ...defaultPlatformStatus },
      },
    };

    const isThreadGenerating =
      thread?.status === THREAD_STATUS.GENERATING_IDEAS;
    const isThreadComplete = thread?.status === THREAD_STATUS.COMPLETED;
    const isThreadError = thread?.status === THREAD_STATUS.ERROR;

    // If no stream events, fall back to persisted ideas
    if (!streamEvents || streamEvents.length === 0) {
      if (persistedIdeas && persistedIdeas.length > 0) {
        const ideas: StreamIdea[] = persistedIdeas.map((idea) => {
          const trendTitles = (idea as any).trendIds
            ?.map((tId: Id<"trends">) => trends?.find((t) => t._id === tId)?.title)
            .filter(Boolean) || ["Unknown trend"];

          return {
            ideaId: idea._id,
            platform: idea.platform as Platform,
            trendTitles,
            hook: idea.hook,
            format: idea.format,
            angle: idea.angle,
            description: idea.description,
          };
        });

        const platformStatuses = { ...defaultState.platformStatuses };
        for (const platform of PLATFORMS) {
          const count = ideas.filter((i) => i.platform === platform).length;
          platformStatuses[platform] = {
            isStreaming: false,
            isComplete: count > 0,
            ideasCount: count,
            error: null,
          };
        }

        return {
          ...defaultState,
          isStreaming: isThreadGenerating,
          isComplete: isThreadComplete || ideas.length > 0,
          ideas,
          ideasCount: ideas.length,
          platformStatuses,
        };
      }

      return {
        ...defaultState,
        isStreaming: isThreadGenerating,
        isComplete: isThreadComplete,
        error: isThreadError ? "Ideas generation failed" : null,
      };
    }

    // Process stream events
    let currentStatus: string | null = null;
    let error: string | null = null;
    const ideas: StreamIdea[] = [];
    const completedPlatforms = new Set<string>();
    const platformErrors: Record<string, string> = {};
    const platformIdeasCounts: Record<string, number> = {};

    for (const event of streamEvents) {
      const data = event.data as Record<string, unknown> | undefined;

      switch (event.eventType) {
        case "node_start":
          if (data?.message) {
            currentStatus = data.message as string;
          }
          break;

        case "token":
          if (data?.message) {
            currentStatus = data.message as string;
          }
          break;

        case "idea":
          if (data) {
            const platform = data.platform as Platform;
            ideas.push({
              ideaId: data.ideaId as string | undefined,
              platform,
              trendTitles: (data.trendTitles as string[]) || [],
              hook: data.hook as string,
              format: data.format as string,
              angle: data.angle as string,
              description: data.description as string,
              platformIdeasCount: data.platformIdeasCount as number | undefined,
            });
            platformIdeasCounts[platform] =
              (platformIdeasCounts[platform] || 0) + 1;
          }
          break;

        case "error":
          if (data?.platform) {
            platformErrors[data.platform as string] =
              (data.message as string) || "Unknown error";
          } else {
            error = (data?.message as string) || "Unknown error";
          }
          break;

        case "complete":
          if (data?.platform) {
            completedPlatforms.add(data.platform as string);
          }
          break;
      }
    }

    const allPlatformsDone = completedPlatforms.size >= PLATFORMS.length;
    const isStreaming = isThreadGenerating && !allPlatformsDone;
    const isComplete = allPlatformsDone || isThreadComplete;

    const platformStatuses: Record<Platform, PlatformStatus> = {} as any;
    for (const platform of PLATFORMS) {
      platformStatuses[platform] = {
        isStreaming: isStreaming && !completedPlatforms.has(platform),
        isComplete: completedPlatforms.has(platform),
        ideasCount: platformIdeasCounts[platform] || 0,
        error: platformErrors[platform] || null,
      };
    }

    return {
      isStreaming,
      isComplete,
      currentStatus,
      ideas,
      ideasCount: ideas.length,
      error: error || (isThreadError ? "Ideas generation failed" : null),
      platformStatuses,
    };
  }, [streamEvents, persistedIdeas, trends, thread?.status]);

  const getIdeasByPlatform = (platform: Platform): StreamIdea[] => {
    return state.ideas.filter((idea) => idea.platform === platform);
  };

  const getIdeasCountByPlatform = (platform: Platform): number => {
    return state.ideas.filter((idea) => idea.platform === platform).length;
  };

  const getPlatformCounts = (): Record<Platform, number> => {
    return PLATFORMS.reduce(
      (acc, platform) => {
        acc[platform] = getIdeasCountByPlatform(platform);
        return acc;
      },
      {} as Record<Platform, number>
    );
  };

  return {
    ...state,
    getIdeasByPlatform,
    getIdeasCountByPlatform,
    getPlatformCounts,
  };
}
```

Key changes:
- `StreamIdea.trendTitle` (string) → `StreamIdea.trendTitles` (string[])
- Removed `trendIndex` from StreamIdea
- New `platformStatuses` object tracking per-platform streaming/completion state
- Completion detected by counting `platform_complete` events (events with `eventType === "complete"` and `data.platform`)
- Removed `currentTrendIndex`, `currentTrendTitle`, `currentPlatform` — replaced with `platformStatuses`

**Step 2: Run `npm run typecheck` to validate**

**Step 3: Commit**

```bash
git add src/hooks/useIdeasStream.ts
git commit -m "feat: update useIdeasStream for parallel per-platform streaming"
```

---

### Task 10: Update PlatformTabs — Per-Platform Streaming Indicators

**Files:**
- Modify: `src/components/ideas/PlatformTabs.tsx`

**Step 1: Update props and rendering**

The component now receives per-platform status instead of a single `currentPlatform`:

```typescript
import type { Platform } from "../../lib/constants";
import { PLATFORMS } from "../../lib/constants";
import { Linkedin, Twitter, Video, Check } from "lucide-react";

interface PlatformStatus {
  isStreaming: boolean;
  isComplete: boolean;
  ideasCount: number;
  error: string | null;
}

interface PlatformTabsProps {
  activePlatform: Platform;
  onPlatformChange: (platform: Platform) => void;
  counts: Record<Platform, number>;
  platformStatuses: Record<Platform, PlatformStatus>;
}

const platformIcons: Record<Platform, React.ReactNode> = {
  linkedin: <Linkedin className="w-4 h-4" />,
  twitter: <Twitter className="w-4 h-4" />,
  tiktok: <Video className="w-4 h-4" />,
};

const platformLabels: Record<Platform, string> = {
  linkedin: "LinkedIn",
  twitter: "Twitter/X",
  tiktok: "TikTok",
};

export function PlatformTabs({
  activePlatform,
  onPlatformChange,
  counts,
  platformStatuses,
}: PlatformTabsProps) {
  return (
    <div className="flex border-b border-gray-200 bg-gray-50">
      {PLATFORMS.map((platform) => {
        const isActive = platform === activePlatform;
        const status = platformStatuses[platform];
        const count = counts[platform] || 0;

        return (
          <button
            key={platform}
            onClick={() => onPlatformChange(platform)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-sm font-medium transition-all relative ${
              isActive
                ? "text-blue-600 border-b-2 border-blue-600 -mb-px bg-white"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            }`}
          >
            <span className={status.isStreaming ? "animate-pulse" : ""}>
              {platformIcons[platform]}
            </span>
            <span className="hidden sm:inline">
              {platformLabels[platform]}
            </span>

            {status.isComplete && count > 0 ? (
              <span
                className={`px-1.5 py-0.5 text-xs rounded-full min-w-[18px] text-center ${
                  isActive
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-200 text-gray-600"
                }`}
              >
                {count}
              </span>
            ) : count > 0 ? (
              <span
                className={`px-1.5 py-0.5 text-xs rounded-full min-w-[18px] text-center ${
                  isActive
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-200 text-gray-600"
                } ${status.isStreaming ? "animate-pulse" : ""}`}
              >
                {count}
              </span>
            ) : null}

            {status.isStreaming && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full animate-ping" />
            )}

            {status.isComplete && (
              <Check className="w-3 h-3 text-green-500 absolute top-1 right-1" />
            )}
          </button>
        );
      })}
    </div>
  );
}
```

Key changes:
- Props: removed `isStreaming` and `currentPlatform`, added `platformStatuses`
- Each tab shows its own streaming/complete state independently
- Green checkmark when platform is complete
- Count badge changes color (blue while streaming → green when complete)

**Step 2: Commit**

```bash
git add src/components/ideas/PlatformTabs.tsx
git commit -m "feat: update PlatformTabs for per-platform streaming indicators"
```

---

### Task 11: Update IdeaCard — Multi-Trend Display

**Files:**
- Modify: `src/components/ideas/IdeaCard.tsx`

**Step 1: Change `trendTitle` prop to `trendTitles`**

```typescript
interface IdeaCardProps {
  hook: string;
  format: string;
  angle: string;
  description: string;
  trendTitles?: string[];
  isNew?: boolean;
}
```

Update the rendering of trend titles inside the card:

Replace the single trend display:
```tsx
{trendTitle && (
  <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
    <Lightbulb className="w-3 h-3 flex-shrink-0" />
    <span className="truncate">{trendTitle}</span>
  </div>
)}
```

With multi-trend display:
```tsx
{trendTitles && trendTitles.length > 0 && (
  <div className="flex items-start gap-1.5 text-xs text-gray-500 mb-2">
    <Lightbulb className="w-3 h-3 flex-shrink-0 mt-0.5" />
    <div className="flex flex-wrap gap-1">
      {trendTitles.map((title, i) => (
        <span
          key={i}
          className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600"
        >
          {title}
        </span>
      ))}
    </div>
  </div>
)}
```

Update the function signature to accept `trendTitles` instead of `trendTitle`.

**Step 2: Commit**

```bash
git add src/components/ideas/IdeaCard.tsx
git commit -m "feat: update IdeaCard to show multiple trend tags"
```

---

### Task 12: Update IdeasPanel — Progress Indicator + Updated Props

**Files:**
- Modify: `src/components/ideas/IdeasPanel.tsx`

**Step 1: Update to use new hook shape and progress indicator**

Key changes needed:
1. Use `platformStatuses` from hook instead of `currentPlatform`
2. Pass `platformStatuses` to `PlatformTabs`
3. Update `IdeaCard` to use `trendTitles`
4. Show progress indicator: `(N/M ideas generated)` in footer
5. Auto-switch to first platform that has ideas arriving

```typescript
import { useState, useEffect, useRef } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { useIdeasStream } from "../../hooks/useIdeasStream";
import { IdeaCard } from "./IdeaCard";
import { PlatformTabs } from "./PlatformTabs";
import type { Platform } from "../../lib/constants";
import { PLATFORMS } from "../../lib/constants";
import { Loader2, Sparkles, RefreshCw, AlertCircle } from "lucide-react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";

interface IdeasPanelProps {
  threadId: Id<"threads">;
}

export function IdeasPanel({ threadId }: IdeasPanelProps) {
  const [activePlatform, setActivePlatform] = useState<Platform>("linkedin");
  const [newIdeaIds, setNewIdeaIds] = useState<Set<string>>(new Set());
  const [isRegenerating, setIsRegenerating] = useState(false);
  const previousIdeasCount = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  const regenerateIdeas = useAction(api.actions.ideas.regenerateIdeas);

  const {
    isStreaming,
    isComplete,
    currentStatus,
    ideas,
    ideasCount,
    error,
    getIdeasByPlatform,
    getPlatformCounts,
    platformStatuses,
  } = useIdeasStream(threadId);

  // Track new ideas for animation
  useEffect(() => {
    if (ideas.length > previousIdeasCount.current) {
      const newIds = new Set<string>();
      for (let i = previousIdeasCount.current; i < ideas.length; i++) {
        const idea = ideas[i];
        newIds.add(`${idea.platform}-${idea.hook.substring(0, 20)}`);
      }
      setNewIdeaIds((prev) => new Set([...prev, ...newIds]));

      setTimeout(() => {
        setNewIdeaIds(new Set());
      }, 2000);

      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    }
    previousIdeasCount.current = ideas.length;
  }, [ideas]);

  // Auto-switch to first platform that gets ideas
  useEffect(() => {
    if (isStreaming) {
      const activeCount = getIdeasByPlatform(activePlatform).length;
      if (activeCount === 0) {
        for (const platform of PLATFORMS) {
          if (getIdeasByPlatform(platform).length > 0) {
            setActivePlatform(platform);
            break;
          }
        }
      }
    }
  }, [isStreaming, ideas.length, activePlatform, getIdeasByPlatform]);

  const counts = getPlatformCounts();
  const activeIdeas = getIdeasByPlatform(activePlatform);
  const activePlatformStatus = platformStatuses[activePlatform];

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      await regenerateIdeas({ threadId });
    } catch (err) {
      console.error("Failed to regenerate ideas:", err);
    } finally {
      setIsRegenerating(false);
    }
  };

  // Count completed platforms for progress
  const completedPlatformsCount = PLATFORMS.filter(
    (p) => platformStatuses[p].isComplete
  ).length;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-500" />
            <h2 className="font-semibold text-gray-900">Content Ideas</h2>
          </div>

          <div className="flex items-center gap-2">
            {isStreaming || isRegenerating ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="hidden sm:inline">
                  {isRegenerating
                    ? "Regenerating..."
                    : `${completedPlatformsCount}/${PLATFORMS.length} platforms`}
                </span>
              </div>
            ) : isComplete && ideasCount > 0 ? (
              <button
                onClick={handleRegenerate}
                disabled={isRegenerating}
                className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50 transition-colors"
                title="Generate new ideas"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">Regenerate</span>
              </button>
            ) : null}
          </div>
        </div>

        {(isStreaming || isRegenerating) && (
          <p className="text-xs text-gray-500 mt-1.5 truncate flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            {currentStatus || "Starting parallel generation..."}
          </p>
        )}
      </div>

      {/* Platform Tabs */}
      <PlatformTabs
        activePlatform={activePlatform}
        onPlatformChange={setActivePlatform}
        counts={counts}
        platformStatuses={platformStatuses}
      />

      {/* Ideas List */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-4">
        {error ? (
          <div className="text-center py-8">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="font-medium text-red-600">Error</p>
            <p className="text-sm text-red-500 mt-1">{error}</p>
          </div>
        ) : activeIdeas.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            {activePlatformStatus.isStreaming || isRegenerating ? (
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-ping" />
                </div>
                <p className="text-sm">
                  Generating{" "}
                  <span className="font-medium text-gray-600">
                    {activePlatform}
                  </span>{" "}
                  ideas...
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Sparkles className="w-8 h-8 text-gray-300" />
                <p className="text-sm">No {activePlatform} ideas yet</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {activeIdeas.map((idea, index) => {
              const uniqueId = `${idea.platform}-${idea.hook.substring(0, 20)}`;

              return (
                <IdeaCard
                  key={`${uniqueId}-${index}`}
                  hook={idea.hook}
                  format={idea.format}
                  angle={idea.angle}
                  description={idea.description}
                  trendTitles={idea.trendTitles}
                  isNew={newIdeaIds.has(uniqueId)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Footer with progress */}
      <div className="p-3 border-t border-gray-200 bg-gray-50 flex-shrink-0">
        <p className="text-xs text-gray-500 text-center">
          {ideasCount > 0 ? (
            <span>
              <span className="font-medium text-gray-700">{ideasCount}</span>{" "}
              ideas across{" "}
              <span className="font-medium text-gray-700">
                {completedPlatformsCount}/{PLATFORMS.length}
              </span>{" "}
              platforms
              {isStreaming && (
                <span className="ml-1 text-blue-500">
                  — generating...
                </span>
              )}
            </span>
          ) : isStreaming || isRegenerating ? (
            <span className="flex items-center justify-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              Generating ideas in parallel...
            </span>
          ) : (
            "No ideas generated yet"
          )}
        </p>
      </div>
    </div>
  );
}
```

Key changes:
- Uses `platformStatuses` for per-platform streaming state
- Progress shows `N/3 platforms` in header during streaming
- Footer shows `X ideas across N/3 platforms`
- Auto-switches to first platform with ideas (important since all 3 stream independently)
- `IdeaCard` gets `trendTitles` instead of `trendTitle`
- Unique ID no longer uses `trendIndex`

**Step 2: Run `npm run typecheck` to verify**

**Step 3: Commit**

```bash
git add src/components/ideas/IdeasPanel.tsx
git commit -m "feat: update IdeasPanel with progress indicator and parallel streaming UX"
```

---

### Task 13: Integration Verification

**Files:** None (verification only)

**Step 1: Run type checking**

Run: `npm run typecheck`
Expected: No type errors.

**Step 2: Search for any remaining references to old `trendId` (singular) in frontend**

Search the `src/` directory for `trendId` (not `trendIds`) and `trendIndex` (not `trendIndices`). Any remaining references need updating. Common places to check:
- `src/hooks/useIdeasStream.ts` — should use `trendTitles`
- `src/components/ideas/IdeaCard.tsx` — should use `trendTitles`
- `src/components/ideas/IdeasPanel.tsx` — should not reference `trendIndex`

**Step 3: Search for remaining references to old action names**

Search for `generateIdeasWithStreaming` across the codebase. It should not exist anywhere anymore. The coordinator replaces it.

**Step 4: Run `npx convex dev` to validate backend**

Run: `npx convex dev`
Expected: All functions compile and push successfully.

**Step 5: Manual test**

1. Start the app: `npm run dev`
2. Create a new thread with a research prompt
3. Wait for research to complete and trends to appear
4. Approve the trends
5. Verify:
   - All 3 platforms start generating in parallel (all 3 tabs show streaming indicators)
   - Ideas appear as cards as they're generated
   - Each platform can finish independently (Twitter might finish before TikTok)
   - Progress shows `N/3 platforms` in header
   - Footer shows running total of ideas
   - Each idea card shows multiple trend tags (not a single trend title)
   - After all 3 platforms complete, thread status becomes "completed"
   - Regenerate button works

**Step 6: Commit final integration**

```bash
git add -A
git commit -m "feat: parallel ideas generation with per-platform streaming"
```

---

## Summary of All File Changes

| File | Action | Description |
|------|--------|-------------|
| `convex/schema.ts` | Modify | `trendId` → `trendIds: v.array(v.id("trends"))`, remove `by_trend` index |
| `convex/ideas.ts` | Modify | Update create/createInternal args to use `trendIds` |
| `convex/agents/state.ts` | Modify | `IdeaState.trendIndex` → `trendIndices: number[]` |
| `convex/agents/prompts.ts` | Modify | Rewrite `getIdeasPrompt` to accept all trends, ask for condensed ideas |
| `convex/agents/nodes/generateIdeas.ts` | Rewrite | Single-platform generator, one LLM call per platform |
| `convex/actions/ideas.ts` | Rewrite | Coordinator + 3 parallel platform workers via scheduler |
| `convex/streamEvents.ts` | Modify | Add `getByThreadInternal` query |
| `convex/http.ts` | Modify | Update streamIdeas endpoint to use coordinator |
| `src/hooks/useIdeasStream.ts` | Rewrite | Per-platform status tracking, `trendTitles`, completion detection |
| `src/components/ideas/PlatformTabs.tsx` | Modify | Per-platform streaming indicators, check marks |
| `src/components/ideas/IdeaCard.tsx` | Modify | `trendTitle` → `trendTitles` with tag display |
| `src/components/ideas/IdeasPanel.tsx` | Modify | Progress indicator, parallel UX, updated props |

## Architecture Diagram (New)

```
User approves trends
       ↓
startIdeasGeneration (public action)
       ↓
generateIdeasCoordinator (internalAction)
  ├─ Clear old ideas + stream events
  ├─ Set status = "generating_ideas"
  ├─ Emit coordinator start event
  │
  ├─ scheduler.runAfter(0) → generateIdeasForPlatform(linkedin)
  ├─ scheduler.runAfter(0) → generateIdeasForPlatform(twitter)
  └─ scheduler.runAfter(0) → generateIdeasForPlatform(tiktok)

                    ┌─────────────────────────────────────────────┐
                    │         RUNS IN PARALLEL                     │
                    │                                              │
  [LinkedIn Worker]  │  [Twitter Worker]   │  [TikTok Worker]      │
  1 LLM call         │  1 LLM call         │  1 LLM call           │
  All trends in      │  All trends in      │  All trends in        │
  2-5 condensed      │  2-5 condensed      │  2-5 condensed        │
  ideas              │  ideas              │  ideas                │
  ↓ stream events    │  ↓ stream events    │  ↓ stream events      │
  ↓ save to DB       │  ↓ save to DB       │  ↓ save to DB         │
  platform_complete  │  platform_complete  │  platform_complete    │
  ↓ check if last    │  ↓ check if last    │  ↓ check if last      │
                    └─────────────────────────────────────────────┘
                                     │
                    Last worker to finish sets thread = "completed"

Frontend (reactive via Convex useQuery):
  ├─ useIdeasStream subscribes to streamEvents
  ├─ Each "idea" event → card appears immediately
  ├─ Each "platform_complete" → tab gets checkmark
  └─ All 3 complete → footer updates, regenerate button appears
```
