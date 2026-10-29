"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconCrown, IconGem, IconLock, IconShield, IconSparkle } from "@/components/icons";
import { PlaceCard, PlaceCardSkeleton } from "@/components/place/PlaceCard";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useAuth } from "@/context/AuthContext";
import { useLocation } from "@/context/LocationContext";
import { useMeta } from "@/context/MetaContext";
import { api } from "@/lib/api";
import { planLabel } from "@/lib/format";
import type { PlaceCard as Place } from "@/lib/types";
import styles from "./gems.module.css";

export default function GemsPage() {
  const { user } = useAuth();
  const { city } = useLocation();
  const { cityName } = useMeta();
  const [gems, setGems] = useState<Place[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setGems(null);
    setError(null);
    api.places
      .gems(city)
      .then((g) => alive && setGems(g))
      .catch((e) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, [city, user?.id, user?.plan, attempt]);

  const locked = gems?.filter((g) => g.locked).length ?? 0;
  const allLocked = gems != null && gems.length > 0 && locked === gems.length;

  return (
    <div className="page">
      <title>Pépites</title>
      <section className={styles.hero}>
        <span className={styles.heroIcon} aria-hidden="true">
          <IconGem />
        </span>
        <p className={styles.eyebrow}>Pépites · {cityName(city) || "Abidjan"}</p>
        <h1 className={styles.title}>Les adresses qu&apos;on se passe entre initiés</h1>
        <p className={styles.sub}>
          Lieux confidentiels repérés et vérifiés par nos curateurs : un bar caché, une plage sans foule, une table d&apos;hôte du week-end.
        </p>
        <ul className={styles.points}>
          <li>
            <IconShield size={16} /> Vérifiées sur place
          </li>
          <li>
            <IconSparkle size={16} /> Nouvelles chaque mois
          </li>
          <li>
            <IconLock size={16} /> Position partagée aux membres seulement
          </li>
        </ul>
      </section>

      {allLocked || (!user && gems && locked > 0) ? (
        <div className={styles.upsell}>
          <div>
            <p className={styles.upsellTitle}>
              <IconCrown size={18} /> {locked} pépite{locked > 1 ? "s" : ""} à débloquer
            </p>
            <p className="muted" style={{ fontSize: "var(--fs-sm)" }}>
              {user ? `Votre offre ${planLabel(user.plan)} n'inclut pas les pépites.` : "Les pépites sont réservées aux membres premium."} Noms, adresses et
              itinéraires s&apos;affichent dès votre abonnement.
            </p>
          </div>
          <Link href="/premium" className="btn btn-gold">
            Débloquer les pépites
          </Link>
        </div>
      ) : null}

      <div className="section" style={{ marginTop: 24 }}>
        {error ? (
          <ErrorState error={error} onRetry={() => setAttempt((n) => n + 1)} />
        ) : !gems ? (
          <div className="grid-cards">
            {[0, 1, 2, 3].map((i) => (
              <PlaceCardSkeleton key={i} />
            ))}
          </div>
        ) : gems.length === 0 ? (
          <EmptyState icon={<IconGem />} title="Pas encore de pépite ici" tone="gold">
            <p>Nos curateurs explorent cette zone. Revenez bientôt, ou essayez une autre ville.</p>
          </EmptyState>
        ) : (
          <div className="grid-cards">
            {gems.map((g) => (
              <PlaceCard key={g.id} place={g} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
