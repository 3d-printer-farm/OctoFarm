FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV OCTOFARM_SQLITE_PATH=/app/data/octofarm.db

RUN npm install -g npm@latest pm2

COPY . /app
WORKDIR /app/server

RUN npm ci --omit=dev

EXPOSE 4000
VOLUME ["/app/data"]
WORKDIR /app

COPY docker/monolithic-entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["bash", "/usr/local/bin/entrypoint.sh"]
