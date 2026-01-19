import { useState } from "react";
import { MainLayout } from "./components/layout/MainLayout";
import type { Id } from "../convex/_generated/dataModel";

function App() {
  const [activeThreadId, setActiveThreadId] = useState<Id<"threads"> | null>(
    null
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="h-screen bg-gray-50">
      <MainLayout
        activeThreadId={activeThreadId}
        onThreadChange={setActiveThreadId}
        sidebarOpen={sidebarOpen}
        onSidebarToggle={setSidebarOpen}
      />
    </div>
  );
}

export default App;
