# CARD-06-v3: Ideas Generation Node

## 🎯 Objetivo

Implementar o node de geração de ideias que cria conteúdo específico por plataforma (LinkedIn, Twitter, TikTok) baseado nas trends aprovadas.

## 📋 Dependências

- ✅ CARD-03 (LangGraph Setup - AgentState)
- ✅ CARD-05.2 (HITL com interrupt)

## 📁 Arquivos a Criar/Modificar

1. `convex/agents/nodes/generateIdeas.ts` - Node principal
2. `convex/agents/prompts.ts` - Adicionar prompt de ideas
3. `convex/agents/state.ts` - Verificar Idea type
4. `convex/agents/nodes/index.ts` - Atualizar exports

---

## 💻 Implementação

### 1. Verificar/Atualizar convex/agents/state.ts

Garantir que o tipo `Idea` está definido corretamente:

```typescript
// Adicionar/verificar em convex/agents/state.ts

/**
 * Generated content idea
 */
export interface Idea {
  trendIndex: number;
  platform: "linkedin" | "twitter" | "tiktok" | "instagram";
  hook: string;
  format: string;
  angle: string;
  description: string;
}

// No AgentState Annotation:
/** Generated content ideas */
ideas: Annotation<Idea[]>({
  reducer: (prev, next) => [...prev, ...next],
  default: () => [],
}),
```

### 2. Atualizar convex/agents/prompts.ts

Adicionar o prompt de geração de ideias:

```typescript
// Adicionar a convex/agents/prompts.ts

import { BrandContext } from "./state";

/**
 * Platform-specific content guidelines
 */
const PLATFORM_GUIDELINES: Record<string, string> = {
  linkedin: `
## LinkedIn Guidelines
- Professional but not boring
- First line is crucial (shows in preview before "see more")
- Personal stories + data = high engagement
- Optimal length: 1200-1500 characters
- Use line breaks for readability
- Ask a question or make a bold statement to open
- End with a call to action or question`,

  twitter: `
## Twitter/X Guidelines
- Punchy, opinionated takes work best
- First tweet must hook immediately
- Threads work for complex topics (5-10 tweets ideal)
- Use numbers and specifics
- Optimal: 280 chars for single post
- Hot takes > lukewarm observations
- Quote tweets and replies are underrated`,

  tiktok: `
## TikTok Guidelines
- Hook in first 3 seconds is CRITICAL
- Educational + entertaining ("edutainment")
- Trending sounds/formats boost reach
- Behind-the-scenes content performs well
- Optimal length: 30-60 seconds
- Fast cuts, visual variety
- Text overlays for accessibility
- End with a hook for the next video`,

  instagram: `
## Instagram Guidelines
- Visual-first thinking always
- Carousel posts dominate for education (7-10 slides)
- Strong first slide = strong hook
- Save-worthy content gets algorithm love
- Reels > static posts for reach
- Use all 30 hashtags strategically
- Stories for engagement, feed for authority`,
};

/**
 * System prompt for generating content ideas
 */
export function getIdeasPrompt(brandContext: BrandContext, platform: string): string {
  return `You are a content strategist for ${brandContext.name}.

## Brand Voice
${brandContext.voice}

## Target Audience
${brandContext.targetAudience}

## Core Values
${brandContext.values.map((v) => `- ${v}`).join("\n")}

## Content Guidelines

### DO:
${brandContext.doList.map((d) => `- ${d}`).join("\n")}

### DON'T:
${brandContext.dontList.map((d) => `- ${d}`).join("\n")}

${PLATFORM_GUIDELINES[platform] || "Adapt to platform best practices."}

## Your Task

Generate 2-3 content ideas for ${platform.toUpperCase()} based on the given trend.

For EACH idea, respond with a JSON object in this exact format:
{
  "ideas": [
    {
      "hook": "The opening line that stops the scroll (max 15 words, make it punchy)",
      "format": "post | thread | video | carousel | story | reel",
      "angle": "Why this specific take will resonate with the audience (1-2 sentences)",
      "description": "What the content will cover and key points to hit (2-3 sentences)"
    }
  ]
}

## Quality Checklist
- Is the hook scroll-stopping?
- Does it align with brand voice?
- Is it actionable for the creator?
- Would the target audience care?

Be concrete and specific. Every idea should be immediately actionable.`;
}

/**
 * User prompt for ideas generation
 */
export function getIdeasUserPrompt(trend: {
  title: string;
  summary: string;
  whyItMatters: string;
}): string {
  return `Generate content ideas for this trend:

## Trend: ${trend.title}

### Summary
${trend.summary}

### Why It Matters
${trend.whyItMatters}

Remember: Generate 2-3 ideas in valid JSON format.`;
}
```

### 3. Criar convex/agents/nodes/generateIdeas.ts

```typescript
// convex/agents/nodes/generateIdeas.ts
"use node";

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { AgentStateType, Idea, BrandContext } from "../state";
import { getIdeasPrompt, getIdeasUserPrompt } from "../prompts";

// Model with streaming enabled for token-level events
const model = new ChatOpenAI({
  modelName: "gpt-4o",
  temperature: 0.7, // Higher for more creative ideas
  streaming: true,
});

// Platforms to generate ideas for
const PLATFORMS = ["linkedin", "twitter", "tiktok"] as const;
type Platform = (typeof PLATFORMS)[number];

interface IdeaResponse {
  ideas: Array<{
    hook: string;
    format: string;
    angle: string;
    description: string;
  }>;
}

/**
 * Parse JSON from LLM response, handling markdown code blocks
 */
function parseIdeasResponse(content: string): IdeaResponse | null {
  try {
    // Try to find JSON in markdown code block
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1].trim());
    }

    // Try to find raw JSON
    const rawJsonMatch = content.match(/\{[\s\S]*"ideas"[\s\S]*\}/);
    if (rawJsonMatch) {
      return JSON.parse(rawJsonMatch[0]);
    }

    return null;
  } catch (error) {
    console.warn("[GENERATE_IDEAS] Failed to parse JSON:", error);
    return null;
  }
}

/**
 * Generate Ideas Node
 *
 * For each approved trend, generates content ideas for each platform.
 * Uses brand context to maintain voice consistency.
 *
 * This node runs AFTER await_approval when user approves.
 */
export const generateIdeasNode = async (
  state: AgentStateType
): Promise<Partial<AgentStateType>> => {
  console.log("[GENERATE_IDEAS] Starting idea generation...");
  console.log(`[GENERATE_IDEAS] Trends count: ${state.trends?.length || 0}`);

  if (!state.trends || state.trends.length === 0) {
    console.error("[GENERATE_IDEAS] No trends available");
    return {
      error: "No trends available for idea generation",
      currentStep: "error",
    };
  }

  const allIdeas: Idea[] = [];
  const brandContext = state.brandContext;

  try {
    // Process each trend
    for (let trendIndex = 0; trendIndex < state.trends.length; trendIndex++) {
      const trend = state.trends[trendIndex];
      console.log(
        `[GENERATE_IDEAS] Processing trend ${trendIndex + 1}/${state.trends.length}: ${trend.title}`
      );

      // Generate ideas for each platform
      for (const platform of PLATFORMS) {
        console.log(`[GENERATE_IDEAS] Generating ${platform} ideas...`);

        try {
          const systemPrompt = getIdeasPrompt(brandContext, platform);
          const userPrompt = getIdeasUserPrompt({
            title: trend.title,
            summary: trend.summary,
            whyItMatters: trend.whyItMatters,
          });

          const response = await model.invoke([
            new SystemMessage(systemPrompt),
            new HumanMessage(userPrompt),
          ]);

          const content = response.content as string;
          const parsed = parseIdeasResponse(content);

          if (parsed && parsed.ideas) {
            for (const ideaData of parsed.ideas) {
              const idea: Idea = {
                trendIndex,
                platform,
                hook: ideaData.hook,
                format: ideaData.format,
                angle: ideaData.angle,
                description: ideaData.description,
              };
              allIdeas.push(idea);
              console.log(
                `[GENERATE_IDEAS] Created idea: "${idea.hook.substring(0, 50)}..."`
              );
            }
          } else {
            console.warn(
              `[GENERATE_IDEAS] Failed to parse ideas for ${platform}, trend ${trendIndex}`
            );
          }
        } catch (platformError) {
          console.error(
            `[GENERATE_IDEAS] Error generating ${platform} ideas:`,
            platformError
          );
          // Continue with other platforms
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
 * Generator version for streaming individual ideas
 * Used by the Ideas action for more granular streaming
 */
export async function* generateIdeasStreaming(
  trends: AgentStateType["trends"],
  brandContext: BrandContext
): AsyncGenerator<{
  type: "start" | "platform_start" | "platform_end" | "idea" | "complete" | "error";
  platform?: Platform;
  trendIndex?: number;
  trendTitle?: string;
  idea?: Idea;
  message?: string;
  totalIdeas?: number;
}> {
  let totalIdeas = 0;

  for (let trendIndex = 0; trendIndex < trends.length; trendIndex++) {
    const trend = trends[trendIndex];

    yield {
      type: "start",
      trendIndex,
      trendTitle: trend.title,
      message: `Processing trend: ${trend.title}`,
    };

    for (const platform of PLATFORMS) {
      yield {
        type: "platform_start",
        platform,
        trendIndex,
        message: `Generating ${platform} ideas...`,
      };

      try {
        const systemPrompt = getIdeasPrompt(brandContext, platform);
        const userPrompt = getIdeasUserPrompt({
          title: trend.title,
          summary: trend.summary,
          whyItMatters: trend.whyItMatters,
        });

        const response = await model.invoke([
          new SystemMessage(systemPrompt),
          new HumanMessage(userPrompt),
        ]);

        const content = response.content as string;
        const parsed = parseIdeasResponse(content);

        if (parsed && parsed.ideas) {
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
              trendTitle: trend.title,
              idea,
            };
          }
        }
      } catch (error) {
        yield {
          type: "error",
          platform,
          trendIndex,
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }

      yield {
        type: "platform_end",
        platform,
        trendIndex,
      };
    }
  }

  yield {
    type: "complete",
    totalIdeas,
    message: `Generated ${totalIdeas} ideas across ${PLATFORMS.length} platforms`,
  };
}
```

### 4. Atualizar convex/agents/nodes/index.ts

```typescript
// convex/agents/nodes/index.ts
export { planResearchNode } from "./plan";
export { searchNode } from "./search";
export { synthesizeNode } from "./synthesize";
export {
  awaitApprovalNode,
  type HITLResumeValue,
  type HITLInterruptValue,
} from "./awaitApproval";
export { generateIdeasNode, generateIdeasStreaming } from "./generateIdeas";
```

---

## ✅ Acceptance Criteria

1. [ ] `generateIdeasNode` gera ideias para cada trend × plataforma
2. [ ] Modelo LLM tem `streaming: true`
3. [ ] Cada ideia tem: hook, format, angle, description, trendIndex, platform
4. [ ] Brand context (Gallium) usado no prompt
5. [ ] `generateIdeasStreaming` permite streaming individual de ideias
6. [ ] JSON parsing robusto (handles markdown code blocks)
7. [ ] Continua mesmo se uma plataforma falhar

## 🛑 Stop Conditions

```bash
# 1. Verificar arquivo existe
test -f convex/agents/nodes/generateIdeas.ts && echo "✅ generateIdeas.ts exists" || echo "❌ missing"

# 2. Verificar streaming habilitado
grep -q "streaming: true" convex/agents/nodes/generateIdeas.ts && echo "✅ Has streaming: true" || echo "❌ missing"

# 3. Verificar exports
grep -q "export const generateIdeasNode" convex/agents/nodes/generateIdeas.ts && echo "✅ generateIdeasNode exported" || echo "❌ missing"
grep -q "export async function\* generateIdeasStreaming" convex/agents/nodes/generateIdeas.ts && echo "✅ generateIdeasStreaming exported" || echo "❌ missing"

# 4. Verificar index.ts atualizado
grep -q "generateIdeasNode" convex/agents/nodes/index.ts && echo "✅ Exported from index" || echo "❌ missing"

# 5. Verificar prompt adicionado
grep -q "getIdeasPrompt" convex/agents/prompts.ts && echo "✅ getIdeasPrompt exists" || echo "❌ missing"

# 6. TypeScript
npx tsc --noEmit 2>&1 | grep -q "error" && echo "❌ TypeScript errors" || echo "✅ TypeScript OK"
```

**Card concluído quando todos os checks passam ✅**

---

## 📝 Notas Técnicas

### Por que `temperature: 0.7`?

Para ideas, queremos mais criatividade que para análise. Temperaturas mais altas (0.7-0.9) geram outputs mais diversos e criativos.

| Use Case | Temperature |
|----------|-------------|
| Planning/Analysis | 0.3 |
| Synthesis | 0.4 |
| Creative Ideas | 0.7 |

### Tratamento de Erros por Plataforma

O node continua mesmo se uma plataforma falhar:

```typescript
for (const platform of PLATFORMS) {
  try {
    // Generate ideas
  } catch (platformError) {
    console.error(`Error for ${platform}`);
    // Continue with next platform, don't throw
  }
}
```

### Generator vs Node

- `generateIdeasNode`: Usado pelo grafo, retorna todas as ideias de uma vez
- `generateIdeasStreaming`: Usado pelo action, yield cada ideia individualmente para streaming

---

## 🔗 Próximo Card

CARD-07-v3: Ideas Action + streamEvents
