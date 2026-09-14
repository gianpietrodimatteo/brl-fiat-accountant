FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
# better-sqlite3 ships prebuilt binaries (incl. linuxmusl) and loads them at runtime; skipping
# scripts avoids npm's implicit `node-gyp rebuild`, which needs a toolchain alpine doesn't have.
RUN npm ci --ignore-scripts

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=build /app/dist ./dist

EXPOSE 3001
CMD ["node", "dist/index.js"]
