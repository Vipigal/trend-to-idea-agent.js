"use node";

import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState, AgentStateType, HiltStatus } from "./state";
import { ThreadStatusEnum } from "../schema";

const planResearchNode = async (
  state: AgentStateType
): Promise<Partial<AgentStateType>> => {
  console.log("[PLAN] Planning research for:", state.userPrompt);
  return { currentStep: ThreadStatusEnum.Planning };
};

const searchNode = async (
  state: AgentStateType
): Promise<Partial<AgentStateType>> => {
  console.log("[SEARCH] Searching with Tavily...");
  return { currentStep: ThreadStatusEnum.Searching };
};

const synthesizeNode = async (
  state: AgentStateType
): Promise<Partial<AgentStateType>> => {
  console.log("[SYNTHESIZE] Analyzing results...");
  return { currentStep: ThreadStatusEnum.Synthesizing };
};

const awaitApprovalNode = async (
  state: AgentStateType
): Promise<Partial<AgentStateType>> => {
  console.log("[AWAIT_APPROVAL] Waiting for user approval...");
  return {
    currentStep: ThreadStatusEnum.AwaitingApproval,
    hitlStatus: HiltStatus.Pending,
  };
};

const generateIdeasNode = async (
  state: AgentStateType
): Promise<Partial<AgentStateType>> => {
  console.log("[GENERATE_IDEAS] Generating content ideas...");
  return { currentStep: ThreadStatusEnum.GeneratingIdeas };
};

const routeAfterApproval = (state: AgentStateType): string => {
  console.log("[ROUTER] HITL status:", state.hitlStatus);

  switch (state.hitlStatus) {
    case HiltStatus.Approved:
      return "generate_ideas";
    case HiltStatus.Refine:
      return "plan_research";
    case HiltStatus.Restart:
      return "plan_research";
    case HiltStatus.Pending:
    default:
      return END;
  }
};

const workflow = new StateGraph(AgentState)
  .addNode("plan_research", planResearchNode)
  .addNode("search", searchNode)
  .addNode("synthesize", synthesizeNode)
  .addNode("await_approval", awaitApprovalNode)
  .addNode("generate_ideas", generateIdeasNode)
  .addEdge(START, "plan_research")
  .addEdge("plan_research", "search")
  .addEdge("search", "synthesize")
  .addEdge("synthesize", "await_approval")
  .addConditionalEdges("await_approval", routeAfterApproval, {
    plan_research: "plan_research",
    generate_ideas: "generate_ideas",
    [END]: END,
  })
  .addEdge("generate_ideas", END);

export const graph = workflow.compile();

export { workflow };
