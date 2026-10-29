"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/context/ToastContext";
import { api, errorMessage } from "@/lib/api";
import type { CollectionSummary } from "@/lib/types";
import { IconCheck, IconFolder, IconPlus } from "../icons";
import { Modal } from "../ui/Modal";

/** Ajout d'un lieu à une collection (existante ou nouvelle). */
export function CollectionPicker({ open, onClose, placeId, placeName }: { open: boolean; onClose: () => void; placeId: string; placeName: string }) {
  const toast = useToast();
  const [list, setList] = useState<CollectionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open) return;
    setError(null);
    setList(null);
    api.collections
      .list()
      .then(setList)
      .catch((e) => setError(errorMessage(e)));
  }, [open]);

  const add = async (id: string, label: string) => {
    setBusy(id);
    try {
      await api.collections.addItem(id, placeId);
      setAdded((s) => new Set(s).add(id));
      toast(`Ajouté à « ${label} »`, "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setBusy("new");
    try {
      const c = await api.collections.create(n);
      setName("");
      setList((l) => [c, ...(l ?? [])]);
      await add(c.id, c.name);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Ajouter à une collection" description={placeName}>
      <form onSubmit={create} className="row" style={{ marginBottom: 16, alignItems: "flex-end" }}>
        <label className="field" style={{ flex: 1 }}>
          <span className="label">Nouvelle collection</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Rooftops à tester" maxLength={80} />
        </label>
        <button type="submit" className="btn btn-primary" disabled={!name.trim() || busy === "new"} style={{ minHeight: 48 }}>
          <IconPlus /> Créer
        </button>
      </form>
      {error ? <p className="form-error">{error}</p> : null}
      {!list && !error ? <div className="skeleton" style={{ height: 120 }} /> : null}
      {list && list.length === 0 ? <p className="muted">Aucune collection pour l&apos;instant : créez la première ci-dessus.</p> : null}
      {list && list.length > 0 ? (
        <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0, gap: 8 }}>
          {list.map((c) => {
            const done = added.has(c.id);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className="btn btn-block"
                  style={{ justifyContent: "space-between", borderRadius: 14, minHeight: 52 }}
                  onClick={() => add(c.id, c.name)}
                  disabled={done || busy === c.id}
                >
                  <span className="row">
                    <IconFolder /> {c.name} <span className="subtle">· {c.count}</span>
                  </span>
                  {done ? <IconCheck style={{ color: "var(--success)" }} /> : <IconPlus />}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </Modal>
  );
}
