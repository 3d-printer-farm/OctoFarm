# node:sqlite (built into Node) requires Node >= 22.5
FROM node:22-alpine as base

RUN apk add --no-cache --virtual .base-deps \
    tini

ENV NODE_ENV=production
ENV OCTOFARM_SQLITE_PATH=/app/data/octofarm.db

RUN npm install -g npm@latest
RUN npm install -g pm2

RUN adduser -D octofarm --home /app && \
    mkdir -p /scripts /app/data && \
    chown -R octofarm:octofarm /scripts/ /app/data

FROM base as compiler

RUN apk add --no-cache --virtual .build-deps \
    alpine-sdk \
    make \
    gcc \
    g++ \
    python3

WORKDIR /tmp/app

COPY server/package.json ./server/package.json
COPY server/package-lock.json ./server/package-lock.json

WORKDIR /tmp/app/server

RUN npm ci --omit=dev

RUN apk del .build-deps

WORKDIR /tmp/app

FROM base as runtime

COPY --chown=octofarm:octofarm --from=compiler /tmp/app/server/node_modules /app/server/node_modules
COPY --chown=octofarm:octofarm . /app

RUN rm -rf /tmp/app

USER octofarm
WORKDIR /app

VOLUME ["/app/data"]

RUN chmod +x ./docker/entrypoint.sh
ENTRYPOINT [ "/sbin/tini", "--" ]
CMD ["./docker/entrypoint.sh"]