import { useQuery, useMutation } from "convex/react";
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
  const approve = useMutation(api.threads.approve);
  const refine = useMutation(api.threads.refine);
  const restart = useMutation(api.threads.restart);

  return {
    thread,
    messages: messages || [],
    trends: trends || [],
    createThread,
    updateStatus,
    approve,
    refine,
    restart,
    isLoading: thread === undefined,
  };
}
