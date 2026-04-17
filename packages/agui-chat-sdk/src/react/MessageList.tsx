import React, { useEffect, useRef } from 'react';
import { useChat, useChatState } from './ChatProvider';
import { ActivityIndicator, CustomEventRenderer, EmptyState, MessageBubble, ToolResultCard } from './message-renderers';

export const MessageList: React.FC = () => {
  const { timeline } = useChatState();
  const { controller } = useChat();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    requestAnimationFrame(() => {
      if (!ref.current) return;
      ref.current.scrollTop = ref.current.scrollHeight;
    });
  });

  return <div ref={ref} className="h-0 min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4"><ul className="space-y-4">{timeline.length === 0 ? <EmptyState /> : timeline.map((item, index) => {
    const key = `${item.kind}:${item.id}:${item.order}:${index}`;

    if (item.kind === 'message') {
      return item.message.role === 'tool'
        ? <li key={key} className="flex min-w-0 justify-end"><ToolResultCard content={typeof item.message.content === 'string' ? item.message.content : JSON.stringify(item.message.content)} toolName={(item.message as any).toolName} timestamp={item.timestamp} /></li>
        : <MessageBubble key={key} content={item.message.content} role={item.message.role || 'assistant'} timestamp={item.message.timestamp} />;
    }

    if (item.kind === 'activity') {
      return <li key={key} className="flex min-w-0 justify-end"><ActivityIndicator label={String(item.message.activityType || 'Actividad')} timestamp={item.timestamp} /></li>;
    }

    return <li key={key} className="flex min-w-0 justify-end">{controller.customEvents.resolve(item.name)?.render ? React.createElement(controller.customEvents.resolve(item.name)!.render, { value: item.value, event: item as any }) : <CustomEventRenderer name={item.name} value={item.value} timestamp={item.timestamp} />}</li>;
  })}</ul></div>;
};
