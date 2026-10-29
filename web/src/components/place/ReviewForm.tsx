"use client";

import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { IconStar, IconStarFilled } from "../icons";

export function ReviewForm({ placeId, onDone }: { placeId: string; onDone: () => void }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) {
      setError("Choisissez une note de 1 à 5.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.places.review(placeId, rating, text.trim());
      setOk(true);
      setText("");
      setRating(0);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (ok) return <p className="form-success">Merci, votre avis a bien été publié.</p>;

  return (
    <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label" style={{ marginBottom: 6 }}>
          Votre note
        </legend>
        <div className="row" role="radiogroup" aria-label="Note sur 5" onMouseLeave={() => setHover(0)} style={{ gap: 2 }}>
          {[1, 2, 3, 4, 5].map((n) => {
            const on = (hover || rating) >= n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} sur 5`}
                className="icon-btn icon-btn-sm"
                style={{ border: 0, background: "transparent", color: on ? "var(--gold)" : "var(--text-subtle)" }}
                onMouseEnter={() => setHover(n)}
                onClick={() => setRating(n)}
              >
                {on ? <IconStarFilled /> : <IconStar />}
              </button>
            );
          })}
        </div>
      </fieldset>
      <label className="field">
        <span className="label">Votre avis (facultatif)</span>
        <textarea
          className="textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ambiance, service, ce qu'il faut commander…"
          maxLength={2000}
        />
        <span className="hint">Quelques mots aident beaucoup les autres.</span>
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <div>
        <button type="submit" className="btn btn-primary" disabled={busy || !rating}>
          {busy ? <span className="spinner" aria-hidden="true" /> : null}
          Publier mon avis
        </button>
      </div>
    </form>
  );
}
