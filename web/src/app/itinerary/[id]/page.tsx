"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { IconArrowLeft, IconExternal, IconTrash } from "@/components/icons";
import { Timeline } from "@/components/itinerary/Timeline";
import { Modal } from "@/components/ui/Modal";
import { RequireAuth } from "@/components/ui/RequireAuth";
import { ErrorState } from "@/components/ui/States";
import { useToast } from "@/context/ToastContext";
import { api, errorMessage } from "@/lib/api";
import { directionsUrl, distanceLabel, formatDate, haversineKm } from "@/lib/format";
import type { Itinerary } from "@/lib/types";

function Detail({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const [it, setIt] = useState<Itinerary | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api.itineraries.get(id).then(setIt).catch(setError);
  }, [id]);
  useEffect(load, [load]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!it) return <div className="skeleton" style={{ height: 320, borderRadius: 20 }} aria-busy="true" />;

  const steps = [...it.steps].sort((a, b) => a.position - b.position);
  const totalKm = steps.reduce((acc, s, i) => acc + (i === 0 ? 0 : s.leg_km ?? haversineKm(steps[i - 1].place.location, s.place.location) ?? 0), 0);

  return (
    <>
      <title>{it.title}</title>
      <div className="page-head">
        <p className="eyebrow">{it.date ? formatDate(it.date) : "Soirée sans date"}</p>
        <div className="row wrap" style={{ justifyContent: "space-between", gap: 12 }}>
          <h1 className="page-title">{it.title}</h1>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirm(true)}>
            <IconTrash /> Supprimer
          </button>
        </div>
        <p className="page-sub">
          {steps.length} étape{steps.length > 1 ? "s" : ""}
          {totalKm > 0 ? ` · ${distanceLabel(totalKm)} au total` : ""}
        </p>
      </div>
      <div style={{ maxWidth: 720 }}>
        <Timeline
          steps={steps.map((s, i) => ({
            key: `${s.position}-${s.place.id}`,
            place: s.place,
            legKm: i === 0 ? null : s.leg_km ?? haversineKm(steps[i - 1].place.location, s.place.location),
            startTime: s.start_time,
            note: s.note,
          }))}
          renderControls={(i) =>
            steps[i].place.location ? (
              <a className="btn btn-sm" href={directionsUrl(steps[i].place.location!.lat, steps[i].place.location!.lng)} target="_blank" rel="noreferrer">
                Itinéraire vers cette étape <IconExternal />
              </a>
            ) : (
              <span className="subtle">Position non disponible</span>
            )
          }
        />
      </div>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Supprimer cette soirée ?"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>
              Annuler
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={async () => {
                try {
                  await api.itineraries.remove(id);
                  toast("Soirée supprimée", "success");
                  router.replace("/itinerary");
                } catch (e) {
                  toast(errorMessage(e), "error");
                }
              }}
            >
              <IconTrash /> Supprimer
            </button>
          </>
        }
      >
        <p className="muted">Cette action est définitive.</p>
      </Modal>
    </>
  );
}

export default function ItineraryDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="page">
      <Link href="/itinerary" className="btn btn-ghost btn-sm" style={{ marginBottom: 12, marginLeft: -12 }}>
        <IconArrowLeft /> Mes soirées
      </Link>
      <RequireAuth>
        <Detail id={decodeURIComponent(id)} />
      </RequireAuth>
    </div>
  );
}
