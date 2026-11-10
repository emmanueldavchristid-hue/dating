"""Modèles de soirée : un ordre logique d'étapes (apéro → dîner → danser…) avec une heure suggérée.

Chaque étape cherche le meilleur lieu de ses catégories, le plus près possible de l'étape précédente.
Les heures sont des suggestions de déroulé, pas des horaires d'ouverture."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Stage:
    label: str
    categories: tuple[str, ...]  # par ordre de préférence
    time: str  # « 19:00 »
    avoid: tuple[str, ...] = ()  # catégories à éviter pour cette étape


@dataclass(frozen=True)
class Template:
    slug: str
    name: str
    pitch: str
    icon: str
    stages: tuple[Stage, ...]
    city: str | None = None  # ville imposée (« Dimanche à Bassam »)


TEMPLATES = (
    Template(
        "date",
        "Date romantique",
        "Un verre au calme, un bon dîner, puis on prolonge",
        "heart",
        (
            Stage("Un verre pour commencer", ("rooftop", "lounge", "bar"), "19:00", avoid=("maquis", "fast-food")),
            Stage("Le dîner", ("restaurant",), "20:30", avoid=("maquis", "fast-food")),
            Stage("On prolonge", ("lounge", "bar", "club"), "22:30", avoid=("maquis",)),
        ),
    ),
    Template(
        "afterwork",
        "Afterwork",
        "Un verre entre collègues, puis un bon maquis",
        "glass",
        (
            Stage("L'afterwork", ("bar", "rooftop", "lounge"), "18:30"),
            Stage("Manger un bout", ("maquis", "restaurant"), "20:30"),
            Stage("Pour ceux qui restent", ("club", "lounge"), "23:00"),
        ),
    ),
    Template(
        "anniversaire",
        "Anniversaire entre potes",
        "Une activité, un dîner, puis on danse",
        "sparkles",
        (
            Stage("L'activité", ("bowling", "karting", "karaoke", "paintball", "escape-game", "jeux"), "17:00"),
            Stage("Le dîner", ("restaurant", "maquis"), "20:00"),
            Stage("On danse", ("club",), "23:30"),
        ),
    ),
    Template(
        "bassam",
        "Dimanche à Bassam",
        "Plage, déjeuner les pieds dans le sable, balade dans le vieux Bassam",
        "sun",
        (
            Stage("La plage", ("plage",), "11:00"),
            Stage("Le déjeuner", ("restaurant", "maquis"), "13:30"),
            Stage("La balade", ("musee", "culture", "nature"), "16:00"),
        ),
        city="grand-bassam",
    ),
    Template(
        "famille",
        "Sortie en famille",
        "Une activité pour les enfants, un déjeuner, une glace",
        "leaf",
        (
            Stage("L'activité", ("parc-loisirs", "piscine", "nature", "jeux"), "10:30"),
            Stage("Le déjeuner", ("restaurant", "fast-food", "maquis"), "13:00"),
            Stage("Le goûter", ("cafe",), "16:00"),
        ),
    ),
)
BY_SLUG = {t.slug: t for t in TEMPLATES}
