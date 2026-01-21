import { useState, useCallback, useEffect, useRef } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { useThread } from "../../hooks/useThread";
import { useResearchStream } from "../../hooks/useResearchStream";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { ApprovalPanel } from "../hitl/ApprovalPanel";
import { ResearchProgress } from "../research/ResearchProgress";
import { THREAD_STATUS } from "../../lib/constants";

interface ChatPanelProps {
  threadId: Id<"threads"> | null;
  onThreadCreated: (threadId: Id<"threads">) => void;
}

export function ChatPanel({ threadId, onThreadCreated }: ChatPanelProps) {
  const { thread, messages, createThread } = useThread(threadId);
  const {
    isStreaming,
    isComplete,
    isStarting,
    currentNode,
    currentStatus,
    plan,
    searchResultsCount,
    trends,
    tokens,
    error: streamError,
    startStream,
    hasEvents,
  } = useResearchStream(threadId);

  const [localError, setLocalError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming, currentNode, plan, trends]);

  const handleSubmit = useCallback(
    async (prompt: string) => {
      setLocalError(null);
      try {
        const newThreadId = await createThread({ userPrompt: prompt });
        onThreadCreated(newThreadId);
        await startStream(newThreadId);
      } catch (err) {
        console.error("Failed to start research:", err);
        setLocalError(
          err instanceof Error ? err.message : "Failed to start research"
        );
      }
    },
    [createThread, onThreadCreated, startStream]
  );

  const isResearching =
    isStarting ||
    isStreaming ||
    thread?.status === THREAD_STATUS.PLANNING ||
    thread?.status === THREAD_STATUS.SEARCHING ||
    thread?.status === THREAD_STATUS.SYNTHESIZING;

  const isInputDisabled =
    isResearching || thread?.status === THREAD_STATUS.AWAITING_APPROVAL;

  const showApproval = thread?.status === THREAD_STATUS.AWAITING_APPROVAL;
  const showProgress = hasEvents || isStarting;

  const error = localError || streamError;

  return (
    <div className="h-full flex flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <MessageList messages={messages} />

        {showProgress && (
          <div className="p-4">
            <ResearchProgress
              isStreaming={isResearching}
              isComplete={isComplete && !isResearching}
              currentNode={currentNode}
              currentStatus={currentStatus}
              plan={plan}
              searchResultsCount={searchResultsCount}
              trendsCount={trends.length}
              tokens={tokens}
              error={streamError}
            />
          </div>
        )}

        {showApproval && threadId && (
          <ApprovalPanel
            threadId={threadId}
            onApproved={() => {
              // Ideas generation is triggered by the approve action
              // The sidebar will auto-open via MainLayout when status changes
            }}
          />
        )}
      </div>

      {error && !streamError && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-200 text-red-700 text-sm">
          Error: {error}
        </div>
      )}

      <div className="border-t border-gray-200 bg-white p-4 flex-shrink-0">
        <div className="max-w-3xl mx-auto">
          <ChatInput
            onSubmit={handleSubmit}
            isDisabled={isInputDisabled}
            isLoading={isResearching}
            placeholder={
              threadId
                ? isResearching
                  ? "Researching..."
                  : showApproval
                    ? "Review and approve the research above"
                    : "Start a new research..."
                : "What trends would you like to research?"
            }
          />
        </div>
      </div>
    </div>
  );
}
