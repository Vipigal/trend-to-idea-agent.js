"use node";

import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
 
export const langfuseSpanProcessor = new LangfuseSpanProcessor({
  exportMode: "immediate" 
});

const sdk = new NodeSDK({
  spanProcessors: [langfuseSpanProcessor],
});
 
sdk.start();