import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { FlatList, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { FadeInDown, interpolate, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, Extrapolation } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Cover } from "@/components/Cover";
import { EmptyState, ErrorState, Skeleton, useToast } from "@/components/feedback";
import { categoryIcon, Icon, type IconName } from "@/components/Icon";
import { categoriesLabel, openColor, PlaceTile } from "@/components/PlaceCard";
import { AddPhotoSheet, PhotoActionsSheet, PhotoCredit, PlaceGallery } from "@/components/PlacePhotos";
import { CollectionSheet, ReportSheet, ReviewSheet } from "@/components/PlaceSheets";
import { UpsellCard } from "@/components/Premium";
import { goBack } from "@/components/Screen";
import { Button, Chip, hapticLight, IconButton, Pill, PressableScale, Txt } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useMeta } from "@/context/MetaContext";
import { useSettings } from "@/context/SettingsContext";
import { api, ApiError, errorMessage, isUnsupported } from "@/lib/api";
import { track } from "@/lib/events";
import {
  aboutText,
  confidenceLabel,
  distanceLabel,
  formatBudgetRange,
  formatDate,
  matchLabel,
  openStatusLabel,
  parseTagline,
  priceLevelLabel,
  travelLabel,
  WEEKDAYS,
} from "@/lib/format";
import { callPhone, openDirections, sharePlace } from "@/lib/links";
import { canManagePhotos, isCoverPhoto, realPhotos } from "@/lib/photos";
import type { Amenities, PlaceCard, PlaceDetail, PlacePhoto } from "@/lib/types";
import { colors, fonts, GUTTER, radius, space } from "@/theme/tokens";

const HERO = 360;

const AMENITIES: { key: keyof Amenities; yes: string; no: string; icon: IconName }[] = [
  { key: "parking", yes: "Parking", no: "Pas de parking", icon: "car" },
  { key: "wheelchair", yes: "Accessible fauteuil", no: "Non accessible fauteuil", icon: "accessibility" },
  { key: "wifi", yes: "Wi-Fi", no: "Pas de Wi-Fi", icon: "wifi" },
  { key: "card_payment", yes: "Carte bancaire", no: "Pas de carte bancaire", icon: "card" },
  { key: "mobile_money", yes: "Mobile Money", no: "Pas de Mobile Money", icon: "smartphone" },
  { key: "outdoor", yes: "Espace extérieur", no: "Pas d'extérieur", icon: "sun" },
];

const SOURCE_LABEL: Record<string, string> = {
  demo: "Données de démonstration",
  osm: "OpenStreetMap",
  partner: "Partenaire",
  curated: "Équipe de curation",
};

function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <View style={s.section}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Txt variant="h3" style={{ flex: 1 }} accessibilityRole="header">
          {title}
        </Txt>
        {right}
      </View>
      {children}
    </View>
  );
}

function Fact({ icon, label, value, color }: { icon: IconName; label: string; value: string; color?: string }) {
  return (
    <View style={s.fact} accessible accessibilityLabel={`${label} : ${value}`}>
      <Icon name={icon} size={17} color={color ?? colors.accentSoft} />
      <Txt variant="caption" color={colors.textSubtle}>
        {label}
      </Txt>
      <Txt variant="label" numberOfLines={2}>
        {value}
      </Txt>
    </View>
  );
}

function ActionTile({ icon, label, onPress, active }: { icon: IconName; label: string; onPress: () => void; active?: boolean }) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={s.actionTile} scaleTo={0.94}>
      <View style={[s.actionIcon, active ? { backgroundColor: colors.accent } : null]}>
        <Icon name={icon} size={19} color={active ? colors.onAccent : colors.text} />
      </View>
      <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
        {label}
      </Txt>
    </PressableScale>
  );
}

export default function PlaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const { catName, ambName } = useMeta();
  const { gps, cityCenter } = useSettings();
  // Distance depuis la position (si consentie), sinon depuis le centre de la ville choisie.
  const origin = gps ?? cityCenter;
  const fromCenter = !gps && !!cityCenter;
  const [allReviews, setAllReviews] = useState(false);
  const toast = useToast();
  const [place, setPlace] = useState<PlaceDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [similar, setSimilar] = useState<PlaceCard[] | null>(null);
  const [fav, setFav] = useState(false);
  const [sheet, setSheet] = useState<"collection" | "report" | "review" | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [addPhoto, setAddPhoto] = useState(false);
  const [managed, setManaged] = useState<PlacePhoto | null>(null);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const staff = canManagePhotos(user);
  const y = useSharedValue(0);
  const [prevId, setPrevId] = useState(id);
  if (id !== prevId) {
    // Navigation d'une fiche à une autre (lieux similaires) : on repart d'un état vierge.
    setPrevId(id);
    setPlace(null);
    setError(null);
    setSimilar(null);
    setAllReviews(false);
    setHeroUrl(null);
  }

  useEffect(() => {
    let alive = true;
    api.places
      .get(String(id), origin)
      .then((p) => {
        if (!alive) return;
        setError(null);
        setPlace(p);
        setFav(p.is_favorite);
        if (reloadKey === 0) track("view", p.id);
      })
      .catch((e: unknown) => alive && setError(e));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id, reloadKey]);

  useEffect(() => {
    let alive = true;
    api.recommendations
      .similar(String(id))
      .then((list) => alive && setSimilar(Array.isArray(list) ? list.filter((p) => p.slug !== id && p.id !== id) : []))
      .catch((e: unknown) => {
        // v1.1 pas encore disponible (404/405) ou autre erreur : la section reste masquée.
        if (alive && (isUnsupported(e) || e)) setSimilar([]);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });
  const heroStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(y.value, [-HERO, 0, HERO], [-HERO / 2, 0, HERO * 0.45], Extrapolation.CLAMP) },
      { scale: interpolate(y.value, [-HERO, 0], [2, 1], Extrapolation.CLAMP) },
    ],
  }));
  const barStyle = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [HERO - 140, HERO - 70], [0, 1], Extrapolation.CLAMP) }));

  const requireAuth = (): boolean => {
    if (user) return true;
    router.push("/login");
    return false;
  };

  const toggleFav = async () => {
    if (!place || !requireAuth()) return;
    const next = !fav;
    setFav(next);
    hapticLight();
    try {
      if (next) {
        await api.favorites.add(place.id);
        track("favorite", place.id);
        toast("Ajouté à tes favoris", "heart");
      } else {
        await api.favorites.remove(place.id);
        toast("Retiré des favoris", "heart");
      }
    } catch (e) {
      setFav(!next);
      toast(errorMessage(e), "info");
    }
  };

  const share = async () => {
    if (!place) return;
    if (await sharePlace(place)) track("share", place.id);
  };

  // --- États spéciaux
  if (error) {
    const premium = error instanceof ApiError && error.kind === "premium";
    const notFound = error instanceof ApiError && error.kind === "not_found";
    return (
      <View style={[s.screen, { paddingTop: insets.top + space[2] }]}>
        <View style={{ paddingHorizontal: GUTTER }}>
          <IconButton icon="chevronLeft" label="Retour" onPress={() => goBack()} />
        </View>
        {premium ? (
          <View style={{ padding: GUTTER, gap: space[4], flex: 1, justifyContent: "center" }}>
            <EmptyState icon="lock" tone="gold" title="Une pépite réservée" body="Cette adresse fait partie de la sélection Insider. Son nom et sa position sont réservés aux membres." />
            <UpsellCard title="Passe Insider" body="Accède à toutes les pépites et aux lieux cachés sélectionnés par nos curateurs." />
          </View>
        ) : notFound ? (
          <EmptyState icon="search" title="Lieu introuvable" body="Ce lieu n'existe plus ou n'est pas publié." action={{ label: "Retour à l'accueil", onPress: () => router.replace("/") }} />
        ) : (
          <ErrorState error={error} onRetry={() => setReloadKey((k) => k + 1)} />
        )}
      </View>
    );
  }

  if (!place) {
    return (
      <View style={s.screen}>
        <Skeleton height={HERO} r={0} />
        <View style={{ padding: GUTTER, gap: 14 }}>
          <Skeleton width="65%" height={30} />
          <Skeleton width="45%" height={16} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Skeleton width="48%" height={78} r={16} />
            <Skeleton width="48%" height={78} r={16} />
          </View>
          <Skeleton height={90} r={16} />
        </View>
        <View style={{ position: "absolute", top: insets.top + 8, left: GUTTER }}>
          <IconButton icon="chevronLeft" label="Retour" onPress={() => goBack()} bg="rgba(14,15,19,0.6)" />
        </View>
      </View>
    );
  }

  const p = place;
  const match = matchLabel(p.match);
  const dist = distanceLabel(p.distance_km);
  const travel = travelLabel(p.travel);
  const budget = formatBudgetRange(p.budget_min_fcfa, p.budget_max_fcfa);
  const level = priceLevelLabel(p.price_level);
  const conf = confidenceLabel(p.confidence);
  const known = AMENITIES.filter((a) => p.amenities?.[a.key] != null);
  const today = (new Date().getDay() + 6) % 7;
  const photos = realPhotos(p.photos);
  const credits = photos.filter((ph) => ph.credit);
  // Photo du héros : celle choisie dans la galerie, sinon la couverture, sinon la première.
  const hero = (heroUrl ? photos.find((ph) => ph.url === heroUrl) : null) ?? photos.find((ph) => isCoverPhoto(ph, p.cover)) ?? (p.cover.url ? null : photos[0]) ?? null;
  const catLabels = p.categories.map((c) => catName[c] ?? c);
  const about = aboutText(p.description, p.short_description, catLabels);
  const { cuisines } = parseTagline(p.short_description, catLabels);
  const hasRating = p.rating_avg != null && p.rating_count > 0;
  const hoursKnown = p.hours.length > 0 || p.open_status !== "unknown";
  const reload = () => {
    setHeroUrl(null);
    setReloadKey((k) => k + 1);
  };

  return (
    <View style={s.screen}>
      <Animated.View style={[s.hero, heroStyle]}>
        <Cover
          url={hero?.url ?? p.cover.url}
          gradient={p.cover.gradient}
          alt={hero?.alt ?? p.cover.alt}
          glyph={categoryIcon(p.categories[0])}
          glyphSize={260}
          style={StyleSheet.absoluteFill}
          shade={false}
        />
        <LinearGradient colors={["rgba(14,15,19,0.55)", "rgba(14,15,19,0)", "rgba(14,15,19,0.2)", colors.bg]} locations={[0, 0.3, 0.7, 1]} style={StyleSheet.absoluteFill} />
        {hero?.url ? <PhotoCredit credit={hero.credit} style={s.heroCredit} testID="hero-credit" /> : null}
      </Animated.View>

      <Animated.ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingBottom: insets.bottom + 110 }} showsVerticalScrollIndicator={false}>
        <View style={{ height: HERO - 64 }} />
        <Animated.View entering={FadeInDown.duration(420)} style={s.body}>
          <View style={s.pills}>
            {p.is_demo ? <Pill label="Démo · lieu fictif" tone="demo" icon="info" /> : null}
            {p.tier === "premium" ? <Pill label="Pépite Insider" tone="gold" icon="gem" /> : null}
            {match ? <Pill label={match} tone="accent" icon="sparkles" /> : null}
          </View>
          <View style={{ paddingHorizontal: GUTTER, gap: 6 }}>
            <Txt variant="h1" style={{ fontSize: 32, lineHeight: 36 }} accessibilityRole="header">
              {p.name}
            </Txt>
            <Txt variant="body" color={colors.textMuted}>
              {[categoriesLabel(p, catName, 3), [p.district, p.city].filter(Boolean).join(", ")].filter(Boolean).join(" — ")}
            </Txt>
          </View>

          <View style={s.facts}>
            {hasRating ? (
              <Fact icon="star" label="Note" value={`${p.rating_avg!.toFixed(1).replace(".", ",")} · ${p.rating_count} avis`} color={colors.gold} />
            ) : null}
            <Fact
              icon="clock"
              label="Horaires"
              value={hoursKnown ? openStatusLabel(p.open_status, p.closes_at) : "Non communiqués"}
              color={hoursKnown ? openColor(p.open_status) : colors.textSubtle}
            />
            {dist ? (
              <Fact icon="pin" label={fromCenter ? "Depuis le centre-ville" : "Distance"} value={travel ? `${dist}\n${travel} · ${p.travel?.source}` : dist} />
            ) : null}
            {budget || level ? <Fact icon="card" label={budget && level ? `Budget / pers. · ${level}` : "Budget / pers."} value={budget ?? level!} /> : null}
          </View>

          <View style={s.actions}>
            <ActionTile icon="heart" label={fav ? "Enregistré" : "Favori"} onPress={toggleFav} active={fav} />
            <ActionTile icon="bookmark" label="Collection" onPress={() => requireAuth() && setSheet("collection")} />
            <ActionTile icon="share" label="Partager" onPress={share} />
            <ActionTile icon="flag" label="Signaler" onPress={() => requireAuth() && setSheet("report")} />
          </View>

          <PlaceGallery
            photos={p.photos}
            cover={p.cover}
            user={user}
            selectedUrl={hero?.url ?? null}
            onSelect={(ph) => {
              setHeroUrl(ph.url);
              scrollRef.current?.scrollTo({ y: 0, animated: true });
            }}
            onAdd={() => setAddPhoto(true)}
            onManage={setManaged}
          />

          {about || cuisines.length || p.ambiances.length ? (
            <Section title={about ? "À propos" : "En bref"}>
              {about ? (
                <Txt variant="body" color={colors.textMuted} style={{ lineHeight: 23 }}>
                  {about}
                </Txt>
              ) : null}
              {cuisines.length || p.ambiances.length ? (
                <View style={s.wrap}>
                  {cuisines.map((c) => (
                    <Chip key={`c-${c}`} size="sm" label={c} icon="utensils" />
                  ))}
                  {p.ambiances.map((a) => (
                    <Chip key={a} size="sm" label={ambName[a] ?? a} />
                  ))}
                </View>
              ) : null}
            </Section>
          ) : null}

          {known.length ? (
            <Section title="Sur place">
              <View style={s.wrap}>
                {known.map((a) => {
                  const yes = p.amenities[a.key] === true;
                  return (
                    <View key={a.key} style={[s.amenity, !yes ? { opacity: 0.7 } : null]}>
                      <Icon name={a.icon} size={16} color={yes ? colors.success : colors.textSubtle} />
                      <Txt variant="label" color={yes ? colors.text : colors.textMuted} style={!yes ? { textDecorationLine: "line-through" } : null}>
                        {yes ? a.yes : a.no}
                      </Txt>
                    </View>
                  );
                })}
              </View>
              <Txt variant="caption" color={colors.textSubtle}>
                Seules les informations connues sont affichées.
              </Txt>
            </Section>
          ) : null}

          {p.hours.length ? (
            <Section title="Horaires">
              <View style={s.hours}>
                {WEEKDAYS.map((d, i) => {
                  const slots = p.hours.filter((h) => h.weekday === i).sort((a, b) => a.open.localeCompare(b.open));
                  const isToday = i === today;
                  return (
                    <View key={d} style={[s.hourRow, isToday ? s.hourToday : null]}>
                      <Txt variant="label" color={isToday ? colors.accentSoft : colors.textMuted} style={{ width: 120 }}>
                        {isToday ? `${d} (auj.)` : d}
                      </Txt>
                      <Txt variant="label" color={slots.length ? colors.text : colors.textSubtle} style={{ flex: 1, textAlign: "right" }}>
                        {slots.length ? slots.map((h) => `${h.open} – ${h.close}`).join(", ") : "Fermé"}
                      </Txt>
                    </View>
                  );
                })}
              </View>
            </Section>
          ) : null}

          {p.events.length ? (
            <Section title="Événements">
              {p.events.map((ev) => (
                <View key={ev.id} style={s.event}>
                  <Icon name="calendar" size={18} color={colors.accentSoft} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="title">{ev.title}</Txt>
                    <Txt variant="caption" color={colors.textMuted}>
                      {formatDate(ev.starts_at, true)}
                      {ev.price_fcfa != null ? ` · ${formatBudgetRange(ev.price_fcfa, ev.price_fcfa)}` : ""}
                    </Txt>
                  </View>
                </View>
              ))}
            </Section>
          ) : null}

          <Section
            title="Avis"
            right={
              <PressableScale onPress={() => requireAuth() && setSheet("review")} accessibilityRole="button" accessibilityLabel="Écrire un avis" hitSlop={8}>
                <Txt variant="label" color={colors.accent}>
                  Écrire un avis
                </Txt>
              </PressableScale>
            }
          >
            {p.reviews_summary ? (
              <View style={s.summary}>
                <Icon name="sparkles" size={16} color={colors.accentSoft} />
                <Txt variant="bodySm" color={colors.text} style={{ flex: 1 }}>
                  {p.reviews_summary}
                </Txt>
              </View>
            ) : null}
            {p.reviews.length ? (
              p.reviews.slice(0, allReviews ? 20 : 3).map((r) => (
                <View key={r.id} style={s.review}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={s.reviewAvatar}>
                      <Txt variant="caption" style={{ fontFamily: fonts.bodyHeavy }}>
                        {r.author.slice(0, 1).toUpperCase()}
                      </Txt>
                    </View>
                    <Txt variant="label" style={{ flex: 1 }}>
                      {r.author}
                    </Txt>
                    <View style={{ flexDirection: "row", gap: 1 }} accessibilityLabel={`${r.rating} sur 5`}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Icon key={n} name="star" size={12} color={n <= r.rating ? colors.gold : colors.borderHover} fill={n <= r.rating ? colors.gold : "none"} />
                      ))}
                    </View>
                  </View>
                  <Txt variant="bodySm" color={colors.textMuted}>
                    {r.text}
                  </Txt>
                  <Txt variant="caption" color={colors.textSubtle}>
                    {formatDate(r.created_at)}
                  </Txt>
                </View>
              ))
            ) : (
              <Txt variant="body" color={colors.textMuted}>
                Pas encore d&apos;avis. Sois le premier à partager ton expérience.
              </Txt>
            )}
          </Section>

          {p.reviews.length > 3 && !allReviews ? (
            <View style={{ paddingHorizontal: GUTTER, marginTop: space[3] }}>
              <Button label={`Voir les ${p.reviews.length} avis`} variant="secondary" size="md" onPress={() => setAllReviews(true)} />
            </View>
          ) : null}

          <Section title="Fiabilité de la fiche">
            <View style={s.reliability}>
              <Row label="Source" value={p.source.attribution ?? SOURCE_LABEL[p.source.kind] ?? p.source.kind} />
              <Row label="Dernière vérification" value={formatDate(p.verified_at) ?? "Jamais vérifiée sur le terrain"} />
              <Row label="Confiance" value={`${conf.label} (${Math.round(p.confidence * 100)} %)`} color={conf.level === "high" ? colors.success : conf.level === "medium" ? colors.warning : colors.danger} />
              {p.address ? <Row label="Adresse" value={p.address} /> : null}
              {credits.map((ph, i) => (
                <Row key={i} label="Photo" value={`© ${ph.credit}`} />
              ))}
            </View>
            <Button label="Signaler une erreur" icon="flag" variant="ghost" size="md" onPress={() => requireAuth() && setSheet("report")} />
          </Section>

          {similar && similar.length ? (
            <View style={{ marginTop: space[6], gap: space[3] }}>
              <View style={{ paddingHorizontal: GUTTER }}>
                <Txt variant="h3" accessibilityRole="header">
                  Lieux similaires
                </Txt>
              </View>
              <FlatList
                horizontal
                data={similar}
                keyExtractor={(x) => x.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 14 }}
                renderItem={({ item }) => <PlaceTile p={item} catName={catName} width={Math.min(240, width * 0.62)} />}
              />
            </View>
          ) : null}
        </Animated.View>
      </Animated.ScrollView>

      {/* Barre supérieure */}
      <View style={[s.topBar, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(14,15,19,0.96)", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, barStyle]} />
        <IconButton icon="chevronLeft" label="Retour" onPress={() => goBack()} bg="rgba(14,15,19,0.55)" border="rgba(255,255,255,0.12)" />
        <Animated.View style={[{ flex: 1, paddingHorizontal: 8 }, barStyle]}>
          <Txt variant="title" numberOfLines={1} style={{ textAlign: "center" }}>
            {p.name}
          </Txt>
        </Animated.View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <IconButton icon="share" label="Partager" onPress={share} bg="rgba(14,15,19,0.55)" border="rgba(255,255,255,0.12)" />
          <IconButton
            icon="heart"
            label={fav ? "Retirer des favoris" : "Ajouter aux favoris"}
            onPress={toggleFav}
            color={fav ? colors.accent : colors.text}
            fill={fav ? colors.accent : "none"}
            bg="rgba(14,15,19,0.55)"
            border="rgba(255,255,255,0.12)"
          />
        </View>
      </View>

      {/* Actions principales */}
      <View style={[s.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {p.phone ? (
          <Button
            label="Appeler"
            icon="phone"
            variant="secondary"
            full={false}
            style={{ paddingHorizontal: 22 }}
            onPress={() => {
              track("call", p.id);
              callPhone(p.phone!);
            }}
          />
        ) : null}
        <Button
          label="Itinéraire"
          icon="navigation"
          style={{ flex: 1 }}
          disabled={!p.location}
          accessibilityHint="Ouvre l'application de cartes du téléphone"
          onPress={() => {
            if (!p.location) return;
            track("directions", p.id);
            openDirections(p.location.lat, p.location.lng, p.name);
          }}
        />
      </View>

      <CollectionSheet placeId={p.id} visible={sheet === "collection"} onClose={() => setSheet(null)} />
      <ReportSheet placeId={p.id} visible={sheet === "report"} onClose={() => setSheet(null)} />
      {staff ? (
        <>
          <AddPhotoSheet visible={addPhoto} onClose={() => setAddPhoto(false)} placeId={p.id} placeName={p.name} hasCover={!!p.cover.url} onUploaded={reload} />
          <PhotoActionsSheet photo={managed} isCover={!!managed && isCoverPhoto(managed, p.cover)} onClose={() => setManaged(null)} onChanged={reload} />
        </>
      ) : null}
      <ReviewSheet placeId={p.id} visible={sheet === "review"} onClose={() => setSheet(null)} onDone={reload} />
    </View>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={s.relRow}>
      <Txt variant="caption" color={colors.textSubtle} style={{ width: 128 }}>
        {label}
      </Txt>
      <Txt variant="label" color={color ?? colors.text} style={{ flex: 1 }}>
        {value}
      </Txt>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  hero: { position: "absolute", top: 0, left: 0, right: 0, height: HERO },
  heroCredit: { position: "absolute", right: 12, bottom: 64 + 12 },
  body: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: space[5],
    gap: space[3],
    minHeight: 600,
  },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: GUTTER },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: GUTTER, marginTop: space[2] },
  fact: {
    width: "48.5%",
    flexGrow: 1,
    flexBasis: "45%",
    padding: 14,
    gap: 4,
    borderRadius: radius.lg,
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actions: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: GUTTER + 8, marginTop: space[3] },
  actionTile: { alignItems: "center", gap: 6, minWidth: 64 },
  actionIcon: { width: 50, height: 50, borderRadius: 18, backgroundColor: colors.surface3, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  section: { paddingHorizontal: GUTTER, marginTop: space[5], gap: space[3] },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  amenity: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, height: 36, borderRadius: radius.pill, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  hours: { borderRadius: radius.lg, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border, paddingVertical: 6 },
  hourRow: { flexDirection: "row", paddingHorizontal: 14, paddingVertical: 9 },
  hourToday: { backgroundColor: colors.accentTint },
  event: { flexDirection: "row", gap: 12, alignItems: "center", padding: 14, borderRadius: radius.md, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border },
  summary: { flexDirection: "row", gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: colors.accentTint, borderWidth: 1, borderColor: "rgba(255,138,61,0.22)" },
  review: { gap: 6, padding: 14, borderRadius: radius.md, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border },
  reviewAvatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surfaceHover, alignItems: "center", justifyContent: "center" },
  reliability: { borderRadius: radius.lg, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 },
  relRow: { flexDirection: "row", gap: 10 },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", paddingHorizontal: GUTTER - 4, paddingBottom: 8 },
  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: GUTTER,
    paddingTop: 12,
    backgroundColor: "rgba(14,15,19,0.97)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
});
