import { StreamingText } from "./StreamingText";
import { User, Bot, AlertCircle, Loader2 } from "lucide-react";

interface MessageProps {
  role: "user" | "assistant" | "system";
  content: string;
  messageType: "user_input" | "status_update" | "research_result" | "error";
  isStreaming?: boolean;
  metadata?: {
    step?: string;
    progress?: number;
  };
}

export function Message({
  role,
  content,
  messageType,
  isStreaming = false,
  metadata,
}: MessageProps) {
  const isUser = role === "user";
  const isError = messageType === "error";
  const isStatus = messageType === "status_update";

  return (
    <div
      className={`flex gap-3 p-4 ${
        isUser ? "bg-gray-50" : "bg-white"
      } ${isError ? "bg-red-50" : ""}`}
    >
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
          isUser
            ? "bg-blue-500"
            : isError
            ? "bg-red-500"
            : "bg-gray-700"
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : isError ? (
          <AlertCircle className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-white" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        {isStatus && metadata?.step && (
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="capitalize">{metadata.step}</span>
          </div>
        )}

        <div
          className={`prose prose-sm max-w-none ${
            isError ? "text-red-700" : "text-gray-800"
          }`}
        >
          <StreamingText text={content} isStreaming={isStreaming} />
        </div>
      </div>
    </div>
  );
}
