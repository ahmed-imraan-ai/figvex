# Build the static site, then serve it with nginx.
#
#   docker build -t figvex .
#   docker run -p 8080:8080 figvex
#
# VITE_* values are baked into the bundle at build time, so pass them as
# build arguments, not runtime environment variables.

FROM node:22-alpine AS build
WORKDIR /app

ARG VITE_REPO_URL=""
ARG VITE_PLANTUML_SERVER=""
ARG VITE_PLANTUML_STDLIB_URL=""
ENV VITE_REPO_URL=$VITE_REPO_URL \
    VITE_PLANTUML_SERVER=$VITE_PLANTUML_SERVER \
    VITE_PLANTUML_STDLIB_URL=$VITE_PLANTUML_STDLIB_URL

# The postinstall script copies the PlantUML engine out of node_modules.
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

FROM nginx:1.29-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
