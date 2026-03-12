# Day Flow

AI-powered daily planner — realistic scheduling, not maximum productivity.

## Tech Stack

- Vite + React + TypeScript
- shadcn/ui + Tailwind CSS
- Supabase Edge Functions (OpenAI gpt-4o)
- Framer Motion

## Getting Started

```sh
npm install
npm run dev
```

## Environment Variables

### Supabase Edge Function

Set `OPENAI_API_KEY` as a Supabase secret:

```sh
supabase secrets set OPENAI_API_KEY=sk-...
```
