import { useEffect, useRef } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { PanelRightOpen, PanelRightClose } from "lucide-react";
import { THREAD_STATUS } from "../../lib/constants";
import { ChatPanel } from "../chat/ChatPanel";
import { Sidebar } from "./Sidebar";

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
  const prevStatusRef = useRef<string | undefined>(undefined);

  const shouldShowSidebar =
    thread?.status === THREAD_STATUS.GENERATING_IDEAS ||
    thread?.status === THREAD_STATUS.COMPLETED;

  useEffect(() => {
    if (
      thread?.status === THREAD_STATUS.GENERATING_IDEAS &&
      prevStatusRef.current !== THREAD_STATUS.GENERATING_IDEAS
    ) {
      onSidebarToggle(true);
    }
    prevStatusRef.current = thread?.status;
  }, [thread?.status, onSidebarToggle]);

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

      {shouldShowSidebar && activeThreadId && (
        <Sidebar
          threadId={activeThreadId}
          isOpen={sidebarOpen}
          onClose={() => onSidebarToggle(false)}
        />
      )}
    </div>
  );
}
