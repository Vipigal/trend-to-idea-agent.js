export declare const getByThread: import("convex/server").RegisteredQuery<"public", {
    threadId: import("convex/values").GenericId<"threads">;
}, Promise<{
    _id: import("convex/values").GenericId<"messages">;
    _creationTime: number;
    metadata?: {
        step?: string | undefined;
        progress?: number | undefined;
    } | undefined;
    createdAt: number;
    role: import("./schema").MessageRoleEnum;
    messageType: import("./schema").MessageTypeEnum;
    threadId: import("convex/values").GenericId<"threads">;
    content: string;
}[]>>;
export declare const create: import("convex/server").RegisteredMutation<"public", {
    metadata?: {
        step?: string | undefined;
        progress?: number | undefined;
    } | undefined;
    role: import("./schema").MessageRoleEnum;
    messageType: import("./schema").MessageTypeEnum;
    threadId: import("convex/values").GenericId<"threads">;
    content: string;
}, Promise<import("convex/values").GenericId<"messages">>>;
export declare const updateContent: import("convex/server").RegisteredMutation<"public", {
    content: string;
    messageId: import("convex/values").GenericId<"messages">;
}, Promise<void>>;
export declare const createInternal: import("convex/server").RegisteredMutation<"internal", {
    metadata?: {
        step?: string | undefined;
        progress?: number | undefined;
    } | undefined;
    role: import("./schema").MessageRoleEnum;
    messageType: import("./schema").MessageTypeEnum;
    threadId: import("convex/values").GenericId<"threads">;
    content: string;
}, Promise<import("convex/values").GenericId<"messages">>>;
