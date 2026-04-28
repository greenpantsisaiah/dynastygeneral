"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/analytics";

/**
 * Fire a GTM event once on mount from a server component tree.
 * Renders nothing. Dedupes by serialized payload so React strict-mode
 * double-mounts don't double-fire.
 */
export function TrackEvent({ payload }: { payload: Parameters<typeof track>[0] }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    track(payload);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
