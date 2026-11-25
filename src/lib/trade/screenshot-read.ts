import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { recordSpend } from "@/lib/budget";
import {
  ScreenshotReadError,
  type ExtractedTrade,
} from "./screenshot-match";

/**
 * Trade screenshot reader (vision). Reads ONLY what the image prints:
 * manager handles, abbreviated player names with position + team tags,
 * and pick labels, grouped by the manager who RECEIVES them. It does not
 * value or judge the trade; that stays with the trade engine after the
 * user confirms the read. Name resolution and side assignment happen in
 * `screenshot-match.ts` against the league's real rosters.
 *
 * Server-only. One vision call per upload, low effort (transcription,
 * not reasoning), structured output so the shape is guaranteed.
 */

export const SCREENSHOT_MODEL = "claude-opus-5-5";

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

const READ_INSTRUCTIONS = `You transcribe a fantasy football trade from a screenshot of the Sleeper app. Transcribe only; do not evaluate the trade.

Sleeper shows trades in two layouts:
1. League chat trade card: "@userA has proposed a trade in <League>", then a box with one heading per manager ("@userA", "@userB"). The assets listed under a manager's heading are the assets THAT MANAGER RECEIVES. Picks print like "2028 2nd Rd (jwatts0723)", where the name in parentheses is the pick's original owner.
2. Trade offer screen: one section per manager with RECEIVES and SENDS columns. A section's header may show the manager's handle, or be cut off at the top of the screenshot (then use null). Picks print like "2028 2nd Rd" with an optional "via watticusgg" line naming the original owner. The same trade often appears from both managers' perspectives; report each manager ONCE with what they receive.

Output one party per manager in the trade, with every asset that manager receives. Each manager's received assets must appear exactly once across the whole output.

For each asset:
- kind: "player" or "pick".
- name: the player name exactly as printed (for example "C. Stroud"), or null for picks.
- position / team: as printed (for example "QB", "HOU"), else null.
- season / round: for picks, the year and round number (2nd Rd -> 2), else null.
- original_owner: for picks, the handle in parentheses or after "via", without "@", else null.
- raw_text: the asset's full printed text on one line.

manager: the handle without "@", or null if it is not visible.
format: "chat_card", "offer_screen", "other" (a different trade layout), or "not_a_trade" (no trade in the image; then parties is empty).
league_name: the league name if printed, else null.`;

const assetSchema = z.object({
  kind: z.enum(["player", "pick"]),
  name: z.string().nullable(),
  position: z.string().nullable(),
  team: z.string().nullable(),
  season: z.number().int().nullable(),
  round: z.number().int().nullable(),
  original_owner: z.string().nullable(),
  raw_text: z.string(),
});

const extractedSchema = z.object({
  format: z.enum(["chat_card", "offer_screen", "other", "not_a_trade"]),
  league_name: z.string().nullable(),
  parties: z
    .array(
      z.object({
        manager: z.string().nullable(),
        receives: z.array(assetSchema).max(30),
      }),
    )
    .max(6),
});

const nullable = (type: string) => ({ type: [type, "null"] });

const EXTRACT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["format", "league_name", "parties"],
  properties: {
    format: {
      type: "string",
      enum: ["chat_card", "offer_screen", "other", "not_a_trade"],
    },
    league_name: nullable("string"),
    parties: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["manager", "receives"],
        properties: {
          manager: nullable("string"),
          receives: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "kind",
                "name",
                "position",
                "team",
                "season",
                "round",
                "original_owner",
                "raw_text",
              ],
              properties: {
                kind: { type: "string", enum: ["player", "pick"] },
                name: nullable("string"),
                position: nullable("string"),
                team: nullable("string"),
                season: nullable("integer"),
                round: nullable("integer"),
                original_owner: nullable("string"),
                raw_text: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  // 40s per request (under the route's 45s maxDuration) so a slow call
  // surfaces as a clean error instead of a hard function kill.
  client ??= new Anthropic({ timeout: 40_000, maxRetries: 1 });
  return client;
}

/** Dev stub: the founder's chat-card screenshot, so the UI runs offline. */
const STUB: ExtractedTrade = {
  format: "chat_card",
  league_name: "Dynasty Disasters",
  parties: [
    {
      manager: "jwatts0723",
      receives: [
        { kind: "player", name: "C. Stroud", position: "QB", team: "HOU", season: null, round: null, original_owner: null, raw_text: "C. Stroud QB - HOU" },
      ],
    },
    {
      manager: "izzydabomb",
      receives: [
        { kind: "player", name: "K. Shakir", position: "WR", team: "BUF", season: null, round: null, original_owner: null, raw_text: "K. Shakir WR - BUF" },
        { kind: "pick", name: null, position: null, team: null, season: 2028, round: 2, original_owner: "jwatts0723", raw_text: "2028 2nd Rd (jwatts0723)" },
      ],
    },
  ],
};

export async function readTradeScreenshot(args: {
  base64: string;
  mediaType: AllowedImageType;
}): Promise<{ extracted: ExtractedTrade; mode: "live" | "stub" }> {
  const anthropic = getClient();
  if (!anthropic) return { extracted: STUB, mode: "stub" };

  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: SCREENSHOT_MODEL,
      max_tokens: 4000,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: EXTRACT_JSON_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: args.mediaType, data: args.base64 },
            },
            { type: "text", text: READ_INSTRUCTIONS },
          ],
        },
      ],
    });
  } catch (err) {
    if (err instanceof Anthropic.APIConnectionTimeoutError) {
      throw new ScreenshotReadError("Reading the screenshot timed out. Try again.");
    }
    if (err instanceof Anthropic.BadRequestError) {
      console.error("[trade-screenshot] bad request", err.message, err.stack);
      throw new ScreenshotReadError("That image could not be read. Try a PNG or JPEG screenshot.");
    }
    throw err;
  }

  recordSpend({
    model: SCREENSHOT_MODEL,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  }).catch(() => {});

  if (response.stop_reason === "refusal") {
    throw new ScreenshotReadError("The screenshot reader declined this image. Enter the trade by hand.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new ScreenshotReadError("The trade in this screenshot was too long to read. Crop it and retry.");
  }
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    console.error("[trade-screenshot] non-JSON output", (err as Error).message);
    throw new ScreenshotReadError("Could not read a trade from that image.");
  }
  const parsed = extractedSchema.safeParse(json);
  if (!parsed.success) {
    console.error("[trade-screenshot] schema mismatch", parsed.error.message);
    throw new ScreenshotReadError("Could not read a trade from that image.");
  }
  if (parsed.data.format === "not_a_trade" || parsed.data.parties.length === 0) {
    throw new ScreenshotReadError("No trade found in that screenshot. Use a Sleeper trade card or offer screen.");
  }
  return { extracted: parsed.data, mode: "live" };
}
