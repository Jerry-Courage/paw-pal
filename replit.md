# FlowState — AI Study Platform

## Project Overview
FlowState is a full-stack AI-powered study platform. Students can upload PDFs, lecture notes, and YouTube videos; the platform generates flashcards, quizzes, study plans, and provides an AI tutor.

## Architecture

- **Frontend**: Next.js 14 (App Router) — lives in `frontend/`
- **Backend**: Django 6 + Django REST Framework — lives in `backend/`
- **Auth**: NextAuth.js (credentials) + Django SimpleJWT
- **AI**: OpenRouter API (configurable model)

## Workflows

- **Start application** — `cd frontend && npm run dev` on port 5000 (webview)
- **Backend API** — `cd backend && python manage.py runserver 0.0.0.0:8000` on port 8000 (console)

## Key Configuration

### Environment Variables (shared)
- `NEXT_PUBLIC_API_URL` = `http://localhost:8000/api`
- `API_URL` = `http://localhost:8000/api`
- `NEXTAUTH_URL` = Replit dev domain URL
- `NEXTAUTH_SECRET` = auto-generated secure secret
- `DJANGO_SECRET_KEY` = auto-generated secure secret
- `DEBUG` = `True`
- `ALLOWED_HOSTS` = `*`

### Secrets Needed
- `OPENROUTER_API_KEY` — required for AI features (flashcard generation, quiz, AI tutor)

## Frontend (`frontend/`)
- Next.js 14.2.5 with App Router
- Tailwind CSS + Radix UI + shadcn-style components
- TanStack Query for data fetching
- NextAuth.js for session management
- `lib/api.ts` — Axios client with JWT auth interceptor
- `lib/auth.ts` — NextAuth configuration

## Backend (`backend/`)
- Django 6.0.3 with DRF
- SQLite database (db.sqlite3)
- JWT authentication via SimpleJWT
- CORS configured for localhost and all `*.replit.dev` origins
- WhiteNoise for static file serving
- Apps: `users`, `library`, `ai_assistant`, `groups`, `planner`, `community`, `assignments`, `workspace`

## Running Locally
1. Frontend starts automatically on port 5000
2. Backend starts automatically on port 8000
3. Django migrations are applied (run `cd backend && python manage.py migrate` if needed)
4. Static files collected to `backend/staticfiles/`

## Replit Compatibility Notes
- Frontend port changed from default 3000 → 5000 (Replit webview requirement)
- Both servers bind to `0.0.0.0` to accept proxied connections
- CORS allows all `*.replit.dev` and `*.repl.co` origins via regex
- `NEXTAUTH_URL` must match the Replit dev domain for auth callbacks to work
