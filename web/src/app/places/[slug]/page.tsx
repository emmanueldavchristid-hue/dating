"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  CategoryIcon,
  IconArrowLeft,
  IconBookmark,
  IconCalendar,
  IconCard,
  IconCheck,
  IconExternal,
  IconFlag,
  IconGem,
  IconGlobe,
  IconHeart,
  IconHeartFilled,
  IconParking,
  IconPhone,
  IconPin,
  IconRoute,
  IconShare,
  IconShield,
  IconStarFilled,
  IconTree,
  IconWallet,
  IconWheelchair,
  IconWifi,
  IconX,
} from "@/components/icons";
import { CollectionPicker } from "@/components/place/CollectionPicker";
import { Cover } from "@/components/place/Cover";
import { DemoBadge, DistanceTravel, OpenBadge } from "@/components/place/PlaceMeta";
import { ReportForm } from "@/components/place/ReportForm";
import { ReviewForm } from "@/components/place/ReviewForm";
import { ErrorState } from "@/components/ui/States";
import { useAuth } from "@/context/AuthContext";
import { useLocation } from "@/context/LocationContext";
import { useMeta } from "@/context/MetaContext";
import { useToast } from "@/context/ToastContext";
import { api, errorMessage } from "@/lib/api";
import {
  WEEKDAYS,
  confidenceLabel,
  directionsUrl,
  formatBudgetRange,
  formatDate,
  formatFcfa,
  formatRating,
} from "@/lib/format";
import type { Amenities, PlaceDetail } from "@/lib/types";
import styles from "./place.module.css";

const AMENITIES: { key: keyof Amenities; yes: string; no: string; Icon: (p: { size?: number }) => React.JSX.Element }[] = [
  { key: "parking", yes: "Parking", no: "Pas de parking", Icon: IconParking },
  { key: "wheelchair", yes: "Accessible en fauteuil", no: "Non accessible en fauteuil", Icon: IconWheelchair },
  { key: "wifi", yes: "Wi-Fi", no: "Pas de Wi-Fi", Icon: IconWifi },
  { key: "card_payment", yes: "Carte bancaire acceptée", no: "Carte bancaire refusée", Icon: IconCard },
  { key: "mobile_money", yes: "Mobile Money accepté", no: "Pas de Mobile Money", Icon: IconWallet },
  { key: "outdoor", yes: "Espace extérieur", no: "Pas d'espace extérieur", Icon: IconTree },
];

const SOURCE_LABELS: Record<PlaceDetail["source"]["kind"], string> = {
  demo: "Donnée de démonstration (fictive)",
  osm: "OpenStreetMap",
  partner: "Partenaire",
  curated: "Équipe de curation",
};

export default function PlacePage() {
  const params = useParams<{ slug: string }>();
  const slug = decodeURIComponent(params.slug);
  const router = useRouter();
  const { user } = useAuth();
  const { coords } = useLocation();
  const { categoryName, ambianceName, categoryIcon } = useMeta();
  const toast = useToast();
  const [place, setPlace] = useState<PlaceDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [fav, setFav] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  const [collOpen, setCollOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [shareFallback, setShareFallback] = useState(false);

  const coordKey = coords ? `${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}` : "";
  const load = useCallback(() => {
    const origin = coordKey ? { lat: Number(coordKey.split(",")[0]), lng: Number(coordKey.split(",")[1]) } : null;
    return api.places.get(slug, origin);
  }, [slug, coordKey]);

  useEffect(() => {
    let alive = true;
    setError(null);
    load()
      .then((p) => {
        if (!alive) return;
        setPlace(p);
        setFav(p.is_favorite);
      })
      .catch((e) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, [load, attempt, user?.id]);

  const requireLogin = (what: string) => {
    toast(`Connectez-vous pour ${what}.`, "info");
    router.push(`/login?next=${encodeURIComponent(`/places/${slug}`)}`);
  };

  const toggleFav = async () => {
    if (!place) return;
    if (!user) return requireLogin("ajouter des favoris");
    setFavBusy(true);
    const next = !fav;
    setFav(next);
    try {
      if (next) await api.favorites.add(place.id);
      else await api.favorites.remove(place.id);
      toast(next ? "Ajouté à vos favoris" : "Retiré de vos favoris", "success");
    } catch (e) {
      setFav(!next);
      toast(errorMessage(e), "error");
    } finally {
      setFavBusy(false);
    }
  };

  const share = async () => {
    if (!place) return;
    const url = window.location.href;
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: place.name, text: place.short_description, url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Lien copié dans le presse-papiers", "success");
    } catch {
      setShareFallback(true);
    }
  };

  if (error) {
    return (
      <div className="page page-narrow" style={{ paddingTop: 40 }}>
        <ErrorState error={error} onRetry={() => setAttempt((n) => n + 1)} />
      </div>
    );
  }

  if (!place) return <DetailSkeleton />;

  const budget = formatBudgetRange(place.budget_min_fcfa, place.budget_max_fcfa);
  const knownAmenities = AMENITIES.filter((a) => place.amenities?.[a.key] != null);
  const conf = confidenceLabel(place.confidence);
  const mainCat = place.categories[0];
  const today = (new Date().getDay() + 6) % 7; // 0 = lundi
  const hoursByDay = WEEKDAYS.map((_, i) => place.hours.filter((h) => h.weekday === i).sort((a, b) => a.open.localeCompare(b.open)));

  return (
    <article className={styles.page}>
      <title>{place.name}</title>
      <header className={styles.hero}>
        <Cover cover={place.cover} category={mainCat} categoryIcon={mainCat ? categoryIcon(mainCat) : null} size="hero" className={styles.heroCover} />
        <div className={styles.heroShade} aria-hidden="true" />
        <div className={styles.heroBar}>
          <button
            type="button"
            className={`icon-btn ${styles.glassBtn}`}
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
            aria-label="Retour"
          >
            <IconArrowLeft />
          </button>
          <div className="row">
            <button type="button" className={`icon-btn ${styles.glassBtn}`} onClick={share} aria-label="Partager ce lieu">
              <IconShare />
            </button>
            <button
              type="button"
              className={`icon-btn ${styles.glassBtn} ${fav ? styles.favOn : ""}`}
              onClick={toggleFav}
              disabled={favBusy}
              aria-pressed={fav}
              aria-label={fav ? "Retirer des favoris" : "Ajouter aux favoris"}
            >
              {fav ? <IconHeartFilled /> : <IconHeart />}
            </button>
          </div>
        </div>
        <div className={styles.heroContent}>
          <div className="row wrap" style={{ gap: 6 }}>
            {place.is_demo ? <DemoBadge /> : null}
            {place.tier === "premium" ? (
              <span className="badge badge-gold">
                <IconGem /> Pépite
              </span>
            ) : null}
            <OpenBadge status={place.open_status} closesAt={place.closes_at} />
          </div>
          <h1 className={styles.name}>{place.name}</h1>
          <p className={styles.heroSub}>
            {place.categories.map(categoryName).join(" · ")}
            {place.district || place.city ? ` — ${[place.district, place.city].filter(Boolean).join(", ")}` : ""}
          </p>
        </div>
      </header>

      <div className={styles.layout}>
        <div className={styles.main}>
          <section className={styles.keyFacts} aria-label="En bref">
            <div className={styles.fact}>
              <span className={styles.factLabel}>Note</span>
              {place.rating_avg != null && place.rating_count > 0 ? (
                <span className={styles.factValue}>
                  <IconStarFilled size={16} style={{ color: "var(--gold)" }} /> {place.rating_avg.toFixed(1).replace(".", ",")}
                  <span className="subtle"> · {place.rating_count} avis</span>
                </span>
              ) : (
                <span className={styles.factMuted}>Pas encore d&apos;avis</span>
              )}
            </div>
            <div className={styles.fact}>
              <span className={styles.factLabel}>Budget / pers.</span>
              {budget ? (
                <span className={styles.factValue}>
                  {budget}
                </span>
              ) : (
                <span className={styles.factMuted}>Non renseigné</span>
              )}
            </div>
            <div className={styles.fact}>
              <span className={styles.factLabel}>Distance</span>
              {place.distance_km != null || place.travel ? (
                <span className={styles.factValue}>
                  <DistanceTravel km={place.distance_km} travel={place.travel} />
                </span>
              ) : (
                <span className={styles.factMuted}>Partagez votre position ou choisissez un quartier</span>
              )}
              {place.distance_km != null && !place.travel ? <span className="subtle">Trajet non estimé</span> : null}
            </div>
          </section>

          <div className={styles.actions}>
            {place.location ? (
              <a className="btn btn-primary" href={directionsUrl(place.location.lat, place.location.lng)} target="_blank" rel="noreferrer">
                <IconRoute /> Itinéraire
                <IconExternal />
              </a>
            ) : (
              <button type="button" className="btn btn-primary" disabled title="Position non disponible">
                <IconRoute /> Itinéraire indisponible
              </button>
            )}
            <button type="button" className="btn" onClick={() => (user ? setCollOpen(true) : requireLogin("créer des collections"))}>
              <IconBookmark /> Collection
            </button>
            <button type="button" className="btn" onClick={share}>
              <IconShare /> Partager
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => (user ? setReportOpen(true) : requireLogin("signaler une erreur"))}>
              <IconFlag /> Signaler une erreur
            </button>
          </div>
          {place.location ? (
            <p className={styles.altDir}>
              Ouvre OpenStreetMap ·{" "}
              <a className="link" href={directionsUrl(place.location.lat, place.location.lng, "google")} target="_blank" rel="noreferrer">
                ou Google Maps
              </a>
            </p>
          ) : null}

          {shareFallback ? (
            <div className={styles.shareBox}>
              <label className="field" style={{ flex: 1 }}>
                <span className="label">Copiez ce lien</span>
                <input className="input" readOnly value={typeof window !== "undefined" ? window.location.href : ""} onFocus={(e) => e.currentTarget.select()} />
              </label>
              <button type="button" className="icon-btn" onClick={() => setShareFallback(false)} aria-label="Fermer">
                <IconX />
              </button>
            </div>
          ) : null}

          <section className={styles.block}>
            <h2 className={styles.blockTitle}>À propos</h2>
            <p className={styles.description}>{place.description || place.short_description}</p>
            {place.ambiances.length ? (
              <div className="chip-wrap" style={{ marginTop: 16 }} aria-label="Ambiances">
                {place.ambiances.map((a) => (
                  <span key={a} className="chip">
                    {ambianceName(a)}
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          {knownAmenities.length ? (
            <section className={styles.block}>
              <h2 className={styles.blockTitle}>Sur place</h2>
              <ul className={styles.amenities}>
                {knownAmenities.map(({ key, yes, no, Icon }) => {
                  const v = place.amenities[key];
                  return (
                    <li key={key} className={v ? styles.amenYes : styles.amenNo}>
                      <Icon size={18} />
                      <span>{v ? yes : no}</span>
                      {v ? <IconCheck size={16} className={styles.amenMark} /> : <IconX size={16} className={styles.amenMark} />}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {place.events?.length ? (
            <section className={styles.block}>
              <h2 className={styles.blockTitle}>À l&apos;affiche</h2>
              <ul className={styles.events}>
                {place.events.map((ev) => (
                  <li key={ev.id} className={styles.event}>
                    <span className={styles.eventIcon}>
                      <IconCalendar size={18} />
                    </span>
                    <span className={styles.eventText}>
                      <strong>{ev.title}</strong>
                      <span className="subtle">{formatDate(ev.starts_at, true)}</span>
                    </span>
                    <span className={styles.eventPrice}>{ev.price_fcfa == null ? "Prix non communiqué" : ev.price_fcfa === 0 ? "Gratuit" : formatFcfa(ev.price_fcfa)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className={styles.block} aria-labelledby="reviews-title">
            <div className={styles.blockHead}>
              <h2 id="reviews-title" className={styles.blockTitle}>
                Avis
              </h2>
              <span className="muted">{formatRating(place.rating_avg, place.rating_count)}</span>
            </div>
            {place.reviews_summary ? (
              <p className={styles.summary}>
                <span className="eyebrow">En résumé</span>
                {place.reviews_summary}
              </p>
            ) : null}
            {place.reviews.length ? (
              <ul className={styles.reviews}>
                {place.reviews.map((r) => (
                  <li key={r.id} className={styles.review}>
                    <div className={styles.reviewHead}>
                      <span className={styles.reviewAvatar} aria-hidden="true">
                        {r.author.slice(0, 1).toUpperCase()}
                      </span>
                      <span className={styles.reviewWho}>
                        <strong>{r.author}</strong>
                        <span className="subtle">{formatDate(r.created_at)}</span>
                      </span>
                      <span className={styles.reviewStars} aria-label={`${r.rating} sur 5`}>
                        {Array.from({ length: 5 }, (_, i) => (
                          <IconStarFilled key={i} size={13} style={{ color: i < r.rating ? "var(--gold)" : "var(--border-hover)" }} />
                        ))}
                      </span>
                    </div>
                    {r.text ? <p className={styles.reviewText}>{r.text}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Personne n&apos;a encore donné son avis. Soyez le premier !</p>
            )}
            <div className={styles.writeReview}>
              <h3 className={styles.subTitle}>Donner mon avis</h3>
              {user ? (
                <ReviewForm placeId={place.id} onDone={() => setAttempt((n) => n + 1)} />
              ) : (
                <p className="muted">
                  <Link className="link" href={`/login?next=${encodeURIComponent(`/places/${slug}`)}`}>
                    Connectez-vous
                  </Link>{" "}
                  pour publier un avis.
                </p>
              )}
            </div>
          </section>
        </div>

        <aside className={styles.aside}>
          <section className={styles.sideCard}>
            <h2 className={styles.sideTitle}>Horaires</h2>
            {place.hours.length ? (
              <table className={styles.hours}>
                <caption className="sr-only">Horaires d&apos;ouverture</caption>
                <tbody>
                  {hoursByDay.map((slots, i) => (
                    <tr key={i} className={i === today ? styles.today : undefined} aria-current={i === today ? "date" : undefined}>
                      <th scope="row">{WEEKDAYS[i]}</th>
                      <td>{slots.length ? slots.map((s) => `${s.open} – ${s.close}`).join(", ") : <span className="subtle">Fermé</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className={styles.unverified}>
                <IconShield size={16} /> Horaires non vérifiés. Appelez avant de vous déplacer.
              </p>
            )}
          </section>

          {place.address || place.phone || place.website ? (
            <section className={styles.sideCard}>
              <h2 className={styles.sideTitle}>Contact</h2>
              <ul className={styles.contact}>
                {place.address ? (
                  <li>
                    <IconPin size={16} /> {place.address}
                  </li>
                ) : null}
                {place.phone ? (
                  <li>
                    <IconPhone size={16} />
                    <a className="link" href={`tel:${place.phone.replace(/\s+/g, "")}`}>
                      {place.phone}
                    </a>
                  </li>
                ) : null}
                {place.website ? (
                  <li>
                    <IconGlobe size={16} />
                    <a className="link" href={place.website} target="_blank" rel="noreferrer noopener">
                      Site web
                    </a>
                  </li>
                ) : null}
              </ul>
            </section>
          ) : null}

          <section className={styles.sideCard}>
            <h2 className={styles.sideTitle}>Fiabilité</h2>
            <div className={styles.reliability}>
              <div className={styles.confRow}>
                <span>Confiance</span>
                <strong className={styles[`conf_${conf.level}`]}>{conf.label}</strong>
              </div>
              <div className={styles.confBar} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(place.confidence * 100)} aria-label="Indice de confiance">
                <span className={styles[`confFill_${conf.level}`]} style={{ width: `${Math.round(Math.min(1, Math.max(0, place.confidence)) * 100)}%` }} />
              </div>
              <dl className={styles.dl}>
                <dt>Source</dt>
                <dd>
                  {SOURCE_LABELS[place.source.kind] ?? place.source.kind}
                  {place.source.attribution ? <span className="subtle"> · {place.source.attribution}</span> : null}
                </dd>
                <dt>Dernière vérification</dt>
                <dd>{formatDate(place.verified_at) ?? "Jamais vérifié"}</dd>
              </dl>
              <button type="button" className="link" onClick={() => (user ? setReportOpen(true) : requireLogin("signaler une erreur"))}>
                Une info est fausse ? Signalez-la
              </button>
            </div>
          </section>

          {place.categories.length ? (
            <section className={styles.sideCard}>
              <h2 className={styles.sideTitle}>Explorer</h2>
              <div className="chip-wrap">
                {place.categories.map((c) => (
                  <Link key={c} href={`/search?categories=${encodeURIComponent(c)}`} className="chip">
                    <CategoryIcon slug={c} icon={categoryIcon(c)} />
                    Plus de {categoryName(c).toLowerCase()}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </aside>
      </div>

      {user ? (
        <>
          <CollectionPicker open={collOpen} onClose={() => setCollOpen(false)} placeId={place.id} placeName={place.name} />
          <ReportForm open={reportOpen} onClose={() => setReportOpen(false)} placeId={place.id} placeName={place.name} />
        </>
      ) : null}
    </article>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Chargement du lieu">
      <div className="skeleton" style={{ height: 340, borderRadius: 0 }} />
      <div className="page stack" style={{ gap: 16 }}>
        <div className="skeleton" style={{ height: 84, borderRadius: 20 }} />
        <div className="skeleton" style={{ height: 44, width: "70%", borderRadius: 999 }} />
        <div className="skeleton" style={{ height: 160, borderRadius: 20 }} />
      </div>
    </div>
  );
}
