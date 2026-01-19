export declare const getByThread: import("convex/server").RegisteredQuery<"public", {
    threadId: import("convex/values").GenericId<"threads">;
}, Promise<{
    _id: import("convex/values").GenericId<"ideas">;
    _creationTime: number;
    variants?: {
        hook: string;
        angle: string;
    }[] | undefined;
    createdAt: number;
    threadId: import("convex/values").GenericId<"threads">;
    platform: import("./schema").PlatformEnum;
    trendId: import("convex/values").GenericId<"trends">;
    hook: string;
    format: string;
    angle: string;
    description: string;
}[]>>;
export declare const getByPlatform: import("convex/server").RegisteredQuery<"public", {
    threadId: import("convex/values").GenericId<"threads">;
    platform: import("./schema").PlatformEnum;
}, Promise<{
    _id: import("convex/values").GenericId<"ideas">;
    _creationTime: number;
    variants?: {
        hook: string;
        angle: string;
    }[] | undefined;
    createdAt: number;
    threadId: import("convex/values").GenericId<"threads">;
    platform: import("./schema").PlatformEnum;
    trendId: import("convex/values").GenericId<"trends">;
    hook: string;
    format: string;
    angle: string;
    description: string;
}[]>>;
export declare const create: import("convex/server").RegisteredMutation<"public", {
    variants?: {
        hook: string;
        angle: string;
    }[] | undefined;
    threadId: import("convex/values").GenericId<"threads">;
    platform: import("./schema").PlatformEnum;
    trendId: import("convex/values").GenericId<"trends">;
    hook: string;
    format: string;
    angle: string;
    description: string;
}, Promise<import("convex/values").GenericId<"ideas">>>;
export declare const deleteByThread: import("convex/server").RegisteredMutation<"public", {
    threadId: import("convex/values").GenericId<"threads">;
}, Promise<void>>;
export declare const getByThreadInternal: import("convex/server").RegisteredQuery<"internal", {
    threadId: import("convex/values").GenericId<"threads">;
}, Promise<{
    _id: import("convex/values").GenericId<"ideas">;
    _creationTime: number;
    variants?: {
        hook: string;
        angle: string;
    }[] | undefined;
    createdAt: number;
    threadId: import("convex/values").GenericId<"threads">;
    platform: import("./schema").PlatformEnum;
    trendId: import("convex/values").GenericId<"trends">;
    hook: string;
    format: string;
    angle: string;
    description: string;
}[]>>;
export declare const getByPlatformInternal: import("convex/server").RegisteredQuery<"internal", {
    threadId: import("convex/values").GenericId<"threads">;
    platform: import("./schema").PlatformEnum;
}, Promise<{
    _id: import("convex/values").GenericId<"ideas">;
    _creationTime: number;
    variants?: {
        hook: string;
        angle: string;
    }[] | undefined;
    createdAt: number;
    threadId: import("convex/values").GenericId<"threads">;
    platform: import("./schema").PlatformEnum;
    trendId: import("convex/values").GenericId<"trends">;
    hook: string;
    format: string;
    angle: string;
    description: string;
}[]>>;
export declare const createInternal: import("convex/server").RegisteredMutation<"internal", {
    variants?: {
        hook: string;
        angle: string;
    }[] | undefined;
    threadId: import("convex/values").GenericId<"threads">;
    platform: import("./schema").PlatformEnum;
    trendId: import("convex/values").GenericId<"trends">;
    hook: string;
    format: string;
    angle: string;
    description: string;
}, Promise<import("convex/values").GenericId<"ideas">>>;
export declare const deleteByThreadInternal: import("convex/server").RegisteredMutation<"internal", {
    threadId: import("convex/values").GenericId<"threads">;
}, Promise<void>>;
