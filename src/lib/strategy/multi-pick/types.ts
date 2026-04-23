/**
 * Multi-pick draft rollout types.
 *
 * Different question than the per-pick Decision card. The Decision card
 * answers "what should I take RIGHT NOW." The multi-pick rollout
 * answers "if I take Bijan now, what does the rest of my draft look
 * like, and how do those picks fit together?"
 */

export type MultiPickEntry = {
  // The user's pick (label and ordinal in the draft).
  pick_label: string;
  pick_no: number;
  // Picks remaining from "now" until this pick lands.
  picks_until: number;
  // Top recommendation at this pick under the depletion forecast.
  primary: {
    name: string;
    position: string;
    team: string | null;
    age: number | null;
    reason: string;
  };
  // Two alternates the model also rates highly. Surfacing alternates
  // matters because pool drift is uncertain; the user should know what
  // their fallback looks like if the primary gets sniped.
  alternates: Array<{
    name: string;
    position: string;
    team: string | null;
    age: number | null;
  }>;
  // Confidence drops as we project further out. 1.0 = "this player will
  // almost certainly be there." 0.3 = "lottery ticket; pool is wide
  // open by then."
  confidence: number;
};

export type MultiPickPlan = {
  picks: MultiPickEntry[];
  // 2-3 sentence narrative connecting the picks. Templated in v1; a
  // future LLM-backed version would tell a sharper story.
  thread: string;
  // Position counts the plan adds to the user's roster, summed across
  // all the recommended picks. Surfaces "you'd add 2 RB / 1 WR / 1 TE."
  position_summary: Array<{ position: string; count: number }>;
};
