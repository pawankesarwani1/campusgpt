<div align="center">

# 🎓 CampusGPT

### AI Study Assistant for Anna University students

Ask questions over your own notes, generate **13-mark answers**, predict **important questions**, summarize uploaded PDFs, and practice with an **AI Exam Mode** — all in one clean, installable web app.

![Tech](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Tech](https://img.shields.io/badge/FastAPI-Python-009688?logo=fastapi&logoColor=white)
![Tech](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)
![Tech](https://img.shields.io/badge/Gemini-LLM-4285F4?logo=google&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-installable-000000?logo=pwa&logoColor=white)

</div>

---

## ✨ Features

- 💬 **RAG chat** over your own course material — answers are grounded in uploaded notes/PYQs, with source attribution.
- 🎯 **Four modes** — General Q&A, **13-Mark** answer generation, **PYQ** (important-question) prediction, and **Summarize**.
- 📄 **PDF upload → embed → retrieve** — drop in your notes and ask questions about them.
- 📝 **Exam Mode** — generates full descriptive papers *or* interactive MCQ quizzes (one question at a time, timer, auto-scoring, explanations).
- 🔊 Text-to-speech, 🎤 voice input, 📤 PDF export, 🔗 shareable chat links.
- 🔐 **JWT auth** (bcrypt, refresh-token rotation, brute-force lockout).
- 🎨 Clean black + blue UI, fully responsive (phone / tablet / laptop), **installable as a PWA**.

<!-- Add screenshots here — they make a huge difference for a portfolio.
![Chat](docs/screenshot-chat.png)
![Exam Mode](docs/screenshot-exam.png)
-->

## 🧱 Tech stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, Vite, Tailwind CSS, Zustand |
| Backend | FastAPI (Python), Uvicorn |
| AI | Google Gemini + LangChain (chat + embeddings) |
| Vector store | ChromaDB (RAG retrieval) |
| Database | MongoDB (users, sessions, messages) |
| Auth | JWT (python-jose) + bcrypt |
| Packaging | PWA (installable), optional Electron desktop build |

## 🏗️ Architecture

```
campusgpt/
├── frontend/        React + Vite SPA (chat UI, exam mode, PWA)
├── backend/         FastAPI app
│   └── app/
│       ├── auth/    register / login / JWT
│       ├── chat/    RAG chain + streaming (SSE)
│       └── upload/  PDF upload endpoint
├── pipeline/        extract → chunk → embed → store (ChromaDB)
└── DEPLOYMENT.md    step-by-step cloud deploy guide
```

The frontend streams answers from `POST /chat/ask`. The backend retrieves relevant
chunks from ChromaDB, builds a mode-specific prompt, and streams Gemini's response
token-by-token over Server-Sent Events.

## 🚀 Getting started (local)

**Prerequisites:** Python 3.10+, Node 18+, a running MongoDB, and a free
[Google AI Studio key](https://aistudio.google.com/app/apikey).

### 1. Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate            # Windows  (source venv/bin/activate on macOS/Linux)
pip install -r requirements.txt
copy .env.example .env           # then fill in your values
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend
```bash
cd frontend
npm install
copy .env.example .env           # optional for local (defaults to localhost:8000)
npm run dev                      # http://localhost:5173
```

## 🖥️ Desktop app (Windows)

The Electron build bundles the FastAPI backend (via PyInstaller), so users just
run the installer — no Python, Node or MongoDB required. On first launch the app
asks for a Gemini API key (stored encrypted with the OS keychain). Chats, uploads
and the vector store live in `%APPDATA%\CampusGPT`.

```bash
cd backend
venv\Scripts\pip install pyinstaller     # one-time
cd ..\frontend
npm run electron:build                   # → frontend/release/CampusGPT Setup x.y.z.exe
```

| Script | What it does |
|--------|--------------|
| `npm run build:backend` | PyInstaller → `backend/dist/campusgpt-backend/` |
| `npm run electron:preview` | Run the production app without installing (uses the built backend) |
| `npm run electron:build` | Backend + UI + NSIS installer |
| `npm run electron:build:quick` | UI + installer, reusing the last backend build |
| `npm run electron:dev` | Vite dev server in a window; run the backend yourself on :8000 |

## 🔑 Environment variables

**backend/.env** (see `backend/.env.example`)

| Key | Description |
|-----|-------------|
| `GOOGLE_API_KEY` | Google AI Studio / Gemini key |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | ≥32-char random secret (`python -c "import secrets;print(secrets.token_urlsafe(48))"`) |

**frontend/.env** (see `frontend/.env.example`)

| Key | Description |
|-----|-------------|
| `VITE_API_URL` | Backend URL (defaults to `http://127.0.0.1:8000`) |

> **Never commit your real `.env`** — only `.env.example` is tracked.

## ☁️ Deployment

A shareable web link (Vercel + Render + MongoDB Atlas) and PWA install are covered
in **[DEPLOYMENT.md](DEPLOYMENT.md)**.

## 🗺️ Roadmap

- [ ] HttpOnly-cookie auth
- [ ] Durable vector store for cloud
- [ ] Automated test suite + CI
- [ ] Google OAuth login

## 📄 License

MIT — see [LICENSE](LICENSE).

<div align="center"><sub>Built as an AI + full-stack portfolio project.</sub></div>
