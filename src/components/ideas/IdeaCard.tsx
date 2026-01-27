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
  trendTitles?: string[];
  isNew?: boolean;
}

const formatColors: Record<string, string> = {
  post: "bg-blue-100 text-blue-700",
  thread: "bg-purple-100 text-purple-700",
  video: "bg-red-100 text-red-700",
  carousel: "bg-green-100 text-green-700",
  story: "bg-yellow-100 text-yellow-700",
  reel: "bg-pink-100 text-pink-700",
  script: "bg-orange-100 text-orange-700",
};

export function IdeaCard({
  hook,
  format,
  angle,
  description,
  trendTitles,
  isNew = false,
}: IdeaCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = `${hook}\n\n${description}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatColorClass =
    formatColors[format.toLowerCase()] || "bg-gray-100 text-gray-600";

  return (
    <div
      className={`border border-gray-200 rounded-lg overflow-hidden bg-white transition-all duration-300 hover:border-gray-300 ${
        isNew ? "ring-2 ring-blue-400 animate-pulse-once" : ""
      }`}
    >
      <div
        className="p-3 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {trendTitles && trendTitles.length > 0 && (
          <div className="flex items-start gap-1.5 text-xs text-gray-500 mb-2">
            <Lightbulb className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <div className="flex flex-wrap gap-1">
              {trendTitles.map((title, i) => (
                <span
                  key={i}
                  className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600"
                >
                  {title}
                </span>
              ))}
            </div>
          </div>
        )}

        <p className="font-medium text-gray-900 text-sm leading-snug">
          "{hook}"
        </p>

        <div className="flex items-center gap-2 mt-2">
          <span
            className={`px-2 py-0.5 text-xs rounded-full font-medium ${formatColorClass}`}
          >
            {format}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="ml-auto text-gray-400 hover:text-gray-600 p-1 rounded transition-colors"
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-gray-100 p-3 bg-gray-50 space-y-3 animate-fadeIn">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1">
              <Sparkles className="w-3 h-3" />
              Why this works
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">{angle}</p>
          </div>

          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">
              Content outline
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">
              {description}
            </p>
          </div>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 transition-colors font-medium"
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
