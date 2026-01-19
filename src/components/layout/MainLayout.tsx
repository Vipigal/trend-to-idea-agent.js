import type { Id } from "../../../convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { PanelRightOpen, PanelRightClose } from "lucide-react";
import { THREAD_STATUS } from "../../lib/constants";
import { ChatPanel } from "../chat/ChatPanel";

interface MainLayoutProps {
  activeThreadId: Id<"threads"> | null;
  onThreadChange: (threadId: Id<"threads"> | null) => void;
  sidebarOpen: boolean;
  onSidebarToggle: (open: boolean) => void;
}

export function MainLayout({
  activeThreadId,
  onThreadChange,
  sidebarOpen,
  onSidebarToggle,
}: MainLayoutProps) {
  const thread = useQuery(
    api.threads.get,
    activeThreadId ? { threadId: activeThreadId } : "skip"
  );

  const shouldShowSidebar =
    thread?.status === THREAD_STATUS.GENERATING_IDEAS ||
    thread?.status === THREAD_STATUS.COMPLETED;

  return (
    <div className="flex h-full">
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ${
          sidebarOpen && shouldShowSidebar ? "mr-96" : ""
        }`}
      >
        <header className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-gray-900">
              Trend-to-Idea Agent
            </h1>
            {thread && (
              <span className="text-sm text-gray-500 px-2 py-1 bg-gray-100 rounded">
                {thread.status}
              </span>
            )}
          </div>

          {shouldShowSidebar && (
            <button
              onClick={() => onSidebarToggle(!sidebarOpen)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title={sidebarOpen ? "Hide ideas" : "Show ideas"}
            >
              {sidebarOpen ? (
                <PanelRightClose className="w-5 h-5 text-gray-600" />
              ) : (
                <PanelRightOpen className="w-5 h-5 text-gray-600" />
              )}
            </button>
          )}
        </header>

        <main className="flex-1 overflow-hidden">
          <ChatPanel
            threadId={activeThreadId}
            onThreadCreated={onThreadChange}
          />
        </main>
      </div>

      {shouldShowSidebar && (
        <aside
          className={`fixed right-0 top-0 h-full w-96 bg-white border-l border-gray-200 transform transition-transform duration-300 ${
            sidebarOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="h-full flex flex-col">
            <div className="h-14 border-b border-gray-200 flex items-center px-4">
              <h2 className="font-semibold text-gray-900">Content Ideas</h2>
            </div>
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <p>Ideas sidebar will render here (CARD-11)</p>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
