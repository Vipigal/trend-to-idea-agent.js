import { useState } from "react";
import { Check, Edit3, RotateCcw, Loader2 } from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";
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
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Research Results
        </h2>
        <span className="text-sm text-gray-500">
          {trends.length} trends found
        </span>
      </div>

      <TrendList trends={trends} />

      {isRefining && (
        <RefineInput
          onSubmit={handleRefine}
          onCancel={() => setIsRefining(false)}
          isLoading={isLoading}
        />
      )}

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
