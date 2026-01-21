import type { Id } from "../../../convex/_generated/dataModel";
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
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed right-0 top-0 h-full w-full sm:w-96 bg-white border-l border-gray-200 shadow-xl transform transition-transform duration-300 ease-in-out z-50 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-label="Ideas sidebar"
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg z-10 transition-colors lg:hidden"
          aria-label="Close sidebar"
        >
          <X className="w-5 h-5" />
        </button>

        <IdeasPanel threadId={threadId} />
      </aside>
    </>
  );
}
