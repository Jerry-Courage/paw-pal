# FlowState — AI-Powered Study Platform

## Quick Start

### Backend (Django)
```bash
cd backend
# Add your OpenRouter API key to .env
python manage.py runserver
```

### Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev
```

Then open http://localhost:3000

## Environment Setup

**backend/.env** — fill in your OpenRouter API key:
```
OPENROUTER_API_KEY=your-key-here
```

**frontend/.env.local** — already configured for local dev. Add OAuth keys when ready:
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_ID=...
GITHUB_SECRET=...
```

## API
Django runs on http://localhost:8000
Next.js runs on http://localhost:3000
