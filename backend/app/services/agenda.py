"""Agenda des sorties : soirées, concerts, brunchs… rattachés à un lieu de la base, saisis par l'équipe."""

from datetime import datetime, timedelta

KINDS = {
    "soiree": "Soirée",
    "concert": "Concert",
    "brunch": "Brunch",
    "afterwork": "Afterwork",
    "spectacle": "Spectacle",
    "famille": "En famille",
    "sport": "Sport & loisirs",
    "festival": "Festival",
    "autre": "Sortie",
}


def window(now: datetime, days: int = 7) -> tuple[datetime, datetime, str]:
    """Période affichée et son titre : « Ce week-end » du jeudi au dimanche, sinon « Cette semaine »."""
    start = now - timedelta(hours=3)  # une soirée commencée il y a peu reste visible
    if now.weekday() >= 3:  # jeudi → dimanche
        sunday = (now + timedelta(days=6 - now.weekday())).replace(hour=23, minute=59, second=59, microsecond=0)
        return start, max(sunday + timedelta(hours=6), now + timedelta(days=2)), "Ce week-end"
    return start, now + timedelta(days=days), "Cette semaine"
