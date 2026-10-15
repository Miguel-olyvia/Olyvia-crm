/** Funções puras da árvore da organização: construir (com as pessoas dentro), contar, comparar vínculo legal e centro, pesquisar. */
import { contarNos, idsDeChefias, noDaPessoa, organizarPorChefia } from "@/components/rh-exemplo/organizacao/arvorePessoas";
import type { CentroOrg, EstruturaOrg, Ligacao, NoArvore, NoOrg, NoSemCentro, PessoaOrg } from "@/components/rh-exemplo/organizacao/tipos";

export interface Contagem {
  legais: number;
  locais: number;
}

const contar = (ligs: readonly Ligacao[], teste: (l: Ligacao) => boolean): number => ligs.filter(teste).length;

/** O primeiro centro de uma filial: o que vale por «mesmo centro da filial». */
export function centroPrincipalDaFilial(est: EstruturaOrg, filialId: string): CentroOrg | null {
  return est.centros.find((c) => c.filialId === filialId) ?? null;
}

/** Pessoas por nó: `legais` pelo vínculo (empresa/filial/grupo), `locais` só nos centros. */
export function contarPessoas(est: EstruturaOrg, ligs: readonly Ligacao[]): Map<string, Contagem> {
  const mapa = new Map<string, Contagem>();
  mapa.set(est.grupo.id, { legais: ligs.length, locais: 0 });
  for (const e of est.empresas) mapa.set(e.id, { legais: contar(ligs, (l) => l.empresaId === e.id), locais: 0 });
  for (const f of est.filiais) mapa.set(f.id, { legais: contar(ligs, (l) => l.filialId === f.id), locais: 0 });
  for (const c of est.centros) mapa.set(c.id, { legais: 0, locais: contar(ligs, (l) => l.centroId === c.id) });
  return mapa;
}

/** Só os nós da estrutura (grupo, empresa, filial, centro) abrem painel; as pessoas abrem a ficha. */
export const ehNoOrg = (no: NoArvore): no is NoOrg => no.tipo !== "pessoa" && no.tipo !== "semCentro";

/** A ligação não tem centro: o centro não existe na estrutura (vínculo legal sem local de trabalho atribuído). */
export const semCentro = (est: EstruturaOrg, lig: Ligacao): boolean => !est.centros.some((c) => c.id === lig.centroId);

/**
 * A árvore: Grupo > Empresas > Filiais > Centros, com os contadores já calculados e as PESSOAS como folhas debaixo do centro
 * onde trabalham (chefia primeiro, subordinados por baixo). Quem tem vínculo mas nenhum centro fica numa linha «Sem centro
 * atribuído» debaixo da filial (ou da empresa, se a filial não existir).
 */
export function construirArvore(est: EstruturaOrg, ligs: readonly Ligacao[], pessoas: readonly PessoaOrg[]): NoOrg {
  const n = contarPessoas(est, ligs);
  const cont = (id: string): Contagem => n.get(id) ?? { legais: 0, locais: 0 };
  const porId = new Map(pessoas.map((p) => [p.id, p]));
  const chefias = idsDeChefias(pessoas);
  const gente = (lista: readonly Ligacao[]) => organizarPorChefia(lista.map((l) => noDaPessoa(est, l, porId, chefias)));
  const semCentroDe = (paiId: string, lista: readonly Ligacao[]): NoSemCentro[] => {
    const filhos = gente(lista.filter((l) => semCentro(est, l)));
    return filhos.length === 0 ? [] : [{ id: `semcentro:${paiId}`, tipo: "semCentro", nome: "", filhos, total: contarNos(filhos) }];
  };
  const centro = (c: CentroOrg): NoOrg => ({
    id: c.id, tipo: "centro", nome: c.nome, filhos: gente(ligacoesDoCentro(c.id, ligs)), legais: 0, locais: cont(c.id).locais,
  });
  const filial = (id: string, nome: string): NoOrg => ({
    id, tipo: "filial", nome, legais: cont(id).legais, locais: null,
    filhos: [...est.centros.filter((c) => c.filialId === id).map(centro), ...semCentroDe(id, ligs.filter((l) => l.filialId === id))],
  });
  const empresas: NoOrg[] = est.empresas.map((e) => ({
    id: e.id, tipo: "empresa", nome: e.nome, legais: cont(e.id).legais, locais: null,
    filhos: [
      ...est.filiais.filter((f) => f.empresaId === e.id).map((f) => filial(f.id, f.nome)),
      ...semCentroDe(e.id, ligs.filter((l) => l.empresaId === e.id && !est.filiais.some((f) => f.id === l.filialId))),
    ],
  }));
  return { id: est.grupo.id, tipo: "grupo", nome: est.grupo.nome, filhos: empresas, legais: cont(est.grupo.id).legais, locais: null };
}

/** O centro onde a pessoa trabalha não é um dos centros da filial do seu vínculo legal. */
export function centroDifere(est: EstruturaOrg, lig: Ligacao): boolean {
  const centro = est.centros.find((c) => c.id === lig.centroId);
  return centro !== undefined && centro.filialId !== lig.filialId;
}

export function pessoasComCentroDiferente(est: EstruturaOrg, ligs: readonly Ligacao[]): Ligacao[] {
  return ligs.filter((l) => centroDifere(est, l));
}

/** Ligações com vínculo legal num nó (grupo, empresa ou filial); vazio para um centro. */
export function ligacoesDoVinculo(est: EstruturaOrg, noId: string, ligs: readonly Ligacao[]): Ligacao[] {
  if (noId === est.grupo.id) return [...ligs];
  if (est.empresas.some((e) => e.id === noId)) return ligs.filter((l) => l.empresaId === noId);
  if (est.filiais.some((f) => f.id === noId)) return ligs.filter((l) => l.filialId === noId);
  return [];
}

export function ligacoesDoCentro(centroId: string, ligs: readonly Ligacao[]): Ligacao[] {
  return ligs.filter((l) => l.centroId === centroId);
}

const normalizar = (s: string): string => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

function filtrarNo(no: NoArvore, alvo: string): NoArvore | null {
  if (normalizar(no.nome).includes(alvo)) return no;
  const filhos = no.filhos.map((f) => filtrarNo(f, alvo)).filter((f): f is NoArvore => f !== null);
  return filhos.length > 0 ? { ...no, filhos } : null;
}

/**
 * Mantém os nós (estrutura ou pessoas) cujo nome contém o termo, com tudo o que está por baixo, e os seus antepassados;
 * `null` se nada corresponde. Sem termo devolve a árvore inteira.
 */
export function filtrarArvore(no: NoOrg, termo: string): NoOrg | null {
  const alvo = normalizar(termo);
  if (alvo === "") return no;
  const r = filtrarNo(no, alvo);
  return r !== null && ehNoOrg(r) ? r : null;
}

/** Os identificadores dos nós com filhos (os que se podem expandir). */
export function idsExpansiveis(no: NoArvore): string[] {
  return no.filhos.length === 0 ? [] : [no.id, ...no.filhos.flatMap(idsExpansiveis)];
}

export interface VisivelNo {
  no: NoArvore;
  paiId: string | null;
}

/** Os nós por ordem de apresentação, só os que se vêem (os filhos de um nó fechado ficam de fora). */
export function listaVisivel(no: NoArvore, abertos: ReadonlySet<string>, paiId: string | null = null): VisivelNo[] {
  const filhos = abertos.has(no.id) ? no.filhos.flatMap((f) => listaVisivel(f, abertos, no.id)) : [];
  return [{ no, paiId }, ...filhos];
}
