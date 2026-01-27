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
