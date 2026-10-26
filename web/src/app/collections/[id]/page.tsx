"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { IconArrowLeft, IconFolder, IconTrash, IconX } from "@/components/icons";
import { PlaceCard, PlaceCardSkeleton } from "@/components/place/PlaceCard";
import { Modal } from "@/components/ui/Modal";
import { RequireAuth } from "@/components/ui/RequireAuth";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useToast } from "@/context/ToastContext";
import { api, errorMessage } from "@/lib/api";
import type { CollectionDetail } from "@/lib/types";

function Detail({ id }: { id: string }) {
  const toast = useToast();
  const router = useRouter();
  const [data, setData] = useState<CollectionDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api.collections.get(id).then(setData).catch(setError);
  }, [id]);
  useEffect(load, [load]);

  const removeItem = async (placeId: string, name: string) => {
    const prev = data;
    setData((d) => (d ? { ...d, items: d.items.filter((p) => p.id !== placeId) } : d));
    try {
      await api.collections.removeItem(id, placeId);
      toast(`« ${name} » retiré de la collection`, "success");
    } catch (e) {
      setData(prev);
      toast(errorMessage(e), "error");
    }
  };

  const removeCollection = async () => {
    setBusy(true);
    try {
      await api.collections.remove(id);
      toast("Collection supprimée", "success");
      router.replace("/favorites");
    } catch (e) {
      toast(errorMessage(e), "error");
      setBusy(false);
    }
  };

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data)
    return (
      <div className="grid-cards">
        {[0, 1, 2].map((i) => (
          <PlaceCardSkeleton key={i} />
        ))}
      </div>
    );

  return (
    <>
      <title>{data.name}</title>
      <div className="page-head">
        <p className="eyebrow">Collection</p>
        <div className="row wrap" style={{ justifyContent: "space-between", gap: 12 }}>
          <h1 className="page-title">{data.name}</h1>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirm(true)}>
            <IconTrash /> Supprimer
          </button>
        </div>
        {data.description ? <p className="page-sub">{data.description}</p> : null}
        <p className="subtle">
          {data.items.length} lieu{data.items.length > 1 ? "x" : ""}
        </p>
      </div>
      {data.items.length === 0 ? (
        <EmptyState
          icon={<IconFolder />}
          title="Collection vide"
          action={
            <Link href="/search" className="btn btn-primary">
              Explorer les lieux
            </Link>
          }
        >
          <p>Ajoutez des lieux depuis leur fiche avec le bouton « Collection ».</p>
        </EmptyState>
      ) : (
        <div className="grid-cards">
          {data.items.map((p) => (
            <PlaceCard
              key={p.id}
              place={p}
              showReasons={false}
              action={
                <button
                  type="button"
                  className="icon-btn icon-btn-sm"
                  style={{ background: "rgba(14,15,19,.7)", backdropFilter: "blur(8px)" }}
                  onClick={() => removeItem(p.id, p.name)}
                  aria-label={`Retirer ${p.name} de la collection`}
                >
                  <IconX />
                </button>
              }
            />
          ))}
        </div>
      )}
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Supprimer cette collection ?"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>
              Annuler
            </button>
            <button type="button" className="btn btn-danger" onClick={removeCollection} disabled={busy}>
              <IconTrash /> Supprimer
            </button>
          </>
        }
      >
        <p className="muted">Les lieux restent disponibles dans l&apos;application.</p>
      </Modal>
    </>
  );
}

export default function CollectionPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="page">
      <Link href="/favorites" className="btn btn-ghost btn-sm" style={{ marginBottom: 12, marginLeft: -12 }}>
        <IconArrowLeft /> Collections
      </Link>
      <RequireAuth>
        <Detail id={decodeURIComponent(id)} />
      </RequireAuth>
    </div>
  );
}
