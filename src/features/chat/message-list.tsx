"use client";

import { useEffect, useRef } from "react";
import type { MessageDto } from "@/server/serialize";
import { MessageBubble } from "./message-bubble";
import { RichText } from "./rich-text";
import type { BubbleContext } from "./types";

const SUGGESTIONS = ["Minha VPN não conecta", "Como estão meus chamados?", "Preciso de um segundo monitor"];

function EmptyState({ firstName, onPick, enabled }: { firstName: string; onPick(text: string): void; enabled: boolean }) {
  return (
    <div className="mx-auto mt-10 max-w-md text-center">
      <h2 className="text-xl font-semibold">Olá{firstName ? `, ${firstName}` : ""}! Como posso ajudar?</h2>
      <p className="mt-2 text-sm text-slate-600">Descreva o que está acontecendo com as suas palavras. Eu consulto seus chamados, busco na central de ajuda e chamo um analista quando preciso.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" disabled={!enabled} onClick={() => onPick(s)} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function Pending({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex max-w-[85%] flex-col items-start">
      <p className="mb-1 text-xs font-medium text-slate-500">Nexo Assist</p>
      <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-2.5" aria-busy="true">
        {children ?? (
          <span className="flex items-center gap-1" role="status" aria-label="O assistente está respondendo">
            {[0, 150, 300].map((d) => (
              <span key={d} className="size-1.5 animate-pulse rounded-full bg-slate-400" style={{ animationDelay: `${d}ms` }} />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

export function MessageList({
  messages, streamingText, thinking, ctx, firstName,
}: {
  messages: MessageDto[];
  streamingText: string | null;
  thinking: boolean;
  ctx: BubbleContext;
  firstName: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const onScroll = () => {
    const el = scroller.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; // só acompanha se o usuário está no fim
  };
  useEffect(() => {
    if (stick.current) end.current?.scrollIntoView({ block: "end" });
  }, [messages, streamingText, thinking]);

  return (
    <div ref={scroller} onScroll={onScroll} className="h-full overflow-y-auto px-4 py-6 sm:px-8">
      <div role="log" aria-label="Conversa com o Nexo Assist" className="mx-auto flex max-w-3xl flex-col gap-4">
        {messages.length === 0 && !thinking && <EmptyState firstName={firstName} onPick={ctx.handlers.onQuickReply} enabled={!ctx.busy} />}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} ctx={ctx} />
        ))}
        {streamingText ? <Pending><RichText text={streamingText} /></Pending> : thinking ? <Pending /> : null}
        <div ref={end} />
      </div>
    </div>
  );
}