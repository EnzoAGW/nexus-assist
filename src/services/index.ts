import { db } from "@/db/client";
import { env } from "@/lib/env";
import { createAnalystConsoleService } from "./analyst-console";
import { createConversationService } from "./conversations";
import { createKnowledgeBaseService } from "./knowledge-base";
import { defaultResilience } from "./legacy";
import { createTicketService } from "./tickets";
import { createUserService } from "./users";

export const services = {
  users: createUserService(db),
  tickets: createTicketService(db, { resilience: defaultResilience(env.TICKETS_FAILURE_RATE) }),
  knowledgeBase: createKnowledgeBaseService(db),
  conversations: createConversationService(db, { maxMessagesPerSession: env.MAX_MESSAGES_PER_SESSION }),
  analystConsole: createAnalystConsoleService(db),
};

export type Services = typeof services;