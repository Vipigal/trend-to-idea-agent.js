export const CONVEX_URL =
  import.meta.env.VITE_CONVEX_URL || "http://localhost:3210";
export const CONVEX_SITE_URL =
  import.meta.env.VITE_CONVEX_SITE_URL || "http://localhost:3211";

export const API_ENDPOINTS = {
  streamResearch: `${CONVEX_SITE_URL}/api/streamResearch`,
  streamIdeas: `${CONVEX_SITE_URL}/api/streamIdeas`,
  researchStatus: `${CONVEX_SITE_URL}/api/researchStatus`,
  ideas: `${CONVEX_SITE_URL}/api/ideas`,
};

export const PLATFORMS = ["linkedin", "twitter", "tiktok"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const THREAD_STATUS = {
  IDLE: "idle",
  PLANNING: "planning",
  SEARCHING: "searching",
  SYNTHESIZING: "synthesizing",
  AWAITING_APPROVAL: "awaiting_approval",
  GENERATING_IDEAS: "generating_ideas",
  COMPLETED: "completed",
  ERROR: "error",
} as const;

export type ThreadStatus = (typeof THREAD_STATUS)[keyof typeof THREAD_STATUS];
