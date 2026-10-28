// Wrapper: tudo o que os separadores Utilizadores e Portal precisam, num só sítio (a página só liga as peças), como `useRolesPerfis`
// faz para as roles: a lista real, as autorizações de /users, as ações de escrita e a atividade do utilizador aberto.
import { useMemo } from "react";
import type { AutorizacoesUtilizadores } from "../autorizacoesUtilizadores";
import type { EstadoAtividade } from "../historicoUtilizador";
import type { Utilizador } from "../tipos";
import { useAcoesUtilizador, type AcoesUtilizador } from "./useAcoesUtilizador";
import { useAutorizacoesUtilizadores } from "./useAutorizacoesUtilizadores";
import { useHistoricoUtilizador } from "./useHistoricoUtilizador";
import { useUtilizadoresReais, type UtilizadoresReais } from "./useUtilizadoresReais";

export interface UtilizadoresPerfisDados extends UtilizadoresReais {
  autorizacoes: AutorizacoesUtilizadores;
  acoes: AcoesUtilizador;
  /** O utilizador cuja ficha está aberta (da lista completa, que inclui os clientes do portal). */
  aberto: Utilizador | null;
  /** A atividade do utilizador aberto (anew_entity_history), só com permissão. */
  atividade: EstadoAtividade;
}

export function useUtilizadoresPerfis(abertoId: string | null): UtilizadoresPerfisDados {
  const dados = useUtilizadoresReais();
  const autorizacoes = useAutorizacoesUtilizadores(dados.todos);
  const acoes = useAcoesUtilizador();
  const aberto = useMemo(() => (abertoId ? dados.todos.find((u) => u.id === abertoId) ?? null : null), [abertoId, dados.todos]);
  const atividade = useHistoricoUtilizador(aberto, !!aberto && autorizacoes.podeVerHistorico(aberto));
  return { ...dados, autorizacoes, acoes, aberto, atividade };
}
