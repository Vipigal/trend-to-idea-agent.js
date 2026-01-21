"use node";

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { AgentStateType, ResearchPlanState } from "../state";
import { PLAN_RESEARCH_PROMPT, REFINEMENT_PROMPT } from "../prompts";
import { ThreadStatusEnum } from "../../schema";

const ResearchPlanSchema = z.object({
  keywords: z
    .array(z.string())
    .describe("2-5 specific search keywords to use"),
  timeframe: z
    .enum(["past_day", "past_week", "past_month", "past_year"])
    .describe("Timeframe for the search"),
  domain: z
    .string()
    .nullable()
    .describe("Industry or domain to focus on, or null if not specified"),
  region: z
    .string()
    .nullable()
    .describe("Geographic region if specified, or null if not specified"),
});

type ResearchPlan = z.infer<typeof ResearchPlanSchema>;

const baseModel = new ChatOpenAI({
  modelName: "gpt-4o",
  temperature: 0.3,
});

const structuredModel = baseModel.withStructuredOutput(ResearchPlanSchema, {
  name: "create_research_plan",
  strict: true,
});

export const planResearchNode = async (
  state: AgentStateType
): Promise<Partial<AgentStateType>> => {
  console.log("[PLAN] Starting research planning...");
  console.log("[PLAN] User prompt:", state.userPrompt);
  console.log("[PLAN] Refinement feedback:", state.refinementFeedback);

  try {
    let systemPrompt = PLAN_RESEARCH_PROMPT;
    let userContent = state.userPrompt;

    if (state.refinementFeedback && state.researchPlan) {
      systemPrompt = REFINEMENT_PROMPT.replace(
        "{previousKeywords}",
        state.researchPlan.keywords.join(", ")
      ).replace("{feedback}", state.refinementFeedback);
      userContent = `Original request: ${state.userPrompt}\nFeedback: ${state.refinementFeedback}`;
    }

    const planResult = (await structuredModel.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userContent),
    ])) as ResearchPlan;

    const plan: ResearchPlanState = {
      keywords: planResult.keywords,
      timeframe: planResult.timeframe || "past_week",
      domain: planResult.domain || undefined,
      region: planResult.region || undefined,
    };

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
