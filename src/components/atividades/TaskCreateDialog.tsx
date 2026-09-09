import { useEffect, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/hooks/useTranslation";
import type { CreateTaskInput } from "@/hooks/useMyDayTasks";

interface TaskCreateDialogProps {
  /** Prazo por omissão: o dia que está a ser visto, em `YYYY-MM-DD`. */
  defaultDueDate: string;
  saving: boolean;
  onCreate: (input: CreateTaskInput) => Promise<boolean>;
  /**
   * `primary` é o botão do cabeçalho, a acção principal do ecrã. `quiet` é o
   * convite que aparece dentro da lista vazia, onde um segundo botão cheio
   * competiria com o de cima em vez de o complementar.
   */
  trigger?: "primary" | "quiet";
}

/**
 * Criar uma tarefa: título, descrição e prazo. Mais nada.
 *
 * Não há selector de tipo — toda a tarefa criada aqui é uma tarefa, e a coluna
 * `type` tem valor por omissão na base. Perguntar seria uma decisão a mais num
 * ecrã cujo propósito é despachar o dia. Pela mesma razão o título é o campo em
 * destaque, com o tamanho de um cabeçalho: é o único obrigatório e, na maioria
 * das vezes, o único que a pessoa vai escrever antes de carregar em Enter.
 */
export function TaskCreateDialog({
  defaultDueDate,
  saving,
  onCreate,
  trigger = "primary",
}: TaskCreateDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate);

  // O prazo por omissão acompanha o dia que se está a ver: quem navega para
  // amanhã e cria uma tarefa quer o prazo de amanhã, não o de hoje.
  useEffect(() => {
    if (!open) setDueDate(defaultDueDate);
  }, [defaultDueDate, open]);

  const canSubmit = title.trim().length > 0 && !saving;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    const created = await onCreate({ title, description, dueDate: dueDate || defaultDueDate });
    if (!created) return;
    setTitle("");
    setDescription("");
    setOpen(false);
  };

  return (
    <>
      {trigger === "primary" ? (
        <Button
          size="sm"
          onClick={() => setOpen(true)}
          className="h-10 gap-2 rounded-full bg-primary px-4 text-primary-foreground shadow-[var(--shadow-sm)] transition-all hover:shadow-[var(--shadow-md)] active:scale-95"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("activities.myDay.newTask")}
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className="h-9 gap-2 rounded-full border-dashed border-primary/40 text-primary hover:border-primary hover:bg-primary/5 hover:text-primary"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("activities.myDay.newTask")}
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("activities.myDay.newTask")}</DialogTitle>
            <DialogDescription>{t("activities.myDay.newTaskHint")}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="task-title" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {t("activities.myDay.taskTitle")}
              </Label>
              <Input
                id="task-title"
                value={title}
                autoFocus
                required
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("activities.myDay.taskTitlePlaceholder")}
                className="h-11 border-0 border-b-2 border-border bg-transparent px-0 text-base font-medium shadow-none focus-visible:border-primary focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-description" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {t("activities.myDay.taskDescription")}
              </Label>
              <Textarea
                id="task-description"
                value={description}
                rows={3}
                onChange={(event) => setDescription(event.target.value)}
                className="resize-none text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="task-due-date" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {t("activities.myDay.taskDueDate")}
              </Label>
              <Input
                id="task-due-date"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className="h-10 w-full tabular-nums sm:w-48"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={!canSubmit}
                className="bg-primary text-primary-foreground"
              >
                {t("activities.myDay.createTask")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
