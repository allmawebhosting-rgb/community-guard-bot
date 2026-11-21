"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UIMessage } from "ai";
import { ArrowDownIcon, DownloadIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export const Conversation = ({ className, ...props }: ConversationProps) => (
  <StickToBottom
    className={cn("relative flex h-full min-h-0 flex-1 overflow-hidden", className)}
    initial="smooth"
    // Instant resize avoids fighting the user when SOS cards / images change height.
    resize="instant"
    role="log"
    {...props}
  />
);

export type ConversationContentProps = ComponentProps<
  typeof StickToBottom.Content
>;

export const ConversationContent = ({
  className,
  ...props
}: ConversationContentProps) => (
  <StickToBottom.Content
    className={cn("flex min-h-full flex-col gap-8 p-4", className)}
    scrollClassName="overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]"
    {...props}
  />
);

export type ConversationEmptyStateProps = ComponentProps<"div"> & {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
};

export const ConversationEmptyState = ({
  className,
  title = "No messages yet",
  description = "Start a conversation to see messages here",
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) => (
  <div
    className={cn(
      "flex size-full flex-col items-center justify-center gap-3 p-8 text-center",
      className
    )}
    {...props}
  >
    {children ?? (
      <>
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <div className="space-y-1">
          <h3 className="font-medium text-sm">{title}</h3>
          {description && (
            <p className="text-muted-foreground text-sm">{description}</p>
          )}
        </div>
      </>
    )}
  </div>
);

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

export const ConversationScrollButton = ({
  className,
  ...props
}: ConversationScrollButtonProps) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  return (
    !isAtBottom && (
      <Button
        className={cn(
          "absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full dark:bg-background dark:hover:bg-muted",
          className
        )}
        onClick={handleScrollToBottom}
        size="icon"
        type="button"
        variant="outline"
        {...props}
      >
        <ArrowDownIcon className="size-4" />
      </Button>
    )
  );
};

/** Near-bottom-aware "New messages" control — never forces scroll on its own. */
export function ConversationNewMessagesButton({
  messageCount,
  className,
}: {
  messageCount: number;
  className?: string;
}) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  const [unseen, setUnseen] = useState(0);
  const prevCountRef = useRef(messageCount);
  const wasAtBottomRef = useRef(isAtBottom);

  useEffect(() => {
    const grew = messageCount > prevCountRef.current;
    const delta = messageCount - prevCountRef.current;
    prevCountRef.current = messageCount;
    if (!grew || delta <= 0) return;
    if (wasAtBottomRef.current || isAtBottom) {
      setUnseen(0);
      return;
    }
    setUnseen((count) => count + delta);
  }, [isAtBottom, messageCount]);

  useEffect(() => {
    wasAtBottomRef.current = isAtBottom;
    if (isAtBottom) setUnseen(0);
  }, [isAtBottom]);

  if (isAtBottom || unseen <= 0) return null;

  return (
    <button
      type="button"
      onClick={() => {
        setUnseen(0);
        scrollToBottom();
      }}
      className={cn(
        "absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border/70 bg-card/95 px-3.5 py-2 text-[12px] font-semibold text-foreground shadow-lift backdrop-blur-md",
        className,
      )}
    >
      New messages
      <ArrowDownIcon className="size-3.5" />
    </button>
  );
}

const getMessageText = (message: UIMessage): string =>
  message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");

export type ConversationDownloadProps = Omit<
  ComponentProps<typeof Button>,
  "onClick"
> & {
  messages: UIMessage[];
  filename?: string;
  formatMessage?: (message: UIMessage, index: number) => string;
};

const defaultFormatMessage = (message: UIMessage): string => {
  const roleLabel =
    message.role.charAt(0).toUpperCase() + message.role.slice(1);
  return `**${roleLabel}:** ${getMessageText(message)}`;
};

export const messagesToMarkdown = (
  messages: UIMessage[],
  formatMessage: (
    message: UIMessage,
    index: number
  ) => string = defaultFormatMessage
): string => messages.map((msg, i) => formatMessage(msg, i)).join("\n\n");

export const ConversationDownload = ({
  messages,
  filename = "conversation.md",
  formatMessage = defaultFormatMessage,
  className,
  children,
  ...props
}: ConversationDownloadProps) => {
  const handleDownload = useCallback(() => {
    const markdown = messagesToMarkdown(messages, formatMessage);
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [messages, filename, formatMessage]);

  return (
    <Button
      className={cn(
        "absolute top-4 right-4 rounded-full dark:bg-background dark:hover:bg-muted",
        className
      )}
      onClick={handleDownload}
      size="icon"
      type="button"
      variant="outline"
      {...props}
    >
      {children ?? <DownloadIcon className="size-4" />}
    </Button>
  );
};
