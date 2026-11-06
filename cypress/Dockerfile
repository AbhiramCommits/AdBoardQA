FROM cypress/included:13.17.0
WORKDIR /repo
ENV CYPRESS_INSTALL_BINARY=0
COPY package.json package-lock.json ./
COPY app/package.json app/package.json
COPY web/package.json web/package.json
RUN npm ci
COPY . .
CMD ["npx", "cypress", "run"]
