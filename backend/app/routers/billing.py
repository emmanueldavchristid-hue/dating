from fastapi import APIRouter
from sqlalchemy import select

from app.adapters.payments import get_payments
from app.deps import DB, CurrentUser
from app.errors import ApiError
from app.models import Plan
from app.schemas import CheckoutIn, PlanOut

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/plans", response_model=list[PlanOut])
def plans(db: DB):
    return [PlanOut(code=p.code, name=p.name, price_fcfa=p.price_fcfa, features=p.features,
                    quotas={"concierge_per_day": p.concierge_per_day, "itinerary_max_steps": p.itinerary_max_steps})
            for p in db.scalars(select(Plan).order_by(Plan.sort))]


@router.post("/checkout")
def checkout(body: CheckoutIn, db: DB, user: CurrentUser):
    provider = get_payments()
    plan = db.get(Plan, body.plan)
    if provider is None or plan is None or plan.price_fcfa is None:
        raise ApiError(501, "not_configured",
                       "Le paiement n'est pas encore activé. Orange Money, Wave et MTN MoMo seront proposés via un agrégateur.")
    return {"checkout_url": provider.create_checkout(str(user.id), plan.code, plan.price_fcfa)}
