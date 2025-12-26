FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM node:20-alpine AS production

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
