"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useToast } from "@/context/ToastContext";
import { api } from "@/lib/api";
import { creditLabel, isCoverPhoto, MAX_CREDIT_LENGTH, photoErrorMessage, realPhotos, uploadPlacePhoto, validatePhotoFile } from "@/lib/photos";
import type { PlaceDetail } from "@/lib/types";
import { IconCamera, IconCheck, IconImage, IconTrash } from "../icons";
import { Modal } from "../ui/Modal";
import styles from "./admin.module.css";

/**
 * Photos d'un lieu : liste (fiche publique), envoi, couverture, suppression.
 * Réservé aux curateurs et administrateurs (le serveur le vérifie aussi).
 */
export function PhotoManager({ placeId, slug, onChanged }: { placeId: string; slug: string; onChanged?: () => void }) {
  const toast = useToast();
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [detail, setDetail] = useState<PlaceDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [credit, setCredit] = useState("");
  const [makeCover, setMakeCover] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    return api.places
      .get(slug)
      .then((d) => {
        setDetail(d);
        return d;
      })
      .catch((e: unknown) => {
        setLoadError(photoErrorMessage(e));
        return null;
      });
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  // Sans couverture, la première photo envoyée devient la couverture : on coche par défaut.
  const hasCover = !!detail?.cover.url;
  const [coverDefaultFor, setCoverDefaultFor] = useState<string | null>(null);
  if (detail && coverDefaultFor !== detail.id) {
    setCoverDefaultFor(detail.id);
    setMakeCover(!detail.cover.url);
  }

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setCredit("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const pick = (f: File | null) => {
    setError(null);
    if (!f) return reset();
    const invalid = validatePhotoFile(f);
    if (invalid) {
      setError(invalid);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setFile(f);
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const res = await uploadPlacePhoto(placeId, file, { credit, makeCover });
      toast(res.is_cover ? "Photo ajoutée en couverture" : "Photo ajoutée", "success");
      reset();
      setMakeCover(false);
      await load();
      onChanged?.();
    } catch (e) {
      setError(photoErrorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const act = async (id: string, kind: "cover" | "delete") => {
    setBusy(id);
    setError(null);
    try {
      if (kind === "cover") await api.admin.setCover(id);
      else await api.admin.deletePhoto(id);
      toast(kind === "cover" ? "Nouvelle couverture" : "Photo supprimée", "success");
      setConfirmId(null);
      await load();
      onChanged?.();
    } catch (e) {
      setError(photoErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const photos = realPhotos(detail?.photos);

  return (
    <section className={styles.photos} aria-labelledby={`${inputId}-title`}>
      <div className={styles.photosHead}>
        <h3 id={`${inputId}-title`} className={styles.photosTitle}>
          <IconImage size={18} /> Photos
        </h3>
        {detail ? <span className="subtle">{photos.length ? `${photos.length} photo${photos.length > 1 ? "s" : ""}` : "Aucune photo"}</span> : null}
      </div>

      {loadError ? (
        <p className="form-error" role="alert">
          {loadError}{" "}
          <button type="button" className="link" onClick={() => void load()}>
            Réessayer
          </button>
        </p>
      ) : !detail ? (
        <div className="skeleton" style={{ height: 120, borderRadius: 16 }} aria-busy="true" />
      ) : photos.length ? (
        <ul className={styles.photoGrid}>
          {photos.map((ph, i) => {
            const cover = isCoverPhoto(ph, detail.cover);
            const credit = creditLabel(ph.credit);
            return (
              <li key={ph.id ?? `${ph.url}-${i}`} className={`${styles.photoItem} ${cover ? styles.photoCover : ""}`}>
                <div className={styles.photoImgWrap}>
                  <img src={ph.url!} alt={ph.alt} className={styles.photoImg} loading="lazy" />
                  {cover ? (
                    <span className={`badge badge-accent ${styles.photoBadge}`}>
                      <IconCheck size={12} /> Couverture
                    </span>
                  ) : null}
                </div>
                {credit ? <p className={styles.photoCredit}>{credit}</p> : null}
                {ph.id ? (
                  confirmId === ph.id ? (
                    <div className={styles.photoActions} role="group" aria-label="Confirmer la suppression">
                      <span className={styles.confirmText}>Supprimer définitivement ?</span>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => void act(ph.id!, "delete")} disabled={busy === ph.id}>
                        {busy === ph.id ? <span className="spinner" aria-hidden="true" /> : <IconTrash size={14} />} Supprimer
                      </button>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmId(null)} disabled={busy === ph.id}>
                        Annuler
                      </button>
                    </div>
                  ) : (
                    <div className={styles.photoActions}>
                      {!cover ? (
                        <button type="button" className="btn btn-sm" onClick={() => void act(ph.id!, "cover")} disabled={!!busy}>
                          {busy === ph.id ? <span className="spinner" aria-hidden="true" /> : null}
                          Définir comme couverture
                        </button>
                      ) : null}
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmId(ph.id!)} disabled={!!busy} aria-label={`Supprimer la photo ${i + 1}`}>
                        <IconTrash size={14} /> Supprimer
                      </button>
                    </div>
                  )
                ) : (
                  <p className="subtle" style={{ fontSize: 12 }}>
                    Photo importée (non modifiable ici)
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">Pas encore de photo : la première envoyée deviendra la couverture.</p>
      )}

      <div className={styles.uploadBox}>
        <label htmlFor={inputId} className={styles.dropLabel}>
          {preview ? <img src={preview} alt="Aperçu de la photo choisie" className={styles.uploadPreview} /> : <IconCamera size={22} />}
          <span>
            <strong>{file ? file.name : "Choisir une photo"}</strong>
            <span className="subtle">JPEG, PNG ou WebP · 8 Mo maximum</span>
          </span>
        </label>
        <input
          ref={fileRef}
          id={inputId}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
          disabled={uploading}
          aria-label="Photo à envoyer"
        />
        <label className="field">
          <span className="label">Crédit (facultatif)</span>
          <input
            className="input"
            value={credit}
            maxLength={MAX_CREDIT_LENGTH}
            onChange={(e) => setCredit(e.target.value)}
            placeholder="Photo : votre nom"
            disabled={uploading}
          />
          <span className="hint">Affiché sous la photo sur la fiche publique.</span>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={makeCover} onChange={(e) => setMakeCover(e.target.checked)} disabled={uploading} />
          <span>
            Photo principale (couverture)
            {!hasCover && detail ? <span className="subtle" style={{ fontWeight: 500 }}> · la fiche n&apos;en a pas encore</span> : null}
          </span>
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="row wrap">
          <button type="button" className="btn btn-primary" onClick={() => void upload()} disabled={!file || uploading}>
            {uploading ? <span className="spinner" aria-hidden="true" /> : <IconCamera size={16} />}
            {uploading ? "Envoi en cours…" : "Envoyer la photo"}
          </button>
          {file && !uploading ? (
            <button type="button" className="btn btn-ghost" onClick={reset}>
              Annuler
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Fenêtre « Photos » (depuis la curation ou la liste des lieux). */
export function PhotoModal({ place, onClose }: { place: { id: string; slug: string; name: string } | null; onClose: () => void }) {
  return (
    <Modal open={!!place} onClose={onClose} title={place ? `Photos · ${place.name}` : "Photos"} variant="sheet">
      {place ? <PhotoManager placeId={place.id} slug={place.slug} /> : null}
    </Modal>
  );
}
