"use node";

import { tavily } from "@tavily/core";
import { AgentStateType, SearchResultState } from "../state";
import { ThreadStatusEnum } from "../../schema";

export const searchNode = async (
  state: AgentStateType
): Promise<Partial<AgentStateType>> => {
  console.log("[SEARCH] Starting Tavily search...");

  if (!state.researchPlan) {
    return {
      error: "No research plan available",
      currentStep: ThreadStatusEnum.Error,
    };
  }

  try {
    const tavilyClient = tavily({
      apiKey: process.env.TAVILY_API_KEY!,
    });

    const { keywords } = state.researchPlan;
    const allResults: SearchResultState[] = [];
    const seenUrls = new Set<string>();

    for (const keyword of keywords) {
      console.log(`[SEARCH] Searching for: "${keyword}"`);

      const response = await tavilyClient.search(keyword, {
        searchDepth: "advanced",
        maxResults: 10,
        includeAnswer: false,
        includeRawContent: false,
      });

      for (const result of response.results) {
        if (seenUrls.has(result.url)) continue;
        seenUrls.add(result.url);

        allResults.push({
          title: result.title,
          url: result.url,
          content: result.content,
          score: result.score,
          publishedDate: result.publishedDate,
        });
      }
    }

    allResults.sort((a, b) => b.score - a.score);

    const topResults = allResults.slice(0, 20);

    console.log(
      `[SEARCH] Found ${allResults.length} total results, kept top ${topResults.length}`
    );

    return {
      searchResults: topResults,
      currentStep: ThreadStatusEnum.Searching,
      error: null,
    };
  } catch (error) {
    console.error("[SEARCH] Error:", error);
    return {
      error: `Search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      currentStep: ThreadStatusEnum.Error,
    };
  }
};
