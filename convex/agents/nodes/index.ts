"use node";

export { planResearchNode } from "./plan";
export { searchNode } from "./search";
export { synthesizeNode } from "./synthesize";

import { AgentStateType, HiltStatus } from "../state";
import { ThreadStatusEnum } from "../../schema";

export const awaitApprovalNode = async (
  state: AgentStateType
): Promise<Partial<AgentStateType>> => {
  console.log("[AWAIT_APPROVAL] Research complete, waiting for user approval");
  console.log(`[AWAIT_APPROVAL] Found ${state.trends.length} trends`);

  return {
    currentStep: ThreadStatusEnum.AwaitingApproval,
    hitlStatus: HiltStatus.Pending,
  };
};
