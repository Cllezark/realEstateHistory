# syntax=docker/dockerfile:1
#
# Two-stage build: Node compiles the Vite frontend, Python serves it.
#
# Unlike the sibling mega-launcher project (single Node runtime, railpack.json),
# this app needs both runtimes: Vite builds the bundle, but serve.py is what runs
# in production because it gzips responses on the fly. That matters a lot here —
# frontend/public/data/parcel-sales.json is 54 MB raw and 7 MB gzipped, so serving
# it uncompressed would mean 54 MB of egress on every cold page load.

# ---- Stage 1: build the frontend ----
FROM node:24-slim AS build
WORKDIR /app/frontend

# Install against the lockfile first so this layer caches independently of source churn
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Source plus the pipeline-generated data in public/ — Vite copies public/ into dist/
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: serve ----
FROM python:3.12-slim
WORKDIR /app

# serve.py is stdlib-only (gzip, http.server, io, os, socketserver) — nothing to pip install
COPY serve.py ./
COPY --from=build /app/frontend/dist ./frontend/dist

# Railway injects PORT; this default only matters for local `docker run`
ENV PORT=8000
EXPOSE 8000

CMD ["python", "serve.py"]
