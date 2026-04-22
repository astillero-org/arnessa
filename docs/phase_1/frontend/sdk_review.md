# Review: `packages/agui-chat-sdk` + `apps/chat-demo`

Scope: abstraction quality, React usage, CSS/theming, packaging, runtime correctness, and consumer override surface.  
Date: 2026-04-17.

---

## Verdict

The SDK has a good backbone but an unreliable contract.

At the top level, the split is sensible:

- `core/` owns controller/store/registry concerns.
- `react/` owns provider + UI concerns.
- the demo wiring (`HttpAgent → ChatController → ChatProvider`) is easy to follow.

What blocks this from being a strong reusable package is not the broad shape. It is that three boundaries are still soft:

1. **Publish contract:** entrypoints, types, and CSS exports do not describe what the package actually ships.
2. **State contract:** the SDK appears to support both event-driven store updates and store↔agent synchronization, which creates ambiguity about the true source of truth.
3. **Consumer contract:** the package is too styled to be headless, but not packaged or extensible enough to be a dependable drop-in UI kit.

If this stays an internal workspace package, it is usable with cleanup. If it is meant to be a real reusable SDK, it needs a sharper product decision first:

> **Is this a pre-styled chat UI kit, or a headless/extensible chat SDK with optional UI?**

Most issues below reduce to that unresolved choice.

---

## 1. What is solid already

These parts are directionally right:

- the separation between protocol/control logic and React UI,
- the existence of registries as extension seams,
- the controller/provider shape,
- the demo as a realistic integration target rather than a toy isolated component sandbox.

That matters because this review is not saying the SDK should be scrapped. It should be tightened.

---

## 2. Release blockers

These are the issues I would fix before publishing or encouraging external reuse.

### 2.1 The package metadata is not honest about what ships

`packages/agui-chat-sdk/package.json` currently points core entry fields at source files:

```json
{
  "main": "./src/index.ts",
  "module": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "development": "./src/index.ts",
      "import": "./dist/index.js",
      "types": "./src/index.ts"
    },
    "./styles.css": "./dist/styles.css"
  }
}
```

That creates three concrete problems:

- published defaults point at raw TypeScript,
- `types` points at source even though `dist/index.d.ts` exists,
- `./styles.css` is exported but not present in `dist/`.

This is a publish-contract bug, not polish.

### 2.2 The CSS/styling contract is currently broken

The React layer emits Tailwind utility classes and expects host tokens such as `primary`, `card`, `foreground`, `border`, `ring`, and `destructive`.

At the same time, some classes used by SDK components are defined only in the demo app:

- `chat-output-surface`
- `chat-output-pill`
- `chat-output-attachment`

So the SDK is currently relying on three things it does not fully own:

1. consumer Tailwind compilation,
2. consumer token names,
3. consumer global CSS.

That is the worst of both worlds: not headless, not self-contained.

### 2.3 Workspace behavior is masking distribution risk

The `development` export points at `./src/index.ts`, so local workspace usage can succeed even when published-package behavior would fail.

There is also evidence that `dist/index.js` is not a faithful mirror of current `src/` React code. If true, consumers may get different runtime behavior depending on whether they resolve source or build output.

That makes local confidence misleading.

### 2.4 Timeline ownership is ambiguous

`ChatStore` contains a lot of compensating logic:

- `dedupeTimeline`
- `pruneGhostMessages`
- `normalizeTimelineItems`
- `getItemSignature`
- `syncNextOrderFromTimeline`
- both `applyEvent(...)` and `setTimeline(...)`

The problem is not the helper count by itself. The problem is what those helpers imply: **the SDK seems to tolerate more than one authoritative feed into timeline state**.

That is usually where correctness starts to rot.

### 2.5 `hydrateConversation` currently breaks the type boundary

`ChatController.hydrateConversation` writes snapshot timeline data back into `agent.messages`.

That is unsafe because the stored timeline is made of SDK `TimelineItem` wrappers, while `agent.messages` expects raw AG-UI `Message` objects.

This is both:

- a direct correctness bug,
- and a sign that the controller/store/agent responsibilities are not cleanly separated.

---

## 3. Architectural weaknesses

### 3.1 The SDK erodes AG-UI's type contract

Across the store/controller/mock layer there is too much `any`, `as any`, and ad hoc narrowing.

Examples include:

- `event: any` handler inputs,
- `MockAgent` casts,
- ambiguous send payload shapes,
- demo-side `controller as unknown as ChatLike`.

If the SDK wraps AG-UI, it should make the contract stricter and easier to consume. Right now it often does the opposite.

### 3.2 `MockAgent` teaches an unclear mental model

`MockAgent.run()` returns only `RUN_STARTED`, while real downstream activity comes from manual subscriber notifications in `runAgent()`.

That gives consumers a confusing example of the intended protocol flow.

### 3.3 `ChatController` lacks an explicit lifecycle

The controller subscribes to the agent but does not expose an unsubscribe or `dispose()` path.

That is easy to miss in a demo and easy to regret in a host app.

### 3.4 Demo duplication is a symptom, not just a demo smell

The demo reimplements pieces the SDK already claims to own:

- `StudioComposer` duplicates SDK composer behavior,
- attachment drafting logic is duplicated,
- the demo reaches around the controller abstraction.

That usually means the SDK's extension surface is not strong enough yet.

---

## 4. Consumer experience is underpowered

### 4.1 The UI layer is hard to adapt without forking

The exported components do not offer a meaningful override surface. There is little or no first-class support for:

- `className`,
- `style`,
- slot props,
- component substitution for core visual pieces.

That makes the React layer effectively all-or-nothing.

### 4.2 Extensibility is uneven

There is some real extension surface:

- custom event registry,
- partial activity registry story.

But it stops short of the pieces consumers most often need to replace:

- message bubbles,
- tool result rendering,
- composer,
- empty state,
- attachments,
- markdown renderers.

The result is a package that is technically extensible, but not extensible where it matters most.

### 4.3 Labels and copy are not externalized

The UI contains hard-coded Spanish strings, plus some English strings.

That is not just localization debt. It is evidence that the SDK still assumes one host product voice.

### 4.4 Markdown/tool rendering is demo-level, not SDK-level

`MessageBubble` is fixed to one markdown configuration, and `ToolResultCard` behaves like a built-in JSON card.

That is sufficient for a demo. It is thin for a reusable SDK that fronts arbitrary tools and agents.

---

## 5. Runtime and React concerns

### 5.1 `MessageList` auto-scroll is too aggressive

The effect runs every render and force-scrolls unconditionally.

That hurts both performance and usability:

- needless work during streaming,
- no respect for users reading earlier messages.

### 5.2 The demo can desynchronize visual thread state from agent state

`studio-shell.tsx` calls store methods directly for hydrate/reset flows, while controller methods also manage agent state.

That means the UI can switch threads while the agent still carries a stale history.

### 5.3 Failed sends leave an awkward recovery state

The optimistic user message is added before run completion. On failure, the draft is restored into the input instead of clearly reconciling the optimistic message.

So the user can see the failed message in the timeline and the same text ready to resend.

### 5.4 Accessibility work is incomplete where UI behaves like a dialog

The image lightbox and side widget appear to act like modal/drawer UI without the full keyboard and focus behavior those patterns need.

### 5.5 The current context shape may be too broad for streaming

`ChatProvider` couples changing state and controller/actions into one context.

That is not automatically wrong, but it increases rerender risk during token streaming. Splitting state and actions is a likely next optimization if profiling confirms the pressure.

### 5.6 Renderer failures are not well-contained

The React layer renders untrusted agent output without obvious local isolation around renderer failures.

The right claim here is not "this definitely crashes everything". The right claim is: the current design gives consumers little protection if a renderer path throws.

---

## 6. CSS and design-system concerns

### 6.1 The SDK is tightly coupled to host token names

The current class model assumes generic token names such as:

- `background`
- `foreground`
- `primary`
- `card`
- `border`
- `muted`
- `ring`
- `destructive`

That means the chat UI implicitly adopts the host design system whether or not those tokens make sense for chat-specific contrast or hierarchy.

### 6.2 The package has merge utilities, but the API does not capitalize on them

The SDK already includes a `cn()` helper backed by `clsx` and `tailwind-merge`.

So the issue is not "no merge strategy exists". The issue is that the current public UI API does not consistently use that utility to make consumer overrides safe and ergonomic.

### 6.3 The theming strategy is still undecided

Right now the package sits between three models:

1. host-owned Tailwind utilities and tokens,
2. SDK-owned styles,
3. demo-owned global helper classes.

That needs one decision, not more incremental exceptions.

---

## 7. Demo-specific issues

These are real, but they should stay clearly separated from SDK defects.

### 7.1 `StudioComposer` should disappear once the SDK surface is right

Either the SDK composer is sufficient and the demo should use it, or the SDK composer is not sufficient and the SDK should expose the missing extension points.

### 7.2 Snapshot persistence fallback is still too destructive

The demo does retry with a reduced payload before deleting storage entirely. That is better than a single immediate wipe, but still a poor final fallback.

### 7.3 The agent URL is hardcoded

`new HttpAgent({ url: 'http://localhost:8000' })` should come from environment configuration.

### 7.4 The demo teaches a broad client boundary

Using a fully client-rendered page is acceptable for a demo, but weak as a reference integration for App Router consumers.

---

## 8. Final target architecture

### 8.1 Public package shape

The package should expose three clear entrypoints:

- `@arnessa/agui-chat-sdk` → **core only**, server-safe
- `@arnessa/agui-chat-sdk/react` → **client React/provider/hooks/UI**
- `@arnessa/agui-chat-sdk/styles.css` → **real prebuilt SDK styles**

That removes the current ambiguity where the root barrel exports hook-based React code.

### 8.2 Single source of truth

`ChatStore` should be the only UI-state authority.

Target flow:

- AG-UI protocol events flow into `ChatStore`
- React reads derived UI state from `ChatStore`
- `ChatController` issues commands and lifecycle actions
- `agent.messages` remains raw AG-UI protocol state and is never used as a dump target for `TimelineItem[]`

This removes the current dual-feed model.

### 8.3 Clear boundaries

**core/** should own:

- typed events and public types
- controller logic
- store logic
- snapshot serialization / hydration mapping
- registries
- attachment helpers

**react/** should own:

- provider and hooks
- presentational components
- override/slot/render APIs
- client-only entrypoint

**apps/chat-demo/** should own:

- reference integration only
- layout/shell concerns
- theme wiring
- demo-specific UX

The demo should not duplicate SDK logic or bypass controller APIs.

### 8.4 Extension model

The package should expose one coherent consumer extension surface through the provider instead of relying on scattered ad hoc seams.

Recommended provider inputs:

- `labels`
- `components`
- `renderers`

At minimum, consumers should be able to override:

- `MessageBubble`
- `ToolResult`
- `Activity`
- `CustomEvent`
- `Composer`
- `EmptyState`
- `ErrorBanner`

Internal registries can still exist, but the public API should feel unified.

### 8.5 Styling strategy

The recommended styling strategy is:

- ship a real `styles.css`
- use namespaced SDK variables such as `--arn-chat-bg`, `--arn-chat-fg`, `--arn-chat-primary`
- allow `className` overrides on public React components

The SDK should not depend on the host app scanning SDK source with Tailwind or inheriting demo-owned global classes.

### 8.6 Next.js safety

For Next.js consumers:

- the root entrypoint should export no hooks/components
- the `react` entrypoint should be explicitly client-only
- the demo should use a small client leaf rather than marking the page itself as fully client-rendered

### 8.7 Performance and lifecycle model

The React layer should split state and actions:

- `ChatStateContext`
- `ChatActionsContext`

The controller should expose `dispose()`.

The message list should use bottom-lock auto-scroll behavior rather than unconditional force-scroll on every render.

---

## 9. File-by-file target plan

### `packages/agui-chat-sdk/package.json`

Change the package contract.

- make the root export core-only
- add a `./react` export
- keep `./styles.css` only if the file is actually shipped
- point `main` / `module` / `types` at `dist/*`
- add `files: ["dist"]`
- add a correct `sideEffects` declaration
- move `@ag-ui/client` and `@ag-ui/core` to `peerDependencies`
- remove dead deps such as `zod` if still unused

### `packages/agui-chat-sdk/src/index.ts`

Refactor to export **core only**.

Keep exports such as:

- `ChatController`
- `ChatStore`
- registry/types helpers
- attachment/types helpers

Remove React exports from the root barrel.

### `packages/agui-chat-sdk/src/react/index.ts`

Add a dedicated React entrypoint.

- export `ChatProvider`
- export React hooks
- export public UI components
- mark the entrypoint as client-only

### `packages/agui-chat-sdk/src/styles.css`

Add a real shipped SDK stylesheet.

Move SDK-owned styling here, including replacements for:

- `chat-output-surface`
- `chat-output-pill`
- `chat-output-attachment`

Also define namespaced SDK CSS variables here.

### `packages/agui-chat-sdk/tsup.config.ts`

Add an explicit build config.

It should build:

- `src/index.ts`
- `src/react/index.ts`
- declarations
- CSS output/copy step

Stop encoding the whole build pipeline only in package scripts.

### `packages/agui-chat-sdk/src/core/types.ts`

Add a central public types module.

Move shared types here:

- send payloads
- timeline item types
- snapshots
- labels
- component/render override types

This removes the current type drift across files.

### `packages/agui-chat-sdk/src/core/serialization.ts`

Add a dedicated mapping layer.

This file should own:

- AG-UI `Message` → SDK timeline item mapping
- snapshot → store hydration mapping
- store snapshot → persisted shape mapping

That gives `hydrateConversation` a correct home and prevents type-boundary corruption.

### `packages/agui-chat-sdk/src/core/ChatStore.ts`

Refactor heavily.

- remove `SDKMessage = any`
- type handlers against AG-UI events
- remove dual-feed assumptions
- keep one event application path
- make hydration explicit and typed
- ensure notifications do not rely on fragile shared references

The store should own UI timeline state only.

### `packages/agui-chat-sdk/src/core/ChatController.ts`

Refactor heavily.

- make it a command/lifecycle layer
- add `dispose()`
- stop writing `TimelineItem[]` into `agent.messages`
- use typed send payloads end-to-end
- route hydrate/reset through explicit serializer/store APIs

The controller should not behave like a hidden second store.

### `packages/agui-chat-sdk/src/core/Registry.ts`

Refactor into a cleaner extension layer.

At minimum support:

- custom event renderers
- activity renderers
- tool result renderers

It may remain internal, but it should align with the public React override API.

### `packages/agui-chat-sdk/src/core/MockAgent.ts`

Refactor to model one clear event path.

- remove unnecessary `as any`
- make `run()` behavior reflect the intended consumer mental model

### `packages/agui-chat-sdk/src/core/attachment-utils.ts`

Keep, but make it the single source of truth.

- retain file drafting
- retain attachment-to-input conversion
- export stable types from `core/types.ts`

Both SDK and demo code should consume this helper instead of duplicating it.

### `packages/agui-chat-sdk/src/react/ChatProvider.tsx`

Refactor or split.

Recommended shape:

- state context
- actions/controller context
- hooks like `useChatState`, `useChatActions`, and optionally `useChatController`

Also allow provider-level inputs for:

- `labels`
- `components`
- `renderers`

### `packages/agui-chat-sdk/src/react/MessageList.tsx`

Refactor.

- fix auto-scroll behavior
- use activity/tool/custom overrides from the provider layer
- add `className`
- optionally add `forwardRef`

This component should render extension seams intentionally rather than reaching directly into controller internals.

### `packages/agui-chat-sdk/src/react/ChatComposer.tsx`

Refactor into the one real composer.

- add `className`
- externalize labels
- support extension points for toolbar/attachments/error rendering
- remove `as any` send path
- improve failed-send reconciliation

The demo should not need its own forked composer once this file is fixed.

### `packages/agui-chat-sdk/src/react/message-renderers.tsx`

Split this file.

Create separate files for:

- `MessageBubble`
- `ToolResultCard`
- `ActivityIndicator`
- `CustomEventRenderer`
- `EmptyState`
- `AttachmentCard`
- `ImageLightbox`
- optional markdown helpers

Also:

- fix accessibility in dialog-like UI
- stop depending on demo-only classes
- add override-friendly props

### `packages/agui-chat-sdk/src/react/FullScreenChat.tsx`

Refactor into a composition shell.

- add `className`
- consume provider overrides
- do not hide styling assumptions here

### `packages/agui-chat-sdk/src/react/SideChatWidget.tsx`

Refactor.

- add proper drawer/dialog accessibility
- add focus and keyboard handling
- add `className` and slot support

### `packages/agui-chat-sdk/src/react/HistoryList.tsx`

Refactor.

- add `className`
- externalize labels
- keep it presentational

### `packages/agui-chat-sdk/src/lib/utils.ts`

Keep.

Use `cn()` consistently across public React components.

### `packages/agui-chat-sdk/src/core/__tests__/ChatStore.test.ts`

Add tests for:

- event application
- run start/finish/error
- hydration behavior
- removal of duplicate-feed assumptions

### `packages/agui-chat-sdk/src/core/__tests__/ChatController.test.ts`

Add tests for:

- send flow
- hydrate/reset flow
- disposal
- no timeline→agent type corruption

### `apps/chat-demo/src/app/page.tsx`

Refactor the demo page.

- avoid making the entire page the client boundary
- move agent URL to `process.env.NEXT_PUBLIC_AGENT_URL`
- render a small client leaf for SDK wiring

### `apps/chat-demo/src/components/chat-demo-client.tsx`

Add this file.

It should own:

- `HttpAgent`
- `ChatController`
- `ChatProvider`

This becomes the client boundary for the demo.

### `apps/chat-demo/src/components/studio-shell.tsx`

Refactor.

- stop mutating the store directly
- route hydrate/reset through controller APIs only
- consume the SDK composer instead of a demo fork
- keep only layout/shell/history concerns here

### `apps/chat-demo/src/components/studio-composer.tsx`

Delete.

Replace it with the SDK `ChatComposer`.

If anything is missing, add the extension point to the SDK rather than keeping this duplicate implementation.

### `apps/chat-demo/src/app/globals.css`

Refactor.

- remove SDK-owned helper classes
- keep only demo-app styles
- import `@arnessa/agui-chat-sdk/styles.css`

### `apps/chat-demo/src/components/theme-provider.tsx`

Keep.

Use it to map demo themes to SDK variables if needed.

### `apps/chat-demo/src/components/preview-panel.tsx`

Keep if it remains demo-specific.

Do not move preview/demo product concerns into the SDK.

---

## 10. Recommended sequence

### First: make the package honest

1. Decide the product shape: **drop-in UI kit** vs **headless/extensible SDK with optional UI**.
2. Fix package entrypoints and type entrypoints to describe the actual build output.
3. Either ship CSS properly, or stop exporting styles and document the consumer-side styling contract explicitly.

### Second: restore one source of truth

4. Choose one authoritative timeline feed.
5. Remove compensating dedupe/ghost-prune behavior that exists only because of duplicate feeds.
6. Fix `hydrateConversation` so the controller does not write `TimelineItem[]` into `agent.messages`.
7. Add explicit controller lifecycle management.

### Third: make the UI genuinely reusable

8. Add a real override surface for styling and component replacement.
9. Externalize labels.
10. Expose deeper render hooks for markdown, tools, attachments, and empty/error states.

### Fourth: harden runtime quality

11. Fix auto-scroll behavior.
12. Fix dialog/drawer accessibility.
13. Add local failure isolation around risky renderer paths.
14. Split contexts only if profiling shows meaningful rerender cost.

---

## Bottom line

This is already a plausible internal SDK. It is not yet a clean reusable package.

The next step is not expanding the feature list. It is tightening three contracts:

- **what the package ships,**
- **who owns chat state,**
- **how consumers are allowed to customize UI.**

Once those are explicit and consistent, most of the remaining work becomes straightforward hardening rather than structural cleanup.
