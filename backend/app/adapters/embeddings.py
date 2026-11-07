"""Encodeurs de texte en vecteurs (384 dimensions, comme la colonne pgvector).

- `fastembed` : vrai modèle multilingue (paraphrase-multilingual-MiniLM-L12-v2, ONNX, CPU).
  Recherche « par le sens ». Nécessite `pip install -r requirements-ai.txt` et l'accès à huggingface.co
  au premier lancement (le modèle est ensuite en cache local).
- `hashing` (défaut, hors ligne) : hachage de mots, de trigrammes et de concepts (synonymes
  métier : « bord de mer » ↔ plage). Recherche lexicale enrichie, honnêtement signalée comme
  « lexical » dans les réponses de l'API.

Changer de fournisseur impose de réindexer : `python -m app.tasks index-embeddings --rebuild`."""

import hashlib
import math
import re
import unicodedata
from functools import lru_cache
from typing import Protocol

from app.config import get_settings

DIM = 384


class Embedder(Protocol):
    name: str
    kind: str  # "semantic" | "lexical"

    def embed(self, texts: list[str], query: bool = False) -> list[list[float]]: ...


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9 ]+", " ", text)


STOP = set(
    "le la les un une des de du d l a au aux et ou en pour avec sur dans par pas plus tres qui que quoi est sont ce cet cette on je tu il nous vous ils me te se y".split()
)


def _concepts() -> dict[str, list[str]]:
    from app.services.intent import AMBIANCE_WORDS, CATEGORY_WORDS

    return {f"cat:{k}": v for k, v in CATEGORY_WORDS.items()} | {f"amb:{k}": v for k, v in AMBIANCE_WORDS.items()}


class HashingEmbedder:
    name = "hashing-v1"
    kind = "lexical"

    def _features(self, text: str) -> dict[str, float]:
        t = f" {_norm(text)} "
        feats: dict[str, float] = {}
        words = [w for w in t.split() if w not in STOP and len(w) > 1]
        for w in words:
            stem = w[:-1] if len(w) > 4 and w.endswith("s") else w
            feats[f"w:{stem}"] = feats.get(f"w:{stem}", 0) + 1.0
            padded = f"#{stem}#"
            for i in range(len(padded) - 2):
                key = f"g:{padded[i : i + 3]}"
                feats[key] = feats.get(key, 0) + 0.25
        for concept, synonyms in _concepts().items():
            if any(f" {_norm(s).strip()} " in t for s in synonyms):
                feats[concept] = feats.get(concept, 0) + 2.0
        return feats

    def embed(self, texts, query=False):
        out = []
        for text in texts:
            vec = [0.0] * DIM
            for feat, weight in self._features(text).items():
                h = hashlib.blake2b(feat.encode(), digest_size=8).digest()
                idx = int.from_bytes(h[:4], "little") % DIM
                vec[idx] += weight if h[4] & 1 else -weight
            n = math.sqrt(sum(v * v for v in vec)) or 1.0
            out.append([v / n for v in vec])
        return out


class FastEmbedEmbedder:
    name = "paraphrase-multilingual-MiniLM-L12-v2"
    kind = "semantic"

    def __init__(self) -> None:
        from fastembed import TextEmbedding  # dépendance optionnelle

        self.model = TextEmbedding(model_name=f"sentence-transformers/{self.name}")

    def embed(self, texts, query=False):
        return [list(map(float, v)) for v in self.model.embed(texts)]


@lru_cache
def get_embedder() -> Embedder:
    if get_settings().embeddings_provider == "fastembed":
        return FastEmbedEmbedder()
    return HashingEmbedder()


def cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b, strict=True))
