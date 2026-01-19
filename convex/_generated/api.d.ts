/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions_ideas from "../actions/ideas.js";
import type * as actions_research from "../actions/research.js";
import type * as agents_graph from "../agents/graph.js";
import type * as agents_nodes_generateIdeas from "../agents/nodes/generateIdeas.js";
import type * as agents_nodes_index from "../agents/nodes/index.js";
import type * as agents_nodes_plan from "../agents/nodes/plan.js";
import type * as agents_nodes_search from "../agents/nodes/search.js";
import type * as agents_nodes_synthesize from "../agents/nodes/synthesize.js";
import type * as agents_prompts from "../agents/prompts.js";
import type * as agents_state from "../agents/state.js";
import type * as http from "../http.js";
import type * as ideas from "../ideas.js";
import type * as lib_langfuse_handler from "../lib/langfuse/handler.js";
import type * as lib_langfuse_instrumentation from "../lib/langfuse/instrumentation.js";
import type * as messages from "../messages.js";
import type * as threads from "../threads.js";
import type * as trends from "../trends.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "actions/ideas": typeof actions_ideas;
  "actions/research": typeof actions_research;
  "agents/graph": typeof agents_graph;
  "agents/nodes/generateIdeas": typeof agents_nodes_generateIdeas;
  "agents/nodes/index": typeof agents_nodes_index;
  "agents/nodes/plan": typeof agents_nodes_plan;
  "agents/nodes/search": typeof agents_nodes_search;
  "agents/nodes/synthesize": typeof agents_nodes_synthesize;
  "agents/prompts": typeof agents_prompts;
  "agents/state": typeof agents_state;
  http: typeof http;
  ideas: typeof ideas;
  "lib/langfuse/handler": typeof lib_langfuse_handler;
  "lib/langfuse/instrumentation": typeof lib_langfuse_instrumentation;
  messages: typeof messages;
  threads: typeof threads;
  trends: typeof trends;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
