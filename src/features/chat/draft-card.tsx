import { Button } from "@/components/ui/button";
import { IMPACT_LABEL, PRIORITY_LABEL } from "@/lib/domain/model/enums";
import type { TicketDraft } from "@/lib/domain/model/schemas";
import { formatDateTime } from "@/lib/domain/utils/format";
import { TYPE_LABEL } from "./ticket-card";

interface Actions {
  active: boolean;
  busy: boolean;
  onConfirm(): void;
  onEdit(): void;
  onCancel(): void;
}

function DraftActions({ active, busy, onConfirm, onEdit, onCancel }: Actions) {
  if (!active) return <p className="mt-3 text-xs text-slate-500">Rascunho encerrado.</p>;
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Button loading={busy} onClick={onConfirm} className="h-9">Confirmar</Button>
      <Button variant="secondary" disabled={busy} onClick={onEdit} className="h-9">Editar</Button>
      <Button variant="ghost" disabled={busy} onClick={onCancel} className="h-9">Cancelar</Button>
    </div>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

export function DraftCard({ draft, dueAt, priorityReason, ...actions }: { draft: TicketDraft; dueAt: string; priorityReason: string } & Actions) {
  return (
    <article aria-label="Rascunho de chamado" className="mt-2 w-full max-w-md rounded-xl border border-brand-100 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">Rascunho de chamado</p>
      <h3 className="mt-1 text-sm font-semibold">{draft.title}</h3>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <Field label="Descrição" wide>{draft.description}</Field>
        <Field label="Tipo">{TYPE_LABEL[draft.type]}</Field>
        <Field label="Categoria">{draft.category}</Field>
        <Field label="Prioridade" wide>
          {PRIORITY_LABEL[draft.priority]} · primeira resposta até {formatDateTime(new Date(dueAt))}
          <span className="block font-normal text-slate-500">{priorityReason}</span>
        </Field>
        <Field label="Quem é afetado" wide>{IMPACT_LABEL[draft.impact]}</Field>
      </dl>
      <DraftActions {...actions} />
    </article>
  );
}

export function UpdateDraftCard({ ticketId, note, reopen, ...actions }: { ticketId: string; note: string; reopen: boolean } & Actions) {
  return (
    <article aria-label="Rascunho de atualização" className="mt-2 w-full max-w-md rounded-xl border border-brand-100 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">{reopen ? "Reabertura" : "Atualização"} do {ticketId}</p>
      <p className="mt-2 text-sm">{note}</p>
      {reopen && <p className="mt-2 text-xs text-slate-500">O chamado foi resolvido há menos de 7 dias, então pode ser reaberto. O prazo de resposta recomeça.</p>}
      <DraftActions {...actions} />
    </article>
  );
}