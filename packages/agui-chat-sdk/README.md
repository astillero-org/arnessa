# @arnessa/react — SDK Reference

A React SDK for embedding AG-UI–powered chat assistants. Ships ready-made shells for zero-config use and headless hooks for full control over layout.

---

## Quick start

```bash
npm install @arnessa/react
```

```tsx
import { ArnessaProvider, FullScreenChat } from '@arnessa/react';

export default function App() {
  return (
    <ArnessaProvider endpoint="https://your-agent-endpoint.example.com">
      <FullScreenChat />
    </ArnessaProvider>
  );
}
```

---

## Pre-built shells

Both shells are drop-in with no required props beyond the wrapping `ArnessaProvider`.

### `<FullScreenChat />`

| Prop | Type | Default | Description |
|---|---|---|---|
| `className` | `string` | — | Extra classes on the outer container |

### `<SideChatWidget />`

A collapsible side panel. Same props as `FullScreenChat`.

---

## Building your own UI

`useArnessaChat()` is the stable headless entry point. It returns everything needed to drive a chat without any layout opinions.

```tsx
import {
  ArnessaProvider,
  MessageList,
  ChatComposer,
  useArnessaChat,
} from '@arnessa/react';

function MyChat() {
  const { timeline, status, sendMessage, abort, reset, labels } = useArnessaChat();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <MessageList />
      </div>

      {status === 'running' && (
        <button onClick={abort}>{labels.sendLabel ?? 'Stop'}</button>
      )}

      <button onClick={reset}>New chat</button>

      <ChatComposer />
    </div>
  );
}

export default function App() {
  return (
    <ArnessaProvider endpoint="https://your-agent-endpoint.example.com">
      <MyChat />
    </ArnessaProvider>
  );
}
```

### `UseArnessaChatResult`

| Field | Type | Description |
|---|---|---|
| `timeline` | `TimelineItem[]` | Ordered list of messages, activities, and custom events |
| `status` | `'idle' \| 'running' \| 'error'` | Current run status |
| `threadId` | `string \| null` | Active thread/session ID |
| `sendMessage` | `(input) => Promise<unknown>` | Send a text message, optionally with file attachments |
| `abort` | `() => void` | Cancel a running request |
| `reset` | `() => void` | Clear the current thread and start fresh |
| `labels` | `Record<string, string>` | Resolved label strings (defaults + overrides) |

### Primitive building blocks

`MessageList` and `ChatComposer` are the two supported primitives. Both read from context automatically — just render them inside `ArnessaProvider`.

| Component | Description |
|---|---|
| `<MessageList />` | Scrollable message thread with auto-scroll, tool results, and activity indicators |
| `<ChatComposer />` | Textarea composer with file attachment drag-and-drop |

---

## Theming

### CSS variables

The SDK contract is the `--arn-chat-*` namespace. Set these on `:root` or any ancestor element:

```css
:root {
  --arn-chat-bg: #ffffff;
  --arn-chat-primary: #6366f1;
  --arn-chat-user-bubble: #6366f1;
  --arn-chat-assistant-bubble: #f1f5f9;
  --arn-chat-text: #0f172a;
  --arn-chat-muted: #64748b;
  --arn-chat-border: #e2e8f0;
  --arn-chat-radius: 0.75rem;
}
```

The shipped shells also use standard shadcn/ui tokens (`--background`, `--primary`, `--muted-foreground`, etc.) as their Tailwind class targets, so they integrate automatically with any shadcn-based host app.

### Escape hatch 1 — CSS variables on an ancestor

```html
<div style="--arn-chat-primary: #10b981;">
  <!-- chat renders here with custom primary color -->
</div>
```

### Escape hatch 2 — `className` prop (full Tailwind override)

```tsx
<FullScreenChat className="bg-zinc-900 text-zinc-100" />
<MessageList className="px-8" />
```

### Escape hatch 3 — `components` / `renderers` prop on `ArnessaProvider`

Swap entire sub-components for custom implementations:

```tsx
<ArnessaProvider
  endpoint="..."
  components={{
    ActivityIndicator: MySpinner,
    EmptyState: MyWelcomeScreen,
  }}
  renderers={{
    thinking: MyThinkingBubble,
  }}
>
  <FullScreenChat />
</ArnessaProvider>
```

---

## i18n / labels

Override any UI string via the `labels` prop on `ArnessaProvider`:

```tsx
<ArnessaProvider
  endpoint="..."
  labels={{
    emptyTitle: 'How can I help?',
    emptySubtitle: 'Ask me anything.',
    placeholder: 'Type a message…',
    attachLabel: 'Attach files',
    dragHint: 'Drop files here',
    sendLabel: 'Send',
    closeImageLabel: 'Remove',
    toolResultDefault: 'Result',
  }}
>
  <FullScreenChat />
</ArnessaProvider>
```

`useArnessaChat().labels` returns the resolved map (defaults merged with your overrides) so custom layouts can consume them without duplicating defaults.

---

## Extension points

### Agent-driven UI mounting — `DynamicSlot` + `registerComponent`

Agents can mount, update, and unmount React components at runtime using `arnessa.uiMount` / `arnessa.uiUpdate` / `arnessa.uiUnmount` custom events.

```tsx
import { ArnessaProvider, FullScreenChat, DynamicSlot, registerComponent } from '@arnessa/react';
import { ProductCard } from './ProductCard';

registerComponent('ProductCard', ProductCard);

export default function App() {
  return (
    <ArnessaProvider endpoint="...">
      <FullScreenChat />
      <DynamicSlot name="sidebar" />
    </ArnessaProvider>
  );
}
```

The agent emits `{ type: 'CUSTOM', name: 'arnessa.uiMount', value: { slot: 'sidebar', component: 'ProductCard', component_id: 'c1', props: { ... } } }` and the slot renders it automatically.

### Agent state — `useAgentState<T>()`

Read and patch structured state that the agent manages server-side:

```tsx
const { state, patchState, writableFields } = useAgentState<{ filter: string }>();
```

### Deferred tool approval — `useDeferredTool(name)`

Pause an agent tool call and let the user approve it in the UI:

```tsx
const { pending, resolve } = useDeferredTool('send_email');
if (pending) {
  return <ConfirmDialog data={pending} onConfirm={() => resolve({ approved: true })} />;
}
```

---

## Legacy hooks

`useChatState` and `useChatActions` remain exported for backwards compatibility but new code should use `useArnessaChat()`.
