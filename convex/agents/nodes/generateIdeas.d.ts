import { AgentStateType, IdeaState, TrendState, BrandContextState } from "../state";
import { PlatformEnum } from "../../schema";
export declare const generateIdeasNode: (state: AgentStateType) => Promise<Partial<AgentStateType>>;
export declare function generateIdeasStreaming(trends: TrendState[], brandContext: BrandContextState): AsyncGenerator<{
    type: "status" | "idea" | "complete" | "error";
    platform?: PlatformEnum;
    trendIndex?: number;
    idea?: IdeaState;
    message?: string;
    totalIdeas?: number;
}>;
