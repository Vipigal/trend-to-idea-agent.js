# CARD-11-v3: Sidebar UI + useIdeasStream Hook

## 🎯 Objetivo

Implementar a sidebar de ideias que consome eventos da tabela `streamEvents` via `useQuery` reativo, mostrando ideias conforme são geradas.

## 📋 Dependências

- ✅ CARD-07-v3 (Ideas Action salvando em streamEvents)
- ✅ CARD-08 (Frontend Setup)
- ✅ CARD-10 (HITL UI - já implementado)

## 📋 Contexto

### Arquitetura de Consumo de Eventos

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CONSUMO REATIVO DE IDEIAS                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Convex Backend                    React Frontend                   │
│   ┌─────────────────┐              ┌────────────────────────────┐   │
│   │                 │              │                            │   │
│   │  streamEvents   │◀─useQuery───│  useIdeasStream hook       │   │
│   │  (ideas)        │   (reactive)│                            │   │
│   │                 │              │  ┌────────────────────┐    │   │
│   └─────────────────┘              │  │  IdeasPanel        │    │   │
│                                    │  │  ├── PlatformTabs  │    │   │
│   ┌─────────────────┐              │  │  └── IdeaCard[]    │    │   │
│   │                 │              │  └────────────────────┘    │   │
│   │  ideas          │◀─useQuery───│                            │   │
│   │  (permanente)   │   (backup)  │  Falls back to ideas table │   │
│   │                 │              │  when streaming complete   │   │
│   └─────────────────┘              └────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Diferença entre `streamEvents` e `ideas`

| Table | Propósito | Quando usar |
|-------|-----------|-------------|
| `streamEvents` | Eventos temporários para streaming | Durante geração |
| `ideas` | Dados permanentes | Após geração |

O hook `useIdeasStream` usa ambos:
1. **Durante streaming**: Lê de `streamEvents` para mostrar ideias conforme chegam
2. **Após streaming**: Lê de `ideas` para dados definitivos

---

## 📁 Arquivos a Criar

1. `src/hooks/useIdeasStream.ts` - Hook que consome streamEvents
2. `src/components/ideas/IdeasPanel.tsx` - Container principal
3. `src/components/ideas/IdeaCard.tsx` - Card de ideia individual
4. `src/components/ideas/PlatformTabs.tsx` - Tabs para filtrar por plataforma
5. `src/components/layout/Sidebar.tsx` - Wrapper da sidebar

---

## 💻 Implementação

### 1. Criar src/hooks/useIdeasStream.ts

```typescript
// src/hooks/useIdeasStream.ts
import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Platform, PLATFORMS } from "../lib/constants";

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

interface IdeasStreamState {
  isStreaming: boolean;
  isComplete: boolean;
  currentTrendIndex: number | null;
  currentTrendTitle: string | null;
  currentPlatform: Platform | null;
  ideas: StreamIdea[];
  ideasCount: number;
  error: string | null;
}

/**
 * Hook para consumir o stream de ideias
 * 
 * Usa useQuery para obter atualizações reativas da tabela streamEvents.
 * Quando o streaming termina, faz fallback para a tabela ideas.
 */
export function useIdeasStream(threadId: Id<"threads"> | null) {
  // Buscar eventos de streaming (durante geração)
  const streamEvents = useQuery(
    api.streamEvents.getByThread,
    threadId
      ? { threadId, streamType: "ideas" as const }
      : "skip"
  );

  // Buscar ideias permanentes (fallback após geração)
  const persistedIdeas = useQuery(
    api.ideas.getByThread,
    threadId ? { threadId } : "skip"
  );

  // Buscar trends para mapear trendIndex -> título
  const trends = useQuery(
    api.trends.getByThread,
    threadId ? { threadId } : "skip"
  );

  // Processar estado do stream
  const state = useMemo<IdeasStreamState>(() => {
    const defaultState: IdeasStreamState = {
      isStreaming: false,
      isComplete: false,
      currentTrendIndex: null,
      currentTrendTitle: null,
      currentPlatform: null,
      ideas: [],
      ideasCount: 0,
      error: null,
    };

    if (!streamEvents) {
      // Se não há eventos de stream mas há ideias persistidas, usar essas
      if (persistedIdeas && persistedIdeas.length > 0) {
        const ideas: StreamIdea[] = persistedIdeas.map((idea) => {
          const trend = trends?.find((t) => t._id === idea.trendId);
          return {
            ideaId: idea._id,
            platform: idea.platform as Platform,
            trendIndex: trends?.findIndex((t) => t._id === idea.trendId) || 0,
            trendTitle: trend?.title || "Unknown trend",
            hook: idea.hook,
            format: idea.format,
            angle: idea.angle,
            description: idea.description,
          };
        });

        return {
          ...defaultState,
          isComplete: true,
          ideas,
          ideasCount: ideas.length,
        };
      }

      return defaultState;
    }

    // Processar eventos do stream
    let isStreaming = true;
    let isComplete = false;
    let currentTrendIndex: number | null = null;
    let currentTrendTitle: string | null = null;
    let currentPlatform: Platform | null = null;
    let error: string | null = null;
    const ideas: StreamIdea[] = [];

    for (const event of streamEvents) {
      const data = event.data as Record<string, unknown> | undefined;

      switch (event.eventType) {
        case "node_start":
          if (data?.trendIndex !== undefined) {
            currentTrendIndex = data.trendIndex as number;
            currentTrendTitle = (data.trendTitle as string) || null;
          }
          break;

        case "token":
          if (data?.platform) {
            currentPlatform = data.platform as Platform;
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
          isStreaming = false;
          isComplete = true;
          break;
      }
    }

    return {
      isStreaming,
      isComplete,
      currentTrendIndex,
      currentTrendTitle,
      currentPlatform,
      ideas,
      ideasCount: ideas.length,
      error,
    };
  }, [streamEvents, persistedIdeas, trends]);

  // Helpers para filtrar por plataforma
  const getIdeasByPlatform = (platform: Platform): StreamIdea[] => {
    return state.ideas.filter((idea) => idea.platform === platform);
  };

  const getIdeasCountByPlatform = (platform: Platform): number => {
    return state.ideas.filter((idea) => idea.platform === platform).length;
  };

  return {
    ...state,
    getIdeasByPlatform,
    getIdeasCountByPlatform,
  };
}
```

### 2. Criar src/components/ideas/IdeaCard.tsx

```typescript
// src/components/ideas/IdeaCard.tsx
import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Sparkles,
  Copy,
  Check,
  Lightbulb,
} from "lucide-react";

interface IdeaCardProps {
  hook: string;
  format: string;
  angle: string;
  description: string;
  trendTitle?: string;
  isNew?: boolean;
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

  // Format badge colors
  const formatColors: Record<string, string> = {
    post: "bg-blue-100 text-blue-700",
    thread: "bg-purple-100 text-purple-700",
    video: "bg-red-100 text-red-700",
    carousel: "bg-green-100 text-green-700",
    story: "bg-yellow-100 text-yellow-700",
    reel: "bg-pink-100 text-pink-700",
  };

  return (
    <div
      className={`border border-gray-200 rounded-lg overflow-hidden bg-white transition-all duration-300 ${
        isNew ? "ring-2 ring-blue-300 animate-pulse-once" : ""
      }`}
    >
      {/* Header */}
      <div className="p-3">
        {/* Trend tag */}
        {trendTitle && (
          <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
            <Lightbulb className="w-3 h-3" />
            <span className="truncate">{trendTitle}</span>
          </div>
        )}

        {/* Hook */}
        <p className="font-medium text-gray-900 text-sm leading-snug">
          "{hook}"
        </p>

        {/* Meta */}
        <div className="flex items-center gap-2 mt-2">
          <span
            className={`px-2 py-0.5 text-xs rounded-full ${
              formatColors[format.toLowerCase()] || "bg-gray-100 text-gray-600"
            }`}
          >
            {format}
          </span>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="ml-auto text-gray-400 hover:text-gray-600 p-1 rounded"
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
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                Copy hook & description
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
```

### 3. Criar src/components/ideas/PlatformTabs.tsx

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
        const count = counts[platform] || 0;

        return (
          <button
            key={platform}
            onClick={() => onPlatformChange(platform)}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors relative ${
              isActive
                ? "text-blue-600 border-b-2 border-blue-600 -mb-px bg-blue-50/50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            {platformIcons[platform]}
            <span className="hidden sm:inline">{platformLabels[platform]}</span>

            {/* Count badge */}
            {count > 0 && (
              <span
                className={`px-1.5 py-0.5 text-xs rounded-full min-w-[20px] text-center ${
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
              <span className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            )}
          </button>
        );
      })}
    </div>
  );
}
```

### 4. Criar src/components/ideas/IdeasPanel.tsx

```typescript
// src/components/ideas/IdeasPanel.tsx
import { useState, useEffect, useRef } from "react";
import { Id } from "../../../convex/_generated/dataModel";
import { useIdeasStream } from "../../hooks/useIdeasStream";
import { IdeaCard } from "./IdeaCard";
import { PlatformTabs } from "./PlatformTabs";
import { Platform, PLATFORMS } from "../../lib/constants";
import { Loader2, Sparkles, RefreshCw } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";

interface IdeasPanelProps {
  threadId: Id<"threads">;
}

export function IdeasPanel({ threadId }: IdeasPanelProps) {
  const [activePlatform, setActivePlatform] = useState<Platform>("linkedin");
  const [newIdeaIds, setNewIdeaIds] = useState<Set<string>>(new Set());
  const previousIdeasCount = useRef(0);

  const regenerateIdeas = useMutation(api.actions.ideas.regenerateIdeas);

  const {
    isStreaming,
    isComplete,
    currentPlatform,
    currentTrendTitle,
    ideas,
    ideasCount,
    error,
    getIdeasByPlatform,
    getIdeasCountByPlatform,
  } = useIdeasStream(threadId);

  // Marcar novas ideias para animação
  useEffect(() => {
    if (ideas.length > previousIdeasCount.current) {
      const newIds = new Set<string>();
      for (let i = previousIdeasCount.current; i < ideas.length; i++) {
        // Usar combinação de campos como ID único
        newIds.add(`${ideas[i].platform}-${ideas[i].trendIndex}-${ideas[i].hook.substring(0, 20)}`);
      }
      setNewIdeaIds((prev) => new Set([...prev, ...newIds]));

      // Remover marcação após animação
      setTimeout(() => {
        setNewIdeaIds(new Set());
      }, 2000);
    }
    previousIdeasCount.current = ideas.length;
  }, [ideas.length]);

  // Contar ideias por plataforma
  const counts = PLATFORMS.reduce(
    (acc, platform) => {
      acc[platform] = getIdeasCountByPlatform(platform);
      return acc;
    },
    {} as Record<Platform, number>
  );

  // Ideias da plataforma ativa
  const activeIdeas = getIdeasByPlatform(activePlatform);

  // Handler para regenerar
  const handleRegenerate = async () => {
    try {
      await regenerateIdeas({ threadId });
    } catch (error) {
      console.error("Failed to regenerate ideas:", error);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-500" />
            <h2 className="font-semibold text-gray-900">Content Ideas</h2>
          </div>

          <div className="flex items-center gap-2">
            {isStreaming ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating...</span>
              </div>
            ) : isComplete ? (
              <button
                onClick={handleRegenerate}
                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                title="Generate new ideas"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">Regenerate</span>
              </button>
            ) : null}
          </div>
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
            <p className="font-medium">Error</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        ) : activeIdeas.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            {isStreaming ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin" />
                <p>
                  Generating {activePlatform} ideas...
                </p>
              </div>
            ) : (
              <p>No {activePlatform} ideas yet</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {activeIdeas.map((idea, index) => {
              const uniqueId = `${idea.platform}-${idea.trendIndex}-${idea.hook.substring(0, 20)}`;

              return (
                <IdeaCard
                  key={`${uniqueId}-${index}`}
                  hook={idea.hook}
                  format={idea.format}
                  angle={idea.angle}
                  description={idea.description}
                  trendTitle={idea.trendTitle}
                  isNew={newIdeaIds.has(uniqueId)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <p className="text-xs text-gray-500 text-center">
          {ideasCount > 0
            ? `${ideasCount} ideas across ${PLATFORMS.length} platforms`
            : isStreaming
              ? "Generating ideas..."
              : "No ideas generated yet"}
        </p>
      </div>
    </div>
  );
}
```

### 5. Criar src/components/layout/Sidebar.tsx

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
    <>
      {/* Backdrop for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed right-0 top-0 h-full w-full sm:w-96 bg-white border-l border-gray-200 shadow-lg transform transition-transform duration-300 z-50 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg z-10 transition-colors"
          aria-label="Close sidebar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Ideas Panel */}
        <IdeasPanel threadId={threadId} />
      </aside>
    </>
  );
}
```

### 6. Adicionar CSS de animação

Adicionar ao `src/index.css`:

```css
/* Animação de entrada para novas ideias */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes pulseOnce {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.3);
  }
}

.animate-fadeIn {
  animation: fadeIn 0.3s ease-out forwards;
}

.animate-pulse-once {
  animation: pulseOnce 1s ease-out;
}
```

### 7. Atualizar MainLayout.tsx

Integrar a sidebar no layout principal:

```typescript
// src/components/layout/MainLayout.tsx
// Adicionar import
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

---

## ✅ Acceptance Criteria

1. [ ] `useIdeasStream` consome eventos de `streamEvents` via `useQuery`
2. [ ] Ideias aparecem na UI conforme são geradas
3. [ ] `PlatformTabs` mostra contadores em tempo real
4. [ ] Indicador visual de qual plataforma está gerando
5. [ ] `IdeaCard` tem botão de copiar hook
6. [ ] Animação de entrada para novas ideias
7. [ ] Sidebar é responsiva (mobile friendly)
8. [ ] Botão "Regenerate" funciona

## 🛑 Stop Conditions

```bash
# 1. Verificar arquivos existem
for file in "hooks/useIdeasStream" "components/ideas/IdeasPanel" "components/ideas/IdeaCard" "components/ideas/PlatformTabs" "components/layout/Sidebar"; do
  test -f "src/${file}.tsx" && echo "✅ ${file}.tsx exists" || echo "❌ ${file}.tsx missing"
done

# 2. Verificar uso de useQuery
grep -q "useQuery" src/hooks/useIdeasStream.ts && echo "✅ Uses useQuery" || echo "❌ missing"

# 3. Verificar consumo de streamEvents
grep -q "api.streamEvents.getByThread" src/hooks/useIdeasStream.ts && echo "✅ Consumes streamEvents" || echo "❌ missing"

# 4. Build check
npm run build 2>&1 | grep -q "error" && echo "❌ Build errors" || echo "✅ Build OK"
```

**Card concluído quando todos os checks passam ✅**

---

## 📝 Notas Técnicas

### Por que `useQuery` em vez de SSE?

| Approach | Prós | Contras |
|----------|------|---------|
| SSE | Streaming "puro" | Não funciona em Convex HTTP Actions |
| `useQuery` | Convex-native, reactive | Polling-based (mas Convex otimiza) |

O Convex otimiza o `useQuery` para ser muito eficiente, então a experiência é similar a SSE na prática.

### Fallback para `ideas` table

O hook primeiro tenta ler de `streamEvents`. Se não há eventos (ou streaming já completou), ele usa a tabela `ideas` como fallback. Isso garante que ideias antigas ainda aparecem.

### Animação de Novas Ideias

Usamos um `Set` para rastrear quais ideias são "novas" e aplicamos uma classe CSS temporária. Isso cria o efeito visual de ideias "chegando".

---

## 🔗 Próximo Card

CARD-12-v3: Integration, Docker & Polish
