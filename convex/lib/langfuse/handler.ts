"use node";

import { CallbackHandler } from "@langfuse/langchain";

export function getLangfuseHandler(threadId: string) {
  const langfuseHandler = new CallbackHandler({
      sessionId: threadId, // <--- CRITICAL: Maps your thread to a Langfuse Session
    });
  return langfuseHandler;
}