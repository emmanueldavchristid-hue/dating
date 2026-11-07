"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "./AuthContext";
import { LocationProvider } from "./LocationContext";
import { MetaProvider } from "./MetaContext";
import { ToastProvider } from "./ToastContext";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MetaProvider>
      <AuthProvider>
        <LocationProvider>
          <ToastProvider>{children}</ToastProvider>
        </LocationProvider>
      </AuthProvider>
    </MetaProvider>
  );
}
