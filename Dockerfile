FROM node:20-bullseye AS build

# Runtime libs required by `canvas` (used for DocAI PDF rasterization).
# Without these, installs may succeed but the container can crash at runtime with missing .so errors.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM node:20-bullseye AS production

# Same runtime libs in the production image (required by `canvas`).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./

RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/.env.public ./.env.public

# Email assets (used by outbound Mailgun template)
RUN mkdir -p server/assets/email
COPY --from=build /app/src/assets/images/ANCHOR__CORPS.png ./server/assets/email/ANCHOR__CORPS.png

RUN mkdir -p uploads

EXPOSE 4001

CMD ["node", "server/index.js"]
