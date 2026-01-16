# CARD-09: Chat UI Components

## 🎯 Objetivo

Implementar os componentes de chat: input, lista de mensagens, mensagem com streaming, e hooks de comunicação.

## 📋 Dependências

- ✅ CARD-08 (Frontend Setup)

## 📁 Arquivos a Criar

- `src/components/chat/ChatPanel.tsx`
- `src/components/chat/ChatInput.tsx`
- `src/components/chat/MessageList.tsx`
- `src/components/chat/Message.tsx`
- `src/components/chat/StreamingText.tsx`
- `src/hooks/useThread.ts`
- `src/hooks/useResearchStream.ts`

## 💻 Implementação

### src/hooks/useThread.ts

```typescript
// src/hooks/useThread.ts
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

export function useThread(threadId: Id<"threads"> | null) {
  const thread = useQuery(
    api.threads.get,
    threadId ? { threadId } : "skip"
  );

  const messages = useQuery(
    api.messages.getByThread,
    threadId ? { threadId } : "skip"
  );

  const trends = useQuery(
    api.trends.getByThread,
    threadId ? { threadId } : "skip"
  );

  const createThread = useMutation(api.threads.create);
  const updateStatus = useMutation(api.threads.updateStatus);
  const approve = useMutation(api.threads.approve);
  const refine = useMutation(api.threads.refine);
  const restart = useMutation(api.threads.restart);

  return {
    thread,
    messages: messages || [],
    trends: trends || [],
    createThread,
    updateStatus,
    approve,
    refine,
    restart,
    isLoading: thread === undefined,
  };
}
```

### src/hooks/useResearchStream.ts

```typescript
// src/hooks/useResearchStream.ts
import { useState, useCallback, useRef } from "react";
import { Id } from "../../convex/_generated/dataModel";
import { API_ENDPOINTS } from "../lib/constants";

interface StreamEvent {
  type: "start" | "status" | "plan" | "trend" | "hitl" | "complete" | "error" | "done";
  message?: string;
  step?: string;
  keywords?: string[];
  trend?: any;
  status?: string;
  trendsCount?: number;
}

export function useResearchStream() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startStream = useCallback(async (threadId: Id<"threads">) => {
    // Abort any existing stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsStreaming(true);
    setEvents([]);
    setError(null);

    try {
      const response = await fetch(API_ENDPOINTS.streamResearch, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6)) as StreamEvent;
              setEvents((prev) => [...prev, data]);

              if (data.type === "error") {
                setError(data.message || "Unknown error");
              }
            } catch (e) {
              console.warn("Failed to parse SSE event:", line);
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(err.message);
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  return {
    isStreaming,
    events,
    error,
    startStream,
    stopStream,
  };
}
```

### src/components/chat/StreamingText.tsx

```typescript
// src/components/chat/StreamingText.tsx
interface StreamingTextProps {
  text: string;
  isStreaming?: boolean;
}

export function StreamingText({ text, isStreaming = false }: StreamingTextProps) {
  return (
    <span className={isStreaming ? "cursor-blink" : ""}>
      {text}
    </span>
  );
}
```

### src/components/chat/Message.tsx

```typescript
// src/components/chat/Message.tsx
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
      {/* Avatar */}
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

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Status indicator */}
        {isStatus && metadata?.step && (
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span className="capitalize">{metadata.step}</span>
          </div>
        )}

        {/* Message content */}
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
```

### src/components/chat/MessageList.tsx

```typescript
// src/components/chat/MessageList.tsx
import { useEffect, useRef } from "react";
import { Message } from "./Message";
import { Doc } from "../../../convex/_generated/dataModel";

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

  // Auto-scroll to bottom on new messages
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

          {/* Streaming message */}
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
```

### src/components/chat/ChatInput.tsx

```typescript
// src/components/chat/ChatInput.tsx
import { useState, FormEvent } from "react";
import { Send, Loader2 } from "lucide-react";

interface ChatInputProps {
  onSubmit: (prompt: string) => void;
  isDisabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSubmit,
  isDisabled = false,
  isLoading = false,
  placeholder = "What trends would you like to research?",
}: ChatInputProps) {
  const [input, setInput] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (trimmed && !isDisabled && !isLoading) {
      onSubmit(trimmed);
      setInput("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={placeholder}
        disabled={isDisabled || isLoading}
        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
      />
      <button
        type="submit"
        disabled={isDisabled || isLoading || !input.trim()}
        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
        Research
      </button>
    </form>
  );
}
```

### src/components/chat/ChatPanel.tsx

```typescript
// src/components/chat/ChatPanel.tsx
import { useState, useCallback, useEffect } from "react";
import { Id } from "../../../convex/_generated/dataModel";
import { useThread } from "../../hooks/useThread";
import { useResearchStream } from "../../hooks/useResearchStream";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { THREAD_STATUS } from "../../lib/constants";

interface ChatPanelProps {
  threadId: Id<"threads"> | null;
  onThreadCreated: (threadId: Id<"threads">) => void;
}

export function ChatPanel({ threadId, onThreadCreated }: ChatPanelProps) {
  const { thread, messages, createThread } = useThread(threadId);
  const { isStreaming, events, error, startStream } = useResearchStream();
  const [streamingContent, setStreamingContent] = useState("");

  // Build streaming content from events
  useEffect(() => {
    const statusMessages = events
      .filter((e) => e.type === "status" && e.message)
      .map((e) => e.message);
    
    if (statusMessages.length > 0) {
      setStreamingContent(statusMessages.join("\n"));
    }
  }, [events]);

  // Clear streaming content when done
  useEffect(() => {
    if (!isStreaming) {
      setStreamingContent("");
    }
  }, [isStreaming]);

  const handleSubmit = useCallback(
    async (prompt: string) => {
      try {
        // Create new thread
        const newThreadId = await createThread({ userPrompt: prompt });
        onThreadCreated(newThreadId);

        // Start research stream
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
    thread?.status === THREAD_STATUS.SYNTHESIZING;

  return (
    <div className="h-full flex flex-col">
      {/* Messages */}
      <MessageList
        messages={messages}
        streamingContent={streamingContent}
        isStreaming={isStreaming}
      />

      {/* Error display */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-200 text-red-700 text-sm">
          Error: {error}
        </div>
      )}

      {/* Input */}
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
```

### Atualizar MainLayout.tsx

Substituir placeholders pelo ChatPanel real:

```typescript
// Em src/components/layout/MainLayout.tsx
// Importar ChatPanel
import { ChatPanel } from "../chat/ChatPanel";

// Substituir o placeholder no main:
<main className="flex-1 overflow-hidden">
  <ChatPanel
    threadId={activeThreadId}
    onThreadCreated={onThreadChange}
  />
</main>

// Remover o footer placeholder (input está dentro do ChatPanel)
```

## ✅ Acceptance Criteria

1. [ ] ChatInput permite digitar e enviar prompt
2. [ ] MessageList mostra mensagens com scroll automático
3. [ ] Message renderiza corretamente user/assistant/error
4. [ ] StreamingText mostra cursor piscando durante streaming
5. [ ] useResearchStream conecta ao endpoint SSE
6. [ ] useThread provê dados e mutations do Convex
7. [ ] Input desabilitado durante streaming

## 🛑 Stop Conditions

```bash
# 1. Verificar que arquivos existem
for file in "ChatPanel" "ChatInput" "MessageList" "Message" "StreamingText"; do
  test -f "src/components/chat/${file}.tsx" && echo "✅ ${file}.tsx exists" || echo "❌ ${file}.tsx missing"
done

# 2. Verificar hooks
test -f src/hooks/useThread.ts && echo "✅ useThread.ts exists" || echo "❌ useThread.ts missing"
test -f src/hooks/useResearchStream.ts && echo "✅ useResearchStream.ts exists" || echo "❌ useResearchStream.ts missing"

# 3. Verificar compilação
npm run build 2>&1 | grep -q "error" && echo "❌ Build errors" || echo "✅ Build OK"

# 4. Verificar imports no ChatPanel
grep -q "useResearchStream" src/components/chat/ChatPanel.tsx && echo "✅ useResearchStream imported" || echo "❌ useResearchStream not imported"

# 5. Verificar SSE endpoint usage
grep -q "streamResearch" src/hooks/useResearchStream.ts && echo "✅ SSE endpoint used" || echo "❌ SSE endpoint missing"
```

**Card concluído quando todos os checks passam ✅**

## 📝 Notas

- SSE (Server-Sent Events) usa `EventSource` nativo ou fetch com stream reader
- Auto-scroll usa `scrollIntoView` com behavior smooth
- Input é desabilitado baseado no status do thread
- Cursor piscante via CSS animation (`.cursor-blink`)
