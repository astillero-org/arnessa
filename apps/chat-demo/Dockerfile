FROM node:20-alpine

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/chat-demo/package.json apps/chat-demo/package.json
COPY packages/agui-chat-sdk/package.json packages/agui-chat-sdk/package.json
COPY apps/chat-demo apps/chat-demo
COPY packages/agui-chat-sdk packages/agui-chat-sdk

RUN pnpm install --frozen-lockfile
RUN pnpm --filter chat-demo build

EXPOSE 3000

CMD ["pnpm", "--filter", "chat-demo", "exec", "next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
