import { useQuery } from "convex/react";
import { useMemo, useCallback, useState, useRef } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { StreamTypeEnum } from "../../convex/schema";
import { API_ENDPOINTS, THREAD_STATUS } from "../lib/constants";

interface ResearchPlan {
  keywords: string[];
  timeframe?: string;
}

interface TrendData {
  title: string;
  summary: string;
  whyItMatters: string;
  confidence: string;
  sources: Array<{
    url: string;
    title: string;
    snippet?: string;
  }>;
}

interface StreamEventData {
  message?: string;
  token?: string;
  keywords?: string[];
  timeframe?: string;
  count?: number;
  trend?: TrendData;
  trendsCount?: number;
}

interface ResearchStreamState {
  isStreaming: boolean;
  isComplete: boolean;
  currentNode: string | null;
  currentStatus: string | null;
  plan: ResearchPlan | null;
  searchResultsCount: number;
  trends: TrendData[];
  tokens: string;
  error: string | null;
  events: Array<{
    type: string;
    node?: string;
    message?: string;
    data?: StreamEventData;
  }>;
}

export function useResearchStream(threadId: Id<"threads"> | null) {
  const [isStarting, setIsStarting] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const thread = useQuery(
    api.threads.get,
    threadId ? { threadId } : "skip"
  );

  const streamEvents = useQuery(
    api.streamEvents.getByThread,
    threadId ? { threadId, streamType: StreamTypeEnum.Research } : "skip"
  );

  const state = useMemo<ResearchStreamState>(() => {
    const defaultState: ResearchStreamState = {
      isStreaming: false,
      isComplete: false,
      currentNode: null,
      currentStatus: null,
      plan: null,
      searchResultsCount: 0,
      trends: [],
      tokens: "",
      error: null,
      events: [],
    };

    const isThreadStreaming =
      thread?.status === THREAD_STATUS.PLANNING ||
      thread?.status === THREAD_STATUS.SEARCHING ||
      thread?.status === THREAD_STATUS.SYNTHESIZING;

    const isThreadComplete =
      thread?.status === THREAD_STATUS.AWAITING_APPROVAL ||
      thread?.status === THREAD_STATUS.GENERATING_IDEAS ||
      thread?.status === THREAD_STATUS.COMPLETED;

    const isThreadError = thread?.status === THREAD_STATUS.ERROR;

    if (!streamEvents || streamEvents.length === 0) {
      return {
        ...defaultState,
        isStreaming: isThreadStreaming,
        isComplete: isThreadComplete,
        error: isThreadError ? "Research failed" : null,
      };
    }

    let currentNode: string | null = null;
    let currentStatus: string | null = null;
    let plan: ResearchPlan | null = null;
    let searchResultsCount = 0;
    const trends: TrendData[] = [];
    let tokens = "";
    let error: string | null = null;
    const events: ResearchStreamState["events"] = [];
    let hasCompleteEvent = false;

    for (const event of streamEvents) {
      const data = event.data as StreamEventData | undefined;
      const node = event.node || null;

      switch (event.eventType) {
        case "node_start":
          currentNode = node;
          if (data?.message) {
            currentStatus = data.message;
          }
          events.push({
            type: "node_start",
            node: node || undefined,
            message: data?.message,
          });
          break;

        case "node_end":
          events.push({
            type: "node_end",
            node: node || undefined,
          });
          break;

        case "token":
          if (data?.token) {
            tokens += data.token;
          }
          break;

        case "plan":
          if (data) {
            plan = {
              keywords: data.keywords || [],
              timeframe: data.timeframe,
            };
            events.push({
              type: "plan",
              node: node || undefined,
              data: { keywords: plan.keywords, timeframe: plan.timeframe },
            });
          }
          break;

        case "search_results":
          if (data?.count) {
            searchResultsCount = data.count;
            events.push({
              type: "search_results",
              node: node || undefined,
              data: { count: searchResultsCount },
            });
          }
          break;

        case "trend":
          if (data?.trend) {
            trends.push(data.trend);
            events.push({
              type: "trend",
              node: node || undefined,
              data: { trend: data.trend },
            });
          }
          break;

        case "error":
          error = data?.message || "Unknown error";
          events.push({
            type: "error",
            message: error,
          });
          break;

        case "complete":
          hasCompleteEvent = true;
          events.push({
            type: "complete",
            data: { trendsCount: data?.trendsCount },
          });
          break;
      }
    }

    const isStreaming = isThreadStreaming && !hasCompleteEvent;
    const isComplete = hasCompleteEvent || isThreadComplete;

    return {
      isStreaming,
      isComplete,
      currentNode,
      currentStatus,
      plan,
      searchResultsCount,
      trends,
      tokens,
      error: error || (isThreadError ? "Research failed" : null),
      events,
    };
  }, [streamEvents, thread?.status]);

  const startStream = useCallback(
    async (targetThreadId: Id<"threads">) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setIsStarting(true);

      try {
        const response = await fetch(API_ENDPOINTS.streamResearch, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId: targetThreadId }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (reader) {
          while (true) {
            const { done } = await reader.read();
            if (done) break;
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          console.error("Stream error:", err.message);
        }
      } finally {
        setIsStarting(false);
        abortControllerRef.current = null;
      }
    },
    []
  );

  const stopStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStarting(false);
  }, []);

  return {
    ...state,
    isStarting,
    startStream,
    stopStream,
    hasEvents: (streamEvents?.length || 0) > 0,
  };
}
