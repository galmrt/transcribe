"""Embedding service using BAAI/bge-large-en-v1.5 via HuggingFace Inference API."""

import logging
import httpx

logger = logging.getLogger(__name__)

HF_API_URL = "https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction"
EMBEDDING_DIM = 384


def _mean_pool(output) -> list[float]:
    """Normalise HF feature-extraction output to a 1D float list.

    HF API may return:
      - 1D [dim]              — already a flat vector, return as-is
      - 2D [seq_len, dim]     — mean over sequence
      - 3D [batch, seq_len, dim] — take batch 0, mean over sequence
    """
    if isinstance(output[0], float):
        return output                        # 1D — already done
    if isinstance(output[0][0], float):
        token_vecs = output                  # 2D [seq, dim]
    else:
        token_vecs = output[0]               # 3D [batch, seq, dim] → batch 0
    dim = len(token_vecs[0])
    return [sum(v[i] for v in token_vecs) / len(token_vecs) for i in range(dim)]


class EmbeddingService:
    def __init__(self, api_key: str):
        self._headers = {"Authorization": f"Bearer {api_key}"}
        logger.info("EmbeddingService initialized (model=all-MiniLM-L6-v2, url=%s)", HF_API_URL)

    async def embed(self, text: str) -> list[float] | None:
        """Return a 1024-dim embedding, or None on failure."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(
                    HF_API_URL,
                    headers=self._headers,
                    json={"inputs": text},
                )
                res.raise_for_status()
                data = res.json()
            vector = _mean_pool(data)
            logger.debug("Embedded %d chars → %d-dim vector", len(text), len(vector))
            return vector
        except Exception as e:
            logger.warning("Embedding failed, transcript will be saved without vector: %s", e)
            return None
