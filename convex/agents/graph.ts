"use node";

import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState, AgentStateType, HiltStatus } from "./state";
import {
  planResearchNode,
  searchNode,
  synthesizeNode,
  awaitApprovalNode,
  generateIdeasNode,
} from "./nodes";

const routeAfterApproval = (state: AgentStateType): string => {
  console.log("[ROUTER] HITL status:", state.hitlStatus);

  switch (state.hitlStatus) {
    case HiltStatus.Approved:
      return "generate_ideas";
    case HiltStatus.Refine:
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
