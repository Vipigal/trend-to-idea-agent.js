"use node";

import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  AgentStateType,
  IdeaState,
  TrendState,
  BrandContextState,
} from "../state";
import { getIdeasPrompt } from "../prompts";
import { PlatformEnum, ThreadStatusEnum } from "../../schema";

const model = new ChatOpenAI({
  modelName: "gpt-4o",
  temperature: 0.7,
  streaming: true,
});

interface IdeaResponse {
  ideas: Array<{
    hook: string;
    format: string;
    angle: string;
    description: string;
  }>;
}

const PLATFORMS: PlatformEnum[] = [
  PlatformEnum.LinkedIn,
  PlatformEnum.Twitter,
  PlatformEnum.TikTok,
];

export const generateIdeasNode = async (
  state: AgentStateType
): Promise<Partial<AgentStateType>> => {
  console.log("[GENERATE_IDEAS] Starting idea generation...");
  console.log(`[GENERATE_IDEAS] Trends count: ${state.trends.length}`);

  if (!state.trends || state.trends.length === 0) {
    return {
      error: "No trends available for idea generation",
      currentStep: ThreadStatusEnum.Error,
    };
  }

  const allIdeas: IdeaState[] = [];

  try {
    for (let trendIndex = 0; trendIndex < state.trends.length; trendIndex++) {
      const trend = state.trends[trendIndex];
      console.log(
        `[GENERATE_IDEAS] Processing trend ${trendIndex + 1}/${state.trends.length}: ${trend.title}`
      );

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

        const content = response.content as string;
        const jsonMatch = content.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          try {
            const parsed: IdeaResponse = JSON.parse(jsonMatch[0]);

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
            console.warn(
              `[GENERATE_IDEAS] Failed to parse ${platform} ideas for trend ${trendIndex}`
            );
          }
        }
      }
    }

    console.log(`[GENERATE_IDEAS] Generated ${allIdeas.length} total ideas`);

    return {
      ideas: allIdeas,
      currentStep: ThreadStatusEnum.GeneratingIdeas,
      error: null,
    };
  } catch (error) {
    console.error("[GENERATE_IDEAS] Error:", error);
    return {
      error: `Idea generation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      currentStep: ThreadStatusEnum.Error,
    };
  }
};

export async function* generateIdeasStreaming(
  trends: TrendState[],
  brandContext: BrandContextState
): AsyncGenerator<{
  type: "status" | "idea" | "complete" | "error";
  platform?: PlatformEnum;
  trendIndex?: number;
  idea?: IdeaState;
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
              const idea: IdeaState = {
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
