import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Linking, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { canManagePhotos, creditLabel, isCoverPhoto, MAX_CREDIT_LENGTH, PICKER_QUALITY, photoErrorMessage, realPhotos, uploadPlacePhoto, type PickedImage } from "@/lib/photos";
import { api } from "@/lib/api";
import type { Cover, PlacePhoto, User } from "@/lib/types";
import { colors, fonts, GUTTER, radius, space } from "@/theme/tokens";
import { Notice, useToast } from "./feedback";
import { Icon, type IconName } from "./Icon";
import { Sheet } from "./Sheet";
import { Button, Field, hapticLight, hapticSuccess, Pill, PressableScale, Toggle, Txt } from "./ui";

// ---------------------------------------------------------------------------
// Crédit discret (héros, galerie)

/** Légende de crédit — obligatoire pour les photos sous licence libre (Wikimedia Commons). */
export function PhotoCredit({ credit, style, testID = "photo-credit" }: { credit: string | null | undefined; style?: object; testID?: string }) {
  const label = creditLabel(credit);
  if (!label) return null;
  return (
    <View style={[s.credit, style]} pointerEvents="none" testID={testID} accessibilityLabel={`Crédit photo : ${label}`}>
      <Icon name="camera" size={10} color="rgba(244,241,234,0.75)" strokeWidth={2.2} />
      <Txt variant="caption" color="rgba(244,241,234,0.82)" numberOfLines={1} style={s.creditText}>
        {label}
      </Txt>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Galerie de la fiche

/**
 * Bande de photos. Les membres la voient dès qu'il y a au moins deux vraies photos ;
 * l'équipe (curateur, admin) la voit toujours, avec l'ajout et un menu par photo.
 */
export function PlaceGallery({
  photos,
  cover,
  user,
  selectedUrl,
  onSelect,
  onAdd,
  onManage,
}: {
  photos: PlacePhoto[];
  cover: Cover;
  user: Pick<User, "role"> | null | undefined;
  selectedUrl?: string | null;
  onSelect?: (photo: PlacePhoto) => void;
  onAdd?: () => void;
  onManage?: (photo: PlacePhoto) => void;
}) {
  const staff = canManagePhotos(user);
  const list = realPhotos(photos);
  if (!staff && list.length < 2) return null;
  return (
    <View style={{ marginTop: space[5], gap: space[3] }} testID="place-gallery">
      <View style={s.galleryHead}>
        <Txt variant="h3" accessibilityRole="header" style={{ flex: 1 }}>
          Photos
        </Txt>
        {list.length ? (
          <Txt variant="caption" color={colors.textSubtle}>
            {list.length} photo{list.length > 1 ? "s" : ""}
          </Txt>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 10 }}>
        {staff ? (
          <PressableScale onPress={onAdd} accessibilityRole="button" accessibilityLabel="Ajouter une photo" style={[s.thumb, s.addTile]} testID="add-photo">
            <View style={s.addIcon}>
              <Icon name="camera" size={20} color={colors.accent} />
            </View>
            <Txt variant="label" color={colors.text} style={{ textAlign: "center" }}>
              Ajouter une photo
            </Txt>
            <Txt variant="caption" color={colors.textSubtle} style={{ textAlign: "center" }}>
              Équipe uniquement
            </Txt>
          </PressableScale>
        ) : null}
        {list.map((ph, i) => {
          const isCover = isCoverPhoto(ph, cover);
          const selected = selectedUrl ? selectedUrl === ph.url : isCover;
          return (
            <View key={ph.id ?? `${ph.url}-${i}`} style={{ width: THUMB_W, gap: 6 }}>
              <PressableScale
                onPress={() => onSelect?.(ph)}
                onLongPress={staff && ph.id ? () => onManage?.(ph) : undefined}
                delayLongPress={350}
                accessibilityRole="imagebutton"
                accessibilityLabel={`${ph.alt}${isCover ? " (couverture)" : ""}`}
                accessibilityHint={staff && ph.id ? "Appui long : gérer la photo" : "Affiche la photo en grand"}
                style={[s.thumb, selected ? s.thumbSelected : null]}
                testID="gallery-photo"
              >
                <Image source={{ uri: ph.url! }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
                {isCover && staff ? <Pill label="Couverture" tone="glass" style={s.coverPill} /> : null}
                {staff && ph.id ? (
                  <PressableScale
                    onPress={() => {
                      hapticLight();
                      onManage?.(ph);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Gérer cette photo"
                    hitSlop={8}
                    style={s.moreBtn}
                    testID="photo-menu"
                  >
                    <Icon name="more" size={18} color={colors.text} strokeWidth={2.6} />
                  </PressableScale>
                ) : null}
              </PressableScale>
              {creditLabel(ph.credit) ? (
                <Txt variant="caption" color={colors.textSubtle} numberOfLines={1} style={{ fontSize: 10.5 }}>
                  {creditLabel(ph.credit)}
                </Txt>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
      {staff && !list.length ? (
        <View style={{ paddingHorizontal: GUTTER }}>
          <Txt variant="caption" color={colors.textSubtle}>
            Aucune photo pour l&apos;instant : la première envoyée deviendra la couverture.
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

const THUMB_W = 132;

// ---------------------------------------------------------------------------
// Ajout d'une photo (curateurs, admins)

type Source = "camera" | "library";

const PERMISSION_COPY: Record<Source, { denied: string; settings: string }> = {
  camera: {
    denied: "Sans accès à l'appareil photo, impossible de prendre la photo. Tu peux toujours en choisir une dans ta galerie.",
    settings: "L'accès à l'appareil photo a été refusé. Active-le dans les réglages du téléphone pour prendre une photo.",
  },
  library: {
    denied: "Sans accès à tes photos, impossible d'en choisir une. Tu peux aussi prendre une photo directement.",
    settings: "L'accès à tes photos a été refusé. Active-le dans les réglages du téléphone pour en choisir une.",
  },
};

export function AddPhotoSheet({
  visible,
  onClose,
  placeId,
  placeName,
  hasCover,
  onUploaded,
}: {
  visible: boolean;
  onClose: () => void;
  placeId: string;
  placeName: string;
  hasCover: boolean;
  onUploaded: (isCover: boolean) => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [asset, setAsset] = useState<PickedImage | null>(null);
  const [makeCover, setMakeCover] = useState(!hasCover);
  const [credit, setCredit] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settingsHint, setSettingsHint] = useState(false);
  const [picking, setPicking] = useState<Source | null>(null);

  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      // Nouvelle ouverture : on repart de zéro (état dérivé, sans effet).
      setAsset(null);
      setMakeCover(!hasCover);
      setCredit("");
      setProgress(null);
      setError(null);
      setSettingsHint(false);
    }
  }

  const uploading = progress != null;

  const ensurePermission = async (source: Source): Promise<boolean> => {
    const get = source === "camera" ? ImagePicker.getCameraPermissionsAsync : ImagePicker.getMediaLibraryPermissionsAsync;
    const ask = source === "camera" ? ImagePicker.requestCameraPermissionsAsync : ImagePicker.requestMediaLibraryPermissionsAsync;
    let perm = await get();
    if (perm.granted) return true;
    if (perm.canAskAgain !== false) perm = await ask();
    if (perm.granted) return true;
    const blocked = perm.canAskAgain === false;
    setSettingsHint(blocked && Platform.OS !== "web");
    setError(blocked ? PERMISSION_COPY[source].settings : PERMISSION_COPY[source].denied);
    return false;
  };

  const pick = async (source: Source) => {
    setError(null);
    setSettingsHint(false);
    setPicking(source);
    try {
      if (!(await ensurePermission(source))) return;
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        quality: PICKER_QUALITY,
        allowsEditing: false,
        exif: false,
        // iOS : transcode les HEIC en JPEG (le serveur accepte JPEG, PNG et WebP).
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      };
      const res = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0]!;
      setAsset({ uri: a.uri, fileName: a.fileName, mimeType: a.mimeType, fileSize: a.fileSize, file: a.file ?? null });
    } catch (e) {
      setError(photoErrorMessage(e));
    } finally {
      setPicking(null);
    }
  };

  const send = async () => {
    if (!asset || uploading) return;
    setError(null);
    setProgress(0);
    try {
      const res = await uploadPlacePhoto(placeId, asset, { credit, makeCover }, (r) => setProgress(r));
      hapticSuccess();
      toast(res.is_cover ? "Photo ajoutée en couverture" : "Photo ajoutée à la fiche", "camera");
      onUploaded(res.is_cover);
      onClose();
    } catch (e) {
      setError(photoErrorMessage(e));
    } finally {
      setProgress(null);
    }
  };

  const pct = progress != null ? Math.round(progress * 100) : 0;

  return (
    <Sheet
      visible={visible}
      onClose={uploading ? () => undefined : onClose}
      title="Ajouter une photo"
      subtitle={placeName}
      footer={
        asset ? (
          <>
            <Button label="Changer" variant="ghost" size="md" full={false} disabled={uploading} onPress={() => setAsset(null)} style={{ paddingHorizontal: 18 }} />
            <Button label={uploading ? `Envoi… ${pct} %` : "Publier la photo"} icon="send" size="md" style={{ flex: 1 }} onPress={send} disabled={uploading} />
          </>
        ) : undefined
      }
    >
      {error ? (
        <View style={{ gap: space[2] }}>
          <Notice icon="info" tone="info">
            {error}
          </Notice>
          {settingsHint ? <Button label="Ouvrir les réglages" icon="settings" variant="secondary" size="md" onPress={() => void Linking.openSettings()} /> : null}
        </View>
      ) : null}

      {!asset ? (
        <>
          <Txt variant="bodySm" color={colors.textMuted}>
            Une belle photo prise sur place aide les membres à choisir. Nous te demanderons l&apos;accès à l&apos;appareil photo ou à ta galerie, uniquement pour
            cette photo.
          </Txt>
          <SourceRow icon="camera" title="Prendre une photo" hint="Ouvre l'appareil photo" busy={picking === "camera"} onPress={() => pick("camera")} />
          <SourceRow icon="image" title="Choisir dans la galerie" hint="JPEG, PNG ou WebP · 8 Mo maximum" busy={picking === "library"} onPress={() => pick("library")} />
        </>
      ) : (
        <>
          <View style={s.preview}>
            <Image source={{ uri: asset.uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="Aperçu de la photo choisie" />
            {uploading ? (
              <View style={s.progressWrap} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }} testID="upload-progress">
                <View style={[s.progressBar, { width: `${Math.max(4, pct)}%` }]} />
              </View>
            ) : null}
          </View>
          <View style={s.switchRow}>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="title" style={{ fontFamily: fonts.bodySemi, fontSize: 15 }}>
                Utiliser comme photo principale
              </Txt>
              <Txt variant="caption" color={colors.textSubtle}>
                {hasCover ? "Remplace la couverture actuelle de la fiche." : "La fiche n'a pas encore de couverture."}
              </Txt>
            </View>
            <Toggle value={makeCover} onChange={setMakeCover} label="Utiliser comme photo principale" disabled={uploading} />
          </View>
          <Field
            label="Crédit (facultatif)"
            placeholder={user?.display_name ? `Photo : ${user.display_name}` : "Photo : ton nom"}
            value={credit}
            onChangeText={setCredit}
            maxLength={MAX_CREDIT_LENGTH}
            editable={!uploading}
            hint="Affiché discrètement sous la photo."
          />
        </>
      )}
    </Sheet>
  );
}

function SourceRow({ icon, title, hint, onPress, busy }: { icon: IconName; title: string; hint: string; onPress: () => void; busy?: boolean }) {
  return (
    <PressableScale onPress={onPress} disabled={busy} accessibilityRole="button" accessibilityLabel={title} accessibilityHint={hint} style={s.source}>
      <View style={s.sourceIcon}>
        <Icon name={icon} size={20} color={colors.accentSoft} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="title">{title}</Txt>
        <Txt variant="caption" color={colors.textSubtle}>
          {hint}
        </Txt>
      </View>
      <Icon name="chevronRight" size={18} color={colors.textSubtle} />
    </PressableScale>
  );
}

// ---------------------------------------------------------------------------
// Menu d'une photo (couverture, suppression)

export function PhotoActionsSheet({
  photo,
  isCover,
  onClose,
  onChanged,
}: {
  photo: PlacePhoto | null;
  isCover: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<"cover" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<PlacePhoto | null>(photo);
  // Garde la photo affichée pendant l'animation de fermeture ; repart de zéro pour une autre photo.
  if (photo && photo !== shown) {
    setShown(photo);
    setConfirm(false);
    setError(null);
  }

  const id = shown?.id;
  const run = async (kind: "cover" | "delete") => {
    if (!id) return;
    setBusy(kind);
    setError(null);
    try {
      if (kind === "cover") await api.photos.setCover(id);
      else await api.photos.remove(id);
      hapticSuccess();
      toast(kind === "cover" ? "Nouvelle photo de couverture" : "Photo supprimée", kind === "cover" ? "check" : "trash");
      onChanged();
      onClose();
    } catch (e) {
      setError(photoErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet visible={!!photo} onClose={busy ? () => undefined : onClose} title={confirm ? "Supprimer cette photo ?" : "Gérer la photo"}>
      {shown?.url ? (
        <View style={[s.preview, { aspectRatio: 16 / 9 }]}>
          <Image source={{ uri: shown.url }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel={shown.alt} />
          <PhotoCredit credit={shown.credit} style={s.creditOnImage} />
        </View>
      ) : null}
      {error ? (
        <Notice icon="info" tone="info">
          {error}
        </Notice>
      ) : null}
      {confirm ? (
        <>
          <Txt variant="bodySm" color={colors.textMuted}>
            La photo sera retirée de la fiche pour tout le monde. Cette action est définitive.
          </Txt>
          <View style={{ flexDirection: "row", gap: space[3] }}>
            <Button label="Annuler" variant="ghost" size="md" style={{ flex: 1 }} disabled={!!busy} onPress={() => setConfirm(false)} />
            <Button label="Supprimer" icon="trash" variant="danger" size="md" style={{ flex: 1 }} loading={busy === "delete"} onPress={() => run("delete")} />
          </View>
        </>
      ) : (
        <View style={{ gap: space[3] }}>
          <Button
            label={isCover ? "Déjà en couverture" : "Définir comme couverture"}
            icon="image"
            variant="secondary"
            size="md"
            disabled={isCover || !id}
            loading={busy === "cover"}
            onPress={() => run("cover")}
          />
          <Button label="Supprimer" icon="trash" variant="danger" size="md" disabled={!id || !!busy} onPress={() => setConfirm(true)} />
        </View>
      )}
    </Sheet>
  );
}

const s = StyleSheet.create({
  credit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: "rgba(14,15,19,0.55)",
    maxWidth: "92%",
  },
  creditText: { fontSize: 10.5, lineHeight: 14, flexShrink: 1 },
  creditOnImage: { position: "absolute", right: 8, bottom: 8 },
  galleryHead: { flexDirection: "row", alignItems: "center", paddingHorizontal: GUTTER },
  thumb: { width: THUMB_W, height: 100, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  thumbSelected: { borderColor: colors.accent, borderWidth: 2 },
  addTile: { alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 8, borderStyle: "dashed", borderColor: "rgba(255,138,61,0.45)", backgroundColor: colors.accentTint },
  addIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,138,61,0.16)" },
  coverPill: { position: "absolute", left: 6, bottom: 6, paddingHorizontal: 7, paddingVertical: 2 },
  moreBtn: { position: "absolute", top: 6, right: 6, width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(14,15,19,0.7)" },
  source: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  sourceIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.accentTint },
  preview: { width: "100%", aspectRatio: 4 / 3, borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.surface2 },
  progressWrap: { position: "absolute", left: 12, right: 12, bottom: 12, height: 6, borderRadius: 3, backgroundColor: "rgba(14,15,19,0.6)", overflow: "hidden" },
  progressBar: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
});
