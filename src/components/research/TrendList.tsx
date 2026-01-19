import { TrendCard } from "./TrendCard";
import type { Doc } from "../../../convex/_generated/dataModel";

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
