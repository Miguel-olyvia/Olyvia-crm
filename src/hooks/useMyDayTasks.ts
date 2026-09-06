import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { classifyTasks, getTaskQueryRange, toDateKey, type TaskRow, type TaskSections } from "@/lib/agenda/tasks";

/**
 * Colunas lidas de `public.activities`.
 *
 * `created_by` é a identidade de NEGÓCIO (`anew_users.id`) e é também o dono:
 * a tabela não tem `assigned_to`, e as políticas só deixam ver, criar, alterar
 * e apagar as próprias linhas. Não há aqui, por isso, âmbito de equipa nem de
 * organização — ao contrário da agenda.
 */
const TASK_SELECT = "id, title, description, due_date, completed, completed_at";

/** Valor por omissão da coluna `type` na base. O ecrã não pergunta o tipo. */
const TASK_TYPE = "task";

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  /** `YYYY-MM-DD`. Por omissão, o dia que está a ser visto. */
  dueDate?: string;
}

export interface UseMyDayTasksResult {
  sections: TaskSections<TaskRow>;
  totalCount: number;
  loading: boolean;
  error: string | null;
  saving: boolean;
  createTask: (input: CreateTaskInput) => Promise<boolean>;
  setTaskCompleted: (id: string, completed: boolean) => Promise<boolean>;
  refresh: () => void;
}

const EMPTY_SECTIONS: TaskSections<TaskRow> = { overdue: [], today: [] };

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : String(err);
}

/**
 * Tarefas da própria pessoa para o dia visível, com criação e conclusão.
 *
 * Vive ao lado de `useMyDay` em vez de dentro dele: são duas tabelas, dois
 * âmbitos (a agenda tem equipa/organização, a tarefa é sempre só minha) e dois
 * modos (a agenda é leitura pura). O que é comum — a janela do dia e o recuo
 * dos atrasados — está partilhado em `src/lib/agenda/`.
 */
export function useMyDayTasks(day: Date): UseMyDayTasksResult {
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;

  const [rows, setRows] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Chave estável: `day` é um `Date` novo a cada render da página e faria o
  // efeito correr em ciclo. Só o dia local interessa a esta query.
  const dayKey = useMemo(() => toDateKey(day), [day]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      if (!organizationId) {
        if (!cancelled) {
          setRows([]);
          setLoading(false);
        }
        return;
      }

      try {
        const businessUserId = await resolveCurrentBusinessUserId();
        if (cancelled) return;
        if (!businessUserId) {
          setRows([]);
          setLoading(false);
          return;
        }

        const range = getTaskQueryRange(new Date(`${dayKey}T00:00:00`));
        const { data, error: queryError } = await supabase
          .from("activities")
          .select(TASK_SELECT)
          .eq("organization_id", organizationId)
          .eq("created_by", businessUserId)
          .gte("due_date", range.fromDate)
          .lt("due_date", range.untilDate)
          .order("due_date", { ascending: true });

        if (queryError) throw queryError;
        if (cancelled) return;

        setRows((data ?? []) as unknown as TaskRow[]);
      } catch (err: unknown) {
        if (cancelled) return;
        console.error("[useMyDayTasks] falha a ler as tarefas:", err);
        setError(toMessage(err));
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [organizationId, dayKey, reloadToken]);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  const createTask = useCallback(
    async ({ title, description, dueDate }: CreateTaskInput): Promise<boolean> => {
      const cleanTitle = title.trim();
      if (!cleanTitle || !organizationId) return false;

      setSaving(true);
      setError(null);
      try {
        const businessUserId = await resolveCurrentBusinessUserId();
        if (!businessUserId) throw new Error("Sem identidade de negócio para gravar a tarefa.");

        const { error: insertError } = await supabase.from("activities").insert({
          organization_id: organizationId,
          created_by: businessUserId,
          title: cleanTitle,
          description: description?.trim() || null,
          due_date: dueDate || dayKey,
          type: TASK_TYPE,
        });

        if (insertError) throw insertError;
        refresh();
        return true;
      } catch (err: unknown) {
        console.error("[useMyDayTasks] falha a criar a tarefa:", err);
        setError(toMessage(err));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [organizationId, dayKey, refresh]
  );

  const setTaskCompleted = useCallback(
    async (id: string, completed: boolean): Promise<boolean> => {
      setSaving(true);
      setError(null);

      // Optimista: a caixa reage já, e o `refresh` a seguir repõe a verdade da
      // base. Reabrir limpa `completed_at` — deixar a data lá deixaria a linha
      // a dizer que foi concluída num momento em que afinal não estava.
      const completedAt = completed ? new Date().toISOString() : null;
      setRows((current) =>
        current.map((row) => (row.id === id ? { ...row, completed, completed_at: completedAt } : row))
      );

      try {
        const { error: updateError } = await supabase
          .from("activities")
          .update({ completed, completed_at: completedAt })
          .eq("id", id);

        if (updateError) throw updateError;
        refresh();
        return true;
      } catch (err: unknown) {
        console.error("[useMyDayTasks] falha a actualizar a tarefa:", err);
        setError(toMessage(err));
        refresh();
        return false;
      } finally {
        setSaving(false);
      }
    },
    [refresh]
  );

  const sections = useMemo(
    () => (rows.length === 0 ? EMPTY_SECTIONS : classifyTasks(rows, new Date(`${dayKey}T00:00:00`))),
    [rows, dayKey]
  );

  return {
    sections,
    totalCount: sections.overdue.length + sections.today.length,
    loading,
    error,
    saving,
    createTask,
    setTaskCompleted,
    refresh,
  };
}
