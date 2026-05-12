/**
 * Last-visit digest banner. Renders at the top of the hub when the
 * user has a prior fingerprint cookie + at least one signal has
 * moved since the last visit.
 *
 * Two surfaces, both small and dismissible-by-time (next render
 * naturally rotates):
 *
 *   1. Plan-disruption acknowledgment (when a planned target was
 *      sniped between visits). Warning-tinted; lands first since
 *      it's the most emotionally relevant continuity beat.
 *
 *   2. Digest line (small, muted). "Since 11 minutes ago: 3 picks
 *      made, standing call shifted, EV bank +0.4."
 *
 * Per REDESIGN_INTENTIONS principle 11 (stable shape, variable
 * content, visible delta): the hub is a workspace returning users
 * live in, not a magazine. Surface what changed in 1.5 seconds.
 *
 * Voice A throughout. Terse, decisive, no decoration.
 */

export type LastVisitDigestProps = {
  digestLine: string | null;
  disruptionAcknowledgment: string | null;
};

export function LastVisitDigest({
  digestLine,
  disruptionAcknowledgment,
}: LastVisitDigestProps) {
  if (!digestLine && !disruptionAcknowledgment) return null;
  return (
    <div className="mt-4 space-y-2">
      {disruptionAcknowledgment && (
        <div className="rounded-md border border-warning/50 bg-warning/5 px-4 py-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-warning">
            Plan disruption
          </div>
          <p className="mt-1 text-sm text-foreground leading-snug">
            {disruptionAcknowledgment}
          </p>
        </div>
      )}
      {digestLine && (
        <div className="px-1">
          <p className="font-mono text-[11px] leading-snug text-muted-2">
            {digestLine}
          </p>
        </div>
      )}
    </div>
  );
}
