import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme, View } from "react-native";
import * as SystemUI from "expo-system-ui";
import { readJson, writeJson } from "@/lib/storage";
import { applyTheme, colors, type ThemeMode } from "@/theme/tokens";

/** Choix de l'utilisateur : sombre (par défaut), clair, ou comme le téléphone. */
export type ThemeChoice = "dark" | "light" | "system";
const KEY = "sortie.theme";

interface AppearanceValue {
  choice: ThemeChoice;
  mode: ThemeMode;
  setChoice: (c: ThemeChoice) => void;
}

const Ctx = createContext<AppearanceValue>({ choice: "dark", mode: "dark", setChoice: () => {} });

/**
 * Applique le thème choisi avant d'afficher l'app, puis la remonte entièrement quand il change :
 * tous les styles (créés avec `themed()`) et toutes les couleurs suivent.
 */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [choice, setChoiceState] = useState<ThemeChoice | null>(null);

  useEffect(() => {
    readJson<ThemeChoice>(KEY).then((c) => setChoiceState(c === "light" || c === "system" ? c : "dark"));
  }, []);

  const mode: ThemeMode = choice === "system" ? (system === "light" ? "light" : "dark") : choice === "light" ? "light" : "dark";
  if (choice) applyTheme(mode); // avant le rendu des enfants : leurs styles lisent la bonne palette

  useEffect(() => {
    if (choice) SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
  }, [choice, mode]);

  const setChoice = useCallback((c: ThemeChoice) => {
    setChoiceState(c);
    void writeJson(KEY, c);
  }, []);
  const value = useMemo(() => ({ choice: choice ?? "dark", mode, setChoice }), [choice, mode, setChoice]);

  if (!choice) return <View style={{ flex: 1, backgroundColor: "#0E0F13" }} />;
  return (
    <Ctx.Provider value={value}>
      <Fragment key={mode}>{children}</Fragment>
    </Ctx.Provider>
  );
}

export const useAppearance = () => useContext(Ctx);
