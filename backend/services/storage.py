"""Supabase storage service for transcripts and chat sessions."""

import logging
from datetime import datetime, timezone
from supabase import AsyncClient, acreate_client

logger = logging.getLogger(__name__)


class StorageService:
    def __init__(self, client: AsyncClient):
        self.client = client

    @classmethod
    async def create(cls, url: str, service_key: str) -> "StorageService":
        client = await acreate_client(url, service_key)
        logger.info("Supabase client initialized")
        return cls(client)

    # ── Transcripts ───────────────────────────────────────────────────────────

    async def save_transcript(self, user_id: str, title: str, content: str) -> dict:
        result = await (
            self.client.table("transcripts")
            .insert({"user_id": user_id, "title": title, "content": content})
            .execute()
        )
        row = result.data[0]
        logger.info("Saved transcript %s for user %s", row["id"], user_id)
        return row

    async def get_transcript(self, user_id: str, transcript_id: str) -> dict | None:
        result = await (
            self.client.table("transcripts")
            .select("*")
            .eq("id", transcript_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        return result.data

    async def get_history(self, user_id: str, limit: int = 50) -> list:
        result = await (
            self.client.table("transcripts")
            .select("id, title, created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []

    async def search_transcripts(self, user_id: str, query: str, limit: int = 5) -> list:
        result = await self.client.rpc(
            "search_transcripts",
            {"p_user_id": user_id, "p_query": query, "p_limit": limit},
        ).execute()
        return result.data or []

    # ── Chat sessions ─────────────────────────────────────────────────────────

    async def upsert_chat_session(
        self, user_id: str, session_id: str, messages: list, title: str
    ) -> dict:
        now = datetime.now(timezone.utc).isoformat()
        result = await (
            self.client.table("chat_sessions")
            .upsert(
                {
                    "id": session_id,
                    "user_id": user_id,
                    "title": title,
                    "messages": messages,
                    "updated_at": now,
                },
                on_conflict="id",
            )
            .execute()
        )
        return result.data[0]

    async def get_chat_sessions(self, user_id: str, limit: int = 50) -> list:
        result = await (
            self.client.table("chat_sessions")
            .select("id, title, updated_at, created_at")
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []

    async def get_chat_session(self, user_id: str, session_id: str) -> dict | None:
        result = await (
            self.client.table("chat_sessions")
            .select("*")
            .eq("id", session_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        return result.data
