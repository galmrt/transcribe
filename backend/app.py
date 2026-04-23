import asyncio
import json
import logging
import os
import tempfile
from contextlib import asynccontextmanager
from typing import Annotated

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

MAX_UPLOAD_SIZE = 25 * 1024 * 1024  # 25 MB
MAX_QUERY_LENGTH = 1000

from services import TranscriptionService, StorageService, ChatService, EmbeddingService

# ── Auth ──────────────────────────────────────────────────────────────────────

async def get_current_user(authorization: str = Header(None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1]
    try:
        response = await storage.client.auth.get_user(token)
        return response.user.id
    except Exception as e:
        logger.warning("Auth failed: %s", e)
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ── Services (initialised in lifespan) ───────────────────────────────────────

transcription: TranscriptionService = None
storage: StorageService = None
chat: ChatService = None
embeddings: EmbeddingService = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global transcription, storage, chat, embeddings

    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is required")

    transcription = TranscriptionService(
        api_key=api_key,
        whisper_model=os.getenv("GROQ_WHISPER_MODEL", "whisper-large-v3-turbo"),
        chat_model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
    )
    storage = await StorageService.create(
        url=os.getenv("SUPABASE_URL"),
        service_key=os.getenv("SUPABASE_SERVICE_KEY"),
    )
    hf_key = os.getenv("HUGGINGFACE_API_KEY")
    if hf_key:
        embeddings = EmbeddingService(api_key=hf_key)
    else:
        logger.warning("HUGGINGFACE_API_KEY not set — semantic search disabled")
    chat = ChatService(
        api_key=api_key,
        model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
        storage=storage,
        embedding_service=embeddings,
    )
    logger.info("All services ready")
    yield


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title="Transcripts API", lifespan=lifespan)

allowed_origins = os.getenv(
    "ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / response models ─────────────────────────────────────────────────

class CleanRequest(BaseModel):
    text: str
    instructions: str = ""

class SaveRequest(BaseModel):
    text: str

class ChatRequest(BaseModel):
    messages: list
    query: str


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/transcribe")
async def transcribe_audio(
    audio: Annotated[UploadFile, File(description="Audio file (webm/mp3/wav/m4a)")],
    user_id: str = Depends(get_current_user),
):
    content = await audio.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 25 MB)")

    suffix = os.path.splitext(audio.filename)[1] or ".webm"
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
            f.write(content)
            tmp_path = f.name

        transcript = await transcription.transcribe(tmp_path)
        return {"transcript": transcript}
    except Exception:
        logger.exception("Transcription failed")
        raise HTTPException(status_code=500, detail="Transcription failed")
    finally:
        if tmp_path:
            try:
                os.remove(tmp_path)
            except OSError:
                pass


@app.post("/clean")
async def clean_transcript(
    body: CleanRequest,
    user_id: str = Depends(get_current_user),
):
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    try:
        cleaned = await transcription.clean(body.text, body.instructions)
        title = " ".join(cleaned.split()[:6])
        tasks = [transcription.extract_metadata(cleaned)]
        if embeddings:
            tasks.append(embeddings.embed(cleaned))
        results = await asyncio.gather(*tasks, return_exceptions=True)
        metadata = results[0] if not isinstance(results[0], Exception) else {"tags": [], "action_items": []}
        embedding = results[1] if len(results) > 1 and not isinstance(results[1], Exception) else None
        if not embeddings:
            logger.warning("Embedding service not available — skipping embedding")
        await storage.save_transcript(
            user_id, title, cleaned, embedding,
            tags=metadata.get("tags"), action_items=metadata.get("action_items"),
        )
        return {"cleaned_text": cleaned, "tags": metadata.get("tags", []), "action_items": metadata.get("action_items", [])}
    except Exception:
        logger.exception("Cleaning failed")
        raise HTTPException(status_code=500, detail="Cleaning failed")


@app.post("/save")
async def save_transcript(
    body: SaveRequest,
    user_id: str = Depends(get_current_user),
):
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    try:
        title = " ".join(body.text.split()[:6])
        tasks = [transcription.extract_metadata(body.text)]
        if embeddings:
            tasks.append(embeddings.embed(body.text))
        results = await asyncio.gather(*tasks, return_exceptions=True)
        metadata = results[0] if not isinstance(results[0], Exception) else {"tags": [], "action_items": []}
        embedding = results[1] if len(results) > 1 and not isinstance(results[1], Exception) else None
        if not embeddings:
            logger.warning("Embedding service not available — skipping embedding")
        await storage.save_transcript(
            user_id, title, body.text, embedding,
            tags=metadata.get("tags"), action_items=metadata.get("action_items"),
        )
        return {"saved": True, "tags": metadata.get("tags", []), "action_items": metadata.get("action_items", [])}
    except Exception:
        logger.exception("Save failed")
        raise HTTPException(status_code=500, detail="Save failed")


@app.post("/search")
async def search(query: str, user_id: str = Depends(get_current_user)):
    if not query or not query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    if len(query) > MAX_QUERY_LENGTH:
        raise HTTPException(status_code=400, detail="Query too long")
    try:
        results = await storage.search_transcripts(user_id, query)
        return results
    except Exception:
        logger.exception("Search failed")
        raise HTTPException(status_code=500, detail="Search failed")


@app.get("/tasks")
async def get_tasks(user_id: str = Depends(get_current_user)):
    try:
        return await storage.get_transcripts_with_actions(user_id)
    except Exception:
        logger.exception("Tasks fetch failed")
        raise HTTPException(status_code=500, detail="Failed to fetch tasks")


@app.get("/history")
async def get_history(user_id: str = Depends(get_current_user)):
    try:
        return await storage.get_history(user_id)
    except Exception:
        logger.exception("History fetch failed")
        raise HTTPException(status_code=500, detail="Failed to fetch history")


@app.get("/transcript/{transcript_id}")
async def get_transcript(transcript_id: str, user_id: str = Depends(get_current_user)):
    row = await storage.get_transcript(user_id, transcript_id)
    if not row:
        raise HTTPException(status_code=404, detail="Transcript not found")
    return row


@app.get("/chat/sessions")
async def get_chat_sessions(user_id: str = Depends(get_current_user)):
    try:
        return await storage.get_chat_sessions(user_id)
    except Exception:
        logger.exception("Failed to load sessions")
        raise HTTPException(status_code=500, detail="Failed to load sessions")


@app.get("/chat/{session_id}")
async def get_chat_session(session_id: str, user_id: str = Depends(get_current_user)):
    session = await storage.get_chat_session(user_id, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.post("/chat/{session_id}/stream")
async def chat_stream(
    session_id: str,
    body: ChatRequest,
    user_id: str = Depends(get_current_user),
):
    async def generator():
        async for event in chat.stream(user_id, session_id, body.messages, body.query):
            yield event

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
