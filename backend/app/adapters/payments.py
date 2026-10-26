"""Paiements : interface prête pour un agrégateur Mobile Money (Orange Money, Wave, MTN MoMo).

Aucun fournisseur n'est branché : aucune transaction n'est simulée."""
from typing import Protocol

from app.config import get_settings


class PaymentProvider(Protocol):
    name: str

    def create_checkout(self, user_id: str, plan_code: str, amount_fcfa: int) -> str:
        """Retourne l'URL de paiement hébergée par l'agrégateur."""
        ...


def get_payments() -> PaymentProvider | None:
    provider = get_settings().payments_provider
    if provider == "none":
        return None
    raise NotImplementedError(f"Fournisseur de paiement '{provider}' non intégré")
