"""Statut ouvert/fermé calculé uniquement à partir d'horaires enregistrés. Sans horaires : 'unknown'."""
from dataclasses import dataclass
from datetime import datetime, time, timedelta


@dataclass(frozen=True)
class Slot:
    weekday: int  # 0 = lundi
    opens: time
    closes: time  # closes <= opens : fermeture après minuit


def _minutes(t: time) -> int:
    return t.hour * 60 + t.minute


def open_status(slots: list[Slot], now: datetime, closed_today: bool = False) -> tuple[str, str | None]:
    """Retourne (statut, heure de fermeture 'HH:MM' ou None)."""
    if not slots:
        return "unknown", None
    if closed_today:
        return "closed", None
    today, minute = now.weekday(), now.hour * 60 + now.minute
    yesterday = (today - 1) % 7
    for s in slots:
        o, c = _minutes(s.opens), _minutes(s.closes)
        overnight = c <= o
        if s.weekday == today:
            if (not overnight and o <= minute < c) or (overnight and minute >= o):
                return "open", s.closes.strftime("%H:%M")
        if s.weekday == yesterday and overnight and minute < c:
            return "open", s.closes.strftime("%H:%M")
    return "closed", None


def local_now(tz: str) -> datetime:
    from zoneinfo import ZoneInfo
    return datetime.now(ZoneInfo(tz))


def start_of_day(now: datetime) -> datetime:
    return now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(0)
