/**
 * As accoes do fluxo 4 (horario) sobre o store em memoria. Cada uma chama a funcao pura que valida e
 * devolve `null` em sucesso ou a chave de traducao do erro.
 */
import { lerEstado } from "@/components/rh-exemplo/dados/loja";
import { definirFluxosB, lerFluxosB, novoIdB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { hojeIso } from "@/components/rh-exemplo/lib/assiduidade";
import {
  corrigirVersao,
  criarExcecao,
  criarVersao,
  removerExcecao,
  type ConfigHorario,
  type DiaPadrao,
  type HorarioPessoa,
  type Resultado,
} from "@/components/rh-exemplo/lib/horarioTipos";

/** O nome de quem esta a usar o ecra (na apresentacao, a pessoa de RH de exemplo). */
export function nomeDeQuemUsa(): string {
  const id = lerEstado().minhaPessoaId;
  return (id ? lerEstado().fichas[id]?.pessoa.nome_completo : null) ?? "RH";
}

const SEM_HORARIO: HorarioPessoa = { versoes: [], excecoes: [] };

function aplicar(pessoaId: string, calcular: (h: HorarioPessoa) => Resultado<HorarioPessoa>): string | null {
  const resultado = calcular(lerFluxosB().horarios[pessoaId] ?? SEM_HORARIO);
  if (resultado.ok === false) return resultado.erro;
  definirFluxosB((e) => ({ ...e, horarios: { ...e.horarios, [pessoaId]: resultado.valor } }));
  return null;
}

export function gravarNovaVersao(
  pessoaId: string,
  dados: { config: ConfigHorario; desde: string; motivo: string; anexoNome: string | null },
): string | null {
  return aplicar(pessoaId, (h) =>
    criarVersao(h, { ...dados, id: novoIdB("hv"), autor: nomeDeQuemUsa(), hoje: hojeIso(), agora: new Date().toISOString() }),
  );
}

export function gravarCorreccaoDeVersao(
  pessoaId: string,
  dados: { versaoId: string; config: ConfigHorario; motivo: string; autorizado: boolean },
): string | null {
  return aplicar(pessoaId, (h) => corrigirVersao(h, { ...dados, id: novoIdB("hv"), autor: nomeDeQuemUsa(), agora: new Date().toISOString() }));
}

export function gravarExcecaoDeDia(pessoaId: string, dados: { data: string; dia: DiaPadrao; motivo: string }): string | null {
  return aplicar(pessoaId, (h) =>
    criarExcecao(h, { ...dados, id: novoIdB("hx"), autor: nomeDeQuemUsa(), hoje: hojeIso(), agora: new Date().toISOString() }),
  );
}

export function apagarExcecaoDeDia(pessoaId: string, excecaoId: string): void {
  definirFluxosB((e) => {
    const atual = e.horarios[pessoaId];
    return atual ? { ...e, horarios: { ...e.horarios, [pessoaId]: removerExcecao(atual, excecaoId) } } : e;
  });
}
