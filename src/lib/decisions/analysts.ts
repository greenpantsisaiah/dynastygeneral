/**
 * The three analysts' names, initials and colors: one table for every
 * surface that shows them (/home cards, the trade check).
 */
import type { VoiceName } from "@/lib/strategy/verdict/voices";

export const ANALYST: Record<VoiceName, { name: string; letter: string; color: string }> = {
  strategist: { name: "Strategist", letter: "S", color: "#7C5CC4" },
  moneyball: { name: "Moneyballer", letter: "M", color: "#2A6FB8" },
  gambler: { name: "Gambler", letter: "G", color: "#C76A12" },
};
