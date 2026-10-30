/**
 * As tarefas de obra para a Agenda (30/10/2026): `rh_agenda_tecnicos` no intervalo visível e a ligação conta → pessoa (`pessoas_contas`) para
 * o filtro "Ver" / recursos. Ver src/lib/agenda/obraTarefas.ts.
 *
 * Silencioso por desenho: sem permissão (CT001, a RPC pede pessoas.view / hr.pessoas.laborais.view ou um papel do Negócio), numa base sem a
 * função ou com outra falha, a Agenda fica sem as tarefas de obra e sem toast (só um console.warn). As marcações da Agenda nunca dependem disto.
 */
import { useQuery } from "@tanstack/react-query";
import { hrFrom, hrRpc } from "@/lib/hr/hrDb";
import { diaIso, type PessoaObraRpc } from "@/lib/agenda/obraTarefas";

export interface ObraTarefasAgenda {
  pessoas: PessoaObraRpc[];
  /** anew_users.id → pessoa do RH (contas activas). Vazio quando não se pode ler pessoas_contas. */
  pessoaDoUtilizador: Map<string, string>;
}

const VAZIO: ObraTarefasAgenda = { pessoas: [], pessoaDoUtilizador: new Map() };

export const obraTarefasAgendaQueryKey = (org: string | null | undefined, de: string, ate: string) =>
  ["agenda-obra-tarefas", org ?? null, de, ate] as const;

async function ler(org: string, de: string, ate: string): Promise<ObraTarefasAgenda> {
  try {
    return await lerOuFalhar(org, de, ate);
  } catch (e) {
    console.warn("[Agenda] tarefas de obra indisponíveis:", e instanceof Error ? e.message : String(e));
    return VAZIO;
  }
}

async function lerOuFalhar(org: string, de: string, ate: string): Promise<ObraTarefasAgenda> {
  const [rpc, contas] = await Promise.all([
    hrRpc("rh_agenda_tecnicos", { p_org: org, p_de: de, p_ate: ate }),
    hrFrom("pessoas_contas").select("pessoa_id, anew_user_id").eq("organization_id", org).eq("estado", "activa"),
  ]);
  if (rpc.error) {
    console.warn("[Agenda] tarefas de obra indisponíveis:", (rpc.error as { code?: string }).code ?? "", rpc.error.message ?? "");
    return VAZIO;
  }
  const pessoaDoUtilizador = new Map<string, string>();
  if (!contas.error) {
    for (const c of (contas.data ?? []) as Array<{ pessoa_id: string | null; anew_user_id: string | null }>) {
      if (c.anew_user_id && c.pessoa_id) pessoaDoUtilizador.set(c.anew_user_id, c.pessoa_id);
    }
  }
  const pessoas = Array.isArray(rpc.data) ? (rpc.data as PessoaObraRpc[]) : [];
  return { pessoas, pessoaDoUtilizador };
}

/** As tarefas de obra de `de`..`ate` (datas do calendário, inclusive). `enabled=false` (o interruptor "Obras" desligado) não lê nada. */
export function useObraTarefasAgenda(organizationId: string | null | undefined, de: Date, ate: Date, enabled = true) {
  const deIso = diaIso(de), ateIso = diaIso(ate);
  const query = useQuery({
    queryKey: obraTarefasAgendaQueryKey(organizationId, deIso, ateIso),
    queryFn: () => ler(organizationId as string, deIso, ateIso),
    enabled: enabled && !!organizationId && ateIso >= deIso,
    staleTime: 60_000,
    retry: false,
  });
  return { ...(query.data ?? VAZIO), de: deIso, ate: ateIso, isLoading: query.isLoading };
}
