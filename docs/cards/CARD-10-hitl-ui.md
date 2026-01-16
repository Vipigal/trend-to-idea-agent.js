# CARD-10: HITL UI Components

## 🎯 Objetivo

Implementar a UI de HITL: exibição de trends com sources, e controles de Approve/Refine/Restart.

## 📋 Dependências

- ✅ CARD-09 (Chat UI)

## 📁 Arquivos a Criar

- `src/components/research/TrendCard.tsx`
- `src/components/research/TrendList.tsx`
- `src/components/research/SourceLink.tsx`
- `src/components/hitl/ApprovalPanel.tsx`
- `src/components/hitl/RefineInput.tsx`

## 💻 Implementação

### src/components/research/SourceLink.tsx

```typescript
// src/components/research/SourceLink.tsx
import { ExternalLink } from "lucide-react";

interface SourceLinkProps {
  url: string;
  title: string;
  snippet?: string;
  publishedAt?: string;
}

export function SourceLink({ url, title, snippet, publishedAt }: SourceLinkProps) {
  // Extract domain from URL
  const domain = new URL(url).hostname.replace("www.", "");

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block p-2 rounded-lg hover:bg-gray-50 transition-colors group"
    >
      <div className="flex items-start gap-2">
        <ExternalLink className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0 group-hover:text-blue-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-700 truncate group-hover:text-blue-600">
            {title}
          </p>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{domain}</span>
            {publishedAt && (
              <>
                <span>•</span>
                <span>{new Date(publishedAt).toLocaleDateString()}</span>
              </>
            )}
          </div>
          {snippet && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{snippet}</p>
          )}
        </div>
      </div>
    </a>
  );
}
```

### src/components/research/TrendCard.tsx

```typescript
// src/components/research/TrendCard.tsx
import { ChevronDown, ChevronUp, TrendingUp } from "lucide-react";
import { useState } from "react";
import { SourceLink } from "./SourceLink";

interface Source {
  url: string;
  title: string;
  snippet?: string;
  publishedAt?: string;
}

interface TrendCardProps {
  title: string;
  summary: string;
  whyItMatters: string;
  confidence: "high" | "medium" | "low";
  sources: Source[];
  index: number;
}

const confidenceColors = {
  high: "bg-green-100 text-green-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-gray-100 text-gray-700",
};

export function TrendCard({
  title,
  summary,
  whyItMatters,
  confidence,
  sources,
  index,
}: TrendCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* Header */}
      <div
        className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start gap-3">
          {/* Index */}
          <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-medium flex-shrink-0">
            {index + 1}
          </div>

          <div className="flex-1 min-w-0">
            {/* Title + Confidence */}
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium text-gray-900 truncate">{title}</h3>
              <span
                className={`px-2 py-0.5 text-xs rounded-full ${confidenceColors[confidence]}`}
              >
                {confidence}
              </span>
            </div>

            {/* Summary */}
            <p className="text-sm text-gray-600 line-clamp-2">{summary}</p>
          </div>

          {/* Expand icon */}
          <div className="flex-shrink-0">
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-gray-100 p-4 bg-gray-50">
          {/* Why it matters */}
          <div className="mb-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
              <TrendingUp className="w-4 h-4" />
              Why it matters
            </div>
            <p className="text-sm text-gray-600">{whyItMatters}</p>
          </div>

          {/* Sources */}
          <div>
            <div className="text-sm font-medium text-gray-700 mb-2">
              Sources ({sources.length})
            </div>
            <div className="space-y-1">
              {sources.map((source, i) => (
                <SourceLink key={i} {...source} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

### src/components/research/TrendList.tsx

```typescript
// src/components/research/TrendList.tsx
import { TrendCard } from "./TrendCard";
import { Doc } from "../../../convex/_generated/dataModel";

interface TrendListProps {
  trends: Doc<"trends">[];
}

export function TrendList({ trends }: TrendListProps) {
  if (trends.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No trends found yet
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {trends.map((trend, index) => (
        <TrendCard
          key={trend._id}
          index={index}
          title={trend.title}
          summary={trend.summary}
          whyItMatters={trend.whyItMatters}
          confidence={trend.confidence}
          sources={trend.sources}
        />
      ))}
    </div>
  );
}
```

### src/components/hitl/RefineInput.tsx

```typescript
// src/components/hitl/RefineInput.tsx
import { useState } from "react";
import { Send, X } from "lucide-react";

interface RefineInputProps {
  onSubmit: (feedback: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function RefineInput({ onSubmit, onCancel, isLoading }: RefineInputProps) {
  const [feedback, setFeedback] = useState("");

  const handleSubmit = () => {
    if (feedback.trim()) {
      onSubmit(feedback.trim());
    }
  };

  return (
    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
      <label className="block text-sm font-medium text-yellow-800 mb-2">
        How should we refine the research?
      </label>
      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="e.g., Focus more on B2B trends, exclude crypto-related topics, look at US market specifically..."
        className="w-full px-3 py-2 border border-yellow-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-none"
        rows={3}
        disabled={isLoading}
      />
      <div className="flex justify-end gap-2 mt-3">
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
        >
          <X className="w-4 h-4 inline mr-1" />
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!feedback.trim() || isLoading}
          className="px-3 py-1.5 text-sm bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50"
        >
          <Send className="w-4 h-4 inline mr-1" />
          Refine
        </button>
      </div>
    </div>
  );
}
```

### src/components/hitl/ApprovalPanel.tsx

```typescript
// src/components/hitl/ApprovalPanel.tsx
import { useState } from "react";
import { Check, Edit3, RotateCcw, Loader2 } from "lucide-react";
import { Id } from "../../../convex/_generated/dataModel";
import { TrendList } from "../research/TrendList";
import { RefineInput } from "./RefineInput";
import { useThread } from "../../hooks/useThread";

interface ApprovalPanelProps {
  threadId: Id<"threads">;
  onApproved: () => void;
}

export function ApprovalPanel({ threadId, onApproved }: ApprovalPanelProps) {
  const { trends, approve, refine, restart } = useThread(threadId);
  const [isRefining, setIsRefining] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleApprove = async () => {
    setIsLoading(true);
    try {
      await approve({ threadId });
      onApproved();
    } catch (error) {
      console.error("Failed to approve:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefine = async (feedback: string) => {
    setIsLoading(true);
    try {
      await refine({ threadId, feedback });
      setIsRefining(false);
    } catch (error) {
      console.error("Failed to refine:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestart = async () => {
    if (!confirm("This will clear all research results. Continue?")) return;
    
    setIsLoading(true);
    try {
      await restart({ threadId });
    } catch (error) {
      console.error("Failed to restart:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Research Results
        </h2>
        <span className="text-sm text-gray-500">
          {trends.length} trends found
        </span>
      </div>

      {/* Trends list */}
      <TrendList trends={trends} />

      {/* Refine input (conditional) */}
      {isRefining && (
        <RefineInput
          onSubmit={handleRefine}
          onCancel={() => setIsRefining(false)}
          isLoading={isLoading}
        />
      )}

      {/* Action buttons */}
      {!isRefining && (
        <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t border-gray-200">
          <button
            onClick={handleApprove}
            disabled={isLoading || trends.length === 0}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Approve & Generate Ideas
          </button>

          <button
            onClick={() => setIsRefining(true)}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50 font-medium"
          >
            <Edit3 className="w-4 h-4" />
            Refine
          </button>

          <button
            onClick={handleRestart}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-500 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 font-medium"
          >
            <RotateCcw className="w-4 h-4" />
            Restart
          </button>
        </div>
      )}
    </div>
  );
}
```

### Integrar ApprovalPanel no ChatPanel

Atualizar `src/components/chat/ChatPanel.tsx`:

```typescript
// Adicionar import
import { ApprovalPanel } from "../hitl/ApprovalPanel";
import { THREAD_STATUS } from "../../lib/constants";

// Dentro do ChatPanel, antes do return:
const showApproval = thread?.status === THREAD_STATUS.AWAITING_APPROVAL;

// No JSX, após MessageList e antes do error display:
{showApproval && threadId && (
  <ApprovalPanel
    threadId={threadId}
    onApproved={() => {
      // Will trigger ideas generation
      // Sidebar will auto-open via MainLayout
    }}
  />
)}
```

## ✅ Acceptance Criteria

1. [ ] TrendCard mostra título, summary, confidence badge
2. [ ] TrendCard expande para mostrar whyItMatters e sources
3. [ ] SourceLink abre em nova aba com URL real
4. [ ] ApprovalPanel mostra 3 botões: Approve, Refine, Restart
5. [ ] RefineInput aparece ao clicar Refine
6. [ ] Approve chama mutation e triggers ideas generation
7. [ ] Refine envia feedback e reinicia pesquisa
8. [ ] Restart limpa tudo e permite nova pesquisa
9. [ ] Loading states em todos os botões

## 🛑 Stop Conditions

```bash
# 1. Verificar arquivos
for file in "research/TrendCard" "research/TrendList" "research/SourceLink" "hitl/ApprovalPanel" "hitl/RefineInput"; do
  test -f "src/components/${file}.tsx" && echo "✅ ${file}.tsx exists" || echo "❌ ${file}.tsx missing"
done

# 2. Verificar ApprovalPanel tem 3 botões
grep -c "onClick=" src/components/hitl/ApprovalPanel.tsx | xargs -I {} test {} -ge 3 && echo "✅ 3+ click handlers" || echo "❌ Missing click handlers"

# 3. Verificar mutations usadas
grep -q "approve" src/components/hitl/ApprovalPanel.tsx && echo "✅ approve mutation used" || echo "❌ approve missing"
grep -q "refine" src/components/hitl/ApprovalPanel.tsx && echo "✅ refine mutation used" || echo "❌ refine missing"
grep -q "restart" src/components/hitl/ApprovalPanel.tsx && echo "✅ restart mutation used" || echo "❌ restart missing"

# 4. Build check
npm run build 2>&1 | grep -q "error" && echo "❌ Build errors" || echo "✅ Build OK"
```

**Card concluído quando todos os checks passam ✅**

## 📝 Notas

- TrendCard usa estado local para expandir/colapsar
- SourceLink extrai domínio da URL para display limpo
- RefineInput usa textarea para feedback mais longo
- Confirm dialog antes de restart (ação destrutiva)
- Loading state compartilhado para todas as ações
