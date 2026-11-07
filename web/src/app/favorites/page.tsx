"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { IconChevronRight, IconFolder, IconHeart, IconHeartFilled, IconPlus, IconTrash } from "@/components/icons";
import { PlaceCard, PlaceCardSkeleton } from "@/components/place/PlaceCard";
import { Modal } from "@/components/ui/Modal";
import { RequireAuth } from "@/components/ui/RequireAuth";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { useToast } from "@/context/ToastContext";
import { api, errorMessage } from "@/lib/api";
import type { CollectionSummary, PlaceCard as Place } from "@/lib/types";
import styles from "./favorites.module.css";

type Tab = "favorites" | "collections";

function Content() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("favorites");
  const [favs, setFavs] = useState<Place[] | null>(null);
  const [colls, setColls] = useState<CollectionSummary[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<CollectionSummary | null>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([api.favorites.list(), api.collections.list()])
      .then(([f, c]) => {
        setFavs(f);
        setColls(c);
      })
      .catch(setError);
  }, []);
  useEffect(load, [load]);

  const unfav = async (p: Place) => {
    setFavs((l) => l?.filter((x) => x.id !== p.id) ?? null);
    try {
      await api.favorites.remove(p.id);
      toast(`« ${p.name} » retiré des favoris`, "success");
    } catch (e) {
      setFavs((l) => (l ? [p, ...l] : l));
      toast(errorMessage(e), "error");
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const c = await api.collections.create(name.trim(), desc.trim() || undefined);
      setColls((l) => [c, ...(l ?? [])]);
      setName("");
      setDesc("");
      setCreateOpen(false);
      setTab("collections");
      toast("Collection créée", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    const c = toDelete;
    setBusy(true);
    try {
      await api.collections.remove(c.id);
      setColls((l) => l?.filter((x) => x.id !== c.id) ?? null);
      toast(`Collection « ${c.name} » supprimée`, "success");
      setToDelete(null);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorState error={error} onRetry={load} />;

  return (
    <>
      <div className={styles.tabsRow}>
        <div className={styles.tabs} role="tablist" aria-label="Favoris et collections">
          <button type="button" role="tab" aria-selected={tab === "favorites"} className={styles.tab} onClick={() => setTab("favorites")}>
            Favoris {favs ? <span className={styles.count}>{favs.length}</span> : null}
          </button>
          <button type="button" role="tab" aria-selected={tab === "collections"} className={styles.tab} onClick={() => setTab("collections")}>
            Collections {colls ? <span className={styles.count}>{colls.length}</span> : null}
          </button>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
          <IconPlus /> Nouvelle collection
        </button>
      </div>

      {tab === "favorites" ? (
        <div role="tabpanel" aria-label="Favoris">
          {!favs ? (
            <div className="grid-cards">
              {[0, 1, 2].map((i) => (
                <PlaceCardSkeleton key={i} />
              ))}
            </div>
          ) : favs.length === 0 ? (
            <EmptyState
              icon={<IconHeart />}
              title="Aucun favori pour l'instant"
              action={
                <Link href="/search" className="btn btn-primary">
                  Trouver des lieux
                </Link>
              }
            >
              <p>Touchez le cœur sur la fiche d&apos;un lieu pour le retrouver ici.</p>
            </EmptyState>
          ) : (
            <div className="grid-cards">
              {favs.map((p) => (
                <PlaceCard
                  key={p.id}
                  place={p}
                  showReasons={false}
                  action={
                    <button type="button" className={`icon-btn icon-btn-sm ${styles.heartBtn}`} onClick={() => unfav(p)} aria-label={`Retirer ${p.name} des favoris`}>
                      <IconHeartFilled />
                    </button>
                  }
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div role="tabpanel" aria-label="Collections">
          {!colls ? (
            <div className="skeleton" style={{ height: 160, borderRadius: 20 }} />
          ) : colls.length === 0 ? (
            <EmptyState
              icon={<IconFolder />}
              title="Rangez vos adresses par thème"
              action={
                <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                  <IconPlus /> Créer une collection
                </button>
              }
            >
              <p>« Afterworks Plateau », « Brunchs du dimanche », « À tester avec Awa »…</p>
            </EmptyState>
          ) : (
            <ul className={styles.collections}>
              {colls.map((c) => (
                <li key={c.id} className={styles.coll}>
                  <Link href={`/collections/${encodeURIComponent(c.id)}`} className={styles.collLink}>
                    <span className={styles.collIcon}>
                      <IconFolder />
                    </span>
                    <span className={styles.collText}>
                      <strong>{c.name}</strong>
                      <span className="subtle">
                        {c.count} lieu{c.count > 1 ? "x" : ""}
                        {c.description ? ` · ${c.description}` : ""}
                      </span>
                    </span>
                    <IconChevronRight className={styles.chev} />
                  </Link>
                  <button type="button" className="icon-btn icon-btn-sm" onClick={() => setToDelete(c)} aria-label={`Supprimer la collection ${c.name}`}>
                    <IconTrash />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nouvelle collection">
        <form onSubmit={create} className="stack" style={{ gap: 16 }}>
          <label className="field">
            <span className="label">Nom</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required placeholder="Ex. Brunchs du dimanche" />
          </label>
          <label className="field">
            <span className="label">Description (facultatif)</span>
            <textarea className="textarea" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} style={{ minHeight: 80 }} />
          </label>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-ghost" onClick={() => setCreateOpen(false)}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={!name.trim() || busy}>
              Créer
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Supprimer la collection ?"
        description={toDelete ? `« ${toDelete.name} » sera supprimée. Les lieux restent dans l'application.` : undefined}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setToDelete(null)}>
              Annuler
            </button>
            <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}>
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

export default function FavoritesPage() {
  return (
    <div className="page">
      <title>Favoris & collections</title>
      <div className="page-head">
        <p className="eyebrow">Mes adresses</p>
        <h1 className="page-title">Favoris & collections</h1>
      </div>
      <RequireAuth title="Vos favoris vous attendent" reason={<p>Connectez-vous pour enregistrer des lieux et créer des collections.</p>}>
        <Content />
      </RequireAuth>
    </div>
  );
}
