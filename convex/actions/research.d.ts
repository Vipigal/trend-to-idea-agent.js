export declare const runResearchGraph: import("convex/server").RegisteredAction<"internal", {
    refinementFeedback?: string | undefined;
    userPrompt: string;
    threadId: import("convex/values").GenericId<"threads">;
}, Promise<{
    success: boolean;
    trends?: Array<{
        title: string;
        summary: string;
        whyItMatters: string;
        confidence: string;
        sources: Array<{
            url: string;
            title: string;
            snippet?: string;
            publishedAt?: string;
        }>;
    }>;
    error?: string;
}>>;
export declare const startResearch: import("convex/server").RegisteredAction<"public", {
    threadId: import("convex/values").GenericId<"threads">;
}, Promise<{
    started: boolean;
}>>;
