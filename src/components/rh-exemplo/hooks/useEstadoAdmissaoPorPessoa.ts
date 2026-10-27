/**
 * O estado da admissão de cada pessoa da lista, num ÚNICO pedido à lista real (`rpc_hr_admissao_listar`, via
 * `useAdmissoesPipeline`), para as linhas não fazerem um pedido cada. Devolve também quantas admissões esperam decisão, para
 * a pastilha do separador (o mesmo pedido serve os dois).
 *
 * - Exige `hr.pessoas.convite.enviar` ou `hr.onboarding.approve`: sem uma delas não há mapa nem erro (a base recusaria e a
 *   lista não mostra chips a quem não os pode ver).
 * - A lista vem em páginas de 50 (mais recentes primeiro): vão-se pedindo as seguintes até `MAX_PAGINAS`. Se ainda ficar
 *   por ver, `incompleto` é verdadeiro e o ecrã diz-lo (nunca se finge que a pessoa «não tem admissão»).
 * - Por pessoa vale o processo MAIS RECENTE (a lista vem por data de criação decrescente).
 * - Enquanto carrega ou se falhou não se inventa nada: mapa vazio e `erro` verdadeiro quando falhou.
 */
import { useEffect, useMemo, useRef } from "react";
import { useAdmissoesPipeline } from "@/hooks/useAdmissoesPipeline";
import { usePermissions } from "@/hooks/usePermissions";
import type { EstadoAdmissao } from "@/types/hr";

/** Quantas páginas de 50 se pedem no máximo (500 processos). */
export const MAX_PAGINAS = 10;

export interface EstadoAdmissaoPorPessoa {
  /** `pessoaId` → estado do processo mais recente. */
  estadoPorPessoa: ReadonlyMap<string, EstadoAdmissao>;
  /** Admissões submetidas à espera da decisão do RH. */
  porAprovar: number;
  carregando: boolean;
  /** A leitura falhou (só para quem a pode fazer). */
  erro: boolean;
  /** Há mais processos do que os que se leram: algumas pessoas podem não ter chip. */
  incompleto: boolean;
}

export function useEstadoAdmissaoPorPessoa(): EstadoAdmissaoPorPessoa {
  const { hasPermission } = usePermissions();
  const pode = hasPermission("hr.pessoas.convite.enviar") || hasPermission("hr.onboarding.approve");
  const { itens, contadores, carregando, aCarregarMais, temMais, erro, carregarMais } = useAdmissoesPipeline({ estados: null });

  // Quantas páginas já chegaram: a primeira conta como uma.
  const paginas = useRef(1);
  const pagina = Math.max(1, Math.ceil(itens.length / 50));
  paginas.current = pagina;

  const querMais = pode && !carregando && !aCarregarMais && !erro && temMais && paginas.current < MAX_PAGINAS;
  useEffect(() => {
    if (querMais) void carregarMais();
  }, [querMais, itens.length, carregarMais]);

  const estadoPorPessoa = useMemo(() => {
    const mapa = new Map<string, EstadoAdmissao>();
    if (!pode) return mapa;
    for (const item of itens) if (!mapa.has(item.pessoaId)) mapa.set(item.pessoaId, item.estado);
    return mapa;
  }, [pode, itens]);

  return {
    estadoPorPessoa,
    porAprovar: pode && !carregando && !erro ? (contadores.submetida ?? 0) : 0,
    carregando: pode && (carregando || aCarregarMais),
    erro: pode && erro !== null,
    incompleto: pode && !erro && temMais && !carregando && !aCarregarMais && paginas.current >= MAX_PAGINAS,
  };
}
