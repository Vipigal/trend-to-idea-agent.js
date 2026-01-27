import { useState, useEffect, useRef } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { useIdeasStream } from "../../hooks/useIdeasStream";
import { IdeaCard } from "./IdeaCard";
import { PlatformTabs } from "./PlatformTabs";
import type { Platform } from "../../lib/constants";
import { PLATFORMS } from "../../lib/constants";
import { Loader2, Sparkles, RefreshCw, AlertCircle } from "lucide-react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";

interface IdeasPanelProps {
  threadId: Id<"threads">;
}

export function IdeasPanel({ threadId }: IdeasPanelProps) {
  const [activePlatform, setActivePlatform] = useState<Platform>("linkedin");
  const [newIdeaIds, setNewIdeaIds] = useState<Set<string>>(new Set());
  const [isRegenerating, setIsRegenerating] = useState(false);
  const previousIdeasCount = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  const regenerateIdeas = useAction(api.actions.ideas.regenerateIdeas);

  const {
    isStreaming,
    isComplete,
    currentStatus,
    ideas,
    ideasCount,
    error,
    getIdeasByPlatform,
    getPlatformCounts,
    platformStatuses,
  } = useIdeasStream(threadId);

  useEffect(() => {
    if (ideas.length > previousIdeasCount.current) {
      const newIds = new Set<string>();
      for (let i = previousIdeasCount.current; i < ideas.length; i++) {
        const idea = ideas[i];
        newIds.add(`${idea.platform}-${idea.hook.substring(0, 20)}`);
      }
      setNewIdeaIds((prev) => new Set([...prev, ...newIds]));

      setTimeout(() => {
        setNewIdeaIds(new Set());
      }, 2000);

      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    }
    previousIdeasCount.current = ideas.length;
  }, [ideas]);

  useEffect(() => {
    if (isStreaming) {
      const activeCount = getIdeasByPlatform(activePlatform).length;
      if (activeCount === 0) {
        for (const platform of PLATFORMS) {
          if (getIdeasByPlatform(platform).length > 0) {
            setActivePlatform(platform);
            break;
          }
        }
      }
    }
  }, [isStreaming, ideas.length, activePlatform, getIdeasByPlatform]);

  const counts = getPlatformCounts();
  const activeIdeas = getIdeasByPlatform(activePlatform);
  const activePlatformStatus = platformStatuses[activePlatform];

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      await regenerateIdeas({ threadId });
    } catch (err) {
      console.error("Failed to regenerate ideas:", err);
    } finally {
      setIsRegenerating(false);
    }
  };

  const completedPlatformsCount = PLATFORMS.filter(
    (p) => platformStatuses[p].isComplete
  ).length;

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="p-4 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-500" />
            <h2 className="font-semibold text-gray-900">Content Ideas</h2>
          </div>

          <div className="flex items-center gap-2">
            {isStreaming || isRegenerating ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="hidden sm:inline">
                  {isRegenerating
                    ? "Regenerating..."
                    : `${completedPlatformsCount}/${PLATFORMS.length} platforms`}
                </span>
              </div>
            ) : isComplete && ideasCount > 0 ? (
              <button
                onClick={handleRegenerate}
                disabled={isRegenerating}
                className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50 transition-colors"
                title="Generate new ideas"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">Regenerate</span>
              </button>
            ) : null}
          </div>
        </div>

        {(isStreaming || isRegenerating) && (
          <p className="text-xs text-gray-500 mt-1.5 truncate flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            {currentStatus || "Starting parallel generation..."}
          </p>
        )}
      </div>

      <PlatformTabs
        activePlatform={activePlatform}
        onPlatformChange={setActivePlatform}
        counts={counts}
        platformStatuses={platformStatuses}
      />

      <div ref={listRef} className="flex-1 overflow-y-auto p-4">
        {error ? (
          <div className="text-center py-8">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="font-medium text-red-600">Error</p>
            <p className="text-sm text-red-500 mt-1">{error}</p>
          </div>
        ) : activeIdeas.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            {activePlatformStatus.isStreaming || isRegenerating ? (
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-ping" />
                </div>
                <p className="text-sm">
                  Generating{" "}
                  <span className="font-medium text-gray-600">
                    {activePlatform}
                  </span>{" "}
                  ideas...
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Sparkles className="w-8 h-8 text-gray-300" />
                <p className="text-sm">No {activePlatform} ideas yet</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {activeIdeas.map((idea, index) => {
              const uniqueId = `${idea.platform}-${idea.hook.substring(0, 20)}`;

              return (
                <IdeaCard
                  key={`${uniqueId}-${index}`}
                  hook={idea.hook}
                  format={idea.format}
                  angle={idea.angle}
                  description={idea.description}
                  trendTitles={idea.trendTitles}
                  isNew={newIdeaIds.has(uniqueId)}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-gray-200 bg-gray-50 flex-shrink-0">
        <p className="text-xs text-gray-500 text-center">
          {ideasCount > 0 ? (
            <span>
              <span className="font-medium text-gray-700">{ideasCount}</span>{" "}
              ideas across{" "}
              <span className="font-medium text-gray-700">
                {completedPlatformsCount}/{PLATFORMS.length}
              </span>{" "}
              platforms
              {isStreaming && (
                <span className="ml-1 text-blue-500">
                  — generating...
                </span>
              )}
            </span>
          ) : isStreaming || isRegenerating ? (
            <span className="flex items-center justify-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              Generating ideas in parallel...
            </span>
          ) : (
            "No ideas generated yet"
          )}
        </p>
      </div>
    </div>
  );
}
