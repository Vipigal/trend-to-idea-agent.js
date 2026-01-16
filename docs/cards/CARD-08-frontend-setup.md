# CARD-08: Frontend Setup

## 🎯 Objetivo

Configurar o frontend React com Convex provider, TailwindCSS, e layout base (chat + sidebar).

## 📋 Dependências

- ✅ CARD-01 a CARD-07 (Backend completo)

## 📁 Arquivos a Criar/Modificar

- `src/main.tsx`
- `src/App.tsx`
- `src/lib/convex.ts`
- `src/lib/constants.ts`
- `src/components/layout/MainLayout.tsx`
- `tailwind.config.js`
- `src/index.css`

## 📦 Packages a Instalar

```bash
npm install tailwindcss postcss autoprefixer lucide-react
npx tailwindcss init -p
```

## 💻 Implementação

### tailwind.config.js

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Gallium brand colors (optional)
        gallium: {
          50: '#f0f9ff',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
        },
      },
    },
  },
  plugins: [],
};
```

### src/index.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Custom scrollbar */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
}

::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: #555;
}

/* Streaming text animation */
@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.cursor-blink::after {
  content: '▋';
  animation: blink 1s infinite;
  color: #0ea5e9;
}
```

### src/lib/constants.ts

```typescript
// src/lib/constants.ts

// Convex URLs
export const CONVEX_URL = import.meta.env.VITE_CONVEX_URL || "http://localhost:3210";
export const CONVEX_SITE_URL = import.meta.env.VITE_CONVEX_SITE_URL || "http://localhost:3211";

// API Endpoints
export const API_ENDPOINTS = {
  streamResearch: `${CONVEX_SITE_URL}/api/streamResearch`,
  streamIdeas: `${CONVEX_SITE_URL}/api/streamIdeas`,
  researchStatus: `${CONVEX_SITE_URL}/api/researchStatus`,
  ideas: `${CONVEX_SITE_URL}/api/ideas`,
};

// Platforms
export const PLATFORMS = ["linkedin", "twitter", "tiktok"] as const;
export type Platform = typeof PLATFORMS[number];

// Thread statuses
export const THREAD_STATUS = {
  IDLE: "idle",
  PLANNING: "planning",
  SEARCHING: "searching",
  SYNTHESIZING: "synthesizing",
  AWAITING_APPROVAL: "awaiting_approval",
  GENERATING_IDEAS: "generating_ideas",
  COMPLETED: "completed",
  ERROR: "error",
} as const;

export type ThreadStatus = typeof THREAD_STATUS[keyof typeof THREAD_STATUS];
```

### src/lib/convex.ts

```typescript
// src/lib/convex.ts
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { CONVEX_URL } from "./constants";

export const convex = new ConvexReactClient(CONVEX_URL);

export { ConvexProvider };
```

### src/main.tsx

```typescript
// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider } from "convex/react";
import { convex } from "./lib/convex";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexProvider client={convex}>
      <App />
    </ConvexProvider>
  </React.StrictMode>
);
```

### src/App.tsx

```typescript
// src/App.tsx
import { useState } from "react";
import { MainLayout } from "./components/layout/MainLayout";
import { Id } from "../convex/_generated/dataModel";

function App() {
  const [activeThreadId, setActiveThreadId] = useState<Id<"threads"> | null>(null);
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
```

### src/components/layout/MainLayout.tsx

```typescript
// src/components/layout/MainLayout.tsx
import { Id } from "../../../convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { PanelRightOpen, PanelRightClose } from "lucide-react";

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
  // Get thread data if we have an active thread
  const thread = useQuery(
    api.threads.get,
    activeThreadId ? { threadId: activeThreadId } : "skip"
  );

  // Show sidebar when generating ideas or completed
  const shouldShowSidebar =
    thread?.status === "generating_ideas" || thread?.status === "completed";

  return (
    <div className="flex h-full">
      {/* Main Chat Panel */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ${
          sidebarOpen && shouldShowSidebar ? "mr-96" : ""
        }`}
      >
        {/* Header */}
        <header className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-gray-900">
              Trend-to-Idea Agent
            </h1>
            {thread && (
              <span className="text-sm text-gray-500">
                Status: {thread.status}
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

        {/* Chat Content Area */}
        <main className="flex-1 overflow-hidden">
          {/* Placeholder - will be replaced by ChatPanel in CARD-09 */}
          <div className="h-full flex items-center justify-center text-gray-400">
            {activeThreadId ? (
              <p>Chat panel will render here (CARD-09)</p>
            ) : (
              <div className="text-center">
                <p className="text-xl mb-2">Welcome to Trend-to-Idea Agent</p>
                <p className="text-sm">
                  Enter a topic to research trending content
                </p>
              </div>
            )}
          </div>
        </main>

        {/* Input Area */}
        <footer className="border-t border-gray-200 bg-white p-4">
          {/* Placeholder - will be replaced by ChatInput in CARD-09 */}
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

      {/* Ideas Sidebar */}
      {shouldShowSidebar && (
        <aside
          className={`fixed right-0 top-0 h-full w-96 bg-white border-l border-gray-200 transform transition-transform duration-300 ${
            sidebarOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {/* Placeholder - will be replaced by IdeasPanel in CARD-11 */}
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
```

## ✅ Acceptance Criteria

1. [ ] TailwindCSS configurado e funcionando
2. [ ] Convex provider wrapping toda a aplicação
3. [ ] Layout com área de chat e sidebar (pode estar oculta)
4. [ ] Sidebar aparece quando thread status é `generating_ideas` ou `completed`
5. [ ] Toggle button para abrir/fechar sidebar
6. [ ] Constants exportadas para URLs e tipos

## 🛑 Stop Conditions

```bash
# 1. Verificar arquivos existem
for file in "src/main.tsx" "src/App.tsx" "src/lib/convex.ts" "src/lib/constants.ts" "src/components/layout/MainLayout.tsx" "tailwind.config.js" "src/index.css"; do
  test -f "$file" && echo "✅ $file exists" || echo "❌ $file missing"
done

# 2. Verificar que Tailwind está configurado
grep -q "@tailwind base" src/index.css && echo "✅ Tailwind directives present" || echo "❌ Tailwind directives missing"

# 3. Verificar ConvexProvider
grep -q "ConvexProvider" src/main.tsx && echo "✅ ConvexProvider in main.tsx" || echo "❌ ConvexProvider missing"

# 4. Verificar que app compila
npm run build 2>&1 | grep -q "error" && echo "❌ Build errors" || echo "✅ Build OK"

# 5. Verificar dev server roda
timeout 10 npm run dev &
sleep 5
curl -s http://localhost:5173 | grep -q "root" && echo "✅ Dev server running" || echo "❌ Dev server failed"
kill %1 2>/dev/null
```

**Card concluído quando todos os checks passam ✅**

## 📝 Notas

- Layout usa Flexbox para posicionamento
- Sidebar tem `position: fixed` para ficar sobre o conteúdo
- Transições CSS para animação suave
- Placeholders serão substituídos nos próximos cards
- `lucide-react` para ícones (leve, tree-shakeable)
