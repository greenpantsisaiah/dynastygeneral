/**
 * Canonical per-pick EV. ONE implementation of the EV-bank math
 * (value / 100) * (pick_no - adp), so a calibration change ripples to
 * every surface that shows an EV delta: the EV bank (per-pick + league),
 * the what-if readout, the candidate cards on The Call, and the
 * companion debate beat. Registered in CANONICAL_SOURCES.md.
 *
 * `perPickEv` returns the RAW number. Rounding is the caller's
 * responsibility: the EV bank rounds the summed total (not each
 * element) while per-candidate surfaces round each value, so the
 * canonical stays unrounded and exposes the shared `round2` for the
 * callers that round. The ADP-noise envelope is expressed by passing
 * a shifted adp (`adp + shift`), not a separate function.
 */
export function perPickEv(value: number, pickNo: number, adp: number): number {
  return (value / 100) * (pickNo - adp);
}

/** Round to 2 decimal places. Shared by every EV consumer. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
