"""Transcription and cleaning via Groq API."""

import json
import logging
import os
from pathlib import Path
from groq import AsyncGroq

logger = logging.getLogger(__name__)

PROMPTS = Path(__file__).parent.parent / "prompts"
CLEAN_PROMPT = (PROMPTS / "clean_transcript.txt").read_text().strip()
FORMAT_PROMPT_TEMPLATE = (PROMPTS / "format_transcript.txt").read_text()
METADATA_PROMPT = (PROMPTS / "extract_metadata.txt").read_text().strip()


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
            audio_bytes = f.read()

        result = await self.client.audio.transcriptions.create(
            file=(os.path.basename(audio_path), audio_bytes),
            model=self.whisper_model,
            response_format="text",
        )
        text = result if isinstance(result, str) else result.text
        logger.info("Transcription complete (%d chars)", len(text))
        return text

    async def clean(self, text: str, instructions: str = "") -> str:
        """Clean transcript, then optionally reformat with a separate LLM call."""
        logger.info("Cleaning transcript (%d chars)", len(text))
        response = await self.client.chat.completions.create(
            model=self.chat_model,
            messages=[
                {"role": "system", "content": CLEAN_PROMPT},
                {"role": "user", "content": text},
            ],
            temperature=0.3,
        )
        cleaned = response.choices[0].message.content.strip()
        logger.info("Cleaned transcript (%d chars)", len(cleaned))

        if not instructions.strip():
            return cleaned

        logger.info("Formatting transcript with instructions: %r", instructions)
        format_system = FORMAT_PROMPT_TEMPLATE.strip()
        fmt_response = await self.client.chat.completions.create(
            model=self.chat_model,
            messages=[
                {"role": "system", "content": format_system},
                {"role": "user", "content": "INSTRUCTION: format as bullet list\nTEXT: Let's buy some milk, eggs and bread."},
                {"role": "assistant", "content": "Let's buy:\n* some milk\n* eggs\n* bread"},
                {"role": "user", "content": "INSTRUCTION: numbered list\nTEXT: We need to call John, write the report and send the email."},
                {"role": "assistant", "content": "We need to:\n1. Call John\n2. Write the report\n3. Send the email"},
                {"role": "user", "content": f"INSTRUCTION: {instructions.strip()}\nTEXT: {cleaned}"},
            ],
            temperature=0.3,
        )
        formatted = fmt_response.choices[0].message.content.strip()
        logger.info("Formatted transcript (%d chars)", len(formatted))
        return formatted

    async def extract_metadata(self, text: str) -> dict:
        """Extract tags and action items from transcript text."""
        logger.info("Extracting metadata (%d chars)", len(text))
        try:
            response = await self.client.chat.completions.create(
                model=self.chat_model,
                messages=[
                    {"role": "system", "content": METADATA_PROMPT},
                    {"role": "user", "content": text},
                ],
                response_format={"type": "json_object"},
                temperature=0.1,
            )
            result = json.loads(response.choices[0].message.content)
            tags = result.get("tags", [])
            action_items = result.get("action_items", [])
            logger.info("Metadata extracted: %d tags, %d action items", len(tags), len(action_items))
            return {"tags": tags, "action_items": action_items}
        except Exception as e:
            logger.warning("Metadata extraction failed: %s", e)
            return {"tags": [], "action_items": []}
