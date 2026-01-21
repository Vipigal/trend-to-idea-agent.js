import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Platform } from "../lib/constants";
import { PLATFORMS, THREAD_STATUS } from "../lib/constants";
import { StreamTypeEnum } from "../../convex/schema";

interface StreamIdea {
  ideaId?: string;
  platform: Platform;
  trendIndex: number;
  trendTitle: string;
  hook: string;
  format: string;
  angle: string;
  description: string;
  ideasCount?: number;
}

interface StatusEvent {
  message: string;
  platform?: Platform;
  trendIndex?: number;
}

interface IdeasStreamState {
  isStreaming: boolean;
  isComplete: boolean;
  currentTrendIndex: number | null;
  currentTrendTitle: string | null;
  currentPlatform: Platform | null;
  currentStatus: string | null;
  ideas: StreamIdea[];
  ideasCount: number;
  error: string | null;
  statusEvents: StatusEvent[];
}

export function useIdeasStream(threadId: Id<"threads"> | null) {
  const thread = useQuery(api.threads.get, threadId ? { threadId } : "skip");

  const streamEvents = useQuery(
    api.streamEvents.getByThread,
    threadId ? { threadId, streamType: StreamTypeEnum.Ideas } : "skip"
  );

  const persistedIdeas = useQuery(
    api.ideas.getByThread,
    threadId ? { threadId } : "skip"
  );

  const trends = useQuery(
    api.trends.getByThread,
    threadId ? { threadId } : "skip"
  );

  const state = useMemo<IdeasStreamState>(() => {
    const defaultState: IdeasStreamState = {
      isStreaming: false,
      isComplete: false,
      currentTrendIndex: null,
      currentTrendTitle: null,
      currentPlatform: null,
      currentStatus: null,
      ideas: [],
      ideasCount: 0,
      error: null,
      statusEvents: [],
    };

    const isThreadGenerating =
      thread?.status === THREAD_STATUS.GENERATING_IDEAS;
    const isThreadComplete = thread?.status === THREAD_STATUS.COMPLETED;
    const isThreadError = thread?.status === THREAD_STATUS.ERROR;

    if (!streamEvents || streamEvents.length === 0) {
      if (persistedIdeas && persistedIdeas.length > 0) {
        const ideas: StreamIdea[] = persistedIdeas.map((idea) => {
          const trend = trends?.find((t) => t._id === idea.trendId);
          return {
            ideaId: idea._id,
            platform: idea.platform as Platform,
            trendIndex: trends?.findIndex((t) => t._id === idea.trendId) ?? 0,
            trendTitle: trend?.title || "Unknown trend",
            hook: idea.hook,
            format: idea.format,
            angle: idea.angle,
            description: idea.description,
          };
        });

        return {
          ...defaultState,
          isStreaming: isThreadGenerating,
          isComplete: isThreadComplete || ideas.length > 0,
          ideas,
          ideasCount: ideas.length,
        };
      }

      return {
        ...defaultState,
        isStreaming: isThreadGenerating,
        isComplete: isThreadComplete,
        error: isThreadError ? "Ideas generation failed" : null,
      };
    }

    let currentTrendIndex: number | null = null;
    let currentTrendTitle: string | null = null;
    let currentPlatform: Platform | null = null;
    let currentStatus: string | null = null;
    let error: string | null = null;
    const ideas: StreamIdea[] = [];
    const statusEvents: StatusEvent[] = [];
    let hasCompleteEvent = false;

    for (const event of streamEvents) {
      const data = event.data as Record<string, unknown> | undefined;

      switch (event.eventType) {
        case "node_start":
          if (data?.message) {
            currentStatus = data.message as string;
            statusEvents.push({
              message: currentStatus,
              trendIndex: data.trendIndex as number | undefined,
            });
          }
          if (data?.trendIndex !== undefined) {
            currentTrendIndex = data.trendIndex as number;
            currentTrendTitle = (data.trendTitle as string) || null;
          }
          break;

        case "token":
          if (data?.message) {
            currentStatus = data.message as string;
            statusEvents.push({
              message: currentStatus,
              platform: data.platform as Platform | undefined,
              trendIndex: data.trendIndex as number | undefined,
            });
          }
          if (data?.platform) {
            currentPlatform = data.platform as Platform;
          }
          if (data?.trendIndex !== undefined) {
            currentTrendIndex = data.trendIndex as number;
          }
          break;

        case "idea":
          if (data) {
            ideas.push({
              ideaId: data.ideaId as string | undefined,
              platform: data.platform as Platform,
              trendIndex: data.trendIndex as number,
              trendTitle: (data.trendTitle as string) || "Unknown",
              hook: data.hook as string,
              format: data.format as string,
              angle: data.angle as string,
              description: data.description as string,
              ideasCount: data.ideasCount as number | undefined,
            });
          }
          break;

        case "error":
          error = (data?.message as string) || "Unknown error";
          break;

        case "complete":
          hasCompleteEvent = true;
          break;
      }
    }

    const isStreaming = isThreadGenerating && !hasCompleteEvent;
    const isComplete = hasCompleteEvent || isThreadComplete;

    return {
      isStreaming,
      isComplete,
      currentTrendIndex,
      currentTrendTitle,
      currentPlatform,
      currentStatus,
      ideas,
      ideasCount: ideas.length,
      error: error || (isThreadError ? "Ideas generation failed" : null),
      statusEvents,
    };
  }, [streamEvents, persistedIdeas, trends, thread?.status]);

  const getIdeasByPlatform = (platform: Platform): StreamIdea[] => {
    return state.ideas.filter((idea) => idea.platform === platform);
  };

  const getIdeasCountByPlatform = (platform: Platform): number => {
    return state.ideas.filter((idea) => idea.platform === platform).length;
  };

  const getPlatformCounts = (): Record<Platform, number> => {
    return PLATFORMS.reduce(
      (acc, platform) => {
        acc[platform] = getIdeasCountByPlatform(platform);
        return acc;
      },
      {} as Record<Platform, number>
    );
  };

  return {
    ...state,
    getIdeasByPlatform,
    getIdeasCountByPlatform,
    getPlatformCounts,
  };
}
