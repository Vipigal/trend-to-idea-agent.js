# CARD-09: Chat UI Components (REVISADO)

## 📝 Mudanças para Streaming Real

### O que mudou
- `useResearchStream` agora processa eventos `on_llm_stream` (tokens individuais)
- Novo estado para acumular tokens e mostrar texto sendo "digitado"
- Eventos de progresso mais granulares (tool_start, tool_end)
- Consistente com o formato de eventos do CARD-05 revisado

---

## 🎯 Objetivo

Implementar os componentes de chat: input, lista de mensagens, mensagem com streaming real de tokens, e hooks de comunicação.

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
- `src/lib/types.ts`

## 💻 Implementação

### src/lib/types.ts (NOVO)

```typescript
// src/lib/types.ts

/**
 * Tipos de eventos SSE recebidos do backend
 */
export interface SSEEvent {
  type: 
    | "start"
    | "node_start"
    | "node_end"
    | "token"
    | "llm_complete"
    | "tool_start"
    | "tool_end"
    | "trend"
    | "idea"
    | "plan"
    | "search_results"
    | "complete"
    | "error"
    | "done";
  
  // Campos opcionais dependendo do tipo
  threadId?: string;
  node?: string;
  message?: string;
  token?: string;
  tool?: string;
  input?: any;
  resultCount?: number;
  trend?: any;
  idea?: any;
  keywords?: string[];
  timeframe?: string;
  count?: number;
  trendsCount?: number;
  ideasCount?: number;
}

/**
 * Estado do streaming de research
 */
export interface StreamState {
  isStreaming: boolean;
  currentNode: string | null;
  currentMessage: string;
  tokenBuffer: string;
  events: SSEEvent[];
  trends: any[];
  error: string | null;
}
```

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

### src/hooks/useResearchStream.ts (REVISADO)

```typescript
// src/hooks/useResearchStream.ts
import { useState, useCallback, useRef } from "react";
import { Id } from "../../convex/_generated/dataModel";
import { API_ENDPOINTS } from "../lib/constants";
import { SSEEvent, StreamState } from "../lib/types";

const initialState: StreamState = {
  isStreaming: false,
  currentNode: null,
  currentMessage: "",
  tokenBuffer: "",
  events: [],
  trends: [],
  error: null,
};

export function useResearchStream() {
  const [state, setState] = useState<StreamState>(initialState);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startStream = useCallback(async (threadId: Id<"threads">) => {
    // Abortar stream existente
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setState({
      ...initialState,
      isStreaming: true,
    });

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
              const event = JSON.parse(line.slice(6)) as SSEEvent;
              
              setState((prev) => {
                const newState = { ...prev };
                newState.events = [...prev.events, event];

                switch (event.type) {
                  // ─────────────────────────────────────────
                  // Início de nó
                  // ─────────────────────────────────────────
                  case "node_start":
                    newState.currentNode = event.node || null;
                    newState.currentMessage = event.message || "";
                    newState.tokenBuffer = ""; // Reset buffer para novo nó
                    break;

                  // ─────────────────────────────────────────
                  // Token individual do LLM (streaming real!)
                  // ─────────────────────────────────────────
                  case "token":
                    if (event.token) {
                      newState.tokenBuffer = prev.tokenBuffer + event.token;
                    }
                    break;

                  // ─────────────────────────────────────────
                  // LLM terminou
                  // ─────────────────────────────────────────
                  case "llm_complete":
                    // Manter o buffer - será usado para display final
                    break;

                  // ─────────────────────────────────────────
                  // Tool (Tavily) iniciou
                  // ─────────────────────────────────────────
                  case "tool_start":
                    newState.currentMessage = `Searching: ${event.input?.query || "..."}`;
                    break;

                  // ─────────────────────────────────────────
                  // Tool terminou
                  // ─────────────────────────────────────────
                  case "tool_end":
                    if (event.resultCount !== undefined) {
                      newState.currentMessage = `Found ${event.resultCount} results`;
                    }
                    break;

                  // ─────────────────────────────────────────
                  // Plano de pesquisa
                  // ─────────────────────────────────────────
                  case "plan":
                    newState.currentMessage = `Keywords: ${event.keywords?.join(", ")}`;
                    break;

                  // ─────────────────────────────────────────
                  // Resultados da busca
                  // ─────────────────────────────────────────
                  case "search_results":
                    newState.currentMessage = `Found ${event.count} sources`;
                    break;

                  // ─────────────────────────────────────────
                  // Trend identificada
                  // ─────────────────────────────────────────
                  case "trend":
                    if (event.trend) {
                      newState.trends = [...prev.trends, event.trend];
                    }
                    break;

                  // ─────────────────────────────────────────
                  // Fim do nó
                  // ─────────────────────────────────────────
                  case "node_end":
                    newState.tokenBuffer = ""; // Reset para próximo nó
                    break;

                  // ─────────────────────────────────────────
                  // Completo
                  // ─────────────────────────────────────────
                  case "complete":
                    newState.currentMessage = `Research complete! Found ${event.trendsCount || newState.trends.length} trends.`;
                    break;

                  // ─────────────────────────────────────────
                  // Erro
                  // ─────────────────────────────────────────
                  case "error":
                    newState.error = event.message || "Unknown error";
                    break;

                  // ─────────────────────────────────────────
                  // Fim do stream
                  // ─────────────────────────────────────────
                  case "done":
                    newState.isStreaming = false;
                    break;
                }

                return newState;
              });
            } catch (e) {
              console.warn("Failed to parse SSE event:", line);
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setState((prev) => ({
          ...prev,
          error: err.message,
          isStreaming: false,
        }));
      }
    } finally {
      setState((prev) => ({
        ...prev,
        isStreaming: false,
      }));
      abortControllerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState((prev) => ({
      ...prev,
      isStreaming: false,
    }));
  }, []);

  const reset = useCallback(() => {
    stopStream();
    setState(initialState);
  }, [stopStream]);

  return {
    ...state,
    startStream,
    stopStream,
    reset,
  };
}
```

### src/components/chat/StreamingText.tsx

```typescript
// src/components/chat/StreamingText.tsx
import { useEffect, useState } from "react";

interface StreamingTextProps {
  text: string;
  isStreaming?: boolean;
  speed?: number; // ms per character (for non-streaming text animation)
}

export function StreamingText({ 
  text, 
  isStreaming = false,
}: StreamingTextProps) {
  return (
    <span className="whitespace-pre-wrap">
      {text}
      {isStreaming && (
        <span className="inline-block w-2 h-4 ml-0.5 bg-blue-500 animate-pulse" />
      )}
    </span>
  );
}

/**
 * Componente para mostrar o status atual com animação
 */
export function StreamingStatus({
  node,
  message,
  tokenBuffer,
  isStreaming,
}: {
  node: string | null;
  message: string;
  tokenBuffer: string;
  isStreaming: boolean;
}) {
  if (!isStreaming && !message) return null;

  // Determinar o que mostrar
  const displayText = tokenBuffer || message;
  const showCursor = isStreaming && (tokenBuffer.length > 0 || message.length > 0);

  // Ícone baseado no nó atual
  const icon = {
    plan_research: "📋",
    search: "🔍",
    synthesize: "📊",
    await_approval: "✅",
  }[node || ""] || "⚙️";

  return (
    <div className="p-4 bg-gray-50 border-b border-gray-100">
      <div className="flex items-start gap-3">
        <span className="text-lg">{icon}</span>
        <div className="flex-1 min-w-0">
          <StreamingText text={displayText} isStreaming={showCursor} />
        </div>
      </div>
    </div>
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
import { StreamingStatus } from "./StreamingText";
import { Doc } from "../../../convex/_generated/dataModel";

interface MessageListProps {
  messages: Doc<"messages">[];
  // Streaming state
  currentNode: string | null;
  currentMessage: string;
  tokenBuffer: string;
  isStreaming: boolean;
}

export function MessageList({
  messages,
  currentNode,
  currentMessage,
  tokenBuffer,
  isStreaming,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll para baixo em novas mensagens ou tokens
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, tokenBuffer]);

  return (
    <div className="flex-1 overflow-y-auto">
      {messages.length === 0 && !isStreaming ? (
        <div className="h-full flex items-center justify-center text-gray-400">
          <p>Start by entering a topic to research</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {/* Mensagens persistidas */}
          {messages.map((message) => (
            <Message
              key={message._id}
              role={message.role}
              content={message.content}
              messageType={message.messageType}
              metadata={message.metadata}
            />
          ))}

          {/* Status de streaming em tempo real */}
          {isStreaming && (
            <StreamingStatus
              node={currentNode}
              message={currentMessage}
              tokenBuffer={tokenBuffer}
              isStreaming={isStreaming}
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
import { Send, Loader2, StopCircle } from "lucide-react";

interface ChatInputProps {
  onSubmit: (prompt: string) => void;
  onStop?: () => void;
  isDisabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSubmit,
  onStop,
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
      
      {isLoading && onStop ? (
        <button
          type="button"
          onClick={onStop}
          className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center gap-2"
        >
          <StopCircle className="w-4 h-4" />
          Stop
        </button>
      ) : (
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
      )}
    </form>
  );
}
```

### src/components/chat/ChatPanel.tsx

```typescript
// src/components/chat/ChatPanel.tsx
import { useCallback } from "react";
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
  const { 
    isStreaming, 
    currentNode,
    currentMessage,
    tokenBuffer,
    error, 
    startStream,
    stopStream,
    reset,
  } = useResearchStream();

  const handleSubmit = useCallback(
    async (prompt: string) => {
      try {
        // Reset streaming state
        reset();
        
        // Criar novo thread
        const newThreadId = await createThread({ userPrompt: prompt });
        onThreadCreated(newThreadId);

        // Iniciar stream de pesquisa
        await startStream(newThreadId);
      } catch (err) {
        console.error("Failed to start research:", err);
      }
    },
    [createThread, onThreadCreated, startStream, reset]
  );

  const isInputDisabled =
    isStreaming ||
    thread?.status === THREAD_STATUS.PLANNING ||
    thread?.status === THREAD_STATUS.SEARCHING ||
    thread?.status === THREAD_STATUS.SYNTHESIZING;

  return (
    <div className="h-full flex flex-col">
      {/* Messages + Streaming */}
      <MessageList
        messages={messages}
        currentNode={currentNode}
        currentMessage={currentMessage}
        tokenBuffer={tokenBuffer}
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
            onStop={stopStream}
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

## ✅ Acceptance Criteria

1. [ ] `useResearchStream` processa eventos `token` para streaming real
2. [ ] `tokenBuffer` acumula tokens do LLM
3. [ ] `StreamingText` mostra cursor piscante durante streaming
4. [ ] `StreamingStatus` mostra progresso com ícone do nó atual
5. [ ] Botão "Stop" aparece durante streaming
6. [ ] Auto-scroll funciona com tokens incrementais
7. [ ] Input desabilitado durante streaming

## 🛑 Stop Conditions

```bash
# 1. Verificar arquivos
for file in "ChatPanel" "ChatInput" "MessageList" "Message" "StreamingText"; do
  test -f "src/components/chat/${file}.tsx" && echo "✅ ${file}.tsx exists" || echo "❌ ${file}.tsx missing"
done

# 2. Verificar hooks
test -f src/hooks/useResearchStream.ts && echo "✅ useResearchStream.ts exists" || echo "❌ missing"
test -f src/lib/types.ts && echo "✅ types.ts exists" || echo "❌ missing"

# 3. Verificar processamento de tokens
grep -q "case \"token\"" src/hooks/useResearchStream.ts && echo "✅ Handles token events" || echo "❌ Missing token handling"
grep -q "tokenBuffer" src/hooks/useResearchStream.ts && echo "✅ Uses tokenBuffer" || echo "❌ Missing tokenBuffer"

# 4. Build check
npm run build 2>&1 | grep -q "error" && echo "❌ Build errors" || echo "✅ Build OK"
```

**Card concluído quando todos os checks passam ✅**

## 📝 Notas

- `tokenBuffer` acumula tokens para mostrar texto sendo "digitado"
- Cursor é um `<span>` com `animate-pulse` em vez de CSS animation
- `StreamingStatus` usa ícones diferentes por nó
- Botão "Stop" permite cancelar o stream via `AbortController`
