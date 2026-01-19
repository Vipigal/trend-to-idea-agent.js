import { BaseMessage } from "@langchain/core/messages";
import { ConfidenceEnum, PlatformEnum, ThreadStatusEnum } from "../schema";
export declare enum HiltStatus {
    Pending = "pending",
    Approved = "approved",
    Refine = "refine",
    Restart = "restart"
}
export interface SourceState {
    url: string;
    title: string;
    snippet?: string;
    publishedAt?: string;
}
export interface TrendState {
    title: string;
    summary: string;
    whyItMatters: string;
    confidence: ConfidenceEnum;
    sources: SourceState[];
}
export interface IdeaState {
    trendIndex: number;
    platform: PlatformEnum;
    hook: string;
    format: string;
    angle: string;
    description: string;
}
export interface ResearchPlanState {
    keywords: string[];
    timeframe: string;
    domain?: string;
    region?: string;
}
export interface SearchResultState {
    title: string;
    url: string;
    content: string;
    score: number;
    publishedDate?: string;
}
export interface BrandContextState {
    name: string;
    voice: string;
    targetAudience: string;
    values: string[];
    doList: string[];
    dontList: string[];
}
export declare const AgentState: import("@langchain/langgraph").AnnotationRoot<{
    userPrompt: import("@langchain/langgraph").BinaryOperatorAggregate<string, string>;
    threadId: import("@langchain/langgraph").BinaryOperatorAggregate<string, string>;
    refinementFeedback: import("@langchain/langgraph").BinaryOperatorAggregate<string | null, string | null>;
    researchPlan: import("@langchain/langgraph").BinaryOperatorAggregate<ResearchPlanState | null, ResearchPlanState | null>;
    searchResults: import("@langchain/langgraph").BinaryOperatorAggregate<SearchResultState[], SearchResultState[]>;
    trends: import("@langchain/langgraph").BinaryOperatorAggregate<TrendState[], TrendState[]>;
    hitlStatus: import("@langchain/langgraph").BinaryOperatorAggregate<HiltStatus | null, HiltStatus | null>;
    ideas: import("@langchain/langgraph").BinaryOperatorAggregate<IdeaState[], IdeaState[]>;
    brandContext: import("@langchain/langgraph").BinaryOperatorAggregate<BrandContextState, BrandContextState>;
    currentStep: import("@langchain/langgraph").BinaryOperatorAggregate<ThreadStatusEnum, ThreadStatusEnum>;
    error: import("@langchain/langgraph").BinaryOperatorAggregate<string | null, string | null>;
    messages: import("@langchain/langgraph").BinaryOperatorAggregate<BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[], BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[]>;
}>;
export type AgentStateType = typeof AgentState.State;
