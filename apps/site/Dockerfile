# Build context is the repository root: the site's dependencies are locked in the root bun.lock.
#   docker build -f apps/site/Dockerfile -t frankstack-site .
FROM node:22-slim AS build
COPY --from=oven/bun:1.4.2 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /repo
COPY . .
# @babel/types is declared in the site only because the @marko/run CLI imports it without listing it;
# the isolated install cannot reach it otherwise. Drop it once a fixed @marko/run is locked.
RUN bun install --frozen-lockfile --ignore-scripts --filter @frankstack/site
WORKDIR /repo/apps/site
RUN bun run build

FROM nginxinc/nginx-unprivileged:stable-alpine
COPY apps/site/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/site/dist/public /usr/share/nginx/html
EXPOSE 8080
