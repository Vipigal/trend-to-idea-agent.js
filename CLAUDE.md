# CLAUDE.md - Trend-to-Idea Agent

> **Este documento é o ponto de entrada para agentes Claude Code trabalhando neste projeto.**

---

## 🎯 Problema Proposto

A Gallium está construindo um **sistema operacional de marketing AI-native**. Este projeto é um take-home assessment que demonstra capacidade de construir um **produto agêntico funcional end-to-end**.

### O que deve ser construído

Uma **interface de chat com streaming** que:

1. **Pesquisa** tendências atuais na web usando Tavily
2. **Apresenta** a pesquisa com citações (URLs + timestamps)
3. **Pausa** para aprovação humana (HITL checkpoint)
4. **Gera** ideias de conteúdo específicas por plataforma após aprovação
5. **Streama** o sub-agent de ideias em uma **sidebar separada**

### Hard Requirements (não negociáveis)

| Requisito                           | Status         |
| ----------------------------------- | -------------- |
| LangGraph.js para orquestração      | 🔴 Obrigatório |
| Convex para backend/persistência    | 🔴 Obrigatório |
| Streaming em todo lugar             | 🔴 Obrigatório |
| HITL antes de gerar ideias          | 🔴 Obrigatório |
| Sub-agent em superfície UI separada | 🔴 Obrigatório |
| Citações com URLs reais             | 🔴 Obrigatório |

---

## 🏗️ Arquitetura

### Stack

```
Frontend:     Vite + React + TypeScript + TailwindCSS
Backend:      Convex (self-hosted, local)
Orquestração: LangGraph.js
LLM:          OpenAI GPT-4o
Search:       Tavily JS Client Library (@tavily/core)
```

### Diagrama de Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Vite + React)                       │
│  ┌──────────────────────────┐  ┌─────────────────────────────┐  │
│  │     Main Chat Panel      │  │    Ideas Sidebar            │  │
│  │  • User input            │  │  • Streams separadamente    │  │
│  │  • Research streaming    │  │  • Ativada após HITL        │  │
│  │  • HITL controls         │  │  • Tabs por plataforma      │  │
│  │  • Progress indicators   │  │                             │  │
│  └────────────┬─────────────┘  └──────────────┬──────────────┘  │
│               │ useQuery/useMutation           │ HTTP SSE       │
└───────────────┼────────────────────────────────┼────────────────┘
                │                                │
                ▼                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CONVEX BACKEND                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Queries    │  │  Mutations  │  │  Actions ("use node")   │  │
│  │  (reads)    │  │  (writes)   │  │  • LangGraph.js         │  │
│  └─────────────┘  └─────────────┘  │  • Tavily client        │  │
│                                     │  • OpenAI calls         │  │
│  ┌─────────────────────────────┐   └─────────────────────────┘  │
│  │      HTTP Actions           │                                 │
│  │  • /api/streamResearch      │   ┌─────────────────────────┐  │
│  │  • /api/streamIdeas         │   │      Database           │  │
│  │  (SSE streaming)            │   │  threads | messages     │  │
│  └─────────────────────────────┘   │  trends  | ideas        │  │
│                                     └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LANGGRAPH STATE MACHINE                       │
│                                                                  │
│  [START] → [PLAN] → [SEARCH] → [SYNTHESIZE] → [AWAIT_APPROVAL]  │
│                                                        │         │
│                         ┌──────────────────────────────┤         │
│                         ▼                              ▼         │
│                    [REFINE]                      [GENERATE]      │
│                         │                              │         │
│                         └──────────────────────────────┴→ [END]  │
└─────────────────────────────────────────────────────────────────┘
```

### Fluxo de Dados

```
1. User envia prompt
   └→ mutation: threads.create()
   └→ HTTP: POST /api/streamResearch

2. Research Agent executa (streaming)
   └→ PLAN: LLM extrai keywords
   └→ SEARCH: Tavily busca
   └→ SYNTHESIZE: LLM agrupa em trends
   └→ mutation: threads.updateStatus("awaiting_approval")

3. HITL Checkpoint
   └→ UI mostra trends + botões [Approve] [Refine] [Restart]
   └→ Graph PAUSA aqui

4. User aprova
   └→ mutation: threads.approve()
   └→ HTTP: POST /api/streamIdeas (sidebar)

5. Ideas Agent executa (streaming para sidebar)
   └→ Para cada trend × plataforma
   └→ Gera ideia com brand context
   └→ mutation: ideas.save()
```

---

## 📁 Estrutura de Arquivos

```
trend-to-idea-agent/
├── CLAUDE.md                      # Este arquivo
├── README.md                      # Setup instructions para examinador
├── docker-compose.yml             # One-command setup
├── Dockerfile                     # Build do app
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── .env.example                   # Template de env vars
│
├── convex/
│   ├── _generated/                # Auto-gerado
│   ├── schema.ts                  # 📌 CARD-01
│   │
│   ├── threads.ts                 # 📌 CARD-02 (queries + mutations)
│   ├── messages.ts                # 📌 CARD-02
│   ├── trends.ts                  # 📌 CARD-02
│   ├── ideas.ts                   # 📌 CARD-02
│   │
│   ├── agents/
│   │   ├── graph.ts               # 📌 CARD-03 (LangGraph definition)
│   │   ├── state.ts               # 📌 CARD-03 (State types)
│   │   ├── nodes/
│   │   │   ├── plan.ts            # 📌 CARD-04
│   │   │   ├── search.ts          # 📌 CARD-04
│   │   │   ├── synthesize.ts      # 📌 CARD-04
│   │   │   └── generateIdeas.ts   # 📌 CARD-06
│   │   └── prompts.ts             # 📌 CARD-04
│   │
│   ├── actions/
│   │   ├── research.ts            # 📌 CARD-05 (Action que roda o graph)
│   │   └── ideas.ts               # 📌 CARD-07
│   │
│   └── http.ts                    # 📌 CARD-05, CARD-07 (HTTP streaming)
│
├── src/
│   ├── main.tsx
│   ├── App.tsx                    # 📌 CARD-08 (Providers + Layout)
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── MainLayout.tsx     # 📌 CARD-08
│   │   │   └── Sidebar.tsx        # 📌 CARD-11
│   │   │
│   │   ├── chat/
│   │   │   ├── ChatPanel.tsx      # 📌 CARD-09
│   │   │   ├── ChatInput.tsx      # 📌 CARD-09
│   │   │   ├── MessageList.tsx    # 📌 CARD-09
│   │   │   └── StreamingText.tsx  # 📌 CARD-09
│   │   │
│   │   ├── research/
│   │   │   ├── TrendCard.tsx      # 📌 CARD-10
│   │   │   ├── TrendList.tsx      # 📌 CARD-10
│   │   │   └── SourceLink.tsx     # 📌 CARD-10
│   │   │
│   │   ├── hitl/
│   │   │   ├── ApprovalPanel.tsx  # 📌 CARD-10
│   │   │   └── RefineInput.tsx    # 📌 CARD-10
│   │   │
│   │   └── ideas/
│   │       ├── IdeasPanel.tsx     # 📌 CARD-11
│   │       ├── IdeaCard.tsx       # 📌 CARD-11
│   │       └── PlatformTabs.tsx   # 📌 CARD-11
│   │
│   ├── hooks/
│   │   ├── useThread.ts           # 📌 CARD-09
│   │   ├── useResearchStream.ts   # 📌 CARD-09
│   │   └── useIdeasStream.ts      # 📌 CARD-11
│   │
│   └── lib/
│       ├── convex.ts              # 📌 CARD-08
│       └── constants.ts           # 📌 CARD-08
│
└── docs/
    └── cards/                     # Development cards
        ├── CARD-01-schema.md
        ├── CARD-02-convex-functions.md
        ├── ...
        └── CARD-12-docker.md
```

---

## 🔧 Comandos Úteis

```bash
# Desenvolvimento
npm run dev              # Inicia Vite + Convex
npx convex dev           # Apenas Convex (se separado)

# Docker (para examinador)
docker-compose up        # Sobe tudo

# Testes
npm run typecheck        # Verifica tipos
npm run lint             # Linting
```

---

## 🌍 Environment Variables

```bash
# .env.local (desenvolvimento)
VITE_CONVEX_URL=http://localhost:3210

# Convex Dashboard ou .env no backend
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=tvly-...
```

---

## 📋 Cards de Desenvolvimento

Os cards estão em `docs/cards/`. Cada card é autocontido com:

- **Objetivo**: O que implementar
- **Dependências**: Cards que precisam estar prontos antes
- **Arquivos**: O que criar/modificar
- **Acceptance Criteria**: O que precisa funcionar
- **Stop Conditions**: Como verificar que terminou

### Ordem de Execução

```
CARD-01 (Schema) ─────────────────────────────────────┐
                                                      │
CARD-02 (Convex Functions) ───────────────────────────┤
                                                      │
CARD-03 (LangGraph Setup) ────────────────────────────┤
                                                      ▼
CARD-04 (Research Nodes) ──→ CARD-05 (Research Action + HTTP)
                                                      │
                              CARD-06 (Ideas Node) ───┤
                                                      │
                              CARD-07 (Ideas Action)──┤
                                                      ▼
CARD-08 (Frontend Setup) ─────────────────────────────┤
                                                      │
CARD-09 (Chat UI) ────────────────────────────────────┤
                                                      │
CARD-10 (HITL UI) ────────────────────────────────────┤
                                                      │
CARD-11 (Sidebar UI) ─────────────────────────────────┤
                                                      ▼
CARD-12 (Docker + Polish) ────────────────────────────┘
```

---

## ⚠️ Regras para Agentes Claude Code

### DO ✅

- Sempre ler o card completo antes de começar
- Verificar stop conditions antes de marcar como concluído
- Rodar `npx convex dev` para validar schema/functions
- Commitar após cada card concluído
- Manter tipos TypeScript strict

### DON'T ❌

- Não pular cards - seguir ordem de dependências
- Não implementar features de bonus antes do core
- Não usar MCP - usar Tavily JS client diretamente
- Não criar arquivos fora da estrutura definida
- Não modificar `_generated/` - é auto-gerado

### Padrões de Código

Evitar utilizar comentários! Apenas para partes de lógica de estado mais complexa.

```typescript
// Convex: sempre tipar args e returns
export const myMutation = mutation({
  args: { threadId: v.id("threads") },
  returns: v.null(),
  handler: async (ctx, args) => {
    // ...
  },
});

// Actions: sempre usar "use node" para LangGraph
("use node");
import { action } from "./_generated/server";

// Frontend: hooks customizados para lógica
export const useThread = (threadId: Id<"threads">) => {
  const thread = useQuery(api.threads.get, { threadId });
  // ...
};
```

---

## 🎯 Critérios de Avaliação (Gallium)

| Critério             | Peso  | O que demonstrar                              |
| -------------------- | ----- | --------------------------------------------- |
| Streaming UX         | Alto  | Tokens aparecem em tempo real, progress claro |
| HITL Control         | Alto  | Pause funciona, refinement loop funciona      |
| LangGraph Quality    | Alto  | Estados claros, transições óbvias             |
| Sub-agent Separation | Alto  | Sidebar é stream separado, não fake           |
| Accuracy             | Médio | URLs reais, timestamps, dados frescos         |
| Code Quality         | Médio | TypeScript, error handling, estrutura         |
| Product Judgment     | Alto  | Fez o "minimum delightful" certo              |

---

## 📚 Referências

- [Convex Docs](https://docs.convex.dev/)
- [LangGraph.js Docs](https://langchain-ai.github.io/langgraphjs/)
- [Tavily JS Client](https://docs.tavily.com/documentation/js-sdk/getting-started)
- [Documento de Deep Research](./docs/deep-research.md)
