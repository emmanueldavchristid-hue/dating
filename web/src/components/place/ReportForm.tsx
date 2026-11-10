"use client";

import { useState } from "react";
import { useToast } from "@/context/ToastContext";
import { api, errorMessage } from "@/lib/api";
import type { ReportKind } from "@/lib/types";
import { Modal } from "../ui/Modal";

const KINDS: { value: ReportKind; label: string }[] = [
  { value: "closed", label: "Le lieu est fermé définitivement" },
  { value: "wrong_hours", label: "Les horaires sont faux" },
  { value: "wrong_location", label: "L'adresse ou la position est fausse" },
  { value: "wrong_price", label: "Les prix ne correspondent pas" },
  { value: "other", label: "Autre problème" },
];

/** « Signaler une erreur » (écran 13). */
export function ReportForm({ open, onClose, placeId, placeName }: { open: boolean; onClose: () => void; placeId: string; placeName: string }) {
  const toast = useToast();
  const [kind, setKind] = useState<ReportKind>("wrong_hours");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.places.report(placeId, kind, message.trim());
      toast("Merci ! Votre signalement sera vérifié par l'équipe.", "success");
      setMessage("");
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Signaler une erreur" description={`Aidez-nous à garder la fiche « ${placeName} » exacte.`}>
      <form onSubmit={submit} className="stack" style={{ gap: 18 }} id="report-form">
        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 4 }}>
          <legend className="label" style={{ marginBottom: 8 }}>
            Quel est le problème ?
          </legend>
          {KINDS.map((k) => (
            <label key={k.value} className="checkbox" style={{ fontWeight: 600 }}>
              <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} />
              {k.label}
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span className="label">Précisions</span>
          <textarea
            className="textarea"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ex. Ouvert jusqu'à 2 h le samedi, pas 23 h."
            maxLength={1000}
          />
          <span className="hint">Facultatif. Pas de données personnelles, merci.</span>
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <span className="spinner" aria-hidden="true" /> : null}
            Envoyer
          </button>
        </div>
      </form>
    </Modal>
  );
}
