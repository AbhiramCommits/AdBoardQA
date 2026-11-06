FROM node:20-alpine
WORKDIR /repo
ENV CYPRESS_INSTALL_BINARY=0
COPY package.json package-lock.json ./
COPY app/package.json app/package.json
COPY web/package.json web/package.json
RUN npm ci
COPY tsconfig.base.json ./
COPY web ./web
EXPOSE 5173
CMD ["npm", "run", "dev", "--workspace", "web", "--", "--host", "0.0.0.0"]
