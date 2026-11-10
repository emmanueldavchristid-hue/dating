import { distanceLabel, formatRating, openStatusLabel, travelLabel } from "@/lib/format";
import type { OpenStatus, Travel } from "@/lib/types";
import { IconClock, IconPin, IconRoute, IconStarFilled } from "../icons";

export function OpenBadge({ status, closesAt, className }: { status: OpenStatus; closesAt?: string | null; className?: string }) {
  const cls = status === "open" ? "badge-open" : status === "closed" ? "badge-closed" : "badge-unknown";
  return (
    <span className={`badge ${cls} ${className ?? ""}`}>
      <IconClock />
      {openStatusLabel(status, closesAt)}
    </span>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <span className={`badge badge-demo ${className ?? ""}`} title="Lieu fictif de démonstration">
      Démo
    </span>
  );
}

export function RatingInline({ avg, count }: { avg: number | null; count: number }) {
  if (avg == null || count <= 0) {
    return <span className="subtle">{formatRating(avg, count)}</span>;
  }
  return (
    <span className="row" style={{ gap: 4 }} aria-label={`Note ${formatRating(avg, count)}`}>
      <IconStarFilled size={14} style={{ color: "var(--gold)" }} />
      <strong>{avg.toFixed(1).replace(".", ",")}</strong>
      <span className="subtle">({count})</span>
    </span>
  );
}

/** Distance (toujours « à vol d'oiseau ») + temps de trajet uniquement s'il est fourni. */
export function DistanceTravel({ km, travel }: { km: number | null; travel: Travel | null }) {
  const d = distanceLabel(km);
  const t = travelLabel(travel);
  if (!d && !t) return null;
  return (
    <span className="row wrap" style={{ gap: "4px 10px" }}>
      {d ? (
        <span className="row" style={{ gap: 4 }}>
          <IconPin size={14} />
          {d}
        </span>
      ) : null}
      {t && travel ? (
        <span className="row" style={{ gap: 4 }} title={`Estimation fournie par ${travel.source}`}>
          <IconRoute size={14} />
          {t} <span className="subtle">· {travel.source}</span>
        </span>
      ) : null}
    </span>
  );
}
