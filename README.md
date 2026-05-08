# Transcripts

Record audio, transcribe it, and ask questions about it later.

## What it does

- Record audio in the browser (Chrome and Safari supported)
- Transcribe via Groq Whisper, optionally clean up with an LLM
- Full-text and semantic hybrid search across all your transcripts
- Chat with an AI that searches your transcripts to answer questions

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI (Python) |
| Frontend | React + Vite |
| Database / Auth | Supabase (Postgres + magic-link auth) |
| Transcription | Groq Whisper (`whisper-large-v3-turbo`) |
| LLM | Groq (`llama-3.3-70b-versatile`) |
| Embeddings | HuggingFace Inference API (optional) |

## Local setup

```bash
# Clone and install backend deps
python -m venv venv && source venv/bin/activate
pip install -r backend/requirements.txt

# Install frontend deps
cd frontend && npm install && cd ..

# Set up env vars
cp backend/.env.example backend/.env      # fill in your keys
cp frontend/.env.example frontend/.env    # fill in your keys

# Run both services
./start.sh
```

Backend runs at `http://localhost:8000`, frontend at `http://localhost:5173`.

## Environment variables

**`backend/.env`**
```
GROQ_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
ALLOWED_ORIGINS=http://localhost:5173
HUGGINGFACE_API_KEY=   # optional — enables semantic search
```

**`frontend/.env`**
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=http://localhost:8000
```

## Deployment

- **Backend**: Render (root dir `backend`, start command `uvicorn app:app --host 0.0.0.0 --port $PORT`)
- **Frontend**: Vercel (root dir `frontend`)
- **Database**: Supabase — run `supabase/schema.sql` once in the SQL editor
