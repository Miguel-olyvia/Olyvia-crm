/**
 * Da base para a pagina «Organizacao»: funcoes puras que montam a estrutura (grupo > empresa > filiais > centros)
 * e as ligacoes das pessoas a partir do que ja existe na base.
 *
 *  - O grupo e a empresa sao a organizacao activa (nao ha tabela de entidades legais por empresa).
 *  - As filiais sao a propria organizacao e as descendentes em `anew_hierarchy` (`useFiliaisDaArvore`).
 *  - Os centros sao `hr_locais_trabalho`, na filial do seu `organograma_node_id`.
 *  - A ligacao de uma pessoa e a sua colocacao em vigor (filial) mais o local da ficha (centro).
 */
import type {
  CentroOrg, EstruturaOrg, ErroLigacao, FilialOrg, Ligacao, PedidoLigacao, PessoaOrg,
} from "@/components/rh-exemplo/organizacao/tipos";
import type { PessoaColocacaoOrganograma } from "@/components/rh-exemplo/tipos";

export interface EmpresaReal {
  id: string;
  name: string;
}
export interface FilialReal {
  id: string;
  name: string;
}
export interface LocalReal {
  id: string;
  nome: string;
  organograma_node_id: string | null;
  morada: string | null;
  cidade: string | null;
}
export interface PessoaReal {
  id: string;
  nome_completo: string;
  cargo: string | null;
  reporta_a_pessoa_id: string | null;
  estado_registo: string;
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

const moradaDe = (l: LocalReal): string => [l.morada, l.cidade].filter((x): x is string => Boolean(x && x.trim())).join(", ");

export function construirEstruturaReal(entrada: {
  empresa: EmpresaReal;
  filiais: readonly FilialReal[];
  locais: readonly LocalReal[];
}): EstruturaOrg {
  const { empresa } = entrada;
  const vazio = { nif: "", morada: "", responsavel: "" };
  if (!empresa.id) {
    return { grupo: { id: "grupo:", nome: "", ...vazio }, empresas: [], filiais: [], centros: [] };
  }
  const empresaId = `empresa:${empresa.id}`;
  const outras = entrada.filiais.filter((f) => f.id !== empresa.id);
  const filiais: FilialOrg[] = [{ id: empresa.id, name: empresa.name }, ...outras].map((f) => ({
    id: f.id, empresaId, nome: f.name, morada: "", responsavel: "",
  }));
  const ids = new Set(filiais.map((f) => f.id));
  const centros: CentroOrg[] = entrada.locais.map((l) => ({
    id: l.id,
    nome: l.nome,
    filialId: l.organograma_node_id && ids.has(l.organograma_node_id) ? l.organograma_node_id : empresa.id,
    morada: moradaDe(l),
    responsavel: "",
  }));
  return {
    grupo: { id: `grupo:${empresa.id}`, nome: empresa.name, ...vazio },
    empresas: [{ id: empresaId, nome: empresa.name, ...vazio }],
    filiais,
    centros,
  };
}

/** Uma ligacao por pessoa com colocacao em vigor num no conhecido; o centro e o local da ficha ("" se nao tiver). */
export function ligacoesReais(
  est: EstruturaOrg,
  pessoas: readonly { id: string; local_id: string | null }[],
  vigentes: ReadonlyMap<string, PessoaColocacaoOrganograma>,
): Ligacao[] {
  const empresaId = est.empresas[0]?.id;
  if (!empresaId) return [];
  const filiais = new Set(est.filiais.map((f) => f.id));
  return pessoas.flatMap((p) => {
    const c = vigentes.get(p.id);
    const no = c?.organograma_node_id;
    if (!c || !no || !filiais.has(no)) return [];
    return [{ pessoaId: p.id, empresaId, filialId: no, centroId: p.local_id ?? "", desde: c.valido_de }];
  });
}

/** As pessoas que se podem ligar/ver: so fichas activas. */
export function pessoasOrgReais(pessoas: readonly PessoaReal[]): PessoaOrg[] {
  return pessoas
    .filter((p) => p.estado_registo === "activo")
    .map((p) => ({ id: p.id, nome: p.nome_completo, cargo: p.cargo, reportaAId: p.reporta_a_pessoa_id }));
}

/** Validacao do pedido antes de ir a base. O centro nao entra: nao se escreve aqui. */
export function validarPedidoReal(est: EstruturaOrg, p: PedidoLigacao): ErroLigacao | null {
  if (!p.pessoaId) return "pessoaEmFalta";
  if (!DATA_ISO.test(p.desde)) return "dataInvalida";
  if (!est.empresas.some((e) => e.id === p.empresaId)) return "empresaInvalida";
  if (!est.filiais.some((f) => f.id === p.filialId)) return "filialInvalida";
  return null;
}
