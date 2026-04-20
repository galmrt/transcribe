"""Transcription and cleaning via Groq API."""

import logging
import os
from pathlib import Path
from groq import AsyncGroq

logger = logging.getLogger(__name__)

PROMPT_FILE = Path(__file__).parent.parent / "prompts/clean_transcript.txt"
SYSTEM_PROMPT = PROMPT_FILE.read_text().strip()


class TranscriptionService:
    def __init__(self, api_key: str, whisper_model: str, chat_model: str):
        self.client = AsyncGroq(api_key=api_key)
        self.whisper_model = whisper_model
        self.chat_model = chat_model
        logger.info("TranscriptionService initialized (whisper=%s, chat=%s)", whisper_model, chat_model)

    async def transcribe(self, audio_path: str) -> str:
        """Transcribe audio file using Groq Whisper API."""
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        logger.info("Transcribing: %s", audio_path)
        with open(audio_path, "rb") as f:
            result = await self.client.audio.transcriptions.create(
                file=(os.path.basename(audio_path), f.read()),
                model=self.whisper_model,
                response_format="text",
            )
        text = result if isinstance(result, str) else result.text
        logger.info("Transcription complete (%d chars)", len(text))
        return text

    async def clean(self, text: str) -> str:
        """Remove filler words and fix grammar using Groq chat API."""
        logger.info("Cleaning transcript (%d chars)", len(text))
        response = await self.client.chat.completions.create(
            model=self.chat_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": text},
            ],
            temperature=0.3,
        )
        cleaned = response.choices[0].message.content.strip()
        logger.info("Cleaned transcript (%d chars)", len(cleaned))
        return cleaned
