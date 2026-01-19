import { useState, useCallback, useEffect } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { useThread } from "../../hooks/useThread";
import { useResearchStream } from "../../hooks/useResearchStream";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { ApprovalPanel } from "../hitl/ApprovalPanel";
import { THREAD_STATUS } from "../../lib/constants";

interface ChatPanelProps {
  threadId: Id<"threads"> | null;
  onThreadCreated: (threadId: Id<"threads">) => void;
}

export function ChatPanel({ threadId, onThreadCreated }: ChatPanelProps) {
  const { thread, messages, createThread } = useThread(threadId);
  const { isStreaming, events, error, startStream } = useResearchStream();
  const [streamingContent, setStreamingContent] = useState("");

  useEffect(() => {
    const statusMessages = events
      .filter((e) => e.type === "status" && e.message)
      .map((e) => e.message);

    if (statusMessages.length > 0) {
      setStreamingContent(statusMessages.join("\n"));
    }
  }, [events]);

  useEffect(() => {
    if (!isStreaming) {
      setStreamingContent("");
    }
  }, [isStreaming]);

  const handleSubmit = useCallback(
    async (prompt: string) => {
      try {
        const newThreadId = await createThread({ userPrompt: prompt });
        onThreadCreated(newThreadId);
        await startStream(newThreadId);
      } catch (err) {
        console.error("Failed to start research:", err);
      }
    },
    [createThread, onThreadCreated, startStream]
  );

  const isInputDisabled =
    isStreaming ||
    thread?.status === THREAD_STATUS.PLANNING ||
    thread?.status === THREAD_STATUS.SEARCHING ||
    thread?.status === THREAD_STATUS.SYNTHESIZING ||
    thread?.status === THREAD_STATUS.AWAITING_APPROVAL;

  const showApproval = thread?.status === THREAD_STATUS.AWAITING_APPROVAL;

  return (
    <div className="h-full flex flex-col">
      <MessageList
        messages={messages}
        streamingContent={streamingContent}
        isStreaming={isStreaming}
      />

      {showApproval && threadId && (
        <ApprovalPanel
          threadId={threadId}
          onApproved={() => {
            // Ideas generation will be triggered
            // Sidebar will auto-open via MainLayout
          }}
        />
      )}

      {error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-200 text-red-700 text-sm">
          Error: {error}
        </div>
      )}

      <div className="border-t border-gray-200 bg-white p-4">
        <div className="max-w-3xl mx-auto">
          <ChatInput
            onSubmit={handleSubmit}
            isDisabled={isInputDisabled}
            isLoading={isStreaming}
            placeholder={
              threadId
                ? "Start a new research..."
                : "What trends would you like to research?"
            }
          />
        </div>
      </div>
    </div>
  );
}
