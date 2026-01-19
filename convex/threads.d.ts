import { ThreadStatusEnum } from "./schema";
export declare const get: import("convex/server").RegisteredQuery<"public", {
    threadId: import("convex/values").GenericId<"threads">;
}, Promise<{
    _id: import("convex/values").GenericId<"threads">;
    _creationTime: number;
    refinementFeedback?: string | undefined;
    title: string;
    status: ThreadStatusEnum;
    userPrompt: string;
    createdAt: number;
    updatedAt: number;
} | null>>;
export declare const list: import("convex/server").RegisteredQuery<"public", {}, Promise<{
    _id: import("convex/values").GenericId<"threads">;
    _creationTime: number;
    refinementFeedback?: string | undefined;
    title: string;
    status: ThreadStatusEnum;
    userPrompt: string;
    createdAt: number;
    updatedAt: number;
}[]>>;
export declare const getByStatus: import("convex/server").RegisteredQuery<"public", {
    status: ThreadStatusEnum;
}, Promise<{
    _id: import("convex/values").GenericId<"threads">;
    _creationTime: number;
    refinementFeedback?: string | undefined;
    title: string;
    status: ThreadStatusEnum;
    userPrompt: string;
    createdAt: number;
    updatedAt: number;
}[]>>;
export declare const create: import("convex/server").RegisteredMutation<"public", {
    userPrompt: string;
}, Promise<import("convex/values").GenericId<"threads">>>;
export declare const updateStatus: import("convex/server").RegisteredMutation<"public", {
    status: ThreadStatusEnum;
    threadId: import("convex/values").GenericId<"threads">;
}, Promise<void>>;
export declare const approve: import("convex/server").RegisteredMutation<"public", {
    threadId: import("convex/values").GenericId<"threads">;
}, Promise<{
    success: boolean;
}>>;
export declare const refine: import("convex/server").RegisteredMutation<"public", {
    threadId: import("convex/values").GenericId<"threads">;
    feedback: string;
}, Promise<{
    success: boolean;
}>>;
export declare const restart: import("convex/server").RegisteredMutation<"public", {
    threadId: import("convex/values").GenericId<"threads">;
}, Promise<{
    success: boolean;
}>>;
export declare const getInternal: import("convex/server").RegisteredQuery<"internal", {
    threadId: import("convex/values").GenericId<"threads">;
}, Promise<{
    _id: import("convex/values").GenericId<"threads">;
    _creationTime: number;
    refinementFeedback?: string | undefined;
    title: string;
    status: ThreadStatusEnum;
    userPrompt: string;
    createdAt: number;
    updatedAt: number;
} | null>>;
export declare const updateStatusInternal: import("convex/server").RegisteredMutation<"internal", {
    status: ThreadStatusEnum;
    threadId: import("convex/values").GenericId<"threads">;
}, Promise<void>>;
