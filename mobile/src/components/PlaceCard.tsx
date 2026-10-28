import { router } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { distanceLabel, formatBudgetRange, matchLabel, openStatusLabel, travelLabel } from "@/lib/format";
import type { OpenStatus, PlaceCard as Place } from "@/lib/types";
import { colors, radius } from "@/theme/tokens";
import { Cover } from "./Cover";
import { categoryIcon, Icon } from "./Icon";
import { Pill, PressableScale, Txt } from "./ui";

type Names = Record<string, string>;

export const LOCKED_TITLE = "Pépite Insider";

export function categoriesLabel(p: Place, catName: Names, max = 2): string {
  return p.categories
    .slice(0, max)
    .map((c) => catName[c] ?? c)
    .join(" · ");
}

/** Ligne « note · distance · trajet » — n'invente rien. */
export function ratingText(p: Pick<Place, "rating_avg" | "rating_count">): string {
  if (p.rating_avg == null || p.rating_count <= 0) return "Pas encore d'avis";
  return `${p.rating_avg.toFixed(1).replace(".", ",")} (${p.rating_count})`;
}

export function openColor(s: OpenStatus): string {
  return s === "open" ? colors.success : s === "closed" ? colors.danger : colors.textSubtle;
}

function a11ySummary(p: Place, catName: Names): string {
  if (p.locked) return `${LOCKED_TITLE}, ${p.district ?? p.city}. Réservée aux membres Insider.`;
  return [
    p.name,
    categoriesLabel(p, catName),
    p.district ?? p.city,
    ratingText(p),
    distanceLabel(p.distance_km),
    travelLabel(p.travel),
    openStatusLabel(p.open_status, p.closes_at),
    matchLabel(p.match),
    p.is_demo ? "Lieu de démonstration" : null,
  ]
    .filter(Boolean)
    .join(". ");
}

function openPlace(p: Place) {
  if (p.locked) router.push("/premium");
  else router.push({ pathname: "/place/[id]", params: { id: p.slug || p.id } });
}

function OpenDot({ status, closesAt }: { status: OpenStatus; closesAt: string | null }) {
  return (
    <View style={s.inline}>
      <View style={[s.dot, { backgroundColor: openColor(status) }]} />
      <Txt variant="caption" color={status === "unknown" ? colors.textSubtle : colors.textMuted} numberOfLines={1}>
        {openStatusLabel(status, closesAt)}
      </Txt>
    </View>
  );
}

function Meta({ p }: { p: Place }) {
  const dist = distanceLabel(p.distance_km);
  const travel = travelLabel(p.travel);
  return (
    <View style={s.metaRow}>
      <View style={s.inline}>
        <Icon name="star" size={13} color={p.rating_avg != null && p.rating_count > 0 ? colors.gold : colors.textSubtle} fill={p.rating_avg != null && p.rating_count > 0 ? colors.gold : "none"} />
        <Txt variant="caption" color={colors.textMuted} testID="rating">
          {ratingText(p)}
        </Txt>
      </View>
      {dist ? (
        <Txt variant="caption" color={colors.textMuted} numberOfLines={1} testID="distance">
          · {dist}
        </Txt>
      ) : null}
      {travel ? (
        <Txt variant="caption" color={colors.textMuted} numberOfLines={1} testID="travel">
          · {travel} ({p.travel?.source})
        </Txt>
      ) : null}
    </View>
  );
}

/** Carte verticale pour les carrousels. */
export function PlaceTile({ p, catName, width = 264, onPress }: { p: Place; catName: Names; width?: number; onPress?: () => void }) {
  const match = matchLabel(p.match);
  const budget = formatBudgetRange(p.budget_min_fcfa, p.budget_max_fcfa);
  if (p.locked) return <LockedTile p={p} width={width} />;
  return (
    <PressableScale
      onPress={onPress ?? (() => openPlace(p))}
      accessibilityRole="button"
      accessibilityLabel={a11ySummary(p, catName)}
      style={{ width }}
      testID="place-tile"
    >
      <Cover url={p.cover.url} gradient={p.cover.gradient} alt={p.cover.alt} glyph={categoryIcon(p.categories[0])} glyphSize={130} style={s.tileCover}>
        <View style={s.coverTop}>
          {p.is_demo ? <Pill label="Démo" tone="demo" /> : <View />}
          {match ? <Pill label={match} tone="accent" icon="sparkles" style={s.matchPill} /> : null}
        </View>
        <View style={s.coverBottom}>
          {p.tier === "premium" ? <Pill label="Pépite" tone="gold" icon="gem" /> : null}
          {budget ? <Pill label={budget} tone="glass" /> : null}
        </View>
      </Cover>
      <View style={{ paddingTop: 12, gap: 4 }}>
        <Txt variant="h3" numberOfLines={1}>
          {p.name}
        </Txt>
        <Txt variant="bodySm" color={colors.textMuted} numberOfLines={1}>
          {[categoriesLabel(p, catName), p.district ?? p.city].filter(Boolean).join(" — ")}
        </Txt>
        <Meta p={p} />
        <OpenDot status={p.open_status} closesAt={p.closes_at} />
      </View>
    </PressableScale>
  );
}

function LockedTile({ p, width }: { p: Place; width: number }) {
  return (
    <PressableScale onPress={() => openPlace(p)} accessibilityRole="button" accessibilityLabel={a11ySummary(p, {})} style={{ width }} testID="locked-card">
      <Cover url={null} gradient={null} alt="Pépite verrouillée" glyph="lock" locked glyphSize={120} style={[s.tileCover, s.goldBorder]}>
        <View style={s.coverTop}>
          <Pill label="Insider" tone="gold" icon="crown" />
          {p.is_demo ? <Pill label="Démo" tone="demo" /> : null}
        </View>
      </Cover>
      <View style={{ paddingTop: 12, gap: 4 }}>
        <Txt variant="h3" color={colors.gold} numberOfLines={1}>
          {LOCKED_TITLE}
        </Txt>
        <Txt variant="bodySm" color={colors.textMuted} numberOfLines={2}>
          {p.district ? `Quelque part à ${p.district}` : p.city} · nom et adresse réservés
        </Txt>
      </View>
    </PressableScale>
  );
}

/** Carte horizontale pour les listes (recherche, favoris…). */
export function PlaceRow({
  p,
  catName,
  showReasons,
  onPress,
  right,
}: {
  p: Place;
  catName: Names;
  showReasons?: boolean;
  onPress?: () => void;
  right?: ReactNode;
}) {
  const match = matchLabel(p.match);
  const budget = formatBudgetRange(p.budget_min_fcfa, p.budget_max_fcfa);
  if (p.locked) {
    return (
      <PressableScale onPress={() => openPlace(p)} accessibilityRole="button" accessibilityLabel={a11ySummary(p, catName)} style={[s.row, s.lockedRow]} testID="locked-card">
        <Cover url={null} gradient={null} alt="Pépite verrouillée" glyph="lock" locked centered glyphSize={34} style={s.rowCover} shade={false} />
        <View style={{ flex: 1, gap: 4 }}>
          <Pill label="Insider" tone="gold" icon="crown" />
          <Txt variant="title" color={colors.gold} numberOfLines={1}>
            {LOCKED_TITLE}
          </Txt>
          <Txt variant="bodySm" color={colors.textMuted} numberOfLines={2}>
            {p.district ? `Quelque part à ${p.district}` : p.city} — débloque-la avec Insider.
          </Txt>
        </View>
        <Icon name="chevronRight" size={18} color={colors.gold} />
      </PressableScale>
    );
  }
  return (
    <PressableScale onPress={onPress ?? (() => openPlace(p))} accessibilityRole="button" accessibilityLabel={a11ySummary(p, catName)} style={s.row} testID="place-row">
      <Cover url={p.cover.url} gradient={p.cover.gradient} alt={p.cover.alt} glyph={categoryIcon(p.categories[0])} glyphSize={72} style={s.rowCover} shade={false}>
        {p.is_demo ? <Pill label="Démo" tone="demo" style={{ position: "absolute", top: 6, left: 6, paddingHorizontal: 6, paddingVertical: 2 }} /> : null}
      </Cover>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={s.inline}>
          <Txt variant="title" numberOfLines={1} style={{ flexShrink: 1 }}>
            {p.name}
          </Txt>
          {p.tier === "premium" ? <Icon name="gem" size={14} color={colors.gold} /> : null}
        </View>
        <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
          {[categoriesLabel(p, catName), p.district ?? p.city, budget].filter(Boolean).join(" · ")}
        </Txt>
        <Meta p={p} />
        <View style={[s.inline, { gap: 8, flexWrap: "wrap", rowGap: 4 }]}>
          <OpenDot status={p.open_status} closesAt={p.closes_at} />
          {match ? <Pill label={match} tone="accent" icon="sparkles" /> : null}
        </View>
        {showReasons && p.reasons.length ? (
          <Txt variant="caption" color={colors.accentSoft} numberOfLines={2} style={{ marginTop: 2 }}>
            {p.reasons.slice(0, 2).join(" · ")}
          </Txt>
        ) : null}
      </View>
      {right}
    </PressableScale>
  );
}

const s = StyleSheet.create({
  tileCover: { height: 176, borderRadius: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  goldBorder: { borderColor: colors.goldBorder },
  coverTop: { position: "absolute", top: 12, left: 12, right: 12, flexDirection: "row", justifyContent: "space-between" },
  coverBottom: { position: "absolute", bottom: 12, left: 12, right: 12, flexDirection: "row", gap: 6, flexWrap: "wrap" },
  matchPill: { backgroundColor: "rgba(26,15,5,0.82)" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" },
  inline: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  row: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    padding: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lockedRow: { backgroundColor: colors.goldBg, borderColor: colors.goldBorder },
  rowCover: { width: 92, height: 92, borderRadius: 16 },
});

