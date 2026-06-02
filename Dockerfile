# Production image for the template app. 3 stages, oven/bun:1-alpine.
#
#   docker build -t my-app .

FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

FROM deps AS build
ENV NODE_ENV=production \
    APP_ID=raffle \
    APP_DIR=.
COPY tsconfig.json ./
COPY src src
RUN bun run node_modules/@valentinkolb/cloud/scripts/build.ts

FROM oven/bun:1-alpine AS runtime
WORKDIR /app
# Nur das gebaute Artefakt ins Runtime-Image (keine Quellen, keine deps-Tools)
COPY --from=build /app/dist ./
LABEL org.opencontainers.image.source=https://github.com/Volkisvolk/sonafeskript

# Als Non-Root laufen: oven/bun bringt den unprivilegierten User `bun` mit.
USER bun

EXPOSE 3000

# Healthcheck gegen einen öffentlichen, leichten Endpunkt.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider http://localhost:3000/api/raffle/raffles || exit 1

CMD ["bun", "server.js"]
