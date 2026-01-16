# CARD-04: Research Nodes Implementation

## 🎯 Objetivo

Implementar os três nós da fase de pesquisa: Plan, Search (Tavily), e Synthesize.

## 📋 Dependências

- ✅ CARD-01 (Schema)
- ✅ CARD-02 (Convex Functions)
- ✅ CARD-03 (LangGraph Setup)

## 📁 Arquivos a Criar

- `convex/agents/nodes/plan.ts`
- `convex/agents/nodes/search.ts`
- `convex/agents/nodes/synthesize.ts`
- `convex/agents/nodes/index.ts`

## 📦 Packages a Instalar

```bash
npm install @tavily/core openai
```

## 💻 Implementação

### convex/agents/nodes/plan.ts

```typescript
// convex/agents/nodes/plan.ts
"use node";

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { AgentStateType, ResearchPlan } from "../state";
import { PLAN_RESEARCH_PROMPT, REFINEMENT_PROMPT } from "../prompts";

const model = new ChatOpenAI({
  modelName: "gpt-4o",
  temperature: 0.3,
});

/**
 * Plan Research Node
 * 
 * Analyzes user prompt and creates a research plan with keywords and parameters.
 * If refinement feedback exists, incorporates it into the plan.
 */
export const planResearchNode = async (
  state: AgentStateType
): Promise<Partial<AgentStateType>> => {
  console.log("[PLAN] Starting research planning...");
  console.log("[PLAN] User prompt:", state.userPrompt);
  console.log("[PLAN] Refinement feedback:", state.refinementFeedback);

  try {
    let systemPrompt = PLAN_RESEARCH_PROMPT;
    let userContent = state.userPrompt;

    // If there's refinement feedback, adjust the prompt
    if (state.refinementFeedback && state.researchPlan) {
      systemPrompt = REFINEMENT_PROMPT
        .replace("{previousKeywords}", state.researchPlan.keywords.join(", "))
        .replace("{feedback}", state.refinementFeedback);
      userContent = `Original request: ${state.userPrompt}\nFeedback: ${state.refinementFeedback}`;
    }

    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userContent),
    ]);

    // Parse JSON response
    const content = response.content as string;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error("Failed to extract JSON from LLM response");
    }

    const plan: ResearchPlan = JSON.parse(jsonMatch[0]);

    console.log("[PLAN] Generated plan:", plan);

    return {
      researchPlan: plan,
      currentStep: "plan",
      error: null,
    };
  } catch (error) {
    console.error("[PLAN] Error:", error);
    return {
      error: `Planning failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      currentStep: "error",
    };
  }
};
```

### convex/agents/nodes/search.ts

```typescript
// convex/agents/nodes/search.ts
"use node";

import { tavily } from "@tavily/core";
import { AgentStateType, SearchResult } from "../state";

// Initialize Tavily client
const tavilyClient = tavily({
  apiKey: process.env.TAVILY_API_KEY!,
});

/**
 * Search Node
 * 
 * Uses Tavily to search for each keyword in the research plan.
 * Aggregates and deduplicates results.
 */
export const searchNode = async (
  state: AgentStateType
): Promise<Partial<AgentStateType>> => {
  console.log("[SEARCH] Starting Tavily search...");

  if (!state.researchPlan) {
    return {
      error: "No research plan available",
      currentStep: "error",
    };
  }

  try {
    const { keywords, timeframe } = state.researchPlan;
    const allResults: SearchResult[] = [];
    const seenUrls = new Set<string>();

    // Search for each keyword
    for (const keyword of keywords) {
      console.log(`[SEARCH] Searching for: "${keyword}"`);

      const response = await tavilyClient.search(keyword, {
        searchDepth: "advanced",
        maxResults: 10,
        includeAnswer: false,
        includeRawContent: false,
        // Tavily time filter mapping
        // Note: Tavily uses different time parameter names
      });

      // Process results
      for (const result of response.results) {
        // Deduplicate by URL
        if (seenUrls.has(result.url)) continue;
        seenUrls.add(result.url);

        allResults.push({
          title: result.title,
          url: result.url,
          content: result.content,
          score: result.score,
          publishedDate: result.publishedDate,
        });
      }
    }

    // Sort by relevance score
    allResults.sort((a, b) => b.score - a.score);

    // Take top 20 results
    const topResults = allResults.slice(0, 20);

    console.log(`[SEARCH] Found ${allResults.length} total results, kept top ${topResults.length}`);

    return {
      searchResults: topResults,
      currentStep: "search",
      error: null,
    };
  } catch (error) {
    console.error("[SEARCH] Error:", error);
    return {
      error: `Search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      currentStep: "error",
    };
  }
};
```

### convex/agents/nodes/synthesize.ts

```typescript
// convex/agents/nodes/synthesize.ts
"use node";

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { AgentStateType, Trend, SearchResult } from "../state";
import { SYNTHESIZE_PROMPT } from "../prompts";

const model = new ChatOpenAI({
  modelName: "gpt-4o",
  temperature: 0.4,
});

interface SynthesisResponse {
  trends: Array<{
    title: string;
    summary: string;
    whyItMatters: string;
    confidence: "high" | "medium" | "low";
    sourceIndices: number[];
  }>;
}

/**
 * Synthesize Node
 * 
 * Takes search results and synthesizes them into structured trends.
 * Links each trend to its supporting sources.
 */
export const synthesizeNode = async (
  state: AgentStateType
): Promise<Partial<AgentStateType>> => {
  console.log("[SYNTHESIZE] Analyzing search results...");

  if (!state.searchResults || state.searchResults.length === 0) {
    return {
      error: "No search results to synthesize",
      currentStep: "error",
    };
  }

  try {
    // Format search results for LLM
    const formattedResults = state.searchResults.map((result, index) => ({
      index,
      title: result.title,
      url: result.url,
      content: result.content.slice(0, 500), // Truncate for token limits
      publishedDate: result.publishedDate,
    }));

    const response = await model.invoke([
      new SystemMessage(SYNTHESIZE_PROMPT),
      new HumanMessage(
        `Search results:\n${JSON.stringify(formattedResults, null, 2)}\n\nUser's original request: ${state.userPrompt}`
      ),
    ]);

    // Parse JSON response
    const content = response.content as string;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error("Failed to extract JSON from LLM response");
    }

    const synthesis: SynthesisResponse = JSON.parse(jsonMatch[0]);

    // Convert to Trend objects with proper source references
    const trends: Trend[] = synthesis.trends.map((t) => ({
      title: t.title,
      summary: t.summary,
      whyItMatters: t.whyItMatters,
      confidence: t.confidence,
      sources: t.sourceIndices
        .filter((i) => i >= 0 && i < state.searchResults.length)
        .map((i) => ({
          url: state.searchResults[i].url,
          title: state.searchResults[i].title,
          snippet: state.searchResults[i].content.slice(0, 200),
          publishedAt: state.searchResults[i].publishedDate,
        })),
    }));

    console.log(`[SYNTHESIZE] Generated ${trends.length} trends`);

    return {
      trends,
      currentStep: "synthesize",
      hitlStatus: null, // Reset for await_approval
      error: null,
    };
  } catch (error) {
    console.error("[SYNTHESIZE] Error:", error);
    return {
      error: `Synthesis failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      currentStep: "error",
    };
  }
};
```

### convex/agents/nodes/index.ts

```typescript
// convex/agents/nodes/index.ts
export { planResearchNode } from "./plan";
export { searchNode } from "./search";
export { synthesizeNode } from "./synthesize";

// Export await_approval inline since it's simple
import { AgentStateType } from "../state";

export const awaitApprovalNode = async (
  state: AgentStateType
): Promise<Partial<AgentStateType>> => {
  console.log("[AWAIT_APPROVAL] Research complete, waiting for user approval");
  console.log(`[AWAIT_APPROVAL] Found ${state.trends.length} trends`);
  
  return {
    currentStep: "await_approval",
    hitlStatus: "pending",
  };
};
```

### Atualizar convex/agents/graph.ts

Atualizar o arquivo para importar os nós reais:

```typescript
// convex/agents/graph.ts
import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState, AgentStateType } from "./state";
import {
  planResearchNode,
  searchNode,
  synthesizeNode,
  awaitApprovalNode,
} from "./nodes";

// Placeholder for ideas node (CARD-06)
const generateIdeasNode = async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
  console.log("[GENERATE_IDEAS] Placeholder - implement in CARD-06");
  return { currentStep: "generate_ideas" };
};

const routeAfterApproval = (state: AgentStateType): string => {
  console.log("[ROUTER] HITL status:", state.hitlStatus);
  
  switch (state.hitlStatus) {
    case "approved":
      return "generate_ideas";
    case "refine":
    case "restart":
      return "plan_research";
    case "pending":
    default:
      return END;
  }
};

const workflow = new StateGraph(AgentState)
  .addNode("plan_research", planResearchNode)
  .addNode("search", searchNode)
  .addNode("synthesize", synthesizeNode)
  .addNode("await_approval", awaitApprovalNode)
  .addNode("generate_ideas", generateIdeasNode)
  
  .addEdge(START, "plan_research")
  .addEdge("plan_research", "search")
  .addEdge("search", "synthesize")
  .addEdge("synthesize", "await_approval")
  
  .addConditionalEdges(
    "await_approval",
    routeAfterApproval,
    {
      plan_research: "plan_research",
      generate_ideas: "generate_ideas",
      [END]: END,
    }
  )
  
  .addEdge("generate_ideas", END);

export const graph = workflow.compile();
export { workflow };
```

## ✅ Acceptance Criteria

1. [ ] `planResearchNode` extrai keywords do prompt via LLM
2. [ ] `searchNode` busca no Tavily e retorna resultados
3. [ ] `synthesizeNode` agrupa resultados em trends estruturadas
4. [ ] `awaitApprovalNode` define hitlStatus como "pending"
5. [ ] Todos os nós logam progresso no console
6. [ ] Erros são tratados e armazenados em `state.error`
7. [ ] Graph atualizado para usar nós reais

## 🛑 Stop Conditions

```bash
# 1. Verificar que arquivos existem
for file in plan search synthesize index; do
  test -f "convex/agents/nodes/${file}.ts" && echo "✅ nodes/${file}.ts exists" || echo "❌ nodes/${file}.ts missing"
done

# 2. Verificar packages instalados
npm list @tavily/core 2>/dev/null | grep -q "tavily" && echo "✅ Tavily installed" || echo "❌ Tavily missing"

# 3. Verificar compilação TypeScript
npx tsc --noEmit convex/agents/nodes/*.ts 2>&1 | grep -q "error" && echo "❌ TypeScript errors" || echo "✅ TypeScript OK"

# 4. Verificar exports
grep -q "export const planResearchNode" convex/agents/nodes/plan.ts && echo "✅ planResearchNode exported" || echo "❌ planResearchNode not exported"
grep -q "export const searchNode" convex/agents/nodes/search.ts && echo "✅ searchNode exported" || echo "❌ searchNode not exported"
grep -q "export const synthesizeNode" convex/agents/nodes/synthesize.ts && echo "✅ synthesizeNode exported" || echo "❌ synthesizeNode not exported"

# 5. Verificar "use node" directive
grep -q '"use node"' convex/agents/nodes/plan.ts && echo "✅ plan.ts has 'use node'" || echo "❌ plan.ts missing 'use node'"
grep -q '"use node"' convex/agents/nodes/search.ts && echo "✅ search.ts has 'use node'" || echo "❌ search.ts missing 'use node'"
```

**Card concluído quando todos os checks passam ✅**

## 📝 Notas

- Todos os nós que usam APIs externas (OpenAI, Tavily) precisam de `"use node"`
- Os nós retornam `Partial<AgentStateType>` - só os campos que mudam
- Tavily client é inicializado com `process.env.TAVILY_API_KEY`
- OpenAI usa `@langchain/openai` para integração com LangGraph
- Erros são capturados e armazenados em `state.error` para tratamento no frontend
