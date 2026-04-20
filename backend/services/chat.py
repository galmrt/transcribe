"""Simple RAG chat: search transcripts → stream Groq answer."""

import json
import logging
from datetime import datetime, timezone
from groq import AsyncGroq
from .storage import StorageService

logger = logging.getLogger(__name__)

SYSTEM_TEMPLATE = """You are a helpful assistant answering questions about the user's transcripts.

{context_section}

Answer based on the provided transcripts. If the answer isn't in the transcripts, say so clearly."""

CONTEXT_SECTION = """Relevant transcripts:
---
{context}
---"""


class ChatService:
    def __init__(self, api_key: str, model: str, storage: StorageService):
        self.client = AsyncGroq(api_key=api_key)
        self.model = model
        self.storage = storage
        logger.info("ChatService initialized (model=%s)", model)

    async def stream(
        self,
        user_id: str,
        session_id: str,
        messages: list,
        query: str,
    ):
        """Async generator that yields SSE-formatted strings."""
        # 1. Search for relevant context
        yield f"data: {json.dumps({'type': 'status', 'message': 'Searching your transcripts...'})}\n\n"
        results = await self.storage.search_transcripts(user_id, query, limit=3)

        if results:
            context_text = "\n\n---\n\n".join(
                f"[{r['title']}]\n{r['content'][:1500]}" for r in results
            )
            context_section = CONTEXT_SECTION.format(context=context_text)
        else:
            context_section = "No matching transcripts found."

        system_content = SYSTEM_TEMPLATE.format(context_section=context_section)

        # 2. Build message list for Groq
        groq_messages = [{"role": "system", "content": system_content}]
        for msg in messages:
            groq_messages.append({"role": msg["role"], "content": msg["content"]})
        groq_messages.append({"role": "user", "content": query})

        # 3. Stream response token by token
        full_answer = ""
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

        # 4. Save session
        now = datetime.now(timezone.utc).isoformat()
        updated_messages = messages + [
            {"role": "user", "content": query, "timestamp": now},
            {"role": "assistant", "content": full_answer, "timestamp": now},
        ]
        title = (query[:57] + "...") if len(query) > 60 else query
        await self.storage.upsert_chat_session(user_id, session_id, updated_messages, title)

        yield f"data: {json.dumps({'type': 'done', 'session_id': session_id})}\n\n"
