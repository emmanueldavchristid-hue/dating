"use client";

import { useState } from "react";
import { useLocation } from "@/context/LocationContext";
import { useMeta } from "@/context/MetaContext";
import { IconChevronDown, IconLocate, IconPin } from "../icons";
import { Modal } from "../ui/Modal";
import { CityPicker } from "./CityPicker";
import { ConsentCard } from "./ConsentCard";
import styles from "./Location.module.css";

export function useOriginLabel(): string {
  const { coords, gpsStatus, city, district } = useLocation();
  const { cityName, districtName } = useMeta();
  if (coords) return "Autour de moi";
  if (gpsStatus === "locating") return "Localisation…";
  const c = cityName(city) || "Abidjan";
  return district ? `${districtName(city, district)}, ${c}` : c;
}

export function LocationChip() {
  const [open, setOpen] = useState(false);
  const { coords } = useLocation();
  const label = useOriginLabel();

  return (
    <>
      <button type="button" className={styles.chip} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {coords ? <IconLocate size={16} /> : <IconPin size={16} />}
        <span className={styles.chipText}>{label}</span>
        <IconChevronDown size={14} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="D'où partez-vous ?" variant="sheet">
        <div className="stack" style={{ gap: 20 }}>
          <ConsentCard compact />
          <div>
            <p className="eyebrow" style={{ marginBottom: 10 }}>
              Ou choisissez un lieu de départ
            </p>
            <CityPicker onPick={() => setOpen(false)} />
          </div>
        </div>
      </Modal>
    </>
  );
}
