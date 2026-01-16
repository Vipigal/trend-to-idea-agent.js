/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agents_graph from "../agents/graph.js";
import type * as agents_nodes_index from "../agents/nodes/index.js";
import type * as agents_nodes_plan from "../agents/nodes/plan.js";
import type * as agents_nodes_search from "../agents/nodes/search.js";
import type * as agents_nodes_synthesize from "../agents/nodes/synthesize.js";
import type * as agents_prompts from "../agents/prompts.js";
import type * as agents_state from "../agents/state.js";
import type * as ideas from "../ideas.js";
import type * as messages from "../messages.js";
import type * as threads from "../threads.js";
import type * as trends from "../trends.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "agents/graph": typeof agents_graph;
  "agents/nodes/index": typeof agents_nodes_index;
  "agents/nodes/plan": typeof agents_nodes_plan;
  "agents/nodes/search": typeof agents_nodes_search;
  "agents/nodes/synthesize": typeof agents_nodes_synthesize;
  "agents/prompts": typeof agents_prompts;
  "agents/state": typeof agents_state;
  ideas: typeof ideas;
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
