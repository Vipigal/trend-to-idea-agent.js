export declare const runIdeasGeneration: import("convex/server").RegisteredAction<"internal", {
    threadId: import("convex/values").GenericId<"threads">;
}, Promise<{
    success: boolean;
    ideasCount: number;
    error?: undefined;
} | {
    success: boolean;
    error: string;
    ideasCount?: undefined;
}>>;
export declare const startIdeasGeneration: import("convex/server").RegisteredAction<"public", {
    threadId: import("convex/values").GenericId<"threads">;
}, Promise<{
    started: boolean;
}>>;
