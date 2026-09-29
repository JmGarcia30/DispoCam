"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  activateServiceWorkerUpdate,
  registerDispoCamServiceWorker,
  sendLoadedAssetsToServiceWorker,
} from "@/lib/pwa/service-worker";

interface PwaContextValue {
  updateAvailable: boolean;
  applyUpdate: (safeToReload: boolean) => boolean;
}

const PwaContext = createContext<PwaContextValue>({ updateAvailable: false, applyUpdate: () => false });

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [waitingRegistration, setWaitingRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    let active = true;
    const cacheAssets = () => sendLoadedAssetsToServiceWorker();
    navigator.serviceWorker?.addEventListener("controllerchange", cacheAssets);
    void registerDispoCamServiceWorker({
      onUpdateAvailable: (registration) => {
        if (active) setWaitingRegistration(registration);
      },
      onBackgroundSyncRequested: () => window.dispatchEvent(new Event("dispocam:background-sync")),
    }).then(async () => {
      await navigator.serviceWorker?.ready;
      cacheAssets();
    }).catch(console.error);
    return () => {
      active = false;
      navigator.serviceWorker?.removeEventListener("controllerchange", cacheAssets);
    };
  }, []);

  const applyUpdate = useCallback((safeToReload: boolean) => {
    if (!waitingRegistration) return false;
    return activateServiceWorkerUpdate(waitingRegistration, safeToReload);
  }, [waitingRegistration]);

  return (
    <PwaContext.Provider value={{ updateAvailable: waitingRegistration !== null, applyUpdate }}>
      {children}
    </PwaContext.Provider>
  );
}

export function usePwaUpdate() {
  return useContext(PwaContext);
}
