"use node";

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { AgentStateType, TrendState } from "../state";
import { SYNTHESIZE_PROMPT } from "../prompts";
import { ConfidenceEnum, ThreadStatusEnum } from "../../schema";

interface SynthesisResponseTrend {
  title: string;
  summary: string;
  whyItMatters: string;
  confidence: "high" | "medium" | "low";
  sourceIndices: number[];
}

interface SynthesisResponse {
  trends: SynthesisResponseTrend[];
}

const mapConfidence = (confidence: "high" | "medium" | "low"): ConfidenceEnum => {
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
    const model = new ChatOpenAI({
      modelName: "gpt-4o",
      temperature: 0.4,
      streaming: true,
    });

    const formattedResults = state.searchResults.map((result, index) => ({
      index,
      title: result.title,
      url: result.url,
      content: result.content.slice(0, 500),
      publishedDate: result.publishedDate,
    }));

    const response = await model.invoke([
      new SystemMessage(SYNTHESIZE_PROMPT),
      new HumanMessage(
        `Search results:\n${JSON.stringify(formattedResults, null, 2)}\n\nUser's original request: ${state.userPrompt}`
      ),
    ]);

    const content = response.content as string;
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("Failed to extract JSON from LLM response");
    }

    const synthesis: SynthesisResponse = JSON.parse(jsonMatch[0]);

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
