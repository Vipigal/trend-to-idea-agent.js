import {
  Loader2,
  Search,
  FileText,
  Brain,
  CheckCircle2,
  AlertCircle,
  Lightbulb,
  Tag,
} from "lucide-react";

interface ResearchPlan {
  keywords: string[];
  timeframe?: string;
}

interface ResearchProgressProps {
  isStreaming: boolean;
  isComplete: boolean;
  currentNode: string | null;
  currentStatus: string | null;
  plan: ResearchPlan | null;
  searchResultsCount: number;
  trendsCount: number;
  tokens: string;
  error: string | null;
}

const nodeIcons: Record<string, React.ReactNode> = {
  plan_research: <Brain className="w-4 h-4" />,
  search: <Search className="w-4 h-4" />,
  synthesize: <FileText className="w-4 h-4" />,
  await_approval: <CheckCircle2 className="w-4 h-4" />,
};

const nodeLabels: Record<string, string> = {
  plan_research: "Planning Research",
  search: "Searching Web",
  synthesize: "Synthesizing Trends",
  await_approval: "Awaiting Approval",
};

export function ResearchProgress({
  isStreaming,
  isComplete,
  currentNode,
  currentStatus,
  plan,
  searchResultsCount,
  trendsCount,
  tokens,
  error,
}: ResearchProgressProps) {
  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5" />
          <span className="font-medium">Research Error</span>
        </div>
        <p className="text-sm text-red-600 mt-1">{error}</p>
      </div>
    );
  }

  if (!isStreaming && !isComplete && !currentNode) {
    return null;
  }

  return (
    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-4">
      {/* Current Step */}
      <div className="flex items-center gap-3">
        {isStreaming ? (
          <div className="relative">
            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full animate-ping" />
          </div>
        ) : isComplete ? (
          <CheckCircle2 className="w-5 h-5 text-green-500" />
        ) : (
          <Loader2 className="w-5 h-5 text-gray-400" />
        )}

        <div className="flex-1">
          <div className="flex items-center gap-2">
            {currentNode && nodeIcons[currentNode]}
            <span className="font-medium text-gray-900">
              {isComplete
                ? "Research Complete"
                : currentNode
                  ? nodeLabels[currentNode] || currentNode
                  : "Starting..."}
            </span>
          </div>
          {currentStatus && !isComplete && (
            <p className="text-sm text-gray-500 mt-0.5">{currentStatus}</p>
          )}
        </div>
      </div>

      {/* Research Plan */}
      {plan && plan.keywords.length > 0 && (
        <div className="pl-8">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-2">
            <Tag className="w-3 h-3" />
            Search Keywords
          </div>
          <div className="flex flex-wrap gap-1.5">
            {plan.keywords.map((keyword, index) => (
              <span
                key={index}
                className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full"
              >
                {keyword}
              </span>
            ))}
          </div>
          {plan.timeframe && (
            <p className="text-xs text-gray-500 mt-1.5">
              Timeframe: {plan.timeframe}
            </p>
          )}
        </div>
      )}

      {/* Search Results */}
      {searchResultsCount > 0 && (
        <div className="pl-8">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Search className="w-3.5 h-3.5" />
            <span>Found {searchResultsCount} sources</span>
          </div>
        </div>
      )}

      {/* Trends Count */}
      {trendsCount > 0 && (
        <div className="pl-8">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Lightbulb className="w-3.5 h-3.5" />
            <span>Identified {trendsCount} trends</span>
          </div>
        </div>
      )}

      {/* Token Stream (thinking) */}
      {tokens && isStreaming && (
        <div className="pl-8">
          <div className="text-xs text-gray-400 mb-1">Thinking...</div>
          <div className="text-sm text-gray-600 bg-white p-2 rounded border border-gray-100 max-h-24 overflow-y-auto font-mono text-xs">
            {tokens.slice(-500)}
            <span className="animate-pulse">|</span>
          </div>
        </div>
      )}

      {/* Progress Steps */}
      {isStreaming && (
        <div className="flex items-center gap-2 pl-8 pt-2 border-t border-gray-200">
          {["plan_research", "search", "synthesize"].map((step, index) => {
            const isCurrentStep = step === currentNode;
            const isPastStep =
              currentNode &&
              ["plan_research", "search", "synthesize"].indexOf(currentNode) >
                index;

            return (
              <div key={step} className="flex items-center">
                <div
                  className={`w-2 h-2 rounded-full transition-colors ${
                    isCurrentStep
                      ? "bg-blue-500 animate-pulse"
                      : isPastStep
                        ? "bg-green-500"
                        : "bg-gray-300"
                  }`}
                />
                {index < 2 && (
                  <div
                    className={`w-8 h-0.5 ${
                      isPastStep ? "bg-green-300" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
