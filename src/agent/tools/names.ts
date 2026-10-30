export const TOOL_NAMES = ["askUser", "proposeTicket", "proposeTicketUpdate"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];