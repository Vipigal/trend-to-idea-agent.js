# CARD-06: Ideas Generation Node

## 🎯 Objetivo

Implementar o nó de geração de ideias que cria conteúdo específico por plataforma baseado nas trends aprovadas.

## 📋 Dependências

- ✅ CARD-03 (LangGraph Setup)
- ✅ CARD-04 (Research Nodes)

## 📁 Arquivos a Criar/Modificar

- `convex/agents/nodes/generateIdeas.ts`
- Atualizar `convex/agents/nodes/index.ts`
- Atualizar `convex/agents/graph.ts`

## 💻 Implementação

### convex/agents/nodes/generateIdeas.ts

```typescript
// convex/agents/nodes/generateIdeas.ts
"use node";

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { AgentStateType, Idea, Trend } from "../state";
import { getIdeasPrompt } from "../prompts";

const model = new ChatOpenAI({
  modelName: "gpt-4o",
  temperature: 0.7, // Higher for creativity
});

interface IdeaResponse {
  ideas: Array<{
    hook: string;
    format: string;
    angle: string;
    description: string;
  }>;
}

const PLATFORMS = ["linkedin", "twitter", "tiktok"] as const;

/**
 * Generate Ideas Node
 * 
 * For each trend, generates content ideas for each platform.
 * Uses brand context to maintain voice consistency.
 */
export const generateIdeasNode = async (
  state: AgentStateType
): Promise<Partial<AgentStateType>> => {
  console.log("[GENERATE_IDEAS] Starting idea generation...");
  console.log(`[GENERATE_IDEAS] Trends count: ${state.trends.length}`);

  if (!state.trends || state.trends.length === 0) {
    return {
      error: "No trends available for idea generation",
      currentStep: "error",
    };
  }

  const allIdeas: Idea[] = [];

  try {
    // Process each trend
    for (let trendIndex = 0; trendIndex < state.trends.length; trendIndex++) {
      const trend = state.trends[trendIndex];
      console.log(`[GENERATE_IDEAS] Processing trend ${trendIndex + 1}/${state.trends.length}: ${trend.title}`);

      // Generate ideas for each platform
      for (const platform of PLATFORMS) {
        console.log(`[GENERATE_IDEAS] Generating ${platform} ideas...`);

        const systemPrompt = getIdeasPrompt(state.brandContext, platform);
        
        const trendContext = `
Trend: ${trend.title}
Summary: ${trend.summary}
Why it matters: ${trend.whyItMatters}
Supporting sources:
${trend.sources.map((s) => `- ${s.title}: ${s.url}`).join("\n")}
`;

        const response = await model.invoke([
          new SystemMessage(systemPrompt),
          new HumanMessage(
            `Generate 2-3 ${platform} content ideas for this trend:\n\n${trendContext}`
          ),
        ]);

        // Parse JSON response
        const content = response.content as string;
        const jsonMatch = content.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          try {
            const parsed: IdeaResponse = JSON.parse(jsonMatch[0]);

            // Add ideas to collection
            for (const idea of parsed.ideas) {
              allIdeas.push({
                trendIndex,
                platform,
                hook: idea.hook,
                format: idea.format,
                angle: idea.angle,
                description: idea.description,
              });
            }
          } catch (parseError) {
            console.warn(`[GENERATE_IDEAS] Failed to parse ${platform} ideas for trend ${trendIndex}`);
          }
        }
      }
    }

    console.log(`[GENERATE_IDEAS] Generated ${allIdeas.length} total ideas`);

    return {
      ideas: allIdeas,
      currentStep: "generate_ideas",
      error: null,
    };
  } catch (error) {
    console.error("[GENERATE_IDEAS] Error:", error);
    return {
      error: `Idea generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      currentStep: "error",
    };
  }
};

/**
 * Streaming version of idea generation
 * Yields ideas as they are generated
 */
export async function* generateIdeasStreaming(
  trends: Trend[],
  brandContext: AgentStateType["brandContext"]
): AsyncGenerator<{
  type: "status" | "idea" | "complete" | "error";
  platform?: string;
  trendIndex?: number;
  idea?: Idea;
  message?: string;
  totalIdeas?: number;
}> {
  console.log("[GENERATE_IDEAS_STREAM] Starting streaming generation...");

  let totalIdeas = 0;

  try {
    for (let trendIndex = 0; trendIndex < trends.length; trendIndex++) {
      const trend = trends[trendIndex];

      yield {
        type: "status",
        message: `Generating ideas for: ${trend.title}`,
        trendIndex,
      };

      for (const platform of PLATFORMS) {
        yield {
          type: "status",
          message: `Creating ${platform} content...`,
          platform,
          trendIndex,
        };

        const systemPrompt = getIdeasPrompt(brandContext, platform);
        
        const trendContext = `
Trend: ${trend.title}
Summary: ${trend.summary}
Why it matters: ${trend.whyItMatters}
`;

        const response = await model.invoke([
          new SystemMessage(systemPrompt),
          new HumanMessage(
            `Generate 2-3 ${platform} content ideas for this trend:\n\n${trendContext}`
          ),
        ]);

        const content = response.content as string;
        const jsonMatch = content.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          try {
            const parsed: IdeaResponse = JSON.parse(jsonMatch[0]);

            for (const ideaData of parsed.ideas) {
              const idea: Idea = {
                trendIndex,
                platform,
                hook: ideaData.hook,
                format: ideaData.format,
                angle: ideaData.angle,
                description: ideaData.description,
              };

              totalIdeas++;
              yield {
                type: "idea",
                platform,
                trendIndex,
                idea,
              };
            }
          } catch (parseError) {
            console.warn(`Failed to parse ideas`);
          }
        }
      }
    }

    yield {
      type: "complete",
      totalIdeas,
      message: `Generated ${totalIdeas} ideas across ${PLATFORMS.length} platforms`,
    };
  } catch (error) {
    yield {
      type: "error",
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
```

### Atualizar convex/agents/nodes/index.ts

```typescript
// convex/agents/nodes/index.ts
export { planResearchNode } from "./plan";
export { searchNode } from "./search";
export { synthesizeNode } from "./synthesize";
export { generateIdeasNode, generateIdeasStreaming } from "./generateIdeas";

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

```typescript
// convex/agents/graph.ts
import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState, AgentStateType } from "./state";
import {
  planResearchNode,
  searchNode,
  synthesizeNode,
  awaitApprovalNode,
  generateIdeasNode,
} from "./nodes";

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

1. [ ] `generateIdeasNode` gera ideias para cada trend × plataforma
2. [ ] Cada ideia tem: hook, format, angle, description
3. [ ] Brand context (Gallium) é usado no prompt
4. [ ] `generateIdeasStreaming` permite streaming individual de ideias
5. [ ] Graph completo com todos os nós funcionando
6. [ ] Ideas são retornadas no state com `trendIndex` para referência

## 🛑 Stop Conditions

```bash
# 1. Verificar que arquivo existe
test -f convex/agents/nodes/generateIdeas.ts && echo "✅ generateIdeas.ts exists" || echo "❌ generateIdeas.ts missing"

# 2. Verificar exports
grep -q "export const generateIdeasNode" convex/agents/nodes/generateIdeas.ts && echo "✅ generateIdeasNode exported" || echo "❌ generateIdeasNode not exported"
grep -q "export async function\* generateIdeasStreaming" convex/agents/nodes/generateIdeas.ts && echo "✅ generateIdeasStreaming exported" || echo "❌ generateIdeasStreaming not exported"

# 3. Verificar que index.ts exporta
grep -q "generateIdeasNode" convex/agents/nodes/index.ts && echo "✅ Exported from index" || echo "❌ Not exported from index"

# 4. Verificar que graph.ts usa nó real
grep -q 'addNode("generate_ideas", generateIdeasNode)' convex/agents/graph.ts && echo "✅ Graph uses real node" || echo "❌ Graph uses placeholder"

# 5. Compilação TypeScript
npx tsc --noEmit convex/agents/nodes/generateIdeas.ts 2>&1 | grep -q "error" && echo "❌ TypeScript errors" || echo "✅ TypeScript OK"
```

**Card concluído quando todos os checks passam ✅**

## 📝 Notas

- `temperature: 0.7` para mais criatividade nas ideias
- Plataformas fixas: linkedin, twitter, tiktok (pode expandir depois)
- `trendIndex` liga cada ideia à trend que a originou
- Versão streaming (`generateIdeasStreaming`) é generator function para uso com HTTP Actions
