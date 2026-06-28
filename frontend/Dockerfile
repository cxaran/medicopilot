FROM node:24-alpine AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS dev

WORKDIR /app
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM node:24-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# URL pública del model-gateway (NEXT_PUBLIC_*): Next la inyecta en build. Default vacío
# => sin gateway (comportamiento actual de dev/prod intacto). El stack QA la pasa por
# build.arg para habilitar la conexión del copiloto.
ARG NEXT_PUBLIC_AGENT_GATEWAY_URL=""
ENV NEXT_PUBLIC_AGENT_GATEWAY_URL=$NEXT_PUBLIC_AGENT_GATEWAY_URL
RUN npm run build

FROM node:24-alpine AS prod

ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
