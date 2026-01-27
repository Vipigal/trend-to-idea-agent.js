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
  trendTitles: string[];
  hook: string;
  format: string;
  angle: string;
  description: string;
  platformIdeasCount?: number;
}

export interface PlatformStatus {
  isStreaming: boolean;
  isComplete: boolean;
  ideasCount: number;
  error: string | null;
}

interface IdeasStreamState {
  isStreaming: boolean;
  isComplete: boolean;
  currentStatus: string | null;
  ideas: StreamIdea[];
  ideasCount: number;
  error: string | null;
  platformStatuses: Record<Platform, PlatformStatus>;
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
    const defaultPlatformStatus: PlatformStatus = {
      isStreaming: false,
      isComplete: false,
      ideasCount: 0,
      error: null,
    };

    const defaultState: IdeasStreamState = {
      isStreaming: false,
      isComplete: false,
      currentStatus: null,
      ideas: [],
      ideasCount: 0,
      error: null,
      platformStatuses: {
        linkedin: { ...defaultPlatformStatus },
        twitter: { ...defaultPlatformStatus },
        tiktok: { ...defaultPlatformStatus },
      },
    };

    const isThreadGenerating =
      thread?.status === THREAD_STATUS.GENERATING_IDEAS;
    const isThreadComplete = thread?.status === THREAD_STATUS.COMPLETED;
    const isThreadError = thread?.status === THREAD_STATUS.ERROR;

    if (!streamEvents || streamEvents.length === 0) {
      if (persistedIdeas && persistedIdeas.length > 0) {
        const ideas: StreamIdea[] = persistedIdeas.map((idea) => {
          const trendTitles =
            (idea as Record<string, unknown>).trendIds !== undefined
              ? ((idea as Record<string, unknown>).trendIds as Id<"trends">[])
                  .map(
                    (tId: Id<"trends">) =>
                      trends?.find((t) => t._id === tId)?.title
                  )
                  .filter((t): t is string => Boolean(t))
              : [];

          return {
            ideaId: idea._id,
            platform: idea.platform as Platform,
            trendTitles,
            hook: idea.hook,
            format: idea.format,
            angle: idea.angle,
            description: idea.description,
          };
        });

        const platformStatuses = { ...defaultState.platformStatuses };
        for (const platform of PLATFORMS) {
          const count = ideas.filter((i) => i.platform === platform).length;
          platformStatuses[platform] = {
            isStreaming: false,
            isComplete: count > 0,
            ideasCount: count,
            error: null,
          };
        }

        return {
          ...defaultState,
          isStreaming: isThreadGenerating,
          isComplete: isThreadComplete || ideas.length > 0,
          ideas,
          ideasCount: ideas.length,
          platformStatuses,
        };
      }

      return {
        ...defaultState,
        isStreaming: isThreadGenerating,
        isComplete: isThreadComplete,
        error: isThreadError ? "Ideas generation failed" : null,
      };
    }

    let currentStatus: string | null = null;
    let error: string | null = null;
    const ideas: StreamIdea[] = [];
    const completedPlatforms = new Set<string>();
    const platformErrors: Record<string, string> = {};
    const platformIdeasCounts: Record<string, number> = {};

    for (const event of streamEvents) {
      const data = event.data as Record<string, unknown> | undefined;

      switch (event.eventType) {
        case "node_start":
          if (data?.message) {
            currentStatus = data.message as string;
          }
          break;

        case "token":
          if (data?.message) {
            currentStatus = data.message as string;
          }
          break;

        case "idea":
          if (data) {
            const platform = data.platform as Platform;
            ideas.push({
              ideaId: data.ideaId as string | undefined,
              platform,
              trendTitles: (data.trendTitles as string[]) || [],
              hook: data.hook as string,
              format: data.format as string,
              angle: data.angle as string,
              description: data.description as string,
              platformIdeasCount: data.platformIdeasCount as number | undefined,
            });
            platformIdeasCounts[platform] =
              (platformIdeasCounts[platform] || 0) + 1;
          }
          break;

        case "error":
          if (data?.platform) {
            platformErrors[data.platform as string] =
              (data.message as string) || "Unknown error";
          } else {
            error = (data?.message as string) || "Unknown error";
          }
          break;

        case "complete":
          if (data?.platform) {
            completedPlatforms.add(data.platform as string);
          }
          break;
      }
    }

    const allPlatformsDone = completedPlatforms.size >= PLATFORMS.length;
    const isStreaming = isThreadGenerating && !allPlatformsDone;
    const isComplete = allPlatformsDone || isThreadComplete;

    const platformStatuses: Record<Platform, PlatformStatus> =
      {} as Record<Platform, PlatformStatus>;
    for (const platform of PLATFORMS) {
      platformStatuses[platform] = {
        isStreaming: isStreaming && !completedPlatforms.has(platform),
        isComplete: completedPlatforms.has(platform),
        ideasCount: platformIdeasCounts[platform] || 0,
        error: platformErrors[platform] || null,
      };
    }

    return {
      isStreaming,
      isComplete,
      currentStatus,
      ideas,
      ideasCount: ideas.length,
      error: error || (isThreadError ? "Ideas generation failed" : null),
      platformStatuses,
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
