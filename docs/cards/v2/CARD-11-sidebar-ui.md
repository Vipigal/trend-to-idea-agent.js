# CARD-11: Ideas Sidebar UI (REVISADO)

## 📝 Mudanças para Streaming Real

### O que mudou
- `useIdeasStream` processa eventos do endpoint `/api/streamIdeas`
- Cada ideia aparece na UI assim que é gerada
- Consistente com padrão de eventos do CARD-07 revisado
- Tabs de plataforma com contadores em tempo real

---

## 🎯 Objetivo

Implementar a sidebar de ideias que streama conteúdo **separadamente** do chat principal, demonstrando o requisito de "sub-agent em superfície UI diferente".

## 📋 Dependências

- ✅ CARD-07 (Ideas Action & HTTP)
- ✅ CARD-08 (Frontend Setup)
- ✅ CARD-10 (HITL UI)

## 📁 Arquivos a Criar

- `src/hooks/useIdeasStream.ts`
- `src/components/ideas/IdeasPanel.tsx`
- `src/components/ideas/IdeaCard.tsx`
- `src/components/ideas/PlatformTabs.tsx`
- `src/components/layout/Sidebar.tsx`

## 💻 Implementação

### src/hooks/useIdeasStream.ts

```typescript
// src/hooks/useIdeasStream.ts
import { useState, useCallback, useRef } from "react";
import { Id } from "../../convex/_generated/dataModel";
import { API_ENDPOINTS, Platform } from "../lib/constants";

interface Idea {
  platform: Platform;
  trendIndex: number;
  trendTitle?: string;
  hook: string;
  format: string;
  angle: string;
  description: string;
}

interface IdeasStreamState {
  isStreaming: boolean;
  currentPlatform: Platform | null;
  currentTrendIndex: number | null;
  currentTrendTitle: string | null;
  ideas: Idea[];
  ideasCount: number;
  error: string | null;
}

const initialState: IdeasStreamState = {
  isStreaming: false,
  currentPlatform: null,
  currentTrendIndex: null,
  currentTrendTitle: null,
  ideas: [],
  ideasCount: 0,
  error: null,
};

export function useIdeasStream() {
  const [state, setState] = useState<IdeasStreamState>(initialState);
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
      const response = await fetch(API_ENDPOINTS.streamIdeas, {
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
              const event = JSON.parse(line.slice(6));

              setState((prev) => {
                const newState = { ...prev };

                switch (event.type) {
                  // ─────────────────────────────────────────
                  // Início do processamento de uma trend
                  // ─────────────────────────────────────────
                  case "node_start":
                    newState.currentTrendIndex = event.trendIndex ?? null;
                    newState.currentTrendTitle = event.trendTitle ?? null;
                    break;

                  // ─────────────────────────────────────────
                  // LLM começou a gerar para uma plataforma
                  // ─────────────────────────────────────────
                  case "llm_start":
                    newState.currentPlatform = event.platform || null;
                    break;

                  // ─────────────────────────────────────────
                  // LLM terminou para uma plataforma
                  // ─────────────────────────────────────────
                  case "llm_end":
                    // Aguardando ideias
                    break;

                  // ─────────────────────────────────────────
                  // Nova ideia gerada
                  // ─────────────────────────────────────────
                  case "idea":
                    if (event.idea) {
                      newState.ideas = [...prev.ideas, event.idea];
                      newState.ideasCount = event.ideasCount || prev.ideasCount + 1;
                    }
                    break;

                  // ─────────────────────────────────────────
                  // Completo
                  // ─────────────────────────────────────────
                  case "complete":
                    newState.ideasCount = event.ideasCount || newState.ideas.length;
                    break;

                  // ─────────────────────────────────────────
                  // Erro
                  // ─────────────────────────────────────────
                  case "error":
                    newState.error = event.message || "Unknown error";
                    break;

                  // ─────────────────────────────────────────
                  // Fim
                  // ─────────────────────────────────────────
                  case "done":
                    newState.isStreaming = false;
                    newState.currentPlatform = null;
                    newState.currentTrendIndex = null;
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

  // Helpers
  const getIdeasByPlatform = useCallback(
    (platform: Platform) => state.ideas.filter((i) => i.platform === platform),
    [state.ideas]
  );

  const getIdeasCountByPlatform = useCallback(
    (platform: Platform) => state.ideas.filter((i) => i.platform === platform).length,
    [state.ideas]
  );

  return {
    ...state,
    startStream,
    stopStream,
    reset,
    getIdeasByPlatform,
    getIdeasCountByPlatform,
  };
}
```

### src/components/ideas/IdeaCard.tsx

```typescript
// src/components/ideas/IdeaCard.tsx
import { useState } from "react";
import { ChevronDown, ChevronUp, Sparkles, Copy, Check } from "lucide-react";

interface IdeaCardProps {
  hook: string;
  format: string;
  angle: string;
  description: string;
  trendTitle?: string;
  isNew?: boolean; // Para animação de entrada
}

export function IdeaCard({
  hook,
  format,
  angle,
  description,
  trendTitle,
  isNew = false,
}: IdeaCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = `${hook}\n\n${description}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`border border-gray-200 rounded-lg overflow-hidden bg-white transition-all duration-300 ${
        isNew ? "animate-fadeIn ring-2 ring-blue-200" : ""
      }`}
    >
      {/* Header */}
      <div className="p-3">
        {/* Trend tag */}
        {trendTitle && (
          <div className="text-xs text-gray-500 mb-1 truncate">
            From: {trendTitle}
          </div>
        )}

        {/* Hook */}
        <p className="font-medium text-gray-900 text-sm leading-snug">
          "{hook}"
        </p>

        {/* Meta */}
        <div className="flex items-center gap-2 mt-2">
          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
            {format}
          </span>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="ml-auto text-gray-400 hover:text-gray-600 p-1"
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-gray-100 p-3 bg-gray-50 space-y-3">
          {/* Angle */}
          <div>
            <div className="flex items-center gap-1 text-xs font-medium text-gray-500 mb-1">
              <Sparkles className="w-3 h-3" />
              Why this works
            </div>
            <p className="text-sm text-gray-700">{angle}</p>
          </div>

          {/* Description */}
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">
              Content outline
            </div>
            <p className="text-sm text-gray-700">{description}</p>
          </div>

          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                Copy hook
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
```

### src/components/ideas/PlatformTabs.tsx

```typescript
// src/components/ideas/PlatformTabs.tsx
import { Platform, PLATFORMS } from "../../lib/constants";
import { Linkedin, Twitter, Video } from "lucide-react";

interface PlatformTabsProps {
  activePlatform: Platform;
  onPlatformChange: (platform: Platform) => void;
  counts: Record<Platform, number>;
  isStreaming?: boolean;
  currentPlatform?: Platform | null;
}

const platformIcons: Record<Platform, React.ReactNode> = {
  linkedin: <Linkedin className="w-4 h-4" />,
  twitter: <Twitter className="w-4 h-4" />,
  tiktok: <Video className="w-4 h-4" />,
};

const platformLabels: Record<Platform, string> = {
  linkedin: "LinkedIn",
  twitter: "Twitter/X",
  tiktok: "TikTok",
};

export function PlatformTabs({
  activePlatform,
  onPlatformChange,
  counts,
  isStreaming = false,
  currentPlatform = null,
}: PlatformTabsProps) {
  return (
    <div className="flex border-b border-gray-200">
      {PLATFORMS.map((platform) => {
        const isActive = platform === activePlatform;
        const isGenerating = isStreaming && platform === currentPlatform;
        const count = counts[platform];

        return (
          <button
            key={platform}
            onClick={() => onPlatformChange(platform)}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors relative ${
              isActive
                ? "text-blue-600 border-b-2 border-blue-600 -mb-px"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {platformIcons[platform]}
            <span className="hidden sm:inline">{platformLabels[platform]}</span>
            
            {/* Count badge */}
            {count > 0 && (
              <span
                className={`px-1.5 py-0.5 text-xs rounded-full ${
                  isActive
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {count}
              </span>
            )}

            {/* Generating indicator */}
            {isGenerating && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            )}
          </button>
        );
      })}
    </div>
  );
}
```

### src/components/ideas/IdeasPanel.tsx

```typescript
// src/components/ideas/IdeasPanel.tsx
import { useState, useEffect, useRef } from "react";
import { Id } from "../../../convex/_generated/dataModel";
import { useIdeasStream } from "../../hooks/useIdeasStream";
import { IdeaCard } from "./IdeaCard";
import { PlatformTabs } from "./PlatformTabs";
import { Platform, PLATFORMS } from "../../lib/constants";
import { Loader2, Sparkles } from "lucide-react";

interface IdeasPanelProps {
  threadId: Id<"threads">;
  onClose?: () => void;
}

export function IdeasPanel({ threadId, onClose }: IdeasPanelProps) {
  const [activePlatform, setActivePlatform] = useState<Platform>("linkedin");
  const [newIdeaIds, setNewIdeaIds] = useState<Set<number>>(new Set());
  const previousIdeasCount = useRef(0);

  const {
    isStreaming,
    currentPlatform,
    currentTrendTitle,
    ideas,
    ideasCount,
    error,
    startStream,
    getIdeasByPlatform,
    getIdeasCountByPlatform,
  } = useIdeasStream();

  // Iniciar stream quando o componente montar
  useEffect(() => {
    startStream(threadId);
  }, [threadId, startStream]);

  // Marcar novas ideias para animação
  useEffect(() => {
    if (ideas.length > previousIdeasCount.current) {
      const newIds = new Set<number>();
      for (let i = previousIdeasCount.current; i < ideas.length; i++) {
        newIds.add(i);
      }
      setNewIdeaIds(newIds);
      
      // Remover marcação após animação
      setTimeout(() => {
        setNewIdeaIds(new Set());
      }, 1000);
    }
    previousIdeasCount.current = ideas.length;
  }, [ideas.length]);

  // Contar ideias por plataforma
  const counts = PLATFORMS.reduce((acc, platform) => {
    acc[platform] = getIdeasCountByPlatform(platform);
    return acc;
  }, {} as Record<Platform, number>);

  // Ideias da plataforma ativa
  const activeIdeas = getIdeasByPlatform(activePlatform);

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-500" />
            <h2 className="font-semibold text-gray-900">Content Ideas</h2>
          </div>
          
          {isStreaming && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Generating...</span>
            </div>
          )}
        </div>

        {/* Current status */}
        {isStreaming && currentTrendTitle && (
          <p className="text-xs text-gray-500 mt-1 truncate">
            Processing: {currentTrendTitle}
          </p>
        )}
      </div>

      {/* Platform tabs */}
      <PlatformTabs
        activePlatform={activePlatform}
        onPlatformChange={setActivePlatform}
        counts={counts}
        isStreaming={isStreaming}
        currentPlatform={currentPlatform}
      />

      {/* Ideas list */}
      <div className="flex-1 overflow-y-auto p-4">
        {error ? (
          <div className="text-center py-8 text-red-500">
            Error: {error}
          </div>
        ) : activeIdeas.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            {isStreaming ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin" />
                <p>Generating {activePlatform} ideas...</p>
              </div>
            ) : (
              <p>No {activePlatform} ideas yet</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {activeIdeas.map((idea, index) => {
              // Encontrar índice global para marcar como novo
              const globalIndex = ideas.findIndex(
                (i) =>
                  i.platform === idea.platform &&
                  i.hook === idea.hook &&
                  i.trendIndex === idea.trendIndex
              );

              return (
                <IdeaCard
                  key={`${idea.platform}-${idea.trendIndex}-${index}`}
                  hook={idea.hook}
                  format={idea.format}
                  angle={idea.angle}
                  description={idea.description}
                  trendTitle={idea.trendTitle}
                  isNew={newIdeaIds.has(globalIndex)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <p className="text-xs text-gray-500 text-center">
          {ideasCount} ideas generated across {PLATFORMS.length} platforms
        </p>
      </div>
    </div>
  );
}
```

### src/components/layout/Sidebar.tsx

```typescript
// src/components/layout/Sidebar.tsx
import { Id } from "../../../convex/_generated/dataModel";
import { IdeasPanel } from "../ideas/IdeasPanel";
import { X } from "lucide-react";

interface SidebarProps {
  threadId: Id<"threads">;
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ threadId, isOpen, onClose }: SidebarProps) {
  return (
    <aside
      className={`fixed right-0 top-0 h-full w-96 bg-white border-l border-gray-200 shadow-lg transform transition-transform duration-300 z-50 ${
        isOpen ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 z-10"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Ideas Panel */}
      <IdeasPanel threadId={threadId} onClose={onClose} />
    </aside>
  );
}
```

### Adicionar CSS de animação

Adicionar no `src/index.css`:

```css
/* Animação de entrada para novas ideias */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fadeIn {
  animation: fadeIn 0.3s ease-out forwards;
}
```

### Atualizar MainLayout.tsx

```typescript
// Em src/components/layout/MainLayout.tsx
import { Sidebar } from "./Sidebar";

// No JSX, substituir o placeholder da sidebar:
{shouldShowSidebar && activeThreadId && (
  <Sidebar
    threadId={activeThreadId}
    isOpen={sidebarOpen}
    onClose={() => onSidebarToggle(false)}
  />
)}
```

## ✅ Acceptance Criteria

1. [ ] `useIdeasStream` processa eventos do `/api/streamIdeas`
2. [ ] Cada ideia aparece na UI assim que é gerada
3. [ ] PlatformTabs mostra contadores em tempo real
4. [ ] Indicador visual de qual plataforma está gerando
5. [ ] IdeaCard tem botão de copiar hook
6. [ ] Animação de entrada para novas ideias
7. [ ] Sidebar é componente separado do chat

## 🛑 Stop Conditions

```bash
# 1. Verificar arquivos
for file in "IdeasPanel" "IdeaCard" "PlatformTabs"; do
  test -f "src/components/ideas/${file}.tsx" && echo "✅ ${file}.tsx exists" || echo "❌ ${file}.tsx missing"
done

test -f src/hooks/useIdeasStream.ts && echo "✅ useIdeasStream.ts exists" || echo "❌ missing"
test -f src/components/layout/Sidebar.tsx && echo "✅ Sidebar.tsx exists" || echo "❌ missing"

# 2. Verificar processamento de eventos
grep -q "case \"idea\"" src/hooks/useIdeasStream.ts && echo "✅ Handles idea events" || echo "❌ Missing idea handling"
grep -q "streamIdeas" src/hooks/useIdeasStream.ts && echo "✅ Uses streamIdeas endpoint" || echo "❌ Wrong endpoint"

# 3. Build check
npm run build 2>&1 | grep -q "error" && echo "❌ Build errors" || echo "✅ Build OK"
```

**Card concluído quando todos os checks passam ✅**

## 📝 Notas

- Sidebar usa `position: fixed` e `z-50` para ficar sobre o conteúdo
- Animação de entrada usa `ring-2 ring-blue-200` para highlight temporário
- Tabs mostram dot pulsante quando gerando para aquela plataforma
- Copy button usa Clipboard API para copiar hook
