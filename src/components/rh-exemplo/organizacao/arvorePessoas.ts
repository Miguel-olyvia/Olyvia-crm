/**
 * As pessoas dentro da árvore da organização: uma folha por pessoa, debaixo do centro onde trabalha. Dentro de cada centro a
 * chefia vem primeiro e quem reporta a alguém do MESMO centro fica por baixo dela (a relação «reporta a» que vivia na vista
 * Chefias). Quem reporta a alguém de outro centro, ou a ninguém, fica ao nível do centro. Funções puras.
 */
import type { EstruturaOrg, Ligacao, NoArvore, NoPessoa, PessoaOrg } from "@/components/rh-exemplo/organizacao/tipos";

const COLACAO = new Intl.Collator("pt", { sensitivity: "base" });

/** Chefia primeiro, depois por nome. */
const ordenar = (a: NoPessoa, b: NoPessoa): number => Number(b.chefia) - Number(a.chefia) || COLACAO.compare(a.nome, b.nome);

/** Quem tem equipa: alguma das pessoas conhecidas reporta a ela (esteja ou não ligada a um centro). */
export function idsDeChefias(pessoas: readonly PessoaOrg[]): Set<string> {
  return new Set(pessoas.flatMap((p) => (p.reportaAId && p.reportaAId !== p.id ? [p.reportaAId] : [])));
}

/** A pessoa como folha, ainda sem subordinados. O vínculo só aparece quando a filial do vínculo não é a do centro. */
export function noDaPessoa(est: EstruturaOrg, lig: Ligacao, pessoas: ReadonlyMap<string, PessoaOrg>, chefias: ReadonlySet<string>): NoPessoa {
  const pessoa = pessoas.get(lig.pessoaId);
  const centro = est.centros.find((c) => c.id === lig.centroId);
  const filial = est.filiais.find((f) => f.id === lig.filialId);
  const reportaAId = pessoa?.reportaAId ?? null;
  return {
    id: `pessoa:${lig.pessoaId}`, tipo: "pessoa", pessoaId: lig.pessoaId, nome: pessoa?.nome ?? lig.pessoaId,
    cargo: pessoa?.cargo ?? null, chefia: chefias.has(lig.pessoaId), reportaAId,
    reportaA: reportaAId ? (pessoas.get(reportaAId)?.nome ?? null) : null,
    vinculo: centro && centro.filialId !== lig.filialId ? (filial?.nome ?? lig.filialId) : null,
    filhos: [],
  };
}

/**
 * Arruma as pessoas de UM centro: raízes (sem chefia no centro) por ordem, e os subordinados por baixo. Uma cadeia circular
 * (A reporta a B e B a A) não se perde nem entra em recursão: o que sobrar depois das raízes entra como raiz.
 */
export function organizarPorChefia(nos: readonly NoPessoa[]): NoPessoa[] {
  const ids = new Set(nos.map((n) => n.pessoaId));
  const subordinadosDe = new Map<string, NoPessoa[]>();
  const raizes: NoPessoa[] = [];
  for (const n of nos) {
    if (n.reportaAId && n.reportaAId !== n.pessoaId && ids.has(n.reportaAId)) {
      subordinadosDe.set(n.reportaAId, [...(subordinadosDe.get(n.reportaAId) ?? []), n]);
    } else {
      raizes.push(n);
    }
  }
  const visitados = new Set<string>();
  const montar = (n: NoPessoa): NoPessoa => {
    visitados.add(n.pessoaId);
    const filhos = (subordinadosDe.get(n.pessoaId) ?? []).filter((f) => !visitados.has(f.pessoaId)).sort(ordenar);
    return { ...n, filhos: filhos.map(montar) };
  };
  const arvore = raizes.sort(ordenar).map(montar);
  for (const n of nos.filter((x) => !visitados.has(x.pessoaId)).sort(ordenar)) {
    if (!visitados.has(n.pessoaId)) arvore.push(montar(n));
  }
  return arvore;
}

/** Quantas pessoas há num conjunto de nós, contando as que estão por baixo de uma chefia. */
export function contarNos(nos: readonly NoArvore[]): number {
  return nos.reduce((soma, n) => soma + (n.tipo === "pessoa" ? 1 : 0) + contarNos(n.filhos), 0);
}
