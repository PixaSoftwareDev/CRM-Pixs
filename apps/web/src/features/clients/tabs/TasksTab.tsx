import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Chip } from "../../../components/ui/Chip";
import { Notice, useNotice } from "../../../components/ui/Notice";
import { Empty, ErrorBox, Skeleton } from "../../../components/ui/States";
import { when } from "../../../lib/format";
import { TASK_STATUS } from "../../tasks/labels";
import { TaskDialog } from "../../tasks/TaskDialog";
import { type TaskDraft, TaskFormDialog } from "../../tasks/TaskFormDialog";
import { nextSlot, todayAr } from "../../tasks/time";
import { useClientTasks } from "../api";

export function TasksTab({ clientId }: { clientId: string }) {
  const tasks = useClientTasks(clientId);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const notice = useNotice();

  let body: React.ReactNode;
  if (tasks.error) body = <ErrorBox error={tasks.error} onRetry={() => void tasks.refetch()} />;
  else if (tasks.isPending) body = <Skeleton className="h-24" />;
  else if (tasks.data.length === 0) body = <Empty>No hay tareas para este cliente.</Empty>;
  else
    body = (
      <Card className="divide-y divide-slate-100">
        {tasks.data.map((t) => {
          const st = TASK_STATUS[t.status];
          const closed = t.status === "hecha" || t.status === "cancelada";
          const overdue = !closed && t.startsAt !== null && new Date(t.startsAt) < new Date();
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setOpenId(t.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: t.typeColor }} aria-hidden />
                <span className="min-w-0">
                  <span className={closed ? "block truncate text-sm text-muted line-through" : "block truncate text-sm font-medium"}>
                    {t.title}
                  </span>
                  <span className="block text-xs text-muted">
                    {t.typeName} · <span className={overdue ? "font-semibold text-red-700" : ""}>{when(t.startsAt)}</span> ·{" "}
                    {t.assigneeName}
                  </span>
                </span>
              </span>
              <Chip tone={overdue ? "red" : st.tone}>{overdue ? "Vencida" : st.label}</Chip>
            </button>
          );
        })}
      </Card>
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setDraft({ clientId, date: todayAr(), start: nextSlot() })}>
          <Plus size={14} aria-hidden /> Nueva tarea
        </Button>
      </div>
      {body}
      <TaskFormDialog draft={draft} onClose={() => setDraft(null)} onCreated={notice.show} />
      <TaskDialog taskId={openId} onClose={() => setOpenId(null)} onSaved={notice.show} />
      <Notice message={notice.message} />
    </div>
  );
}
