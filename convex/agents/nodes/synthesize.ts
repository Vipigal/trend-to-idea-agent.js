"use node";

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { AgentStateType, TrendState } from "../state";
import { SYNTHESIZE_PROMPT } from "../prompts";
import { ConfidenceEnum, ThreadStatusEnum } from "../../schema";

const TrendSchema = z.object({
  title: z.string().describe("Clear, specific trend title"),
  summary: z.string().describe("1-2 sentence summary of the trend"),
  whyItMatters: z.string().describe("Business/marketing implications"),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe("Confidence level based on source quality"),
  sourceIndices: z
    .array(z.number())
    .describe("Indices of supporting sources from the search results"),
});

const SynthesisResponseSchema = z.object({
  trends: z
    .array(TrendSchema)
    .describe("Array of 5-8 distinct trends identified from search results"),
});

type SynthesisResponse = z.infer<typeof SynthesisResponseSchema>;

const baseModel = new ChatOpenAI({
  modelName: "gpt-4o",
  temperature: 0.4,
  streaming: true,
});

const structuredModel = baseModel.withStructuredOutput(SynthesisResponseSchema, {
  name: "synthesize_trends",
  strict: true,
});

const mapConfidence = (
  confidence: "high" | "medium" | "low"
): ConfidenceEnum => {
  switch (confidence) {
    case "high":
      return ConfidenceEnum.High;
    case "medium":
      return ConfidenceEnum.Medium;
    case "low":
      return ConfidenceEnum.Low;
  }
};

export const synthesizeNode = async (
  state: AgentStateType
): Promise<Partial<AgentStateType>> => {
  console.log("[SYNTHESIZE] Analyzing search results...");

  if (!state.searchResults || state.searchResults.length === 0) {
    return {
      error: "No search results to synthesize",
      currentStep: ThreadStatusEnum.Error,
    };
  }

  try {
    const formattedResults = state.searchResults.map((result, index) => ({
      index,
      title: result.title,
      url: result.url,
      content: result.content.slice(0, 500),
      publishedDate: result.publishedDate,
    }));

    const synthesis = (await structuredModel.invoke([
      new SystemMessage(SYNTHESIZE_PROMPT),
      new HumanMessage(
        `Search results:\n${JSON.stringify(formattedResults, null, 2)}\n\nUser's original request: ${state.userPrompt}`
      ),
    ])) as SynthesisResponse;

    const trends: TrendState[] = synthesis.trends.map((t) => ({
      title: t.title,
      summary: t.summary,
      whyItMatters: t.whyItMatters,
      confidence: mapConfidence(t.confidence),
      sources: t.sourceIndices
        .filter((i) => i >= 0 && i < state.searchResults.length)
        .map((i) => ({
          url: state.searchResults[i].url,
          title: state.searchResults[i].title,
          snippet: state.searchResults[i].content.slice(0, 200),
          publishedAt: state.searchResults[i].publishedDate,
        })),
    }));

    console.log(`[SYNTHESIZE] Generated ${trends.length} trends`);

    return {
      trends,
      currentStep: ThreadStatusEnum.Synthesizing,
      hitlStatus: null,
      error: null,
    };
  } catch (error) {
    console.error("[SYNTHESIZE] Error:", error);
    return {
      error: `Synthesis failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      currentStep: ThreadStatusEnum.Error,
    };
  }
};
