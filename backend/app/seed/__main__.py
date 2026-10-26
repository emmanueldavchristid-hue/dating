"""Données de référence + jeu de DÉMONSTRATION fictif.

    python -m app.seed            # référentiels seulement (idempotent)
    python -m app.seed --demo     # + lieux, comptes et avis fictifs (remplace la démo existante)

Tous les lieux de démo sont marqués is_demo=True, source « demo », sans date de vérification :
noms, avis et horaires sont INVENTÉS et ne décrivent aucun établissement réel."""
import random
import sys
from datetime import UTC, datetime, time, timedelta

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert

from app.config import get_settings
from app.db import SessionLocal
from app.models import (
    Ambiance,
    Category,
    City,
    CurationItem,
    DataSource,
    District,
    Event,
    Media,
    OpeningHours,
    Place,
    Plan,
    Review,
    User,
    UserPreferences,
)
from app.security import hash_password
from app.services.places import refresh_rating, set_taxonomy, slugify

CATEGORIES = [
    ("restaurant", "Restaurants", "utensils"), ("maquis", "Maquis", "flame"), ("lounge", "Lounges", "sofa"),
    ("rooftop", "Rooftops", "building"), ("plage", "Plages", "waves"), ("nature", "Nature & parcs", "leaf"),
    ("bar", "Bars", "glass"), ("cafe", "Cafés & brunch", "coffee"), ("activite", "Activités & loisirs", "ticket"),
    ("culture", "Culture & art", "palette"), ("club", "Clubs", "music"), ("evenement", "Événements", "calendar"),
]
AMBIANCES = [("calme", "Calme"), ("romantique", "Romantique"), ("festif", "Festif"), ("entre-amis", "Entre amis"),
             ("famille", "En famille"), ("decouverte", "Découverte"), ("plein-air", "Plein air")]
CITIES = {
    "abidjan": ("Abidjan", (5.3364, -4.0267), {
        "plateau": ("Plateau", 5.3237, -4.0186), "cocody": ("Cocody", 5.3480, -3.9870),
        "deux-plateaux": ("Deux Plateaux", 5.3700, -3.9980), "riviera": ("Riviera", 5.3600, -3.9600),
        "angre": ("Angré", 5.3950, -3.9900), "zone-4": ("Zone 4", 5.2950, -3.9900), "marcory": ("Marcory", 5.3030, -3.9770),
        "treichville": ("Treichville", 5.2930, -4.0080), "yopougon": ("Yopougon", 5.3450, -4.0750),
        "port-bouet": ("Port-Bouët", 5.2560, -3.9400), "bingerville": ("Bingerville", 5.3550, -3.8850),
    }),
    "grand-bassam": ("Grand-Bassam", (5.2010, -3.7380), {
        "quartier-france": ("Quartier France", 5.1960, -3.7380), "mockeyville": ("Mockeyville", 5.2050, -3.7300),
    }),
    "assinie": ("Assinie", (5.1300, -3.2800), {"assinie-mafia": ("Assinie-Mafia", 5.1290, -3.2850)}),
}
PLANS = [
    ("free", "Découverte", 0, 3, 2, False, ["Découverte et recherche multicritère", "Carte et fiches complètes", "Favoris et collections", "Concierge en mode découverte (3/jour)"], 0),
    ("plus", "Plus", None, 30, 4, False, ["Tout Découverte", "Concierge 30 demandes/jour", "Soirées jusqu'à 4 étapes", "Alertes de découverte (bientôt)"], 1),
    ("insider", "Insider", None, 100, 5, True, ["Tout Plus", "Pépites et lieux cachés", "Collections exclusives", "Soirées jusqu'à 5 étapes"], 2),
]
GRADIENTS = {
    "restaurant": ["#5A2E1C", "#120C0A"], "maquis": ["#6B3A12", "#140D07"], "lounge": ["#3A2350", "#0F0B16"],
    "rooftop": ["#1E3A4C", "#0B1117"], "plage": ["#0F4C5C", "#08161B"], "nature": ["#1F4A32", "#0A140E"],
    "bar": ["#4C1E2E", "#130A0D"], "cafe": ["#5C4026", "#130F0A"], "activite": ["#2C3E6B", "#0B0F19"],
    "culture": ["#4A3A1A", "#120F08"], "club": ["#2A1450", "#0B0714"], "evenement": ["#5A1E3C", "#140810"],
}
HOURS = {
    "soir": [(d, "18:00", "01:00") for d in range(1, 7)],
    "jour": [(d, "08:00", "18:00") for d in range(7)],
    "resto": [(d, a, b) for d in range(7) for a, b in (("12:00", "15:00"), ("19:00", "23:00"))],
    "club": [(d, "22:00", "04:00") for d in (3, 4, 5)],
    "plage": [(d, "09:00", "19:00") for d in range(7)],
    "brunch": [(d, "07:30", "16:00") for d in range(7)],
    "maquis": [(d, "11:00", "00:00") for d in range(7)],
    "inconnu": [],
}
# nom, catégories, ambiances, ville/quartier, niveau prix, budget min-max (FCFA/pers.), tier, horaires, équipements, accroche, popularité
P = [
    ("La Terrasse Ébène", ["rooftop", "bar"], ["romantique", "calme"], "abidjan/plateau", 3, 12000, 30000, "free", "soir", "PCW", "Cocktails au-dessus des tours du Plateau, lumière dorée au coucher du soleil.", 60),
    ("Maquis Le Grand Four", ["maquis"], ["entre-amis", "festif"], "abidjan/yopougon", 1, 2500, 7000, "free", "maquis", "MO", "Poisson braisé, alloco et grandes tablées sous les ampoules.", 90),
    ("Le Jardin Kapokier", ["restaurant", "nature"], ["calme", "famille", "plein-air"], "abidjan/cocody", 2, 8000, 18000, "free", "resto", "PCMOW", "Cuisine du marché servie sous un grand arbre, au calme.", 45),
    ("Lagoon Lounge Bleu Nuit", ["lounge", "bar"], ["festif", "entre-amis"], "abidjan/zone-4", 3, 10000, 25000, "free", "soir", "PCM", "Lounge face à la lagune, DJ le week-end et banquettes profondes.", 70),
    ("Café Akwaba Matin", ["cafe"], ["calme", "decouverte"], "abidjan/deux-plateaux", 2, 3000, 9000, "free", "brunch", "CMW", "Brunchs généreux, café ivoirien torréfié sur place.", 50),
    ("Plage des Cocotiers Penchés", ["plage", "restaurant"], ["plein-air", "famille", "entre-amis"], "abidjan/port-bouet", 2, 5000, 15000, "free", "plage", "PO", "Transats, poisson grillé et vagues de l'Atlantique.", 65),
    ("Galerie Lumière d'Ivoire", ["culture"], ["decouverte", "calme"], "abidjan/plateau", 1, 0, 5000, "free", "jour", "W", "Expositions d'artistes contemporains, entrée souvent libre.", 25),
    ("Club Orbite", ["club"], ["festif"], "abidjan/marcory", 4, 15000, 50000, "free", "club", "PC", "Grande salle, son puissant, soirées jusqu'à l'aube.", 55),
    ("Le Comptoir des Lagunes", ["restaurant"], ["romantique", "calme"], "abidjan/cocody", 4, 25000, 60000, "free", "resto", "PCW", "Table gastronomique, fruits de mer et vue sur l'eau.", 40),
    ("Parc des Fromagers", ["nature"], ["famille", "plein-air", "calme"], "abidjan/bingerville", 1, 0, 3000, "free", "jour", "PO", "Allées ombragées et pique-niques en famille.", 30),
    ("Bowling Néon 225", ["activite"], ["entre-amis", "famille", "festif"], "abidjan/riviera", 2, 6000, 15000, "free", "soir", "PCMW", "Pistes de bowling, billards et snacks.", 35),
    ("Maquis Tantie Bébé", ["maquis"], ["entre-amis"], "abidjan/treichville", 1, 2000, 6000, "free", "maquis", "M", "Garba et attiéké toute la journée, ambiance de quartier.", 80),
    ("Rooftop Horizon 8", ["rooftop", "lounge"], ["festif", "romantique"], "abidjan/plateau", 4, 15000, 40000, "free", "soir", "PCW", "Vue à 360° sur la ville, musique live le jeudi.", 50),
    ("Bar Les Palmiers", ["bar"], ["entre-amis", "plein-air"], "abidjan/angre", 2, 4000, 12000, "free", "soir", "MO", "Grande terrasse, bière fraîche et matchs sur écran.", 45),
    ("Atelier Pagne & Thé", ["cafe", "culture"], ["decouverte", "calme"], "abidjan/cocody", 2, 4000, 10000, "free", "jour", "CMW", "Salon de thé et boutique de créateurs.", 20),
    ("Le Patio Riviera", ["restaurant", "lounge"], ["romantique", "plein-air"], "abidjan/riviera", 3, 12000, 28000, "free", "resto", "PCMOW", "Patio fleuri, grillades et cocktails maison.", 38),
    ("Karting Vitesse Sud", ["activite"], ["entre-amis", "festif", "plein-air"], "abidjan/port-bouet", 3, 10000, 25000, "free", "jour", "PCO", "Piste de karting extérieure et chrono affiché.", 28),
    ("Maquis Belle Lagune", ["maquis", "bar"], ["festif", "entre-amis", "plein-air"], "abidjan/marcory", 1, 3000, 9000, "free", "maquis", "MO", "Pieds dans la lagune, poulet braisé et musique.", 60),
    ("Cinéma Le Sankofa", ["culture", "activite"], ["entre-amis", "famille"], "abidjan/cocody", 2, 3500, 6000, "free", "soir", "PCMW", "Salle confortable, films récents et cinéma africain.", 33),
    ("Brasserie du Port", ["restaurant", "bar"], ["entre-amis"], "abidjan/treichville", 2, 7000, 16000, "free", "inconnu", "", "Grande brasserie animée près des quais.", 22),
    ("Jardin Botanique Secret", ["nature"], ["calme", "decouverte", "plein-air"], "abidjan/bingerville", 1, 1000, 3000, "free", "inconnu", "O", "Sentiers et espèces rares à quelques minutes de la ville.", 15),
    ("Lounge Velours", ["lounge"], ["romantique", "calme"], "abidjan/deux-plateaux", 3, 12000, 30000, "free", "soir", "PCW", "Lumière tamisée, jazz doux et cocktails signature.", 42),
    ("Snack Allocodrome Express", ["maquis"], ["entre-amis", "famille"], "abidjan/cocody", 1, 1500, 5000, "free", "maquis", "MO", "Alloco minute et brochettes, à toute heure de la soirée.", 75),
    ("Salle Rythmes & Voix", ["culture", "evenement"], ["festif", "decouverte"], "abidjan/plateau", 2, 5000, 20000, "free", "inconnu", "C", "Concerts et scènes ouvertes selon la programmation.", 27),
    ("Le Belvédère Bassam", ["restaurant", "plage"], ["romantique", "plein-air"], "grand-bassam/quartier-france", 3, 12000, 30000, "free", "resto", "PCMO", "Maison coloniale, terrasse sur l'océan.", 48),
    ("Plage Mockeyville Bleue", ["plage"], ["famille", "plein-air", "entre-amis"], "grand-bassam/mockeyville", 1, 2000, 8000, "free", "plage", "PO", "Plage familiale, paillotes et jus frais.", 52),
    ("Musée Mémoire de Bassam", ["culture"], ["decouverte", "calme", "famille"], "grand-bassam/quartier-france", 1, 1000, 3000, "free", "jour", "P", "Histoire de la première capitale, visites guidées.", 30),
    ("Lodge Sable d'Or", ["plage", "lounge"], ["romantique", "calme", "plein-air"], "assinie/assinie-mafia", 4, 25000, 70000, "free", "plage", "PCO", "Bungalows, hamacs et dîner les pieds dans le sable.", 44),
    ("Bar Coquillage", ["bar", "plage"], ["festif", "entre-amis", "plein-air"], "assinie/assinie-mafia", 2, 5000, 15000, "free", "soir", "MO", "Bar de plage, feux de camp et sound systems.", 36),
    ("Café Lecture Baobab", ["cafe", "culture"], ["calme", "decouverte"], "abidjan/angre", 1, 2000, 6000, "free", "brunch", "CMW", "Bibliothèque partagée, jus de bissap et wifi.", 18),
    ("Escape Room Le Coffre", ["activite"], ["entre-amis", "famille", "decouverte"], "abidjan/riviera", 2, 8000, 15000, "free", "inconnu", "CM", "Énigmes en équipe de 2 à 6 joueurs.", 16),
    ("Grill de la Corniche", ["restaurant"], ["entre-amis", "famille"], "abidjan/cocody", 2, 6000, 14000, "free", "resto", "PM", "Viandes grillées et vue sur la baie.", 39),
    # ----- Pépites premium (fictives) -----
    ("La Crique aux Hérons", ["nature", "plage"], ["calme", "decouverte", "plein-air"], "abidjan/bingerville", 1, 0, 5000, "premium", "inconnu", "O", "Petite crique cachée, accessible par un sentier, presque déserte en semaine.", 8),
    ("Le Salon Sans Enseigne", ["bar", "culture"], ["romantique", "decouverte", "calme"], "abidjan/plateau", 3, 10000, 25000, "premium", "soir", "C", "Bar à jazz confidentiel au fond d'une cour, trente places.", 10),
    ("Table d'Hôte Chez Mamie Ahou", ["restaurant", "maquis"], ["decouverte", "famille"], "abidjan/yopougon", 1, 4000, 8000, "premium", "inconnu", "M", "Cuisine familiale servie dans une cour, sur réservation.", 6),
    ("Atelier Céramique Lagune", ["culture", "activite"], ["decouverte", "calme"], "abidjan/marcory", 2, 8000, 15000, "premium", "jour", "CM", "Atelier d'artisan ouvert pour des initiations en petit groupe.", 5),
    ("Ponton du Pêcheur", ["restaurant", "nature"], ["romantique", "plein-air", "calme"], "assinie/assinie-mafia", 2, 7000, 16000, "premium", "resto", "MO", "Ponton en bois, poisson du jour, coucher de soleil sur la lagune.", 9),
    ("Terrasse Secrète Bassam", ["rooftop", "bar"], ["romantique", "decouverte"], "grand-bassam/quartier-france", 2, 6000, 14000, "premium", "soir", "MO", "Toit d'une vieille maison coloniale, vue sur les façades.", 7),
]
REVIEW_TEXTS = {
    5: ["Superbe découverte, on y retourne vite.", "Accueil chaleureux et cadre magnifique.", "Exactement l'ambiance qu'on cherchait."],
    4: ["Très bonne adresse, un peu d'attente le week-end.", "Bon rapport qualité-prix, cadre agréable.", "Belle soirée, service correct."],
    3: ["Correct sans plus, le cadre sauve l'ensemble.", "Sympa mais un peu bruyant.", "Bien, mais les prix ont augmenté."],
    2: ["Service lent et plats tièdes ce soir-là.", "Déçu par rapport aux photos."],
}
DEMO_PASSWORD = "Demo-2026!"


def seed_reference(db) -> None:
    db.execute(insert(Category).values([{"slug": s, "name": n, "icon": i, "sort": k} for k, (s, n, i) in enumerate(CATEGORIES)])
               .on_conflict_do_update(index_elements=["slug"], set_={"name": insert(Category).excluded.name, "icon": insert(Category).excluded.icon, "sort": insert(Category).excluded.sort}))
    db.execute(insert(Ambiance).values([{"slug": s, "name": n} for s, n in AMBIANCES]).on_conflict_do_nothing())
    for code, name, price, conc, steps, gems, features, sort in PLANS:
        db.merge(Plan(code=code, name=name, price_fcfa=price, concierge_per_day=conc, itinerary_max_steps=steps,
                      can_see_gems=gems, features=features, sort=sort))
    for slug, (name, (lat, lng), districts) in CITIES.items():
        city = db.scalar(select(City).where(City.slug == slug)) or City(slug=slug, name=name, center=f"SRID=4326;POINT({lng} {lat})")
        db.add(city)
        db.flush()
        for dslug, (dname, dlat, dlng) in districts.items():
            if not db.scalar(select(District).where(District.city_id == city.id, District.slug == dslug)):
                db.add(District(city_id=city.id, slug=dslug, name=dname, center=f"SRID=4326;POINT({dlng} {dlat})"))
    for kind, name, lic, attr in [("demo", "Démonstration", None, "Données fictives de démonstration"),
                                  ("osm", "OpenStreetMap", "ODbL", "© OpenStreetMap contributors"),
                                  ("curated", "Curation interne", None, None), ("partner", "Partenaires", None, None)]:
        if not db.scalar(select(DataSource).where(DataSource.name == name)):
            db.add(DataSource(kind=kind, name=name, license=lic, attribution=attr))
    db.commit()


def _t(s: str) -> time:
    return time.fromisoformat(s)


def seed_demo(db) -> None:
    if get_settings().is_production:
        raise SystemExit("Refusé : pas de données de démo en production")
    rnd = random.Random(2026)
    db.execute(delete(Place).where(Place.is_demo.is_(True)))
    db.execute(delete(User).where(User.email.like("%@sortie.demo")))
    db.commit()
    src = db.scalar(select(DataSource).where(DataSource.kind == "demo"))
    plans_users = [("admin@sortie.demo", "Admin Démo", "admin", "insider"), ("insider@sortie.demo", "Awa (Insider)", "user", "insider"),
                   ("user@sortie.demo", "Koffi (Découverte)", "user", "free"), ("curateur@sortie.demo", "Curateur Démo", "curator", "free")]
    pw = hash_password(DEMO_PASSWORD)
    for email, name, role, plan in plans_users:
        u = User(email=email, password_hash=pw, display_name=name, role=role, plan_code=plan)
        u.preferences = UserPreferences(categories=["rooftop", "plage"], ambiances=["calme"], home_city="abidjan") if email.startswith("user") else UserPreferences()
        db.add(u)
    reviewers = []
    for i, first in enumerate(["Aya", "Serge", "Mariam", "Yao", "Fatou", "Didier", "Nadia", "Ibrahim", "Clarisse", "Moussa", "Inès", "Hervé"]):
        u = User(email=f"avis{i}@sortie.demo", password_hash=pw, display_name=f"{first} (démo)", is_active=False, plan_code="free")
        db.add(u)
        reviewers.append(u)
    db.flush()
    cities = {c.slug: c for c in db.scalars(select(City))}
    districts = {(d.city_id, d.slug): d for d in db.scalars(select(District))}
    from geoalchemy2 import Geometry
    from sqlalchemy import cast, func
    g = cast(District.center, Geometry)
    centers = {(r[0], r[1]): (r[2], r[3]) for r in db.execute(select(District.city_id, District.slug, func.ST_Y(g), func.ST_X(g)))}
    now = datetime.now(UTC)
    for idx, (name, cats, ambs, loc, lvl, bmin, bmax, tier, hours, amen, short, pop) in enumerate(P):
        cslug, dslug = loc.split("/")
        city = cities[cslug]
        district = districts[(city.id, dslug)]
        lat, lng = centers[(city.id, dslug)]
        lat, lng = lat + rnd.uniform(-0.006, 0.006), lng + rnd.uniform(-0.006, 0.006)
        place = Place(
            slug=slugify(name), name=name, short_description=short,
            description=f"{short} Fiche de démonstration : ce lieu est fictif et sert uniquement à illustrer l'application.",
            city_id=city.id, district_id=district.id, address=f"{district.name}, {city.name} (adresse fictive)",
            location=f"SRID=4326;POINT({lng} {lat})", price_level=lvl, budget_min_fcfa=bmin, budget_max_fcfa=bmax,
            tier=tier, status="published", is_demo=True, source_id=src.id, verified_at=None, confidence=0.3,
            popularity=pop * 3, cover_gradient=GRADIENTS[cats[0]],
            has_parking=True if "P" in amen else None, card_payment=True if "C" in amen else None,
            mobile_money=True if "M" in amen else None, outdoor=True if "O" in amen else None,
            wifi=True if "W" in amen else None, wheelchair=True if idx % 5 == 0 else None,
            created_at=now - timedelta(days=rnd.randint(1, 400)),
        )
        set_taxonomy(db, place, cats, ambs)
        place.hours = [OpeningHours(weekday=d, opens=_t(a), closes=_t(b)) for d, a, b in HOURS[hours]]
        place.media = [Media(gradient=GRADIENTS[c], alt=f"{name} — visuel d'ambiance ({c})", position=k, credit=None)
                       for k, c in enumerate(cats)]
        db.add(place)
        db.flush()
        n_reviews = min(len(reviewers), max(0, int(pop / 7) + rnd.randint(-2, 2))) if tier == "free" else rnd.randint(1, 3)
        base = rnd.choice([3.6, 4.0, 4.2, 4.5, 4.7])
        for u in rnd.sample(reviewers, n_reviews):
            rating = max(2, min(5, round(rnd.gauss(base, 0.7))))
            db.add(Review(place_id=place.id, user_id=u.id, rating=rating, text=rnd.choice(REVIEW_TEXTS[rating]), is_demo=True,
                          created_at=now - timedelta(days=rnd.randint(1, 300))))
        db.flush()
        refresh_rating(db, place)
        if place.rating_count >= 5:
            place.reviews_summary = "Résumé de démonstration : les avis (fictifs) saluent surtout le cadre et l'accueil ; quelques remarques sur l'attente aux heures de pointe."
        if "evenement" in cats or "culture" in cats:
            db.add(Event(place_id=place.id, title="Soirée découverte (démo)", starts_at=now + timedelta(days=rnd.randint(2, 20), hours=19), price_fcfa=bmin or None))
        if tier == "free" and 5 <= pop <= 20:
            db.add(CurationItem(place_id=place.id, reason="gem_candidate", detail="Peu fréquenté mais bien noté : candidat pépite à vérifier sur place."))
    db.commit()
    print(f"Démo : {len(P)} lieux fictifs, {len(plans_users)} comptes (mot de passe : {DEMO_PASSWORD})")


def main() -> None:
    with SessionLocal() as db:
        seed_reference(db)
        if "--demo" in sys.argv:
            seed_demo(db)
    print("Seed terminé")


if __name__ == "__main__":
    main()
