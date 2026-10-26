from app.models import User
from app.schemas import Preferences, UserOut


def user_out(u: User) -> UserOut:
    p = u.preferences
    return UserOut(
        id=str(u.id), email=u.email, display_name=u.display_name, role=u.role, plan=u.plan_code,
        preferences=Preferences(categories=p.categories or [], ambiances=p.ambiances or [],
                                budget_max_fcfa=p.budget_max_fcfa, home_city=p.home_city) if p else Preferences(),
        location_consent=u.location_consent,
    )
