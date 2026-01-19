export declare const getByThread: import("convex/server").RegisteredQuery<"public", {
    threadId: import("convex/values").GenericId<"threads">;
}, Promise<{
    _id: import("convex/values").GenericId<"trends">;
    _creationTime: number;
    title: string;
    createdAt: number;
    threadId: import("convex/values").GenericId<"threads">;
    confidence: import("./schema").ConfidenceEnum;
    summary: string;
    whyItMatters: string;
    sources: {
        snippet?: string | undefined;
        publishedAt?: string | undefined;
        url: string;
        title: string;
    }[];
    order: number;
}[]>>;
export declare const create: import("convex/server").RegisteredMutation<"public", {
    title: string;
    threadId: import("convex/values").GenericId<"threads">;
    confidence: import("./schema").ConfidenceEnum;
    summary: string;
    whyItMatters: string;
    sources: {
        snippet?: string | undefined;
        publishedAt?: string | undefined;
        url: string;
        title: string;
    }[];
    order: number;
}, Promise<import("convex/values").GenericId<"trends">>>;
export declare const createBatch: import("convex/server").RegisteredMutation<"public", {
    threadId: import("convex/values").GenericId<"threads">;
    trends: {
        title: string;
        confidence: import("./schema").ConfidenceEnum;
        summary: string;
        whyItMatters: string;
        sources: {
            snippet?: string | undefined;
            publishedAt?: string | undefined;
            url: string;
            title: string;
        }[];
    }[];
}, Promise<import("convex/values").GenericId<"trends">[]>>;
export declare const deleteByThread: import("convex/server").RegisteredMutation<"public", {
    threadId: import("convex/values").GenericId<"threads">;
}, Promise<void>>;
export declare const getByThreadInternal: import("convex/server").RegisteredQuery<"internal", {
    threadId: import("convex/values").GenericId<"threads">;
}, Promise<{
    _id: import("convex/values").GenericId<"trends">;
    _creationTime: number;
    title: string;
    createdAt: number;
    threadId: import("convex/values").GenericId<"threads">;
    confidence: import("./schema").ConfidenceEnum;
    summary: string;
    whyItMatters: string;
    sources: {
        snippet?: string | undefined;
        publishedAt?: string | undefined;
        url: string;
        title: string;
    }[];
    order: number;
}[]>>;
export declare const createBatchInternal: import("convex/server").RegisteredMutation<"internal", {
    threadId: import("convex/values").GenericId<"threads">;
    trends: {
        title: string;
        confidence: import("./schema").ConfidenceEnum;
        summary: string;
        whyItMatters: string;
        sources: {
            snippet?: string | undefined;
            publishedAt?: string | undefined;
            url: string;
            title: string;
        }[];
    }[];
}, Promise<import("convex/values").GenericId<"trends">[]>>;
