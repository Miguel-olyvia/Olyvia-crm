// Wrapper: a atividade de um utilizador (anew_entity_history, últimas 50 alterações), como UserHistoryDialog. Só se lê com a
// ficha aberta e com permissão para ver o histórico (users.edit com âmbito), como na página real.
import { useQuery } from "@tanstack/react-query";
import { entradaDeHistorico, MAX_HISTORICO, type EntradaHistorico, type EstadoAtividade, type LinhaHistorico } from "../historicoUtilizador";
import { mensagemDeErro } from "../rolesReais";
import type { Utilizador } from "../tipos";
import { db } from "./clienteBase";

export async function lerHistoricoDaBase(entityId: string): Promise<EntradaHistorico[]> {
  const { data, error } = await db.from("anew_entity_history").select("*").eq("entity_id", entityId).order("created_at", { ascending: false }).limit(MAX_HISTORICO);
  if (error) throw new Error(error.message);
  const linhas = (data ?? []) as LinhaHistorico[];
  const autores = [...new Set(linhas.map((l) => l.changed_by).filter((x): x is string => !!x))];
  const nomes = new Map<string, string>();
  if (autores.length > 0) {
    const r = await db.from("anew_users").select("id, name").in("id", autores);
    if (r.error) throw new Error(r.error.message);
    ((r.data ?? []) as { id: string; name: string }[]).forEach((u) => nomes.set(u.id, u.name));
  }
  return linhas.map((l) => entradaDeHistorico(l, nomes));
}

export function useHistoricoUtilizador(utilizador: Utilizador | null, pode: boolean): EstadoAtividade {
  const entityId = utilizador?.entityId ?? null;
  const ativo = !!utilizador && pode && !!entityId;
  const consulta = useQuery({
    queryKey: ["utilizadores-perfis", "historico", entityId],
    queryFn: () => lerHistoricoDaBase(entityId as string),
    enabled: ativo,
  });
  if (!utilizador) return { estado: "ok", entradas: [] };
  if (!pode) return { estado: "semPermissao" };
  if (!entityId) return { estado: "ok", entradas: [] };
  if (consulta.error) return { estado: "erro", mensagem: mensagemDeErro(consulta.error) };
  if (consulta.isPending) return { estado: "carregando" };
  return { estado: "ok", entradas: consulta.data };
}
