'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useChat, useChatOverrides, useChatState } from './ChatProvider';
import { ActivityIndicator, CustomEventRenderer, EmptyState, MessageBubble, ToolResultCard } from './message-renderers';

export interface MessageListProps {
  className?: string;
}

export const MessageList: React.FC<MessageListProps> = ({ className }) => {
  const { timeline } = useChatState();
  const { controller } = useChat();
  const { components } = useChatOverrides();
  const ref = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onScroll = () => {
      const threshold = 80;
      setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight <= threshold);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!isAtBottom || !ref.current) return;
    requestAnimationFrame(() => {
      if (!ref.current) return;
      ref.current.scrollTop = ref.current.scrollHeight;
    });
  }, [timeline, isAtBottom]);

  const BubbleComponent = components.MessageBubble ?? MessageBubble;
  const ToolComponent = components.ToolResultCard ?? ToolResultCard;
  const ActivityComponent = components.ActivityIndicator ?? ActivityIndicator;
  const EmptyComponent = components.EmptyState ?? EmptyState;

  return (
    <div
      ref={ref}
      className={className ?? 'h-0 min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4'}
    >
      <ul className="space-y-4">
        {timeline.length === 0 ? (
          <EmptyComponent />
        ) : (
          timeline.map((item, index) => {
            const key = `${item.kind}:${item.id}:${item.order}:${index}`;

            if (item.kind === 'message') {
              if (item.message.role === 'tool') {
                return (
                  <li key={key} className="flex min-w-0 justify-end">
                    <ToolComponent
                      content={typeof item.message.content === 'string' ? item.message.content : JSON.stringify(item.message.content)}
                      toolName={item.message.toolName}
                      timestamp={item.timestamp}
                    />
                  </li>
                );
              }
              return (
                <BubbleComponent
                  key={key}
                  content={item.message.content}
                  role={item.message.role || 'assistant'}
                  timestamp={item.message.timestamp}
                />
              );
            }

            if (item.kind === 'activity') {
              return (
                <li key={key} className="flex min-w-0 justify-end">
                  <ActivityComponent
                    label={String(item.message.activityType || 'Activity')}
                    timestamp={item.timestamp}
                  />
                </li>
              );
            }

            const customDef = controller.customEvents.resolve(item.name);
            return (
              <li key={key} className="flex min-w-0 justify-end">
                {customDef?.render
                  ? React.createElement(customDef.render, { value: item.value, event: item as any })
                  : <CustomEventRenderer name={item.name} value={item.value} timestamp={item.timestamp} />}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
};
