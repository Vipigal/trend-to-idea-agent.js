"use node";

import { interrupt } from "@langchain/langgraph";
import { AgentStateType, HiltStatus } from "../state";
import { ThreadStatusEnum } from "../../schema";

export interface HITLInterruptValue {
  trends: Array<{
    title: string;
    summary: string;
    whyItMatters: string;
    confidence: string;
    sources: Array<{ url: string; title: string }>;
  }>;
  message: string;
  options: string[];
}

export interface HITLResumeValue {
  action: "approved" | "refine" | "restart";
  feedback?: string;
}

export const awaitApprovalNode = async (
  state: AgentStateType
): Promise<Partial<AgentStateType>> => {
  console.log("[AWAIT_APPROVAL] Preparing HITL checkpoint...");
  console.log(`[AWAIT_APPROVAL] Trends count: ${state.trends?.length || 0}`);

  const interruptPayload: HITLInterruptValue = {
    trends: state.trends.map((t) => ({
      title: t.title,
      summary: t.summary,
      whyItMatters: t.whyItMatters,
      confidence: t.confidence,
      sources: t.sources.map((s) => ({ url: s.url, title: s.title })),
    })),
    message:
      "Research complete! Please review the trends and decide how to proceed.",
    options: ["approved", "refine", "restart"],
  };

  const decision = interrupt<HITLInterruptValue, HITLResumeValue>(interruptPayload)

  console.log("[AWAIT_APPROVAL] Resumed with decision:", decision);

  switch (decision.action) {
    case "approved":
      return {
        hitlStatus: HiltStatus.Approved,
        currentStep: ThreadStatusEnum.AwaitingApproval,
        error: null,
      };

    case "refine":
      return {
        hitlStatus: HiltStatus.Refine,
        refinementFeedback: decision.feedback || "",
        currentStep: ThreadStatusEnum.AwaitingApproval,
        error: null,
        trends: [],
        searchResults: [],
      };

    case "restart":
      return {
        hitlStatus: HiltStatus.Restart,
        currentStep: ThreadStatusEnum.AwaitingApproval,
        error: null,
        trends: [],
        searchResults: [],
        researchPlan: null,
        refinementFeedback: null,
      };

    default:
      return {
        hitlStatus: HiltStatus.Pending,
        error: `Unknown HITL action: ${decision.action}`,
      };
  }
};
