import { type ActivityCreate, MANUAL_ACTIVITY_KINDS } from "@crm/shared";
import { Bot, CalendarCheck, FileText, LifeBuoy, Mail, MessageCircle, Phone, StickyNote, Wallet } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Input, Select } from "../../../components/ui/Field";
import { Empty, ErrorBox, Skeleton } from "../../../components/ui/States";
import { when } from "../../../lib/format";
import { useActivities, useAddActivity } from "../api";

const KIND_LABEL: Record<ActivityCreate["kind"], string> = {
  nota: "Nota",
  llamada: "Llamada",
  reunion: "Reunión",
  whatsapp: "WhatsApp",
  email: "Email",
};

const ICON: Record<string, typeof StickyNote> = {
  nota: StickyNote,
  llamada: Phone,
  reunion: CalendarCheck,
  whatsapp: MessageCircle,
  email: Mail,
  ticket: LifeBuoy,
  cobro: Wallet,
  factura: FileText,
  sistema: Bot,
};

export function ActivityTab({ clientId }: { clientId: string }) {
  const feed = useActivities(clientId);
  const add = useAddActivity(clientId);
  const [kind, setKind] = useState<ActivityCreate["kind"]>("nota");
  const [body, setBody] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    add.mutate({ kind, body }, { onSuccess: () => setBody("") });
  };

  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Card className="flex flex-col gap-4 p-5">
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <label className="w-36">
          <span className="sr-only">Tipo</span>
          <Select value={kind} onChange={(e) => setKind(e.target.value as ActivityCreate["kind"])}>
            {MANUAL_ACTIVITY_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </label>
        <label className="min-w-[220px] flex-1">
          <span className="sr-only">Qué pasó</span>
          <Input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            placeholder="¿Qué pasó? Ej: confirmaron que transfieren el viernes"
          />
        </label>
        <Button type="submit" disabled={add.isPending || !body.trim()}>
          Guardar
        </Button>
      </form>
      {add.error && <ErrorBox error={add.error} />}

      {feed.error && <ErrorBox error={feed.error} onRetry={() => void feed.refetch()} />}
      {feed.isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : items.length === 0 ? (
        <Empty>Todavía no hay actividad con este cliente.</Empty>
      ) : (
        <ol className="flex flex-col">
          {items.map((a) => {
            const Icon = ICON[a.kind] ?? StickyNote;
            return (
              <li key={a.id} className="flex gap-3 border-b border-slate-100 py-3 last:border-0">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                  <Icon size={15} aria-hidden />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <strong className="text-sm">{a.title}</strong>
                    <span className="text-xs text-muted">
                      {when(a.occurredAt)} · {a.actorName ?? "automático"}
                    </span>
                  </div>
                  {a.body && <p className="mt-0.5 text-sm whitespace-pre-line text-slate-700">{a.body}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {feed.hasNextPage && (
        <Button variant="secondary" size="sm" className="self-center" onClick={() => void feed.fetchNextPage()} disabled={feed.isFetchingNextPage}>
          {feed.isFetchingNextPage ? "Cargando…" : "Ver anteriores"}
        </Button>
      )}
    </Card>
  );
}
