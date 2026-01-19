interface StreamingTextProps {
  text: string;
  isStreaming?: boolean;
}

export function StreamingText({ text, isStreaming = false }: StreamingTextProps) {
  return (
    <span className={isStreaming ? "cursor-blink" : ""}>
      {text}
    </span>
  );
}
