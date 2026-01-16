# CARD-03: LangGraph Setup

## 🎯 Objetivo

Configurar o LangGraph.js com a definição do estado e estrutura básica do grafo (sem implementação dos nós ainda).

## 📋 Dependências

- ✅ CARD-01 (Schema)
- ✅ CARD-02 (Convex Functions)

## 📁 Arquivos a Criar

- `convex/agents/state.ts`
- `convex/agents/graph.ts`
- `convex/agents/prompts.ts`

## 📦 Packages a Instalar

```bash
npm install @langchain/langgraph @langchain/openai @langchain/core
```

## 💻 Implementação

### convex/agents/state.ts

```typescript
// convex/agents/state.ts
import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

/**
 * Source information from Tavily search
 */
export interface Source {
  url: string;
  title: string;
  snippet?: string;
  publishedAt?: string;
}

/**
 * Synthesized trend from research
 */
export interface Trend {
  title: string;
  summary: string;
  whyItMatters: string;
  confidence: "high" | "medium" | "low";
  sources: Source[];
}

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

/**
 * Research plan extracted from user prompt
 */
export interface ResearchPlan {
  keywords: string[];
  timeframe: string; // "past_week", "past_month", etc.
  domain?: string;
  region?: string;
}

/**
 * Raw search result from Tavily
 */
export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  publishedDate?: string;
}

/**
 * Brand context for idea generation
 */
export interface BrandContext {
  name: string;
  voice: string;
  targetAudience: string;
  values: string[];
  doList: string[];
  dontList: string[];
}

/**
 * LangGraph State Definition
 * 
 * This is the central state that flows through all nodes in the graph.
 * Each node reads from and writes to this state.
 */
export const AgentState = Annotation.Root({
  // ============================================
  // INPUT
  // ============================================
  
  /** Original user prompt */
  userPrompt: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  
  /** Thread ID in Convex database */
  threadId: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  
  /** User's refinement feedback (if any) */
  refinementFeedback: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // ============================================
  // RESEARCH PHASE
  // ============================================
  
  /** Plan extracted from user prompt */
  researchPlan: Annotation<ResearchPlan | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  
  /** Raw results from Tavily search */
  searchResults: Annotation<SearchResult[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  
  /** Synthesized trends */
  trends: Annotation<Trend[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // ============================================
  // HITL STATE
  // ============================================
  
  /** Current HITL status */
  hitlStatus: Annotation<"pending" | "approved" | "refine" | "restart" | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // ============================================
  // IDEAS PHASE
  // ============================================
  
  /** Generated content ideas */
  ideas: Annotation<Idea[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  
  /** Brand context for idea generation */
  brandContext: Annotation<BrandContext>({
    reducer: (_, next) => next,
    default: () => ({
      name: "Gallium",
      voice: "Clear, sharp, slightly edgy, technical but human. No corporate fluff.",
      targetAudience: "Founders, growth leads, and small marketing teams who want to move faster with AI",
      values: ["Speed", "Leverage", "Rigor", "Systems thinking", "Modern taste"],
      doList: [
        "Concrete takeaways",
        "Strong opinions backed by evidence",
        "Punchy hooks",
        "'This actually works' energy",
        "Show don't tell"
      ],
      dontList: [
        "Corporate speak",
        "Vague platitudes", 
        "Excessive emojis",
        "Clickbait without substance",
        "Being preachy"
      ],
    }),
  }),

  // ============================================
  // CONTROL FLOW
  // ============================================
  
  /** Current step for progress tracking */
  currentStep: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "idle",
  }),
  
  /** Error message if any */
  error: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  
  /** Message history for LLM context */
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
});

/** Type alias for the state */
export type AgentStateType = typeof AgentState.State;
```

### convex/agents/graph.ts

```typescript
// convex/agents/graph.ts
import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState, AgentStateType } from "./state";

// ============================================
// NODE PLACEHOLDERS
// (Will be implemented in CARD-04 and CARD-06)
// ============================================

const planResearchNode = async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
  // TODO: CARD-04
  console.log("[PLAN] Planning research for:", state.userPrompt);
  return { currentStep: "plan" };
};

const searchNode = async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
  // TODO: CARD-04
  console.log("[SEARCH] Searching with Tavily...");
  return { currentStep: "search" };
};

const synthesizeNode = async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
  // TODO: CARD-04
  console.log("[SYNTHESIZE] Analyzing results...");
  return { currentStep: "synthesize" };
};

const awaitApprovalNode = async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
  // This node just marks the state for HITL
  console.log("[AWAIT_APPROVAL] Waiting for user approval...");
  return { 
    currentStep: "await_approval",
    hitlStatus: "pending" 
  };
};

const generateIdeasNode = async (state: AgentStateType): Promise<Partial<AgentStateType>> => {
  // TODO: CARD-06
  console.log("[GENERATE_IDEAS] Generating content ideas...");
  return { currentStep: "generate_ideas" };
};

// ============================================
// ROUTING FUNCTIONS
// ============================================

/**
 * Router after HITL checkpoint
 * Determines next step based on user action
 */
const routeAfterApproval = (state: AgentStateType): string => {
  console.log("[ROUTER] HITL status:", state.hitlStatus);
  
  switch (state.hitlStatus) {
    case "approved":
      return "generate_ideas";
    case "refine":
      return "plan_research"; // Go back to planning with feedback
    case "restart":
      return "plan_research"; // Start fresh
    case "pending":
    default:
      return END; // Wait for user input (graph pauses)
  }
};

// ============================================
// GRAPH DEFINITION
// ============================================

const workflow = new StateGraph(AgentState)
  // Add nodes
  .addNode("plan_research", planResearchNode)
  .addNode("search", searchNode)
  .addNode("synthesize", synthesizeNode)
  .addNode("await_approval", awaitApprovalNode)
  .addNode("generate_ideas", generateIdeasNode)
  
  // Linear edges for research phase
  .addEdge(START, "plan_research")
  .addEdge("plan_research", "search")
  .addEdge("search", "synthesize")
  .addEdge("synthesize", "await_approval")
  
  // Conditional edge after HITL
  .addConditionalEdges(
    "await_approval",
    routeAfterApproval,
    {
      plan_research: "plan_research",
      generate_ideas: "generate_ideas",
      [END]: END,
    }
  )
  
  // Final edge
  .addEdge("generate_ideas", END);

/**
 * Compiled graph ready for execution
 * 
 * Usage:
 * ```typescript
 * const result = await graph.invoke({
 *   userPrompt: "What's trending in AI?",
 *   threadId: "thread_123",
 * });
 * ```
 */
export const graph = workflow.compile();

/**
 * For streaming execution
 * 
 * Usage:
 * ```typescript
 * for await (const chunk of graph.stream({...})) {
 *   console.log(chunk);
 * }
 * ```
 */
export { workflow };
```

### convex/agents/prompts.ts

```typescript
// convex/agents/prompts.ts
import { BrandContext } from "./state";

/**
 * System prompt for the research planning phase
 */
export const PLAN_RESEARCH_PROMPT = `You are a trend research analyst. Your job is to analyze a user's request and create a research plan.

Given a user prompt, extract:
1. Keywords to search for (2-5 specific terms)
2. Timeframe (default: "past_week")
3. Domain/industry if specified
4. Geographic region if specified

Respond in JSON format:
{
  "keywords": ["keyword1", "keyword2"],
  "timeframe": "past_week",
  "domain": "technology",
  "region": null
}

Be specific with keywords. For example:
- "creator economy" → ["creator monetization", "creator economy 2024", "influencer revenue models"]
- "AI trends" → ["artificial intelligence trends", "generative AI business", "AI startup funding"]
`;

/**
 * System prompt for synthesizing search results into trends
 */
export const SYNTHESIZE_PROMPT = `You are a trend analyst. Your job is to synthesize search results into clear, actionable trends.

Analyze the search results and identify 5-8 distinct trends. For each trend:
1. Give it a clear, specific title
2. Write a 1-2 sentence summary
3. Explain why it matters (business/marketing implications)
4. Assign confidence: "high" (multiple reliable sources), "medium" (some sources), "low" (emerging/speculative)

Respond in JSON format:
{
  "trends": [
    {
      "title": "Trend Title",
      "summary": "Brief summary...",
      "whyItMatters": "Why marketers should care...",
      "confidence": "high",
      "sourceIndices": [0, 2, 5]  // Indices of sources that support this trend
    }
  ]
}

Guidelines:
- Be specific, not generic ("TikTok Shop driving impulse purchases" > "Social commerce growing")
- Focus on actionable insights
- Group related findings into single trends
- Prioritize recent and reliable sources
`;

/**
 * System prompt for generating content ideas
 */
export const getIdeasPrompt = (brandContext: BrandContext, platform: string) => `You are a content strategist for ${brandContext.name}.

## Brand Voice
${brandContext.voice}

## Target Audience
${brandContext.targetAudience}

## Core Values
${brandContext.values.map(v => `- ${v}`).join('\n')}

## Content Guidelines
DO:
${brandContext.doList.map(d => `- ${d}`).join('\n')}

DON'T:
${brandContext.dontList.map(d => `- ${d}`).join('\n')}

## Platform: ${platform.toUpperCase()}
${getPlatformGuidelines(platform)}

## Your Task
Generate 2-3 content ideas for ${platform} based on the given trend.

For each idea provide:
{
  "hook": "The opening line that stops the scroll (max 15 words)",
  "format": "post | thread | video | carousel | story",
  "angle": "Why this specific take will resonate with the audience",
  "description": "What the content will cover (2-3 sentences)"
}

Be concrete and specific. Every idea should be immediately actionable.
`;

/**
 * Platform-specific content guidelines
 */
const getPlatformGuidelines = (platform: string): string => {
  const guidelines: Record<string, string> = {
    linkedin: `
- Professional but not boring
- First line is crucial (shows in preview)
- Personal stories + data work well
- Optimal length: 1200-1500 characters
- Use line breaks for readability`,
    
    twitter: `
- Punchy, opinionated takes
- First tweet must hook immediately
- Threads work for complex topics
- Use numbers and specifics
- Optimal: 280 chars for single, 5-10 tweets for thread`,
    
    tiktok: `
- Hook in first 3 seconds
- Educational + entertaining
- Trending sounds/formats help
- Behind-the-scenes performs well
- Optimal: 30-60 seconds`,
    
    instagram: `
- Visual-first thinking
- Carousel posts for education
- Strong first slide hook
- Save-worthy content
- Optimal: 7-10 carousel slides`,
  };
  
  return guidelines[platform] || "Adapt to platform best practices.";
};

/**
 * Prompt for handling refinement feedback
 */
export const REFINEMENT_PROMPT = `The user has provided feedback on the research results.

Previous research focused on: {previousKeywords}
User feedback: {feedback}

Adjust the research plan based on this feedback. You might need to:
- Narrow or broaden the scope
- Focus on different aspects
- Exclude certain topics
- Add new keywords

Respond with an updated research plan in the same JSON format.
`;
```

## ✅ Acceptance Criteria

1. [ ] `convex/agents/state.ts` defines AgentState with all required fields
2. [ ] `convex/agents/graph.ts` creates a valid StateGraph with 5 nodes
3. [ ] `convex/agents/prompts.ts` has all prompt templates
4. [ ] Graph compiles without errors
5. [ ] State types are properly exported

## 🛑 Stop Conditions

```bash
# 1. Verificar que arquivos existem
for file in state graph prompts; do
  test -f "convex/agents/${file}.ts" && echo "✅ ${file}.ts exists" || echo "❌ ${file}.ts missing"
done

# 2. Verificar que packages estão instalados
npm list @langchain/langgraph 2>/dev/null | grep -q "langgraph" && echo "✅ LangGraph installed" || echo "❌ LangGraph missing"

# 3. Verificar compilação TypeScript
npx tsc --noEmit convex/agents/*.ts 2>&1 | grep -q "error" && echo "❌ TypeScript errors" || echo "✅ TypeScript OK"

# 4. Verificar exports do state
grep -q "export const AgentState" convex/agents/state.ts && echo "✅ AgentState exported" || echo "❌ AgentState not exported"
grep -q "export type AgentStateType" convex/agents/state.ts && echo "✅ AgentStateType exported" || echo "❌ AgentStateType not exported"

# 5. Verificar que graph compila (node check)
node -e "require('./convex/agents/graph.ts')" 2>&1 | grep -q "error" && echo "❌ Graph errors" || echo "✅ Graph compiles"
```

**Card concluído quando todos os checks passam ✅**

## 📝 Notas

- Os nós são placeholders neste card - serão implementados em CARD-04 e CARD-06
- O grafo usa `addConditionalEdges` para o HITL routing
- BrandContext do Gallium está hardcoded como default no state
- Prompts usam JSON para structured output do LLM
