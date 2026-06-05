FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json pnpm-workspace.yaml turbo.json ./
COPY apps/dashboard/package.json apps/dashboard/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/workflow-core/package.json packages/workflow-core/package.json

RUN npm install && npm install --workspace apps/dashboard --no-save \
  lightningcss-linux-x64-musl@1.32.0 \
  @tailwindcss/oxide-linux-x64-musl@4.3.0

COPY apps/dashboard apps/dashboard
COPY packages packages

RUN npm --workspace apps/dashboard run build

EXPOSE 3000

CMD ["npm", "--workspace", "apps/dashboard", "run", "start"]
