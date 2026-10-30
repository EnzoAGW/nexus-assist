import type { Intent } from "@/lib/domain/trace";
import type { Classification } from "./classification";
import { HANDOFF, uncertainReason } from "@/lib/domain/handoff"

export const TOOL_NAMES = ["askUser", "proposeTicket", "proposeTicketUpdate"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];
/** Abaixo disto o agent não decide sozinho: transfere para um analista. */
export const CONFIDENCE_THRESHOLD = 0.55;
export const CONFIRM_THRESHOLD = 0.8;


export type Route =
  | { kind: "handoff"; reason: string; ruleId: string }
  | { kind: "out_of_scope" }
  | { kind: "confirm" }
  | { kind: "use_buttons" }
  | { kind: "agent"; toolset: readonly ToolName[] };

const TOOLSET: Record<Intent, readonly ToolName[]> = {
  faq: [],
  ticket_lookup: ["askUser"],
  ticket_create: ["proposeTicket", "askUser"],
  ticket_update: ["proposeTicketUpdate", "askUser"],
  clarification: ["askUser"],
  smalltalk: [],
  confirmation: ["askUser"],
  handoff_request: [],
  out_of_scope: [],
};


export function routeMessage(c: Classification, ctx: { hasPendingAction: boolean }): Route {
  if (c.confidence < CONFIDENCE_THRESHOLD) {
    return {
      kind: "handoff",
      reason: uncertainReason(c.confidence),
      ruleId: "low-confidence",
    };
  }
  if (c.intent === "handoff_request") {
    return { kind: "handoff", reason: HANDOFF.requested, ruleId: "user-requested-handoff" };
  }
  if (c.intent === "out_of_scope") return { kind: "out_of_scope" };

  if (c.intent === "confirmation" && ctx.hasPendingAction) {
    return c.confidence >= CONFIRM_THRESHOLD ? { kind: "confirm" } : { kind: "use_buttons" };
  }
  return { kind: "agent", toolset: TOOLSET[c.intent] };
}