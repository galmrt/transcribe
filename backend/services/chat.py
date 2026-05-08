"""RAG chat with Groq tool calling: LLM decides when/what to search."""

import json
import logging
import time
from datetime import datetime, timezone
from groq import AsyncGroq, BadRequestError
from .storage import StorageService
from .embeddings import EmbeddingService

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a helpful assistant answering questions about the user's personal transcripts (recorded audio notes).

You have access to a search tool. Use it when the user asks about something that might be in their recordings.

Rules for your responses:
- Answer the user's question directly and concisely
- Do NOT narrate what you are doing ("Let me check...", "I found...", "Searching for...")
- Do NOT quote transcripts verbatim or show their titles
- Do NOT explain the search process
- If nothing relevant is found, say so briefly
- For general questions unrelated to transcripts, answer directly without searching"""

SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "search_transcripts",
        "description": (
            "Search the user's recorded transcripts. Call this whenever the user asks about "
            "something they may have recorded or said. Do not answer from memory — search first. "
            "Call once per query. Do not batch multiple queries into one call."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": (
                        "A short keyword phrase (2–5 words) extracted from the user's question. "
                        "Use specific nouns and topics. Example: 'grocery list', 'meeting with John', 'project deadline'."
                    ),
                }
            },
            "required": ["query"],
        },
    },
}


class ChatService:
    def __init__(self, api_key: str, model: str, storage: StorageService, embedding_service: EmbeddingService | None = None):
        self.client = AsyncGroq(api_key=api_key)
        self.model = model
        self.storage = storage
        self.embedding_service = embedding_service
        logger.info("ChatService initialized (model=%s, semantic=%s)", model, embedding_service is not None)

    async def _run_search(self, user_id: str, query: str) -> str:
        t0 = time.monotonic()
        mode = "none"
        results = []

        if self.embedding_service:
            embedding = await self.embedding_service.embed(query)
            if embedding:
                results = await self.storage.search_transcripts_hybrid(user_id, query, embedding, limit=5)
                mode = "hybrid"
            else:
                results = await self.storage.search_transcripts(user_id, query, limit=5)
                mode = "fulltext"
        else:
            results = await self.storage.search_transcripts(user_id, query, limit=5)
            mode = "fulltext"

        latency_ms = int((time.monotonic() - t0) * 1000)
        logger.info(
            "Search | mode=%s query=%r results=%d latency=%dms titles=%s",
            mode, query, len(results), latency_ms,
            [r["title"] for r in results],
        )
        await self.storage.log_search(user_id, query, mode, len(results), latency_ms)

        if not results:
            return "No matching transcripts found."

        parts = []
        for r in results:
            parts.append(f"[{r['title']}]\n{r['content'][:1500]}")
        return "\n\n---\n\n".join(parts)

    async def stream(
        self,
        user_id: str,
        session_id: str,
        messages: list,
        query: str,
    ):
        """Async generator yielding SSE-formatted strings."""
        groq_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        for msg in messages:
            groq_messages.append({"role": msg["role"], "content": msg["content"]})
        groq_messages.append({"role": "user", "content": query})

        full_answer = ""
        tool_loop_limit = 4

        try:
            for _ in range(tool_loop_limit):
                response = await self.client.chat.completions.create(
                    model=self.model,
                    messages=groq_messages,
                    tools=[SEARCH_TOOL],
                    tool_choice="auto",
                    parallel_tool_calls=False,
                    max_tokens=1024,
                )

                choice = response.choices[0]

                if choice.finish_reason == "tool_calls" and choice.message.tool_calls:
                    groq_messages.append(choice.message)

                    for tc in choice.message.tool_calls:
                        fn_name = tc.function.name
                        try:
                            args = json.loads(tc.function.arguments)
                        except json.JSONDecodeError:
                            args = {}

                        if fn_name == "search_transcripts":
                            search_query = args.get("query", query)
                            yield f"data: {json.dumps({'type': 'status', 'message': f'Searching: {search_query}'})}\n\n"
                            result_text = await self._run_search(user_id, search_query)
                        else:
                            result_text = f"Unknown tool: {fn_name}"

                        groq_messages.append({
                            "role": "tool",
                            "tool_call_id": tc.id,
                            "content": result_text,
                        })

                    continue

                stream = await self.client.chat.completions.create(
                    model=self.model,
                    messages=groq_messages,
                    stream=True,
                    max_tokens=1024,
                )
                async for chunk in stream:
                    token = chunk.choices[0].delta.content
                    if token:
                        full_answer += token
                        yield f"data: {json.dumps({'type': 'chunk', 'content': token})}\n\n"

                break

        except BadRequestError as e:
            if "tool_use_failed" not in str(e):
                raise
            logger.warning("Tool call generation failed, falling back to direct search: %s", e)
            yield f"data: {json.dumps({'type': 'status', 'message': 'Searching your transcripts...'})}\n\n"
            context = await self._run_search(user_id, query)
            fallback_messages = [
                {"role": "system", "content": f"{SYSTEM_PROMPT}\n\nRelevant transcripts:\n---\n{context}\n---"},
            ]
            for msg in messages:
                fallback_messages.append({"role": msg["role"], "content": msg["content"]})
            fallback_messages.append({"role": "user", "content": query})
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=fallback_messages,
                stream=True,
                max_tokens=1024,
            )
            async for chunk in stream:
                token = chunk.choices[0].delta.content
                if token:
                    full_answer += token
                    yield f"data: {json.dumps({'type': 'chunk', 'content': token})}\n\n"

        if not full_answer:
            full_answer = "I wasn't able to find a clear answer in your transcripts."
            yield f"data: {json.dumps({'type': 'chunk', 'content': full_answer})}\n\n"

        now = datetime.now(timezone.utc).isoformat()
        updated_messages = messages + [
            {"role": "user", "content": query, "timestamp": now},
            {"role": "assistant", "content": full_answer, "timestamp": now},
        ]
        title = (query[:57] + "...") if len(query) > 60 else query
        await self.storage.upsert_chat_session(user_id, session_id, updated_messages, title)

        yield f"data: {json.dumps({'type': 'done', 'session_id': session_id})}\n\n"
