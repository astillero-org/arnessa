# Plan — Custom Interfaces & Styling for `@arnessa/react`

## Why

Today the SDK ships two ready-made shells (`FullScreenChat`, `SideAssistantWidget`) and a handful of internal hooks. A user who wants to build their *own* harness UI has to reverse‑engineer `ArnessaProvider.tsx` to find out which hooks exist, what they return, and how to wire them to `MessageList` / `ChatComposer`. There is also no published guide for theming.

This document is the plan for closing that gap. **No code yet** — implementation follows once this is approved.

## Goals

1. Make "bring your own layout" a first‑class, documented path.
2. Keep the existing pre‑built shells working unchanged (no breaking changes).
3. Make the styling story explicit: what to override, where, and how.

## Non‑goals

- A theme provider component or runtime theme switcher (CSS variables on `:root` already cover this; we just need to document it).
- Replacing Tailwind with CSS modules inside the shipped shells.
- A new design system.

## What to add

### 1. A documented headless hook: `useArnessaChat()`

A single, stable entry point that returns everything needed to render a chat UI, without forcing any layout. Consolidates what is currently spread across `useChatState`, `useChatActions`, `useChatOverrides`, `useArnessa`.

Proposed shape (TypeScript):

```ts
export interface UseArnessaChatResult {
  messages: ChatState['messages'];
  status: 'idle' | 'running' | 'error';
  threadId: string | null;
  sendMessage: (input: string | { text: string; attachments?: Attachment[] }) => Promise<void>;
  abort: () => void;
  reset: () => void;
  labels: Record<string, string>;
}

export function useArnessaChat(): UseArnessaChatResult;
```

Implementation: thin wrapper composing existing hooks. No new state machinery. Lives in `packages/agui-chat-sdk/src/react/useArnessaChat.ts`.

### 2. Export the existing primitives as the documented building blocks

The composition story is: `ArnessaProvider` → `useArnessaChat()` → render with `<MessageList />` and `<ChatComposer />` (or the user's own components driven by the hook).

Action: confirm `MessageList` and `ChatComposer` are exported from `src/react/index.ts` and listed in the README as the supported primitives. No new components needed for v1.

### 3. README for the SDK package

New file: `packages/agui-chat-sdk/README.md`. Sections:

- **Quick start** — install, `<ArnessaProvider>`, drop in `<FullScreenChat />`.
- **Pre‑built shells** — `FullScreenChat`, `SideAssistantWidget` with prop tables.
- **Building your own UI** — `useArnessaChat()` example with a custom layout that uses `MessageList` + a custom composer.
- **Theming** — the CSS variable contract (`--arn-chat-bg`, `--arn-chat-primary`, …) with fallbacks to host design tokens (`--background`, `--primary`). Show the three escape hatches in order of granularity:
  1. Set CSS variables on `:root` or any ancestor.
  2. Pass `className` to any shell or primitive (full Tailwind override).
  3. Pass `components` / `renderers` to `ArnessaProvider` to swap entire pieces (`ActivityIndicator`, `EmptyState`, custom event renderers).
- **i18n / labels** — the `labels` prop and the keys `useChatOverrides()` consumes (`emptyTitle`, `placeholder`, `sendLabel`, …).
- **Extension points** — `DynamicSlot` + `registerComponent` for agent‑driven UI mounting.

### 4. Tighten the CSS variable contract

`styles.css` already declares the `--arn-chat-*` variables but the *shipped* components mostly use raw Tailwind utility classes (`bg-card`, `text-muted-foreground`). That works when the host app has shadcn‑style tokens, and silently degrades otherwise.

Proposal: leave the Tailwind classes as the default (don't churn the shells), but document that the SDK *contract* is the `--arn-chat-*` namespace, and that the Tailwind classes resolve through standard shadcn variables. One paragraph in the README, no code change.

### 5. Update `index.ts` exports

Surface the public API explicitly:

- `useArnessaChat` (new)
- `MessageList`, `ChatComposer` (already exported — verify)
- `useAgentState`, `useDeferredTool`, `DynamicSlot`, `registerComponent` (already exist — keep)
- Mark `useChatActions` / `useChatState` as legacy in JSDoc but keep them.

## Out of scope for this change

- Renaming or removing legacy hooks.
- Adding a `density` prop to `ChatComposer` (separate ticket if needed).
- Headless versions of `FullScreenChat` / `SideAssistantWidget` (the new hook makes them unnecessary).

## Test plan

- Unit test for `useArnessaChat` covering: initial state, `sendMessage` happy path, `abort` while running, `reset` clears the thread. Uses the same testing utilities `ArnessaProvider.dom.test.tsx` already uses.
- One integration‑style test: render a tiny custom layout (no `FullScreenChat`) wired purely through `useArnessaChat` + `MessageList`, send a message, assert it appears.
- README snippets are copy‑pasted into the test file as a smoke check that the documented examples actually compile.
- Existing `MessageList.test.tsx` and `ArnessaProvider.dom.test.tsx` must still pass — the change is purely additive.

## Files touched

| File | Change |
|---|---|
| `packages/agui-chat-sdk/src/react/useArnessaChat.ts` | **new** — headless hook |
| `packages/agui-chat-sdk/src/react/useArnessaChat.test.tsx` | **new** — unit + integration test |
| `packages/agui-chat-sdk/src/react/index.ts` | export `useArnessaChat` |
| `packages/agui-chat-sdk/src/index.ts` | re‑export if needed |
| `packages/agui-chat-sdk/README.md` | **new** — full SDK docs |
| `packages/agui-chat-sdk/src/react/ArnessaProvider.tsx` | JSDoc only — mark legacy hooks |

## Risk

Low. Everything is additive: one new hook, one new doc, exports. No changes to `ArnessaProvider`'s runtime behavior, no changes to the shipped shells, no changes to the wire protocol.
