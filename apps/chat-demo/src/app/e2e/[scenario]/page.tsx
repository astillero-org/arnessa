'use client';

import React, { use, useEffect, useState } from 'react';
import { 
  ArnessaProvider, 
  MessageList,
  useHarness, 
  useAgentState, 
  useDeferredTool, 
  DynamicSlot,
  registerComponent,
} from '@arnessa/react/react';
import { ArnessaEvent } from '@arnessa/react';

function eventLabel(event: ArnessaEvent) {
  if (event.type === 'CUSTOM' && event.name) return event.name;
  return event.type || event.kind || event.name || 'unknown';
}

function eventPayload(event: ArnessaEvent) {
  if (event.payload !== undefined) return event.payload;
  if (event.value !== undefined) return event.value;
  if (event.delta !== undefined) return event.delta;
  if (event.content !== undefined) return event.content;
  if (event.snapshot !== undefined) return event.snapshot;
  if (event.message !== undefined) return event.message;
  return null;
}

// Test component for DynamicUI
const TestBadge = ({ temp }: { temp: number }) => (
  <div id="test-badge" className="bg-blue-500 text-white p-2 rounded">
    Badge: {temp}
  </div>
);

// Register it
if (typeof window !== 'undefined') {
    console.log("[E2E] Registering WeatherCard component");
    registerComponent('WeatherCard', TestBadge);
}

function ScenarioManager({ scenario }: { scenario: string }) {
  console.log(`[E2E] ScenarioManager mounting for scenario: ${scenario}`);
  const { send, messages, status } = useHarness();
  const { state } = useAgentState<{ count: number }>();
  const { pending, resolve } = useDeferredTool('wait_for_human');
  const [autoRun, setAutoRun] = useState(false);

  useEffect(() => {
    if (autoRun) return;
    setAutoRun(true);

    console.log(`[E2E] ScenarioManager auto-trigger for: ${scenario}`);
    // Auto-trigger based on scenario
    if (scenario === 'basic-message') {
      send("Say 'Arnessa is alive' and finish the test.");
    } else if (scenario === 'state-patch') {
      send("Set the count to 99 using the patch_state tool, then finish the test.");
    } else if (scenario === 'dynamic-ui') {
      send("Mount a 'WeatherCard' in the 'sidebar' slot with temp 25, then finish.");
    } else if (scenario === 'deferred-tool') {
      send("Ask me 'What is your favorite color?' using the wait_for_human tool.");
    } else if (scenario === 'drawing-approval') {
      send("Draw a chair with approval.");
    }
  }, [scenario, send, autoRun]);

  useEffect(() => {
      console.log(`[E2E] Messages updated, count: ${messages.length}`);
  }, [messages]);

  useEffect(() => {
      console.log(`[E2E] State updated: ${JSON.stringify(state)}`);
  }, [state]);

  useEffect(() => {
      if (pending) console.log(`[E2E] Pending deferred tool: ${pending.tool_name}`);
  }, [pending]);

  return (
    <div className="p-8 space-y-4 font-mono" id="e2e-root">
      <h1 className="text-xl font-bold">Scenario: {scenario}</h1>
      <div id="status">Status: {status}</div>

      <div id="messages" className="border p-4 h-40 overflow-auto bg-gray-50">
        {messages.map((m: ArnessaEvent, i: number) => (
          <div key={`${eventLabel(m)}-${m.timestamp ?? i}-${m.session_id ?? m.threadId ?? 'event'}`} className="text-xs border-b py-1 message-item">
            [{eventLabel(m)}] {JSON.stringify(eventPayload(m))}
          </div>
        ))}
      </div>

      {scenario === 'state-patch' && (
        <div id="state-view" className="bg-green-100 p-4 rounded">
          State Count: <span id="count-val">{state?.count ?? 'null'}</span>
        </div>
      )}

      {scenario === 'dynamic-ui' && (
        <div className="bg-purple-100 p-4 rounded">
          <div className="mb-2 font-bold">Sidebar Slot:</div>
          <div id="slot-sidebar">
            <DynamicSlot name="sidebar" />
          </div>
        </div>
      )}

      {scenario === 'deferred-tool' && pending && (
        <div id="deferred-ui" className="bg-yellow-100 p-4 rounded border border-yellow-400">
          <p id="deferred-question">{pending.args.question}</p>
          <button 
            id="resolve-btn"
            type="button"
            className="mt-2 bg-yellow-600 text-white px-4 py-1 rounded"
            onClick={() => resolve("Blue")}
          >
            Resolve with 'Blue'
          </button>
        </div>
      )}

      {scenario === 'drawing-approval' && (
        <div id="chat-rendered" className="border p-4 h-80 overflow-auto bg-white">
          <MessageList className="h-full overflow-y-auto overflow-x-hidden p-2" />
        </div>
      )}
    </div>
  );
}

export default function E2EScenarioPage({ params }: { params: Promise<{ scenario: string }> }) {
  const resolvedParams = use(params);
  const endpoint = process.env.NEXT_PUBLIC_AGENT_URL ?? 'http://localhost:8002';
  console.log(`[E2E] Rendering page for scenario: ${resolvedParams.scenario} using endpoint: ${endpoint}`);

  return (
    <ArnessaProvider endpoint={endpoint}>
      <ScenarioManager scenario={resolvedParams.scenario} />
    </ArnessaProvider>
  );
}
