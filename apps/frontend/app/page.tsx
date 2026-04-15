import { CopilotChat } from "@copilotkit/react-core/v2";

export default function Page() {
  return (
    <main>
      <CopilotChat
        agentId="my_agent"
        labels={{ chatInputPlaceholder: "Ask me anything..." }}
        attachments={{ enabled: true }} 
      />
    </main>
  );
}