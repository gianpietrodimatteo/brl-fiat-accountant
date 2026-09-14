FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# `next build` inlines NEXT_PUBLIC_* into the browser bundle, so it has to be known now.
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY next.config.ts ./

EXPOSE 3000
CMD ["sh", "-c", "npm start -- -H 0.0.0.0"]
