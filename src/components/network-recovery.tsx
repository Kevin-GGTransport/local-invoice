"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { WifiOff } from "lucide-react";

import { SERVER_TABLE_REFRESH_EVENT } from "@/components/data-table/use-server-table";

const CHUNK_FAILURE_PATTERN =
  /(failed to fetch dynamically imported module|importing a module script failed|error loading chunk|loading chunk [\w.-]+ failed|dynamically imported module)/i;

function errorMessage(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  return "";
}

export function isChunkLoadFailure(value: unknown): boolean {
  return CHUNK_FAILURE_PATTERN.test(errorMessage(value));
}

export function NetworkRecovery() {
  const router = useRouter();
  const [offline, setOffline] = React.useState(false);
  const offlineRef = React.useRef(false);
  const pendingHardReloadRef = React.useRef(false);
  const hardReloadUsedRef = React.useRef(false);

  React.useEffect(() => {
    const markOffline = () => {
      offlineRef.current = true;
      setOffline(true);
    };

    const markOnline = () => {
      offlineRef.current = false;
      setOffline(false);

      // Some brief failures do not emit an offline event. Always revalidate the
      // current server-rendered route; mounted client tables listen for the same
      // event and reload their bounded API queries.
      router.refresh();
      window.dispatchEvent(new Event(SERVER_TABLE_REFRESH_EVENT));

      if (pendingHardReloadRef.current) {
        pendingHardReloadRef.current = false;
        window.location.reload();
      }
    };

    const handleAssetFailure = (event: Event) => {
      if (hardReloadUsedRef.current) return;

      const candidate =
        event instanceof ErrorEvent
          ? event.error ?? event.message
          : (event as PromiseRejectionEvent).reason;
      if (!isChunkLoadFailure(candidate)) return;

      hardReloadUsedRef.current = true;
      // A failed dynamic import is often cached by the browser after a network
      // drop. A single hard reload after connectivity returns clears that state.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        pendingHardReloadRef.current = true;
        return;
      }
      window.location.reload();
    };

    if (typeof navigator !== "undefined" && navigator.onLine === false) markOffline();
    window.addEventListener("offline", markOffline);
    window.addEventListener("online", markOnline);
    window.addEventListener("error", handleAssetFailure);
    window.addEventListener("unhandledrejection", handleAssetFailure);

    return () => {
      window.removeEventListener("offline", markOffline);
      window.removeEventListener("online", markOnline);
      window.removeEventListener("error", handleAssetFailure);
      window.removeEventListener("unhandledrejection", handleAssetFailure);
    };
  }, [router]);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden="true" />
      当前网络已断开，页面会保留已加载数据；网络恢复后将自动刷新。
    </div>
  );
}
