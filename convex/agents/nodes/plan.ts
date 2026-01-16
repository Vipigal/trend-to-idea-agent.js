"use node";

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { AgentStateType, ResearchPlanState } from "../state";
import { PLAN_RESEARCH_PROMPT, REFINEMENT_PROMPT } from "../prompts";
import { ThreadStatusEnum } from "../../schema";

export const planResearchNode = async (
  state: AgentStateType
): Promise<Partial<AgentStateType>> => {
  console.log("[PLAN] Starting research planning...");
  console.log("[PLAN] User prompt:", state.userPrompt);
  console.log("[PLAN] Refinement feedback:", state.refinementFeedback);

  try {
    const model = new ChatOpenAI({
      modelName: "gpt-4o",
      temperature: 0.3,
    });

    let systemPrompt = PLAN_RESEARCH_PROMPT;
    let userContent = state.userPrompt;

    if (state.refinementFeedback && state.researchPlan) {
      systemPrompt = REFINEMENT_PROMPT
        .replace("{previousKeywords}", state.researchPlan.keywords.join(", "))
        .replace("{feedback}", state.refinementFeedback);
      userContent = `Original request: ${state.userPrompt}\nFeedback: ${state.refinementFeedback}`;
    }

    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userContent),
    ]);

    const content = response.content as string;
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("Failed to extract JSON from LLM response");
    }

    const plan: ResearchPlanState = JSON.parse(jsonMatch[0]);

    console.log("[PLAN] Generated plan:", plan);

    return {
      researchPlan: plan,
      currentStep: ThreadStatusEnum.Planning,
      error: null,
    };
  } catch (error) {
    console.error("[PLAN] Error:", error);
    return {
      error: `Planning failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      currentStep: ThreadStatusEnum.Error,
    };
  }
};
