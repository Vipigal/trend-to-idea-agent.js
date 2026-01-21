import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export function useThread(threadId: Id<"threads"> | null) {
  const thread = useQuery(
    api.threads.get,
    threadId ? { threadId } : "skip"
  );

  const messages = useQuery(
    api.messages.getByThread,
    threadId ? { threadId } : "skip"
  );

  const trends = useQuery(
    api.trends.getByThread,
    threadId ? { threadId } : "skip"
  );

  const createThread = useMutation(api.threads.create);
  const updateStatus = useMutation(api.threads.updateStatus);

  const approve = useAction(api.actions.hitl.approve);
  const refine = useAction(api.actions.hitl.refine);
  const restart = useAction(api.actions.hitl.restart);
  const startResearch = useAction(api.actions.research.startResearch);

  return {
    thread,
    messages: messages || [],
    trends: trends || [],
    createThread,
    updateStatus,
    approve,
    refine,
    restart,
    startResearch,
    isLoading: thread === undefined,
  };
}
