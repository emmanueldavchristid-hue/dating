"""Fournisseurs LLM interchangeables, côté serveur uniquement.

Le modèle ne reçoit QUE des faits issus de la base et n'exécute aucun SQL : il peut
(1) extraire des filtres structurés, (2) rédiger une réponse à partir des lieux fournis.
Toute défaillance retombe sur le fournisseur suivant, puis sur le mode « règles ».

Fournisseurs :
- `openai` : tout service compatible avec l'API OpenAI (Groq, Gemini, OpenRouter, NVIDIA NIM…) ;
- `anthropic` : API Messages d'Anthropic.
Configuration : LLM_PROVIDERS=groq,gemini (ordre de repli) + la clé de chacun (voir .env.example)."""

import json
import logging
import re
from typing import Protocol

import httpx

from app.config import get_settings
from app.schemas import Parsed

log = logging.getLogger(__name__)

# Services compatibles OpenAI connus : adresse de base et modèle par défaut (modifiables dans .env).
OPENAI_COMPATIBLE = {
    "groq": ("https://api.groq.com/openai/v1", "llama-3.3-70b-versatile"),
    "gemini": ("https://generativelanguage.googleapis.com/v1beta/openai", "gemini-2.5-flash"),
    "openrouter": ("https://openrouter.ai/api/v1", "meta-llama/llama-3.3-70b-instruct:free"),
    "nvidia": ("https://integrate.api.nvidia.com/v1", "meta/llama-3.3-70b-instruct"),
}

EXTRACT_SYSTEM = (
    "Tu analyses une demande de sortie à Abidjan (Côte d'Ivoire). Réponds UNIQUEMENT par un objet JSON :\n"
    '{"categories": [...], "ambiances": [...], "budget_max_fcfa": entier ou null, "open_now": booléen, '
    '"q": mots-clés libres restants ou null}\n'
    "Catégories autorisées (slug : sens) : {categories}.\n"
    "Ambiances autorisées : {ambiances}.\n"
    "Règles : n'invente aucune valeur hors de ces listes ; comprends le français, l'anglais et le nouchi "
    "(« gbê », « s'enjailler » = faire la fête ; « maquis », « garba », « alloco ») ; les fautes de frappe aussi. "
    "Si le dernier message est une relance (« moins cher », « et à Cocody ? », « plutôt un bar »), combine-le "
    "avec la demande précédente ; si c'est une NOUVELLE demande, ignore les précédentes. "
    "Une salutation ou un message sans demande donne des listes vides."
)
COMPOSE_SYSTEM = (
    "Tu es le concierge de sorties d'une application à Abidjan. Réponds dans la langue de l'utilisateur, "
    "ton chaleureux et naturel, 2 à 4 phrases, sans liste à puces ni markdown. "
    "Tu ne parles QUE des lieux fournis en JSON, en citant leur nom exact, et tu expliques en quelques mots "
    "pourquoi chacun correspond à la demande. N'ajoute AUCUN prix, note, horaire, distance ou détail absent "
    "des données ; si une info utile manque (prix, horaires), dis simplement qu'elle n'est pas encore connue. "
    "Si `alternative` vaut true, dis honnêtement que l'app n'a pas encore exactement ce qui est demandé et "
    "présente ces lieux comme des alternatives proches. N'invente jamais d'autre lieu."
)


class LLMProvider(Protocol):
    name: str

    def extract(
        self, message: str, categories: dict[str, str], ambiances: list[str], history: list[dict] | None = None
    ) -> Parsed | None: ...

    def compose(self, message: str, facts: list[dict], alternative: bool = False) -> str | None: ...


def _parsed_from(data: dict, categories, ambiances) -> Parsed:
    budget = data.get("budget_max_fcfa")
    return Parsed(
        categories=[c for c in data.get("categories") or [] if c in categories],
        ambiances=[a for a in data.get("ambiances") or [] if a in ambiances],
        budget_max_fcfa=budget if isinstance(budget, int) and budget > 0 else None,
        open_now=bool(data.get("open_now")),
        q=data.get("q") if isinstance(data.get("q"), str) else None,
    )


def _json_object(text: str) -> dict | None:
    m = re.search(r"\{.*\}", text or "", re.S)
    if not m:
        return None
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def _history_text(history: list[dict] | None) -> str:
    lines = [f"{'Utilisateur' if t['role'] == 'user' else 'Concierge'} : {t['content'][:300]}" for t in history or []]
    return ("Conversation précédente :\n" + "\n".join(lines[-6:]) + "\n\n") if lines else ""


class OpenAICompatibleProvider:
    """Groq, Gemini, OpenRouter, NVIDIA NIM… : même format de requête (/chat/completions)."""

    def __init__(self, name: str, base_url: str, api_key: str, model: str, client: httpx.Client | None = None) -> None:
        self.name, self.base_url, self.api_key, self.model = name, base_url.rstrip("/"), api_key, model
        self.client = client or httpx.Client(timeout=20.0)

    def _chat(self, system: str, user: str, json_mode: bool, max_tokens: int = 500) -> str | None:
        payload = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": 0.2 if json_mode else 0.6,
            "max_tokens": max_tokens,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        try:
            r = self.client.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                json=payload,
            )
            r.raise_for_status()
            return (r.json()["choices"][0]["message"].get("content") or "").strip() or None
        except (httpx.HTTPError, KeyError, IndexError, ValueError) as e:
            log.warning("LLM %s indisponible : %s", self.name, type(e).__name__)
            return None

    def extract(self, message, categories, ambiances, history=None):
        system = EXTRACT_SYSTEM.replace("{categories}", json.dumps(categories, ensure_ascii=False)).replace(
            "{ambiances}", ", ".join(ambiances)
        )
        text = self._chat(system, _history_text(history) + f"Dernier message : {message}", json_mode=True)
        data = _json_object(text) if text else None
        return _parsed_from(data, categories, ambiances) if data is not None else None

    def compose(self, message, facts, alternative=False):
        body = json.dumps({"alternative": alternative, "lieux": facts}, ensure_ascii=False)
        return self._chat(COMPOSE_SYSTEM, f"Demande : {message}\nDonnées : {body}", json_mode=False, max_tokens=400)


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, api_key: str, model: str, client: httpx.Client | None = None) -> None:
        self.api_key, self.model = api_key, model
        self.client = client or httpx.Client(timeout=20.0)

    def _call(self, system: str, user: str) -> str | None:
        try:
            r = self.client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": self.model,
                    "max_tokens": 600,
                    "system": system,
                    "messages": [{"role": "user", "content": user}],
                },
            )
            r.raise_for_status()
            data = r.json()
        except (httpx.HTTPError, ValueError) as e:
            log.warning("LLM indisponible: %s", type(e).__name__)
            return None
        text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()
        return text or None

    def extract(self, message, categories, ambiances, history=None):
        system = EXTRACT_SYSTEM.replace("{categories}", json.dumps(categories, ensure_ascii=False)).replace(
            "{ambiances}", ", ".join(ambiances)
        )
        text = self._call(system, _history_text(history) + f"Dernier message : {message}")
        data = _json_object(text) if text else None
        return _parsed_from(data, categories, ambiances) if data is not None else None

    def compose(self, message, facts, alternative=False):
        body = json.dumps({"alternative": alternative, "lieux": facts}, ensure_ascii=False)
        return self._call(COMPOSE_SYSTEM, f"Demande : {message}\nDonnées : {body}")


class ChainProvider:
    """Essaie chaque fournisseur dans l'ordre (ex. Groq saturé → Gemini). `name` = celui qui a répondu."""

    def __init__(self, providers: list) -> None:
        self.providers = providers
        self.name = providers[0].name if providers else "rules"

    def _first(self, method: str, *args, **kwargs):
        for p in self.providers:
            out = getattr(p, method)(*args, **kwargs)
            if out is not None:
                self.name = p.name
                return out
        return None

    def extract(self, message, categories, ambiances, history=None):
        return self._first("extract", message, categories, ambiances, history)

    def compose(self, message, facts, alternative=False):
        return self._first("compose", message, facts, alternative)


def configured_providers() -> list:
    s = get_settings()
    names = [n.strip().lower() for n in (s.llm_providers or s.llm_provider or "").split(",") if n.strip()]
    out = []
    for n in names:
        if n == "anthropic" and s.anthropic_api_key:
            out.append(AnthropicProvider(s.anthropic_api_key, s.llm_model))
        elif n in OPENAI_COMPATIBLE:
            key = getattr(s, f"{n}_api_key", "")
            base, model = OPENAI_COMPATIBLE[n]
            if key:
                out.append(OpenAICompatibleProvider(n, base, key, getattr(s, f"{n}_model", "") or model))
    return out


def get_llm() -> LLMProvider | None:
    providers = configured_providers()
    return ChainProvider(providers) if providers else None


def llm_mode() -> str:
    """« rules » sans fournisseur configuré, sinon la liste des fournisseurs (ex. « groq,gemini »)."""
    providers = configured_providers()
    return ",".join(p.name for p in providers) if providers else "rules"
