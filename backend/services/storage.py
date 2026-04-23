"""Supabase storage service for transcripts and chat sessions."""

import logging
from datetime import datetime, timezone
from supabase import AsyncClient, acreate_client
import asyncio

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

    async def save_transcript(
        self,
        user_id: str,
        title: str,
        content: str,
        embedding: list[float] | None = None,
        tags: list[str] | None = None,
        action_items: list[str] | None = None,
    ) -> dict:
        row_data = {"user_id": user_id, "title": title, "content": content}
        if embedding is not None:
            row_data["embedding"] = embedding
        if tags is not None:
            row_data["tags"] = tags
        if action_items is not None:
            row_data["action_items"] = action_items
        result = await (
            self.client.table("transcripts")
            .insert(row_data)
            .execute()
        )
        row = result.data[0]
        logger.info(
            "Saved transcript %s (embedding=%s, tags=%s, actions=%d)",
            row["id"], "yes" if embedding else "no", tags, len(action_items or []),
        )
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
            .select("id, title, created_at, tags")
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

    async def search_transcripts_semantic(
        self, user_id: str, embedding: list[float], limit: int = 3
    ) -> list:
        result = await self.client.rpc(
            "search_transcripts_semantic",
            {"p_user_id": user_id, "p_embedding": embedding, "p_limit": limit},
        ).execute()
        return result.data or []

    async def search_transcripts_hybrid(
        self, user_id: str, query: str, embedding: list[float], limit: int = 5
    ) -> list:
        result = await self.client.rpc(
            "search_transcripts_hybrid",
            {"p_user_id": user_id, "p_query": query, "p_embedding": embedding, "p_limit": limit},
        ).execute()
        return result.data or []

    async def log_search(
        self,
        user_id: str,
        query: str,
        mode: str,
        result_count: int,
        latency_ms: int,
    ) -> None:
        try:
            await (
                self.client.table("search_logs")
                .insert({
                    "user_id": user_id,
                    "query": query,
                    "mode": mode,
                    "result_count": result_count,
                    "latency_ms": latency_ms,
                })
                .execute()
            )
        except Exception as e:
            logger.warning("Failed to log search: %s", e)

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

    async def get_transcripts_with_actions(self, user_id: str, limit: int = 100) -> list:
        result = await (
            self.client.table("transcripts")
            .select("id, title, created_at, tags, action_items")
            .eq("user_id", user_id)
            .neq("action_items", "[]")
            .order("created_at", desc=True)
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
