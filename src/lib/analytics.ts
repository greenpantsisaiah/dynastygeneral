"use client";

import { sendGTMEvent } from "@next/third-parties/google";

type DGEvent =
  | { event: "sleeper_username_submit"; username: string }
  | {
      event: "leagues_fetched";
      username: string;
      dynasty_count: number;
      other_count: number;
    }
  | {
      event: "league_opened";
      league_id: string;
      season: number;
      dynasty: boolean;
    }
  | { event: "coach_message_sent"; league_id: string; turn_count: number }
  | { event: "briefing_generated"; league_id: string }
  | {
      event: "trade_evaluated";
      league_id: string;
      verdict?: "accept" | "counter" | "decline" | "wait";
    }
  | {
      event: "trade_attack_built";
      league_id: string;
      target_type: "player" | "manager" | "pick";
    }
  | {
      event: "trade_verdict_shared";
      league_id: string;
      mode: "incoming" | "outbound";
    }
  | { event: "scout_report_run"; scouted_username: string }
  | { event: "soundboard_doctrine_saved"; doctrine: string }
  | { event: "trial_started"; plan: "pro" }
  | {
      event: "pro_subscribed";
      plan: "pro_annual" | "pro_monthly";
      value: number;
      currency: "USD";
    }
  | { event: "day_pass_purchased"; value: number; currency: "USD" };

export function track(payload: DGEvent) {
  sendGTMEvent(payload);
}
