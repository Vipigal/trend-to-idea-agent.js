export declare enum ThreadStatusEnum {
    Idle = "idle",
    Planning = "planning",
    Searching = "searching",
    Synthesizing = "synthesizing",
    AwaitingApproval = "awaiting_approval",
    GeneratingIdeas = "generating_ideas",
    Completed = "completed",
    Error = "error"
}
export declare const threadStatusValidator: import("convex/values").VUnion<ThreadStatusEnum, import("convex/values").VLiteral<ThreadStatusEnum, "required">[], "required", never>;
export declare enum MessageRoleEnum {
    User = "user",
    Assistant = "assistant",
    System = "system"
}
export declare const messagesRoleValidator: import("convex/values").VUnion<MessageRoleEnum, import("convex/values").VLiteral<MessageRoleEnum, "required">[], "required", never>;
export declare enum MessageTypeEnum {
    UserInput = "user_input",
    StatusUpdate = "status_update",
    ResearchResult = "research_result",
    Error = "error"
}
export declare const messageTypeValidator: import("convex/values").VUnion<MessageTypeEnum, import("convex/values").VLiteral<MessageTypeEnum, "required">[], "required", never>;
export declare enum StreamTypeEnum {
    Research = "research",
    Ideas = "ideas"
}
export declare const streamTypeValidator: import("convex/values").VUnion<StreamTypeEnum, import("convex/values").VLiteral<StreamTypeEnum, "required">[], "required", never>;
export declare enum ConfidenceEnum {
    High = "high",
    Medium = "medium",
    Low = "low"
}
export declare const confidenceValidator: import("convex/values").VUnion<ConfidenceEnum, import("convex/values").VLiteral<ConfidenceEnum, "required">[], "required", never>;
export declare const sourceValidator: import("convex/values").VObject<{
    snippet?: string | undefined;
    publishedAt?: string | undefined;
    url: string;
    title: string;
}, {
    url: import("convex/values").VString<string, "required">;
    title: import("convex/values").VString<string, "required">;
    snippet: import("convex/values").VString<string | undefined, "optional">;
    publishedAt: import("convex/values").VString<string | undefined, "optional">;
}, "required", "url" | "title" | "snippet" | "publishedAt">;
export declare enum PlatformEnum {
    LinkedIn = "linkedin",
    Twitter = "twitter",
    TikTok = "tiktok",
    Instagram = "instagram"
}
export declare const platformValidator: import("convex/values").VUnion<PlatformEnum, import("convex/values").VLiteral<PlatformEnum, "required">[], "required", never>;
declare const _default: import("convex/server").SchemaDefinition<{
    threads: import("convex/server").TableDefinition<import("convex/values").VObject<{
        refinementFeedback?: string | undefined;
        title: string;
        status: ThreadStatusEnum;
        userPrompt: string;
        createdAt: number;
        updatedAt: number;
    }, {
        title: import("convex/values").VString<string, "required">;
        status: import("convex/values").VUnion<ThreadStatusEnum, import("convex/values").VLiteral<ThreadStatusEnum, "required">[], "required", never>;
        userPrompt: import("convex/values").VString<string, "required">;
        refinementFeedback: import("convex/values").VString<string | undefined, "optional">;
        createdAt: import("convex/values").VFloat64<number, "required">;
        updatedAt: import("convex/values").VFloat64<number, "required">;
    }, "required", "title" | "status" | "userPrompt" | "refinementFeedback" | "createdAt" | "updatedAt">, {
        by_status: ["status", "_creationTime"];
        by_createdAt: ["createdAt", "_creationTime"];
    }, {}, {}>;
    messages: import("convex/server").TableDefinition<import("convex/values").VObject<{
        metadata?: {
            step?: string | undefined;
            progress?: number | undefined;
        } | undefined;
        createdAt: number;
        role: MessageRoleEnum;
        messageType: MessageTypeEnum;
        threadId: import("convex/values").GenericId<"threads">;
        content: string;
    }, {
        threadId: import("convex/values").VId<import("convex/values").GenericId<"threads">, "required">;
        role: import("convex/values").VUnion<MessageRoleEnum, import("convex/values").VLiteral<MessageRoleEnum, "required">[], "required", never>;
        content: import("convex/values").VString<string, "required">;
        messageType: import("convex/values").VUnion<MessageTypeEnum, import("convex/values").VLiteral<MessageTypeEnum, "required">[], "required", never>;
        metadata: import("convex/values").VObject<{
            step?: string | undefined;
            progress?: number | undefined;
        } | undefined, {
            step: import("convex/values").VString<string | undefined, "optional">;
            progress: import("convex/values").VFloat64<number | undefined, "optional">;
        }, "optional", "step" | "progress">;
        createdAt: import("convex/values").VFloat64<number, "required">;
    }, "required", "createdAt" | "role" | "messageType" | "threadId" | "content" | "metadata" | "metadata.step" | "metadata.progress">, {
        by_thread: ["threadId", "_creationTime"];
        by_thread_and_time: ["threadId", "createdAt", "_creationTime"];
    }, {}, {}>;
    trends: import("convex/server").TableDefinition<import("convex/values").VObject<{
        title: string;
        createdAt: number;
        threadId: import("convex/values").GenericId<"threads">;
        confidence: ConfidenceEnum;
        summary: string;
        whyItMatters: string;
        sources: {
            snippet?: string | undefined;
            publishedAt?: string | undefined;
            url: string;
            title: string;
        }[];
        order: number;
    }, {
        threadId: import("convex/values").VId<import("convex/values").GenericId<"threads">, "required">;
        title: import("convex/values").VString<string, "required">;
        summary: import("convex/values").VString<string, "required">;
        whyItMatters: import("convex/values").VString<string, "required">;
        confidence: import("convex/values").VUnion<ConfidenceEnum, import("convex/values").VLiteral<ConfidenceEnum, "required">[], "required", never>;
        sources: import("convex/values").VArray<{
            snippet?: string | undefined;
            publishedAt?: string | undefined;
            url: string;
            title: string;
        }[], import("convex/values").VObject<{
            snippet?: string | undefined;
            publishedAt?: string | undefined;
            url: string;
            title: string;
        }, {
            url: import("convex/values").VString<string, "required">;
            title: import("convex/values").VString<string, "required">;
            snippet: import("convex/values").VString<string | undefined, "optional">;
            publishedAt: import("convex/values").VString<string | undefined, "optional">;
        }, "required", "url" | "title" | "snippet" | "publishedAt">, "required">;
        order: import("convex/values").VFloat64<number, "required">;
        createdAt: import("convex/values").VFloat64<number, "required">;
    }, "required", "title" | "createdAt" | "threadId" | "confidence" | "summary" | "whyItMatters" | "sources" | "order">, {
        by_thread: ["threadId", "_creationTime"];
        by_thread_and_order: ["threadId", "order", "_creationTime"];
    }, {}, {}>;
    ideas: import("convex/server").TableDefinition<import("convex/values").VObject<{
        variants?: {
            hook: string;
            angle: string;
        }[] | undefined;
        createdAt: number;
        threadId: import("convex/values").GenericId<"threads">;
        platform: PlatformEnum;
        trendId: import("convex/values").GenericId<"trends">;
        hook: string;
        format: string;
        angle: string;
        description: string;
    }, {
        threadId: import("convex/values").VId<import("convex/values").GenericId<"threads">, "required">;
        trendId: import("convex/values").VId<import("convex/values").GenericId<"trends">, "required">;
        platform: import("convex/values").VUnion<PlatformEnum, import("convex/values").VLiteral<PlatformEnum, "required">[], "required", never>;
        hook: import("convex/values").VString<string, "required">;
        format: import("convex/values").VString<string, "required">;
        angle: import("convex/values").VString<string, "required">;
        description: import("convex/values").VString<string, "required">;
        variants: import("convex/values").VArray<{
            hook: string;
            angle: string;
        }[] | undefined, import("convex/values").VObject<{
            hook: string;
            angle: string;
        }, {
            hook: import("convex/values").VString<string, "required">;
            angle: import("convex/values").VString<string, "required">;
        }, "required", "hook" | "angle">, "optional">;
        createdAt: import("convex/values").VFloat64<number, "required">;
    }, "required", "createdAt" | "threadId" | "platform" | "trendId" | "hook" | "format" | "angle" | "description" | "variants">, {
        by_thread: ["threadId", "_creationTime"];
        by_trend: ["trendId", "_creationTime"];
        by_platform: ["threadId", "platform", "_creationTime"];
    }, {}, {}>;
    streamState: import("convex/server").TableDefinition<import("convex/values").VObject<{
        createdAt: number;
        updatedAt: number;
        threadId: import("convex/values").GenericId<"threads">;
        content: string;
        streamType: StreamTypeEnum;
        isComplete: boolean;
    }, {
        threadId: import("convex/values").VId<import("convex/values").GenericId<"threads">, "required">;
        streamType: import("convex/values").VUnion<StreamTypeEnum, import("convex/values").VLiteral<StreamTypeEnum, "required">[], "required", never>;
        content: import("convex/values").VString<string, "required">;
        isComplete: import("convex/values").VBoolean<boolean, "required">;
        createdAt: import("convex/values").VFloat64<number, "required">;
        updatedAt: import("convex/values").VFloat64<number, "required">;
    }, "required", "createdAt" | "updatedAt" | "threadId" | "content" | "streamType" | "isComplete">, {
        by_thread_type: ["threadId", "streamType", "_creationTime"];
    }, {}, {}>;
}, true>;
export default _default;
