"use node";

import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import { ConfidenceEnum, PlatformEnum, ThreadStatusEnum } from "../schema";

export enum HiltStatus {
  Pending = "pending",
  Approved = "approved",
  Refine = "refine",
  Restart = "restart",
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

export const AgentState = Annotation.Root({
  userPrompt: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  threadId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),

  refinementFeedback: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  researchPlan: Annotation<ResearchPlanState | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  searchResults: Annotation<SearchResultState[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  trends: Annotation<TrendState[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  hitlStatus: Annotation<HiltStatus | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  ideas: Annotation<IdeaState[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),

  brandContext: Annotation<BrandContextState>({
    reducer: (_, next) => next,
    default: () => ({
      name: "Gallium",
      voice:
        "Clear, sharp, slightly edgy, technical but human. No corporate fluff.",
      targetAudience:
        "Founders, growth leads, and small marketing teams who want to move faster with AI",
      values: [
        "Speed",
        "Leverage",
        "Rigor",
        "Systems thinking",
        "Modern taste",
      ],
      doList: [
        "Concrete takeaways",
        "Strong opinions backed by evidence",
        "Punchy hooks",
        "'This actually works' energy",
        "Show don't tell",
      ],
      dontList: [
        "Corporate speak",
        "Vague platitudes",
        "Excessive emojis",
        "Clickbait without substance",
        "Being preachy",
      ],
    }),
  }),

  currentStep: Annotation<ThreadStatusEnum>({
    reducer: (_, next) => next,
    default: () => ThreadStatusEnum.Idle,
  }),

  error: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  messages: Annotation<BaseMessage[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
});

export type AgentStateType = typeof AgentState.State;
