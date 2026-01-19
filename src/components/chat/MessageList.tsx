import { useEffect, useRef } from "react";
import { Message } from "./Message";
import type { Doc } from "../../../convex/_generated/dataModel";

interface MessageListProps {
  messages: Doc<"messages">[];
  streamingContent?: string;
  isStreaming?: boolean;
}

export function MessageList({
  messages,
  streamingContent,
  isStreaming = false,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  return (
    <div className="flex-1 overflow-y-auto">
      {messages.length === 0 && !streamingContent ? (
        <div className="h-full flex items-center justify-center text-gray-400">
          <p>Start by entering a topic to research</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {messages.map((message) => (
            <Message
              key={message._id}
              role={message.role}
              content={message.content}
              messageType={message.messageType}
              metadata={message.metadata}
            />
          ))}

          {isStreaming && streamingContent && (
            <Message
              role="assistant"
              content={streamingContent}
              messageType="status_update"
              isStreaming={true}
            />
          )}
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
