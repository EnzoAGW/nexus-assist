export const CONSOLE_FILTERS = ["all", "waiting", "mine", "agent", "closed"] as const;
export type ConsoleFilter = (typeof CONSOLE_FILTERS)[number];

export const FILTER_LABEL: Record<ConsoleFilter, string> = {
  all: "Todas",
  waiting: "Na fila",
  mine: "Minhas",
  agent: "Com o agent",
  closed: "Encerradas",
};