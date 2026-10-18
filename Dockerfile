# ---- Front-end build ----
FROM node:22-alpine AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- Runtime: API + static front-end ----
FROM node:22-alpine
ENV NODE_ENV=production \
    DATA_PATH=/data \
    WEB_DIST=/app/web/dist \
    PORT=3001
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/src ./src
COPY --from=web /app/web/dist /app/web/dist
VOLUME /data
EXPOSE 3001
HEALTHCHECK --interval=1m --timeout=5s CMD wget -qO- http://127.0.0.1:3001/api/health || exit 1
CMD ["node", "--no-warnings=ExperimentalWarning", "src/index.js"]
