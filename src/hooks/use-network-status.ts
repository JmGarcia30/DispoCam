"use client";

import { useCallback, useEffect, useState } from "react";
import { canReachApplication, type NetworkState } from "@/lib/network/connectivity";

export function useNetworkStatus(probeIntervalMs = 30_000) {
  const [state, setState] = useState<NetworkState>("checking");

  const check = useCallback(async () => {
    setState((current) => (current === "offline" ? "checking" : current));
    const reachable = await canReachApplication();
    setState(reachable ? "online" : "offline");
    return reachable;
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
