import { useState, useCallback, useRef } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { API_ENDPOINTS } from "../lib/constants";

interface StreamEvent {
  type: "start" | "status" | "plan" | "trend" | "hitl" | "complete" | "error" | "done";
  message?: string;
  step?: string;
  keywords?: string[];
  trend?: unknown;
  status?: string;
  trendsCount?: number;
}

export function useResearchStream() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startStream = useCallback(async (threadId: Id<"threads">) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsStreaming(true);
    setEvents([]);
    setError(null);

    try {
      const response = await fetch(API_ENDPOINTS.streamResearch, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6)) as StreamEvent;
              setEvents((prev) => [...prev, data]);

              if (data.type === "error") {
                setError(data.message || "Unknown error");
              }
            } catch {
              console.warn("Failed to parse SSE event:", line);
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(err.message);
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  return {
    isStreaming,
    events,
    error,
    startStream,
    stopStream,
  };
}
