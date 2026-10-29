from sqlalchemy.orm import Session

from app.models import AuditLog, User


def audit(db: Session, actor: User | None, action: str, entity_type: str, entity_id: str, **data) -> None:
    """Journal d'administration. Ne jamais y mettre de mot de passe ni de position précise."""
    db.add(
        AuditLog(
            actor_id=actor.id if actor else None,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            data=data,
        )
    )
