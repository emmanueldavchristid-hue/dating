"""Fournisseur LLM interchangeable, côté serveur uniquement.

Le modèle ne reçoit QUE des faits issus de la base et n'exécute aucun SQL : il peut
(1) extraire des filtres structurés, (2) rédiger une réponse à partir des lieux fournis.
Toute défaillance retombe sur le mode « règles »."""
import json
import logging
from typing import Protocol

import httpx

from app.config import get_settings
from app.schemas import Parsed

log = logging.getLogger(__name__)

FILTER_TOOL = {
    "name": "set_filters",
    "description": "Filtres de recherche extraits de la demande de l'utilisateur.",
    "input_schema": {
        "type": "object",
        "properties": {
            "categories": {"type": "array", "items": {"type": "string"}},
            "ambiances": {"type": "array", "items": {"type": "string"}},
            "budget_max_fcfa": {"type": ["integer", "null"]},
            "open_now": {"type": "boolean"},
            "q": {"type": ["string", "null"], "description": "mots-clés libres restants"},
        },
        "required": ["categories", "ambiances", "open_now"],
    },
}


class LLMProvider(Protocol):
    name: str

    def extract(self, message: str, categories: list[str], ambiances: list[str]) -> Parsed | None: ...

    def compose(self, message: str, facts: list[dict]) -> str | None: ...


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, api_key: str, model: str, client: httpx.Client | None = None) -> None:
        self.api_key, self.model = api_key, model
        self.client = client or httpx.Client(timeout=20.0)

    def _call(self, payload: dict) -> dict | None:
        try:
            r = self.client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": self.api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={"model": self.model, "max_tokens": 600, **payload},
            )
            r.raise_for_status()
            return r.json()
        except httpx.HTTPError as e:
            log.warning("LLM indisponible: %s", type(e).__name__)
            return None

    def extract(self, message, categories, ambiances):
        data = self._call({
            "system": f"Extrais des filtres. Catégories autorisées : {categories}. Ambiances autorisées : {ambiances}. N'invente aucune valeur.",
            "tools": [FILTER_TOOL], "tool_choice": {"type": "tool", "name": "set_filters"},
            "messages": [{"role": "user", "content": message}],
        })
        if not data:
            return None
        for block in data.get("content", []):
            if block.get("type") == "tool_use":
                inp = block.get("input", {})
                return Parsed(
                    categories=[c for c in inp.get("categories", []) if c in categories],
                    ambiances=[a for a in inp.get("ambiances", []) if a in ambiances],
                    budget_max_fcfa=inp.get("budget_max_fcfa"), open_now=bool(inp.get("open_now")), q=inp.get("q"),
                )
        return None

    def compose(self, message, facts):
        data = self._call({
            "system": (
                "Tu es un concierge de sorties à Abidjan. Réponds en français, chaleureux et bref (4 phrases max). "
                "Tu ne parles QUE des lieux fournis en JSON, sans ajouter de prix, note, horaire ou distance absents des données. "
                "Si une info manque, dis qu'elle n'est pas connue. Si la liste est vide, dis-le honnêtement."
            ),
            "messages": [{"role": "user", "content": f"Demande : {message}\nLieux disponibles : {json.dumps(facts, ensure_ascii=False)}"}],
        })
        if not data:
            return None
        text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()
        return text or None


def get_llm() -> LLMProvider | None:
    s = get_settings()
    if s.llm_provider == "anthropic" and s.anthropic_api_key:
        return AnthropicProvider(s.anthropic_api_key, s.llm_model)
    return None
