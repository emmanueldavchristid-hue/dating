import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { api, errorMessage } from "@/lib/api";
import type { CollectionSummary, ReportKind } from "@/lib/types";
import { colors, radius } from "@/theme/tokens";
import { Notice, useToast } from "./feedback";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import { Button, Chip, Field, hapticSuccess, PressableScale, Txt } from "./ui";

export function CollectionSheet({ placeId, visible, onClose }: { placeId: string; visible: boolean; onClose: () => void }) {
  const toast = useToast();
  const [list, setList] = useState<CollectionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    api.collections
      .list()
      .then((l) => {
        setList(l);
        setError(null);
      })
      .catch((e: unknown) => setError(errorMessage(e)));
  }, [visible]);

  const add = async (id: string, label: string) => {
    setBusy(id);
    try {
      await api.collections.addItem(id, placeId);
      hapticSuccess();
      toast(`Ajouté à « ${label} »`, "bookmark");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy("new");
    try {
      const c = await api.collections.create(n);
      setName("");
      await add(c.id, c.name);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Ajouter à une collection">
      {error ? <Notice icon="info">{error}</Notice> : null}
      {list == null && !error ? <ActivityIndicator color={colors.accent} /> : null}
      {list?.map((c) => (
        <PressableScale key={c.id} onPress={() => add(c.id, c.name)} accessibilityRole="button" accessibilityLabel={`Ajouter à ${c.name}`} style={s.item}>
          <View style={s.itemIcon}>
            <Icon name="bookmark" size={18} color={colors.accentSoft} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="title">{c.name}</Txt>
            <Txt variant="caption" color={colors.textMuted}>
              {c.count} lieu{c.count > 1 ? "x" : ""}
            </Txt>
          </View>
          {busy === c.id ? <ActivityIndicator color={colors.accent} /> : <Icon name="plus" size={20} color={colors.textMuted} />}
        </PressableScale>
      ))}
      {list && !list.length ? (
        <Txt variant="bodySm" color={colors.textMuted}>
          Pas encore de collection. Crée la première :
        </Txt>
      ) : null}
      <Field label="Nouvelle collection" placeholder="Ex. Rooftops du vendredi" value={name} onChangeText={setName} onSubmitEditing={create} returnKeyType="done" maxLength={80} />
      <Button label="Créer et ajouter" icon="plus" onPress={create} disabled={!name.trim()} loading={busy === "new"} variant="secondary" />
    </Sheet>
  );
}

const REPORT_KINDS: { value: ReportKind; label: string }[] = [
  { value: "closed", label: "Fermé définitivement" },
  { value: "wrong_hours", label: "Horaires faux" },
  { value: "wrong_location", label: "Mauvaise position" },
  { value: "wrong_price", label: "Prix faux" },
  { value: "other", label: "Autre" },
];

export function ReportSheet({ placeId, visible, onClose }: { placeId: string; visible: boolean; onClose: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState<ReportKind | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!kind) return;
    setBusy(true);
    setError(null);
    try {
      await api.places.report(placeId, kind, msg.trim());
      toast("Merci ! Signalement envoyé à l'équipe.", "flag");
      setKind(null);
      setMsg("");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Signaler une erreur"
      subtitle="Tes retours nous aident à garder des fiches fiables."
      footer={<Button label="Envoyer" icon="send" onPress={send} disabled={!kind} loading={busy} style={{ flex: 1 }} />}
    >
      <View style={s.wrap}>
        {REPORT_KINDS.map((k) => (
          <Chip key={k.value} label={k.label} selected={kind === k.value} onPress={() => setKind(k.value)} />
        ))}
      </View>
      <Field label="Précisions (facultatif)" placeholder="Qu'as-tu constaté ?" value={msg} onChangeText={setMsg} multiline maxLength={1000} style={{ minHeight: 90, textAlignVertical: "top" }} />
      {error ? <Notice icon="info">{error}</Notice> : null}
    </Sheet>
  );
}

export function ReviewSheet({ placeId, visible, onClose, onDone }: { placeId: string; visible: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.places.review(placeId, rating, text.trim());
      hapticSuccess();
      toast("Merci pour ton avis !", "star");
      setRating(0);
      setText("");
      onClose();
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Ton avis" footer={<Button label="Publier" onPress={send} disabled={!rating || text.trim().length < 3} loading={busy} style={{ flex: 1 }} />}>
      <View style={{ flexDirection: "row", gap: 10, justifyContent: "center" }} accessibilityRole="adjustable" accessibilityLabel={`Note : ${rating} sur 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <PressableScale key={n} onPress={() => setRating(n)} scaleTo={0.85} accessibilityRole="button" accessibilityLabel={`${n} étoile${n > 1 ? "s" : ""}`} hitSlop={4}>
            <Icon name="star" size={38} color={n <= rating ? colors.gold : colors.borderHover} fill={n <= rating ? colors.gold : "none"} strokeWidth={1.5} />
          </PressableScale>
        ))}
      </View>
      <Field label="Ton expérience" placeholder="Accueil, ambiance, ce que tu as aimé…" value={text} onChangeText={setText} multiline maxLength={2000} style={{ minHeight: 110, textAlignVertical: "top" }} />
      {error ? <Notice icon="info">{error}</Notice> : null}
    </Sheet>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  itemIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.accentTint, alignItems: "center", justifyContent: "center" },
});
