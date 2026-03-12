# Day Flow

AI-powered daily planner — realistic scheduling, not maximum productivity.

## Tech Stack

- Vite + React + TypeScript
- shadcn/ui + Tailwind CSS
- Vercel Serverless Functions (OpenAI gpt-4o)
- Framer Motion

## Getting Started

```sh
npm install
npm run dev
```

## Deploying to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com), import the repo
3. Add environment variable: `OPENAI_API_KEY` = your OpenAI key
4. **Cloud sync (optional):** Go to Vercel Dashboard → Storage → Create Blob Store → connect to your project. This auto-creates the `BLOB_READ_WRITE_TOKEN` env var. Without this, data stays in localStorage only (no cross-device sync).
5. Deploy — that's it
