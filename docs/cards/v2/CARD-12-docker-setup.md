# CARD-12: Docker Setup & Final Polish

## 🎯 Objetivo

Configurar Docker para facilitar o setup do examinador e fazer polish final do projeto.

## 📋 Dependências

- ✅ Todos os cards anteriores (01-11)

## 📁 Arquivos a Criar

- `Dockerfile`
- `docker-compose.yml`
- `.env.example`
- `README.md`
- `.dockerignore`

## 💻 Implementação

### Dockerfile

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app

# Instalar dependências do sistema
RUN apk add --no-cache libc6-compat

# Copiar package files
COPY package*.json ./
COPY convex/package*.json ./convex/

# Instalar dependências
RUN npm ci

# Copiar código fonte
COPY . .

# Build do frontend
RUN npm run build

# Expor portas
EXPOSE 5173 3210 3211

# Comando padrão
CMD ["npm", "run", "dev"]
```

### docker-compose.yml

```yaml
# docker-compose.yml
version: '3.8'

services:
  # ===========================================
  # APP + CONVEX (Modo Desenvolvimento)
  # ===========================================
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "5173:5173"   # Vite dev server
      - "3210:3210"   # Convex backend
      - "3211:3211"   # Convex HTTP actions
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - TAVILY_API_KEY=${TAVILY_API_KEY}
      - VITE_CONVEX_URL=http://localhost:3210
      - VITE_CONVEX_SITE_URL=http://localhost:3211
    volumes:
      # Hot reload para desenvolvimento
      - ./src:/app/src
      - ./convex:/app/convex
      # Não sobrescrever node_modules
      - /app/node_modules
      - /app/convex/node_modules
    command: >
      sh -c "
        echo '🚀 Starting Trend-to-Idea Agent...' &&
        echo '📦 Starting Convex backend...' &&
        npx convex dev --once &
        sleep 5 &&
        echo '🌐 Starting Vite dev server...' &&
        npm run dev -- --host
      "
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5173"]
      interval: 30s
      timeout: 10s
      retries: 3

# ===========================================
# INSTRUÇÕES DE USO
# ===========================================
# 1. Copie .env.example para .env
# 2. Preencha OPENAI_API_KEY e TAVILY_API_KEY
# 3. Execute: docker-compose up
# 4. Acesse: http://localhost:5173
# ===========================================
```

### .env.example

```bash
# .env.example
# Copie este arquivo para .env e preencha as variáveis

# ===========================================
# API Keys (OBRIGATÓRIO)
# ===========================================

# OpenAI API Key
# Obtenha em: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-...

# Tavily API Key  
# Obtenha em: https://tavily.com (free tier disponível)
TAVILY_API_KEY=tvly-...

# ===========================================
# URLs (não precisa alterar para dev local)
# ===========================================
VITE_CONVEX_URL=http://localhost:3210
VITE_CONVEX_SITE_URL=http://localhost:3211
```

### .dockerignore

```
# .dockerignore
node_modules
convex/node_modules
.git
.gitignore
*.md
!README.md
.env
.env.local
dist
.vscode
*.log
```

### README.md

```markdown
# Trend-to-Idea Agent

> AI-powered trend research and content idea generation for marketing teams.

## 🚀 Quick Start

### Option 1: Docker (Recommended for reviewers)

```bash
# 1. Clone the repo
git clone <repo-url>
cd trend-to-idea-agent

# 2. Setup environment
cp .env.example .env
# Edit .env and add your API keys

# 3. Run with Docker
docker-compose up

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
- OpenAI API Key
- Tavily API Key (free tier: https://tavily.com)

## 🎯 Features

### Research Phase
- Enter a topic to research current trends
- AI extracts keywords and searches the web using Tavily
- Results are synthesized into 5-8 actionable trends
- Each trend includes sources with real URLs

### HITL Checkpoint
- **Approve**: Generate content ideas based on trends
- **Refine**: Provide feedback to narrow/adjust research
- **Restart**: Clear and start fresh

### Ideas Generation
- Content ideas for LinkedIn, Twitter/X, and TikTok
- Each idea includes: hook, format, angle, and description
- Ideas stream to a separate sidebar panel
- Copy hooks with one click

## 🏗️ Architecture

```
Frontend (React + Vite)
    │
    ├─► Convex Queries/Mutations (real-time)
    │
    └─► HTTP SSE Endpoints (streaming)
            │
            └─► LangGraph State Machine
                    │
                    ├─► OpenAI GPT-4o (planning, synthesis, ideas)
                    │
                    └─► Tavily API (web search)
```

## 🔧 Tech Stack

- **Frontend**: React, TypeScript, Vite, TailwindCSS
- **Backend**: Convex (self-hosted)
- **AI Orchestration**: LangGraph.js
- **LLM**: OpenAI GPT-4o
- **Search**: Tavily API

## 📁 Project Structure

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
│   ├── http.ts          # HTTP streaming endpoints
│   └── schema.ts        # Database schema
│
└── docker-compose.yml   # One-command setup
```

## 🧪 Testing the Flow

1. **Enter a prompt**: "What are the latest trends in creator economy monetization?"

2. **Watch research stream**: 
   - Planning (keywords extraction)
   - Searching (Tavily results)
   - Synthesizing (trend analysis)

3. **Review trends**: Click to expand and see sources

4. **Approve or Refine**: 
   - Approve to generate ideas
   - Refine to adjust research focus

5. **View ideas in sidebar**: 
   - Switch between platforms
   - Ideas appear as they're generated

## 📝 Design Decisions

1. **Convex as single backend**: Simplifies architecture, provides real-time updates out of the box

2. **LangGraph.js over Python**: Same codebase, runs in Convex Actions with "use node"

3. **Tavily over Google Trends**: Official API, reliable, includes source URLs

4. **Separate streaming endpoints**: `/api/streamResearch` and `/api/streamIdeas` demonstrate sub-agent separation

5. **streamEvents() for real streaming**: Tokens appear in real-time, not just node completions

## 📄 License

MIT
```

## ✅ Acceptance Criteria

1. [ ] `docker-compose up` inicia o projeto sem erros
2. [ ] `.env.example` documenta todas as variáveis necessárias
3. [ ] `README.md` tem instruções claras de setup
4. [ ] Projeto funciona end-to-end após `docker-compose up`
5. [ ] Hot reload funciona para desenvolvimento

## 🛑 Stop Conditions

```bash
# 1. Verificar arquivos existem
for file in Dockerfile docker-compose.yml .env.example README.md .dockerignore; do
  test -f "$file" && echo "✅ $file exists" || echo "❌ $file missing"
done

# 2. Testar Docker build
docker build -t trend-agent . 2>&1 | tail -5

# 3. Testar docker-compose (com .env configurado)
# docker-compose config  # Valida sintaxe
# docker-compose up      # Inicia tudo

# 4. Verificar que README tem Quick Start
grep -q "Quick Start" README.md && echo "✅ README has Quick Start" || echo "❌ Missing Quick Start"
```

**Card concluído quando todos os checks passam ✅**

## 📝 Checklist Final

Antes de submeter, verificar:

- [ ] `docker-compose up` funciona com API keys válidas
- [ ] Research streaming mostra tokens em tempo real
- [ ] HITL approve/refine/restart funcionam
- [ ] Sidebar streama ideias separadamente
- [ ] Sources têm URLs reais e clicáveis
- [ ] Nenhum erro no console do browser
- [ ] Código TypeScript compila sem erros

## 🎯 Demonstração para Avaliador

Fluxo recomendado para demonstrar:

1. **Setup**: `docker-compose up` (mostra facilidade)

2. **Research**: "What's trending in B2B SaaS marketing with AI?"
   - Mostrar tokens aparecendo em tempo real
   - Mostrar tool calls para Tavily

3. **HITL**: Clicar "Refine" primeiro
   - Dar feedback: "Focus more on content marketing specifically"
   - Mostrar que re-executa com contexto

4. **Approve**: Gerar ideias
   - Mostrar sidebar abrindo
   - Mostrar ideias aparecendo por plataforma
   - Mostrar que é stream separado

5. **Qualidade**: Expandir trends e ideias
   - Mostrar sources com URLs reais
   - Mostrar hooks acionáveis
