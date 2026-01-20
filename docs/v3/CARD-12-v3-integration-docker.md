# CARD-12-v3: Integration, Docker & Polish

## 🎯 Objetivo

Integrar todos os componentes, garantir que o fluxo E2E funciona, configurar Docker para fácil setup do avaliador, e fazer polish final.

## 📋 Dependências

- ✅ Todos os cards anteriores (05.1 a 11-v3)

## 📋 Checklist de Integração

Antes do Docker, precisamos garantir que tudo funciona:

### Backend
- [ ] Schema com todas as tabelas (threads, messages, trends, ideas, streamEvents, checkpoints, checkpointWrites)
- [ ] Actions de research funcionando com checkpointer
- [ ] Actions de HITL (approve, refine, restart) funcionando
- [ ] Actions de ideas funcionando
- [ ] StreamEvents sendo populados corretamente

### Frontend
- [ ] Chat renderiza mensagens e status
- [ ] HITL panel mostra trends e botões
- [ ] Sidebar mostra ideias conforme são geradas
- [ ] Erros são tratados e mostrados ao usuário

### Fluxo E2E
- [ ] Criar thread → Research → Trends → Approve → Ideas → Complete
- [ ] Refine funciona (volta para research com feedback)
- [ ] Restart funciona (limpa tudo e permite nova pesquisa)

---

## 📁 Arquivos a Criar/Modificar

1. `Dockerfile`
2. `docker-compose.yml`
3. `.env.example`
4. `README.md`
5. `.dockerignore`
6. Ajustes finais de integração

---

## 💻 Implementação

### 1. Verificar/Criar src/lib/constants.ts

```typescript
// src/lib/constants.ts

// Convex URLs
export const CONVEX_URL =
  import.meta.env.VITE_CONVEX_URL || "http://localhost:3210";

// Platforms
export const PLATFORMS = ["linkedin", "twitter", "tiktok"] as const;
export type Platform = (typeof PLATFORMS)[number];

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

export type ThreadStatus = (typeof THREAD_STATUS)[keyof typeof THREAD_STATUS];

// Status que mostram a sidebar
export const SIDEBAR_VISIBLE_STATUSES: ThreadStatus[] = [
  THREAD_STATUS.GENERATING_IDEAS,
  THREAD_STATUS.COMPLETED,
];

// Status que desabilitam input
export const INPUT_DISABLED_STATUSES: ThreadStatus[] = [
  THREAD_STATUS.PLANNING,
  THREAD_STATUS.SEARCHING,
  THREAD_STATUS.SYNTHESIZING,
];
```

### 2. Criar Dockerfile

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app

# Instalar dependências do sistema
RUN apk add --no-cache libc6-compat curl

# Copiar package files
COPY package*.json ./

# Instalar dependências
RUN npm ci

# Copiar código fonte
COPY . .

# Variáveis de ambiente para build
ARG VITE_CONVEX_URL
ENV VITE_CONVEX_URL=$VITE_CONVEX_URL

# Build do frontend
RUN npm run build

# Expor portas
EXPOSE 5173 3210

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5173 || exit 1

# Comando para desenvolvimento
CMD ["sh", "-c", "npx convex dev & npm run dev -- --host"]
```

### 3. Criar docker-compose.yml

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        VITE_CONVEX_URL: http://localhost:3210
    ports:
      - "5173:5173"   # Vite dev server
      - "3210:3210"   # Convex backend
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - TAVILY_API_KEY=${TAVILY_API_KEY}
      - VITE_CONVEX_URL=http://localhost:3210
    volumes:
      # Hot reload para desenvolvimento
      - ./src:/app/src:ro
      - ./convex:/app/convex:ro
      # Não sobrescrever node_modules
      - /app/node_modules
    stdin_open: true
    tty: true

# ╔═══════════════════════════════════════════════════════════════════╗
# ║                    INSTRUÇÕES DE USO                              ║
# ╠═══════════════════════════════════════════════════════════════════╣
# ║  1. Copie .env.example para .env                                  ║
# ║  2. Preencha OPENAI_API_KEY e TAVILY_API_KEY                      ║
# ║  3. Execute: docker-compose up --build                            ║
# ║  4. Acesse: http://localhost:5173                                 ║
# ╚═══════════════════════════════════════════════════════════════════╝
```

### 4. Criar .env.example

```bash
# .env.example
# ═══════════════════════════════════════════════════════════════════
# Copie este arquivo para .env e preencha os valores
# ═══════════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════════
# API Keys (OBRIGATÓRIO)
# ═══════════════════════════════════════════════════════════════════

# OpenAI API Key
# Obtenha em: https://platform.openai.com/api-keys
# Modelo usado: gpt-4o
OPENAI_API_KEY=sk-...

# Tavily API Key
# Obtenha em: https://tavily.com (free tier disponível - 1000 requests/mês)
TAVILY_API_KEY=tvly-...

# ═══════════════════════════════════════════════════════════════════
# URLs (não precisa alterar para desenvolvimento local)
# ═══════════════════════════════════════════════════════════════════
VITE_CONVEX_URL=http://localhost:3210
```

### 5. Criar .dockerignore

```
# .dockerignore
node_modules
.git
.gitignore
*.md
!README.md
.env
.env.local
.env*.local
dist
.vscode
*.log
.DS_Store
coverage
.nyc_output
```

### 6. Criar README.md

```markdown
# Trend-to-Idea Agent

> AI-powered trend research and content idea generation for marketing teams.
> Built with LangGraph.js + Convex + React.

![Demo](./docs/demo.gif)

## 🚀 Quick Start

### Option 1: Docker (Recommended for reviewers)

```bash
# 1. Clone the repo
git clone <repo-url>
cd trend-to-idea-agent

# 2. Setup environment
cp .env.example .env
# Edit .env and add your API keys:
#   - OPENAI_API_KEY (get from https://platform.openai.com)
#   - TAVILY_API_KEY (get from https://tavily.com - free tier available)

# 3. Run with Docker
docker-compose up --build

# 4. Open http://localhost:5173
```

### Option 2: Local Development

```bash
# 1. Install dependencies
npm install

# 2. Setup environment
cp .env.example .env
# Edit .env and add your API keys

# 3. Start Convex backend (terminal 1)
npx convex dev

# 4. Start frontend (terminal 2)
npm run dev

# 5. Open http://localhost:5173
```

## 📋 Requirements

- Node.js 20+
- OpenAI API Key (GPT-4o access)
- Tavily API Key (free tier: https://tavily.com)

## 🎯 Features

### Research Phase
- Enter a topic to research current trends
- AI extracts keywords and searches the web using Tavily
- Results are synthesized into 5-8 actionable trends
- Each trend includes real source URLs and confidence level

### HITL Checkpoint
- **Approve**: Generate content ideas based on approved trends
- **Refine**: Provide feedback to narrow/adjust research scope
- **Restart**: Clear everything and start fresh

### Ideas Generation
- Content ideas for LinkedIn, Twitter/X, and TikTok
- Each idea includes: hook, format, angle, and description
- Ideas stream to a separate sidebar panel
- Copy hooks with one click

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (React + Vite)                       │
│  ┌─────────────────────┐      ┌──────────────────────────────┐  │
│  │   Chat Panel        │      │   Ideas Sidebar              │  │
│  │   - Research stream │      │   - Ideas stream             │  │
│  │   - HITL controls   │      │   - Platform tabs            │  │
│  └──────────┬──────────┘      └──────────────┬───────────────┘  │
│             │ useQuery (reactive)             │ useQuery          │
└─────────────┼─────────────────────────────────┼──────────────────┘
              │                                 │
              ▼                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CONVEX BACKEND                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  streamEvents   │  │   checkpoints   │  │   ideas/trends  │  │
│  │  (UI streaming) │  │  (graph state)  │  │  (permanent)    │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │            │
│           └────────────────────┼────────────────────┘            │
│                                │                                 │
│                    ┌───────────▼───────────┐                     │
│                    │   Convex Actions      │                     │
│                    │   ("use node")        │                     │
│                    └───────────┬───────────┘                     │
└────────────────────────────────┼────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      LANGGRAPH.JS                                │
│                                                                  │
│   [START] → [plan_research] → [search] → [synthesize]           │
│                                               │                  │
│                                               ▼                  │
│                                    [await_approval]              │
│                                    (interrupt() here)            │
│                                               │                  │
│               ┌───────────────────┬──────────┴──────────┐       │
│               ▼                   ▼                      ▼       │
│           [refine]           [approved]              [restart]   │
│           (back to           (continues)             (clear &    │
│            plan)                  │                   restart)   │
│                                   ▼                              │
│                          [generate_ideas]                        │
│                                   │                              │
│                                   ▼                              │
│                                 [END]                            │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │   External APIs         │
                    │   - OpenAI GPT-4o       │
                    │   - Tavily Search       │
                    └─────────────────────────┘
```

## 🔧 Tech Stack

| Layer | Technology | Why |
|-------|------------|-----|
| Frontend | React + TypeScript + Vite | Modern, fast, type-safe |
| Styling | TailwindCSS | Rapid prototyping |
| Backend | Convex | Real-time out of box, self-hosted |
| AI Orchestration | LangGraph.js | State machine for agents, native streaming |
| LLM | OpenAI GPT-4o | Quality, structured output |
| Search | Tavily API | Returns real URLs, free tier |

## 📂 Project Structure

```
├── src/
│   ├── components/
│   │   ├── chat/        # Chat interface
│   │   ├── research/    # Trend cards
│   │   ├── hitl/        # Approval controls
│   │   ├── ideas/       # Ideas sidebar
│   │   └── layout/      # Layout components
│   ├── hooks/           # React hooks
│   └── lib/             # Utilities
│
├── convex/
│   ├── agents/
│   │   ├── graph.ts     # LangGraph definition
│   │   ├── state.ts     # State types
│   │   ├── nodes/       # Graph nodes
│   │   └── prompts.ts   # System prompts
│   ├── actions/         # Convex actions
│   ├── lib/
│   │   └── ConvexCheckpointer.ts  # Custom checkpointer
│   └── schema.ts        # Database schema
│
└── docker-compose.yml   # One-command setup
```

## 🎯 Design Decisions

### 1. ConvexCheckpointer for HITL

We built a custom LangGraph checkpointer that persists to Convex. This enables:
- True pause/resume without re-executing nodes
- Fault tolerance (can recover from crashes)
- Time travel debugging

### 2. streamEvents Table for UI Streaming

Instead of HTTP SSE (which doesn't work in Convex Actions), we use a `streamEvents` table:
- Events are written during graph execution
- Frontend subscribes via `useQuery` (reactive)
- Works seamlessly with Convex's real-time system

### 3. Separate Streaming Surfaces

The assessment required "sub-agent on different UI surface". We implemented:
- Main chat: Research results
- Sidebar: Ideas generation
- Each has its own `streamType` in streamEvents

## 🧪 Testing the Flow

1. **Enter a prompt**: "What's trending in B2B SaaS marketing with AI?"

2. **Watch research stream**:
   - Planning (keywords extraction)
   - Searching (Tavily results appear)
   - Synthesizing (trends are analyzed)

3. **Review trends**: Click to expand and see sources

4. **Test HITL options**:
   - Try "Refine" with feedback: "Focus more on content marketing"
   - Observe it re-runs with adjusted parameters
   - Try "Restart" to clear everything

5. **Approve and view ideas**:
   - Sidebar opens automatically
   - Ideas appear as they're generated
   - Switch between platform tabs

## 📝 Known Limitations

- **No auth**: This is a demo, no user accounts
- **No saved history**: Sessions don't persist across browser refreshes
- **Rate limits**: Tavily free tier is 1000 requests/month
- **Model costs**: GPT-4o is used, be aware of API costs

## 🔗 Links

- [LangGraph.js Documentation](https://langchain-ai.github.io/langgraphjs/)
- [Convex Documentation](https://docs.convex.dev/)
- [Tavily API](https://tavily.com/)

## 📄 License

MIT
```

### 7. Ajustes de integração no frontend

Verificar que `src/App.tsx` está conectando tudo:

```typescript
// src/App.tsx
import { useState, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { MainLayout } from "./components/layout/MainLayout";
import { SIDEBAR_VISIBLE_STATUSES } from "./lib/constants";

function App() {
  const [activeThreadId, setActiveThreadId] = useState<Id<"threads"> | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Fetch active thread
  const thread = useQuery(
    api.threads.get,
    activeThreadId ? { threadId: activeThreadId } : "skip"
  );

  // Auto-open sidebar when generating ideas
  const shouldShowSidebar =
    thread?.status &&
    SIDEBAR_VISIBLE_STATUSES.includes(thread.status as any);

  // Auto-open sidebar when ideas start generating
  const handleThreadChange = useCallback((threadId: Id<"threads"> | null) => {
    setActiveThreadId(threadId);
  }, []);

  // Effect to open sidebar when status changes to generating_ideas
  if (shouldShowSidebar && !sidebarOpen && thread?.status === "generating_ideas") {
    setSidebarOpen(true);
  }

  return (
    <div className="h-screen bg-gray-50">
      <MainLayout
        activeThreadId={activeThreadId}
        onThreadChange={handleThreadChange}
        sidebarOpen={sidebarOpen}
        onSidebarToggle={setSidebarOpen}
        shouldShowSidebar={!!shouldShowSidebar}
      />
    </div>
  );
}

export default App;
```

---

## ✅ Checklist Final

### Funcionalidade
- [ ] Research streaming funciona
- [ ] Trends são exibidas corretamente
- [ ] Sources têm URLs reais e clicáveis
- [ ] Approve gera ideias
- [ ] Refine re-executa com feedback
- [ ] Restart limpa e permite nova pesquisa
- [ ] Sidebar streama ideias
- [ ] Copy button funciona

### Técnico
- [ ] TypeScript compila sem erros
- [ ] Frontend builda sem erros
- [ ] Convex sync funciona
- [ ] Docker build funciona
- [ ] docker-compose up funciona

### UX
- [ ] Estados de loading claros
- [ ] Erros são mostrados ao usuário
- [ ] Animações suaves
- [ ] Responsivo em mobile

---

## 🛑 Stop Conditions

```bash
# 1. Verificar arquivos Docker
test -f Dockerfile && echo "✅ Dockerfile exists" || echo "❌ missing"
test -f docker-compose.yml && echo "✅ docker-compose.yml exists" || echo "❌ missing"
test -f .env.example && echo "✅ .env.example exists" || echo "❌ missing"
test -f README.md && echo "✅ README.md exists" || echo "❌ missing"

# 2. Verificar build frontend
npm run build 2>&1 | grep -q "error" && echo "❌ Build errors" || echo "✅ Build OK"

# 3. Verificar TypeScript
npx tsc --noEmit 2>&1 | grep -q "error" && echo "❌ TypeScript errors" || echo "✅ TypeScript OK"

# 4. Verificar Convex sync
npx convex dev --once 2>&1 | grep -q "error" && echo "❌ Convex errors" || echo "✅ Convex synced"

# 5. Verificar Docker build (se Docker disponível)
docker build -t trend-agent . 2>&1 | tail -3

# 6. Verificar README tem Quick Start
grep -q "Quick Start" README.md && echo "✅ README has Quick Start" || echo "❌ missing Quick Start"
```

**Card concluído quando todos os checks passam ✅**

---

## 🎬 Demo Script para o Avaliador

### Preparação
```bash
docker-compose up --build
# Aguardar logs mostrarem "ready"
# Abrir http://localhost:5173
```

### Demonstração (5 minutos)

1. **Setup** (30s)
   - Mostrar que é `docker-compose up` único
   - Mostrar README com instruções claras

2. **Research Flow** (1.5min)
   - Digite: "What's trending in creator economy monetization?"
   - Mostrar tokens aparecendo em tempo real
   - Mostrar status mudando (Planning → Searching → Synthesizing)
   - Mostrar trends com sources clicáveis

3. **HITL - Refine** (1min)
   - Clicar "Refine"
   - Digitar: "Focus more on subscription models"
   - Mostrar que re-executa com o contexto
   - Mostrar novas trends

4. **HITL - Approve** (1.5min)
   - Clicar "Approve"
   - Mostrar sidebar abrindo
   - Mostrar ideias aparecendo por plataforma
   - Mostrar tabs funcionando
   - Mostrar copy button

5. **Qualidade** (30s)
   - Expandir uma trend → mostrar sources
   - Expandir uma ideia → mostrar angle e description
   - Mencionar que é LangGraph com checkpointer real

---

## 📝 Notas para o Avaliador

### Diferencias desta implementação:

1. **Checkpointer real**: Não re-executamos o grafo inteiro no refine - usamos `interrupt()` e `Command({ resume: ... })`

2. **Streaming via Convex**: Em vez de SSE (que não funciona em Convex Actions), usamos uma tabela `streamEvents` com `useQuery` reativo

3. **Duas superfícies de streaming**: Chat principal e sidebar são streams independentes

4. **Brand context**: O Gallium brand voice está embutido nos prompts

### Trade-offs conscientes:

- **Convex self-hosted**: Optamos por self-hosted para facilitar avaliação (não precisa de conta)
- **GPT-4o**: Qualidade > custo para demo
- **Tavily**: API oficial com URLs reais (vs scraping genérico)
