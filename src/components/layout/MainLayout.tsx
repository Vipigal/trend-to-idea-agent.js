import type { Id } from "../../../convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { PanelRightOpen, PanelRightClose } from "lucide-react";
import { THREAD_STATUS } from "../../lib/constants";

interface MainLayoutProps {
  activeThreadId: Id<"threads"> | null;
  onThreadChange: (threadId: Id<"threads"> | null) => void;
  sidebarOpen: boolean;
  onSidebarToggle: (open: boolean) => void;
}

export function MainLayout({
  activeThreadId,
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
          {activeThreadId ? (
            <div className="h-full flex items-center justify-center text-gray-400">
              <p>Chat panel will render here (CARD-09)</p>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">
              <div className="text-center">
                <p className="text-xl mb-2">Welcome to Trend-to-Idea Agent</p>
                <p className="text-sm">
                  Enter a topic to research trending content
                </p>
              </div>
            </div>
          )}
        </main>

        <footer className="border-t border-gray-200 bg-white p-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="What trends would you like to research?"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled
              />
              <button
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                disabled
              >
                Research
              </button>
            </div>
          </div>
        </footer>
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
