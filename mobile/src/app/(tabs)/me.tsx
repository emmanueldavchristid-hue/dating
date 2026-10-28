import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, Share, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Notice, useToast } from "@/components/feedback";
import { Sheet } from "@/components/Sheet";
import { Button, Card, ListRow, Pill, Toggle, Txt } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useMeta } from "@/context/MetaContext";
import { useSettings } from "@/context/SettingsContext";
import { api, errorMessage, isUnsupported } from "@/lib/api";
import { APP_NAME } from "@/lib/config";
import { formatFcfa, initials, planLabel } from "@/lib/format";
import type { Taste } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";
import { colors, fonts, GUTTER, radius, space } from "@/theme/tokens";

function TasteCard({ taste }: { taste: Taste }) {
  const { catName, ambName } = useMeta();
  const max = Math.max(0.0001, ...taste.top_categories.map((c) => c.weight));
  return (
    <Card style={{ gap: space[3] }}>
      <View style={{ gap: 2 }}>
        <Txt variant="h3">Ce que l&apos;app a compris de tes goûts</Txt>
        <Txt variant="caption" color={colors.textMuted}>
          Basé sur {taste.signals} {taste.signals > 1 ? "signaux" : "signal"} (vues, favoris, partages…). Tu gardes la main via tes préférences.
        </Txt>
      </View>
      {taste.top_categories.length ? (
        <View style={{ gap: 8 }}>
          {taste.top_categories.slice(0, 4).map((c) => (
            <View key={c.slug} style={{ gap: 4 }}>
              <Txt variant="label">{catName[c.slug] ?? c.slug}</Txt>
              <View style={s.track}>
                <View style={[s.fill, { width: `${Math.max(6, (c.weight / max) * 100)}%` }]} />
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Txt variant="bodySm" color={colors.textMuted}>
          Pas encore assez de signaux : explore quelques lieux et ajoute des favoris.
        </Txt>
      )}
      {taste.top_ambiances.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {taste.top_ambiances.slice(0, 5).map((a) => (
            <Pill key={a.slug} label={ambName[a.slug] ?? a.slug} tone="accent" />
          ))}
        </View>
      ) : null}
      {taste.budget_typical_fcfa != null ? (
        <Txt variant="bodySm" color={colors.textMuted}>
          Budget habituel : <Txt variant="bodySm">{formatFcfa(taste.budget_typical_fcfa)}</Txt>
        </Txt>
      ) : null}
    </Card>
  );
}

export default function Me() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user, logout, refresh } = useAuth();
  const { capabilities } = useMeta();
  const { choice, enableGps, setCity, prefs } = useSettings();
  const [del, setDel] = useState<0 | 1 | 2>(0);
  const [busy, setBusy] = useState<string | null>(null);
  const taste = useAsync(
    () =>
      api.me.taste().catch((e: unknown) => {
        if (isUnsupported(e)) return null; // v1.1 pas encore déployé → section masquée
        throw e;
      }),
    [user?.id],
    !!user,
  );

  const toggleLocation = async (on: boolean) => {
    if (on) {
      const ok = await enableGps();
      if (!ok) toast("Localisation refusée ou indisponible", "info");
    } else {
      await setCity(prefs.home_city ?? "abidjan", null);
      toast("Localisation désactivée", "check");
    }
  };

  const exportData = async () => {
    setBusy("export");
    try {
      const data = await api.me.export();
      await Share.share({ title: `Mes données ${APP_NAME}`, message: JSON.stringify(data, null, 2) });
    } catch (e) {
      toast(errorMessage(e), "info");
    } finally {
      setBusy(null);
    }
  };

  const deleteAccount = async () => {
    setBusy("delete");
    try {
      await api.me.remove();
      setDel(0);
      await logout();
      toast("Ton compte a été supprimé", "check");
    } catch (e) {
      toast(errorMessage(e), "info");
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + space[4], paddingHorizontal: GUTTER, paddingBottom: space[7], gap: space[5] }}
        refreshControl={
          user ? (
            <RefreshControl
              refreshing={false}
              onRefresh={() => {
                void refresh();
                taste.refresh();
              }}
              tintColor={colors.accent}
            />
          ) : undefined
        }
      >
        {user ? (
          <LinearGradient colors={["#22252F", "#15171D"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.profile}>
            <View style={s.avatar}>
              <Txt variant="h2" color={colors.onAccent} style={{ fontFamily: fonts.displayHeavy }}>
                {initials(user.display_name)}
              </Txt>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Txt variant="h2" numberOfLines={1}>
                {user.display_name}
              </Txt>
              <Txt variant="caption" color={colors.textMuted} numberOfLines={1}>
                {user.email}
              </Txt>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                <Pill label={planLabel(user.plan)} tone={user.plan === "free" ? "neutral" : "gold"} icon={user.plan === "free" ? "compass" : "crown"} />
                {user.role !== "user" ? <Pill label={user.role === "admin" ? "Admin" : "Curateur"} tone="info" icon="shield" /> : null}
              </View>
            </View>
          </LinearGradient>
        ) : (
          <LinearGradient colors={["#3A1F0E", "#15171D"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.profile, { flexDirection: "column", alignItems: "stretch" }]}>
            <Txt variant="h1">Ton espace</Txt>
            <Txt variant="body" color={colors.textMuted}>
              Connecte-toi pour retrouver tes favoris, tes collections, tes soirées et le concierge.
            </Txt>
            <View style={{ gap: 10, marginTop: space[2] }}>
              <Button label="Se connecter" icon="user" onPress={() => router.push("/login")} />
              <Button label="Créer un compte" variant="secondary" onPress={() => router.push("/register")} />
            </View>
          </LinearGradient>
        )}

        {user && taste.data ? <TasteCard taste={taste.data} /> : null}

        {user ? (
          <View>
            <Txt variant="overline" color={colors.textSubtle} style={s.groupTitle}>
              MES SORTIES
            </Txt>
            <Card style={s.group}>
              <ListRow icon="heart" label="Favoris" onPress={() => router.push("/favorites")} />
              <ListRow icon="bookmark" label="Collections" onPress={() => router.push("/collections")} />
              <ListRow icon="route" label="Mes soirées" onPress={() => router.push("/soiree")} />
            </Card>
          </View>
        ) : null}

        <View>
          <Txt variant="overline" color={colors.textSubtle} style={s.groupTitle}>
            RÉGLAGES
          </Txt>
          <Card style={s.group}>
            <ListRow icon="settings" label="Mes préférences" hint="Catégories, ambiances, budget, ville" onPress={() => router.push("/preferences")} />
            <ListRow
              icon="locate"
              label="Utiliser ma position"
              hint="Uniquement pour la distance à vol d'oiseau"
              right={<Toggle value={choice.kind === "gps"} onChange={toggleLocation} label="Utiliser ma position" />}
            />
            <ListRow icon="crown" label="Offres premium" value={user ? planLabel(user.plan) : undefined} onPress={() => router.push("/premium")} />
          </Card>
        </View>

        {user ? (
          <View>
            <Txt variant="overline" color={colors.textSubtle} style={s.groupTitle}>
              MES DONNÉES
            </Txt>
            <Card style={s.group}>
              <ListRow icon="download" label="Exporter mes données" hint="Fichier JSON via le menu de partage" onPress={exportData} disabled={busy === "export"} />
              {user.role === "admin" || user.role === "curator" ? (
                <ListRow icon="shield" label="Console d'administration (web)" hint="Disponible uniquement sur l'application web, depuis un ordinateur." />
              ) : null}
              <ListRow icon="logout" label="Se déconnecter" onPress={() => logout().then(() => toast("Déconnecté", "logout"))} />
              <ListRow icon="trash" label="Supprimer mon compte" danger onPress={() => setDel(1)} />
            </Card>
          </View>
        ) : null}

        <View>
          <Txt variant="overline" color={colors.textSubtle} style={s.groupTitle}>
            À PROPOS
          </Txt>
          <Card style={s.group}>
            <ListRow icon="info" label={`À propos de ${APP_NAME}`} hint="Principes, mentions, attributions" onPress={() => router.push("/about")} />
          </Card>
        </View>

        {capabilities?.demo_data !== false ? <Notice icon="info">Données de démonstration fictives : lieux, avis et horaires servent uniquement à illustrer l&apos;application.</Notice> : null}
      </ScrollView>

      <Sheet
        visible={del > 0}
        onClose={() => setDel(0)}
        title={del === 1 ? "Supprimer ton compte ?" : "Dernière confirmation"}
        footer={
          <>
            <Button label="Annuler" variant="ghost" full={false} style={{ width: 120 }} onPress={() => setDel(0)} />
            {del === 1 ? (
              <Button label="Continuer" variant="danger" style={{ flex: 1 }} onPress={() => setDel(2)} />
            ) : (
              <Button label="Supprimer définitivement" variant="danger" style={{ flex: 1 }} loading={busy === "delete"} onPress={deleteAccount} />
            )}
          </>
        }
      >
        <Txt variant="body" color={colors.textMuted}>
          {del === 1
            ? "Tes favoris, collections, soirées, avis et préférences seront effacés. Pense à exporter tes données avant."
            : "Cette action est irréversible. Ton compte sera supprimé immédiatement."}
        </Txt>
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  profile: { flexDirection: "row", alignItems: "center", gap: 16, padding: space[4], borderRadius: radius.xl, borderWidth: 1, borderColor: colors.borderStrong },
  avatar: { width: 66, height: 66, borderRadius: 24, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  groupTitle: { marginBottom: 8, marginLeft: 4 },
  group: { paddingVertical: 4, paddingHorizontal: 14 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surface3, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
});
