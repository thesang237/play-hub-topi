# Deploying Play Hub on Render

This repo is configured for Render's free Web Service plan with `render.yaml`.

## Steps

1. Push this repo to GitHub.
2. In Render, create a new Blueprint from the GitHub repo.
3. Keep the generated `play-hub` web service on the free plan.
4. Add `YOUTUBE_API_KEY` as a secret environment variable if you want live YouTube search.
5. Deploy.

Render provides the `PORT` environment variable automatically. The app serves the built Vite frontend, `/api` routes, and `/ws` WebSocket endpoint from the same service.

## Commands Render Uses

```sh
pnpm install --frozen-lockfile && pnpm build
pnpm start
```
