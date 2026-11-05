import { useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useMeta } from "@/context/MetaContext";
import { BUDGET_PRESETS, DISTANCE_PRESETS, EMPTY_FILTERS, RATING_PRESETS, SORTS, toggleIn, type SearchFilters } from "@/lib/filters";
import { colors, space } from "@/theme/tokens";
import { categoryIcon } from "./Icon";
import { Sheet } from "./Sheet";
import { Button, Chip, Toggle, Txt } from "./ui";

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: space[3] }}>
      <Txt variant="overline" color={colors.textSubtle}>
        {title.toUpperCase()}
      </Txt>
      <View style={s.wrap}>{children}</View>
    </View>
  );
}

function SwitchRow({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <View style={s.switchRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="title" style={{ fontSize: 15 }}>
          {label}
        </Txt>
        {hint ? (
          <Txt variant="caption" color={colors.textSubtle}>
            {hint}
          </Txt>
        ) : null}
      </View>
      <Toggle value={value} onChange={onChange} label={label} />
    </View>
  );
}

export function FilterSheet({
  visible,
  onClose,
  value,
  onApply,
  gpsActive,
}: {
  visible: boolean;
  onClose: () => void;
  value: SearchFilters;
  onApply: (f: SearchFilters) => void;
  gpsActive: boolean;
}) {
  const { categories, groups, ambiances, capabilities } = useMeta();
  const cov = capabilities?.coverage;
  // Un filtre n'est proposé que si assez de lieux le renseignent (sinon il ne renverrait rien).
  const has = (k: keyof NonNullable<typeof cov>) => !cov || cov[k] >= 20;
  const byGroup = groups.length
    ? groups.map((g) => ({ title: g.name, items: categories.filter((c) => g.categories.includes(c.slug)) }))
    : [{ title: "Catégories", items: categories }];
  const [f, setF] = useState(value);
  const [wasVisible, setWasVisible] = useState(visible);
  // À chaque ouverture, on repart des filtres appliqués (état dérivé, sans effet).
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setF(value);
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Filtres"
      footer={
        <>
          <Button label="Tout effacer" variant="ghost" full={false} onPress={() => setF({ ...EMPTY_FILTERS, q: f.q })} style={{ width: 140 }} />
          <Button
            label="Voir les lieux"
            onPress={() => {
              onApply(f);
              onClose();
            }}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <Group title="Trier par">
        {SORTS.map((o) => (
          <Chip
            key={o.value}
            label={o.label}
            selected={f.sort === o.value}
            onPress={() => setF({ ...f, sort: o.value })}
            accessibilityLabel={o.value === "distance" && !gpsActive ? `${o.label} (depuis le centre de la zone choisie)` : o.label}
          />
        ))}
      </Group>
      {byGroup.map((g) =>
        g.items.length ? (
          <Group key={g.title} title={g.title}>
            {g.items.map((c) => (
              <Chip key={c.slug} icon={categoryIcon(c.icon || c.slug)} label={c.name} selected={f.categories.includes(c.slug)} onPress={() => setF({ ...f, categories: toggleIn(f.categories, c.slug) })} />
            ))}
          </Group>
        ) : null,
      )}
      {ambiances.some((a) => (a.count ?? 20) >= 20) ? (
        <Group title="Ambiances">
          {ambiances
            .filter((a) => (a.count ?? 20) >= 20)
            .map((a) => (
              <Chip key={a.slug} label={a.name} selected={f.ambiances.includes(a.slug)} onPress={() => setF({ ...f, ambiances: toggleIn(f.ambiances, a.slug) })} />
            ))}
        </Group>
      ) : null}
      {has("budget") ? (
        <Group title="Budget max (FCFA)">
          <Chip label="Tous" selected={!f.budgetMax} onPress={() => setF({ ...f, budgetMax: null })} />
          {BUDGET_PRESETS.map((b) => (
            <Chip key={b.value} label={b.label} selected={f.budgetMax === b.value} onPress={() => setF({ ...f, budgetMax: b.value })} />
          ))}
        </Group>
      ) : null}
      <Group title="Distance max (à vol d'oiseau)">
        <Chip label="Toutes" selected={!f.maxDistanceKm} onPress={() => setF({ ...f, maxDistanceKm: null })} />
        {DISTANCE_PRESETS.map((d) => (
          <Chip key={d} label={`${d} km`} selected={f.maxDistanceKm === d} onPress={() => setF({ ...f, maxDistanceKm: d })} />
        ))}
      </Group>
      {has("rating") ? (
        <Group title="Note minimum">
          <Chip label="Toutes" selected={!f.minRating} onPress={() => setF({ ...f, minRating: null })} />
          {RATING_PRESETS.map((r) => (
            <Chip key={r} icon="star" label={String(r).replace(".", ",")} selected={f.minRating === r} onPress={() => setF({ ...f, minRating: r })} />
          ))}
        </Group>
      ) : null}
      <View style={{ gap: 4 }}>
        {has("hours") ? <SwitchRow label="Ouvert maintenant" hint="Seulement les lieux dont les horaires sont connus" value={f.openNow} onChange={(v) => setF({ ...f, openNow: v })} /> : null}
        {has("parking") ? <SwitchRow label="Parking" value={f.parking} onChange={(v) => setF({ ...f, parking: v })} /> : null}
        {has("wheelchair") ? <SwitchRow label="Accès fauteuil roulant" value={f.wheelchair} onChange={(v) => setF({ ...f, wheelchair: v })} /> : null}
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
