"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { canReachApplication, type NetworkState } from "@/lib/network/connectivity";

export function useNetworkStatus(probeIntervalMs = 30_000) {
  const [state, setState] = useState<NetworkState>("checking");
  const activeCheck = useRef<Promise<boolean> | null>(null);

  const check = useCallback(() => {
    if (activeCheck.current) return activeCheck.current;
    setState("checking");
    const probe = canReachApplication().then((reachable) => {
      setState(reachable ? "online" : "offline");
      return reachable;
    }).finally(() => {
      activeCheck.current = null;
    });
    activeCheck.current = probe;
    return probe;
  }, []);

  useEffect(() => {
    const initialCheck = window.setTimeout(() => void check(), 0);
    const onOffline = () => setState("offline");
    const onOnline = () => void check();
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    const timer = window.setInterval(() => void check(), probeIntervalMs);
    return () => {
      window.clearTimeout(initialCheck);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      window.clearInterval(timer);
    };
  }, [check, probeIntervalMs]);

  return { state, online: state === "online", offline: state === "offline", check };
}
