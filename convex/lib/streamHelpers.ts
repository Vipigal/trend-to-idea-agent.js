"use node";

import { ThreadStatusEnum } from "../schema";

export function getNodeStartMessage(node: string): string {
  const messages: Record<string, string> = {
    plan_research: "Planning research strategy...",
    search: "Searching for trends with Tavily...",
    synthesize: "Analyzing and synthesizing results...",
    await_approval: "Research complete! Please review the trends.",
    generate_ideas: "Generating content ideas...",
  };
  return messages[node] || `Processing ${node}...`;
}

export function getStatusForNode(node: string): ThreadStatusEnum | null {
  const statuses: Record<string, ThreadStatusEnum> = {
    plan_research: ThreadStatusEnum.Planning,
    search: ThreadStatusEnum.Searching,
    synthesize: ThreadStatusEnum.Synthesizing,
    await_approval: ThreadStatusEnum.AwaitingApproval,
    generate_ideas: ThreadStatusEnum.GeneratingIdeas,
  };
  return statuses[node] || null;
}

export interface SSEEvent {
  type:
    | "start"
    | "node_start"
    | "node_end"
    | "token"
    | "plan"
    | "search_results"
    | "trend"
    | "idea"
    | "complete"
    | "error"
    | "done";
  [key: string]: unknown;
}

export function createSSEEncoder() {
  const encoder = new TextEncoder();
  return {
    encode: (data: SSEEvent) =>
      encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
  };
}

export function isMainGraphNode(name: string): boolean {
  const mainNodes = [
    "plan_research",
    "search",
    "synthesize",
    "await_approval",
    "generate_ideas",
  ];
  return mainNodes.includes(name);
}
