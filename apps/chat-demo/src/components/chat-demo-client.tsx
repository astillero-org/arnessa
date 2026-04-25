'use client';

import { ArnessaProvider } from '@arnessa/react/react';
import { StudioShell } from './studio-shell';
import { ThemeProvider } from './theme-provider';

export function ChatDemoClient() {
  const endpoint = process.env.NEXT_PUBLIC_AGENT_URL ?? 'http://localhost:8000';

  return (
    <ThemeProvider>
      <ArnessaProvider endpoint={endpoint}>
        <StudioShell />
      </ArnessaProvider>
    </ThemeProvider>
  );
}
