import { useSyncExternalStore } from "react";
import type { AdminMe } from "./api";

/** The signed-in organizer / super admin, loaded once by the admin layout and read by the header. */
let current: AdminMe | null = null;
const listeners = new Set<() => void>();

export function setAdminMe(me: AdminMe | null) {
  current = me;
  listeners.forEach((l) => l());
}

export function useAdminMe(): AdminMe | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
}
