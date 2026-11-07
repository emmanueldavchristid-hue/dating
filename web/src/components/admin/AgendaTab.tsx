"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/context/ToastContext";
import { api, errorMessage, itemsOf } from "@/lib/api";
import { formatBudgetRange, formatDate } from "@/lib/format";
import type { AdminEvent, AdminPlace } from "@/lib/types";
import { IconCalendar, IconEdit, IconPlus, IconX } from "../icons";
import { EmptyState, ErrorState } from "../ui/States";
import { Modal } from "../ui/Modal";
import styles from "./admin.module.css";

export const EVENT_KINDS: Record<string, string> = {
  soiree: "Soirée",
  concert: "Concert",
  brunch: "Brunch",
  afterwork: "Afterwork",
  spectacle: "Spectacle",
  famille: "En famille",
  sport: "Sport & loisirs",
  festival: "Festival",
  autre: "Autre sortie",
};

/** « 2026-11-08T22:00 » (champ du navigateur, heure locale) → ISO avec fuseau. */
export function localInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO → valeur d'un champ « datetime-local » en heure locale. */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Agenda : les soirées, concerts et brunchs annoncés (vus sur TikTok, Instagram…) rattachés à un lieu. */
export function AgendaTab() {
  const toast = useToast();
  const [past, setPast] = useState(false);
  const [items, setItems] = useState<AdminEvent[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<AdminEvent | "new" | null>(null);

  const load = useCallback(() => {
    setError(null);
    setItems(null);
    api.admin
      .events(past)
      .then((d) => setItems(d.items))
      .catch(setError);
  }, [past]);
  useEffect(load, [load]);

  const remove = async (e: AdminEvent) => {
    if (!window.confirm(`Supprimer « ${e.title} » ?`)) return;
    try {
      await api.admin.deleteEvent(e.id);
      setItems((l) => l?.filter((x) => x.id !== e.id) ?? null);
      toast("Événement supprimé", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <div className={styles.tab}>
      <div className={styles.toolbar}>
        <div className="chip-wrap" role="radiogroup" aria-label="Période">
          <button type="button" role="radio" aria-checked={!past} className="chip" onClick={() => setPast(false)}>
            À venir
          </button>
          <button type="button" role="radio" aria-checked={past} className="chip" onClick={() => setPast(true)}>
            Passés
          </button>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
          <IconPlus size={18} /> Nouvel événement
        </button>
      </div>
      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !items ? (
        <p className="subtle">Chargement…</p>
      ) : items.length === 0 ? (
        <EmptyState icon={<IconCalendar />} title={past ? "Aucun événement passé" : "Aucune sortie annoncée"}>
          {!past ? <p>Ajoute les soirées, concerts et brunchs de la semaine : ils apparaissent dans « Ce week-end » sur l&apos;app.</p> : null}
        </EmptyState>
      ) : (
        <ul className={styles.cards}>
          {items.map((e) => (
            <li key={e.id} className={styles.reportCard}>
              <div className={styles.reportHead}>
                <span className="badge badge-accent">{EVENT_KINDS[e.kind] ?? e.kind}</span>
                <span className="subtle">{formatDate(e.starts_at, true)}</span>
              </div>
              <p className={styles.reportPlace}>
                <strong>{e.title}</strong> · {e.place_name}
                {e.price_fcfa != null ? ` · ${e.price_fcfa === 0 ? "Entrée libre" : formatBudgetRange(e.price_fcfa, e.price_fcfa)}` : ""}
              </p>
              {e.description ? <p className={styles.reportMsg}>{e.description}</p> : null}
              <div className="chip-wrap">
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing(e)}>
                  <IconEdit size={16} /> Modifier
                </button>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(e)}>
                  <IconX size={16} /> Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <EventForm
          event={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      ) : null}
    </div>
  );
}

function EventForm({ event, onClose, onSaved }: { event: AdminEvent | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState(event?.place_name ?? "");
  const [results, setResults] = useState<AdminPlace[]>([]);
  const [place, setPlace] = useState<{ id: string; name: string } | null>(event ? { id: event.place_id, name: event.place_name } : null);
  const [title, setTitle] = useState(event?.title ?? "");
  const [kind, setKind] = useState(event?.kind ?? "soiree");
  const [start, setStart] = useState(isoToLocalInput(event?.starts_at ?? null));
  const [end, setEnd] = useState(isoToLocalInput(event?.ends_at ?? null));
  const [price, setPrice] = useState(event?.price_fcfa != null ? String(event.price_fcfa) : "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [link, setLink] = useState(event?.link ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (place && q === place.name) return;
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = window.setTimeout(() => {
      api.admin
        .places(q.trim(), 1)
        .then((d) => setResults(itemsOf(d).slice(0, 6)))
        .catch(() => setResults([]));
    }, 250);
    return () => window.clearTimeout(t);
  }, [q, place]);

  const valid = !!place && title.trim().length >= 2 && !!localInputToIso(start);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!valid || !place) return;
    setBusy(true);
    setError(null);
    const body = {
      title: title.trim(),
      kind,
      starts_at: localInputToIso(start)!,
      ends_at: localInputToIso(end),
      price_fcfa: price.trim() === "" ? null : Number(price),
      description: description.trim(),
      link: link.trim() || null,
    };
    try {
      if (event) await api.admin.updateEvent(event.id, body);
      else await api.admin.createEvent({ ...body, place_id: place.id });
      toast(event ? "Événement modifié" : "Événement ajouté à l'agenda", "success");
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={event ? `Modifier « ${event.title} »` : "Nouvel événement"}
      variant="sheet"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" form="event-form" className="btn btn-primary" disabled={!valid || busy}>
            {busy ? <span className="spinner" aria-hidden="true" /> : null}
            {event ? "Enregistrer" : "Ajouter à l'agenda"}
          </button>
        </>
      }
    >
      <form id="event-form" onSubmit={submit} className={styles.form}>
        <label className="field">
          <span className="label">Lieu *</span>
          <input
            className="input"
            value={q}
            disabled={!!event}
            placeholder="Nom du lieu (il doit exister dans la base)"
            onChange={(e) => {
              setQ(e.target.value);
              setPlace(null);
            }}
          />
          {!event && !place && results.length ? (
            <span className="chip-wrap" role="listbox" aria-label="Lieux trouvés">
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="chip"
                  onClick={() => {
                    setPlace({ id: r.id, name: r.name });
                    setQ(r.name);
                    setResults([]);
                  }}
                >
                  {r.name}
                  {r.district ? ` · ${r.district}` : ""}
                </button>
              ))}
            </span>
          ) : null}
          <span className="hint">{place ? `Lieu choisi : ${place.name}` : "Lieu absent ? Crée-le d'abord dans l'onglet Lieux (lien Google Maps)."}</span>
        </label>
        <label className="field">
          <span className="label">Titre *</span>
          <input className="input" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Soirée Amapiano avec DJ…" />
        </label>
        <div className={styles.two}>
          <label className="field">
            <span className="label">Type</span>
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
              {Object.entries(EVENT_KINDS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Prix d&apos;entrée (FCFA)</span>
            <input className="input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} placeholder="Vide = non communiqué, 0 = libre" />
          </label>
        </div>
        <div className={styles.two}>
          <label className="field">
            <span className="label">Début *</span>
            <input className="input" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="field">
            <span className="label">Fin</span>
            <input className="input" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span className="label">Description</span>
          <textarea className="textarea" maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Line-up, dress code, réservation…" />
        </label>
        <label className="field">
          <span className="label">Lien (billetterie, publication du lieu)</span>
          <input className="input" maxLength={300} value={link} onChange={(e) => setLink(e.target.value)} />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
