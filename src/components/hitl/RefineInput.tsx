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
