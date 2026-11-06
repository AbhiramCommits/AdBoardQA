FROM node:20-alpine AS build
WORKDIR /repo
ENV CYPRESS_INSTALL_BINARY=0
COPY package.json package-lock.json ./
COPY app/package.json app/package.json
COPY web/package.json web/package.json
RUN npm ci
COPY tsconfig.base.json ./
COPY app ./app
RUN npm run build --workspace app

FROM node:20-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY app/package.json app/package.json
COPY web/package.json web/package.json
RUN npm ci --omit=dev --workspace app --include-workspace-root=false
COPY --from=build /repo/app/dist app/dist
ENV PORT=3001
ENV DATA_FILE=/data/db.json
EXPOSE 3001
CMD ["node", "app/dist/server.js"]
