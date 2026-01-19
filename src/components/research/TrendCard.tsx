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
      <div
        className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-medium flex-shrink-0">
            {index + 1}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium text-gray-900 truncate">{title}</h3>
              <span
                className={`px-2 py-0.5 text-xs rounded-full ${confidenceColors[confidence]}`}
              >
                {confidence}
              </span>
            </div>

            <p className="text-sm text-gray-600 line-clamp-2">{summary}</p>
          </div>

          <div className="flex-shrink-0">
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-gray-100 p-4 bg-gray-50">
          <div className="mb-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
              <TrendingUp className="w-4 h-4" />
              Why it matters
            </div>
            <p className="text-sm text-gray-600">{whyItMatters}</p>
          </div>

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
