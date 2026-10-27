// 23/10/2026 (2.0, segurança): o Estado de cada organização, isolado neste browser.
// · A chave do localStorage leva a organização e quem entrou (`chaveLocal`): dois separadores em organizações diferentes nunca leem
//   nem gravam o Estado um do outro (antes havia uma só chave, e o evento "storage" trazia o Estado da outra organização).
// · O Estado guardado vai marcado com a organização (S.org): um Estado com outra marca não se lê, e a sincronização recusa gravá-lo.
// · Uma organização real começa VAZIA (sem negócios, clientes, inventário nem frota de exemplo; o catálogo, os custos de arranque e as
//   definições ficam). Os dados de exemplo só na organização de demonstração (organizacoes.demonstracao) e no protótipo sem conta.
// · Trocar de organização esquece tudo o que vive em memória (Inventário, Frota, RH, as páginas da V2, Pessoas, Negócios) antes de
//   carregar a nova.
import { VERSAO, demo, seed, type Estado } from "./motor";
import { migrarAdendas } from "./adendas";
import { garantirTecnicos } from "./equipa/tecnicos";
import { baseVazia } from "./inventario/seed";
import type { Inventario } from "./inventario/tipos";
import { seedFrota } from "./frota/seed";
import type { Frota } from "./frota/tipos";
import { esquecerInventario, substituirInventario } from "./inventario/loja";
import { definirChaveFrota } from "./frota/loja";
import { esquecerPessoas } from "./PessoasSimples";
import { esquecerPessoasFunc } from "./PessoasFunc";
import { esquecerNegociosFunc } from "./NegociosFunc";
import { esquecerDiaADia } from "./diaADia";
import { esquecerV2 } from "./v2/esquecerV2";

/** A chave de sempre (o protótipo sem conta e os testes). */
export const CHAVE_BASE = "olyvia-prototipo-negocios";

/** A chave do Estado neste browser: sem conta, a de sempre; com conta, a da organização e de quem entrou. */
export const chaveLocal = (org?: string | null, quem?: string | null): string =>
  org ? `${CHAVE_BASE}:${org}:${quem || "-"}` : CHAVE_BASE;

/** Um Estado vazio de uma organização real: o catálogo, os custos de arranque e as definições do exemplo, sem negócios, clientes,
 *  fichas nem contas. 24/10 (junção com fix/agenda): também sem os técnicos de exemplo (marcado `semExemplos`: garantirTecnicos
 *  aceita a lista vazia); os técnicos de obra criam-se em Utilizadores e a agenda é a dos membros reais. */
export function estadoVazio(org?: string): Estado {
  const S = seed();
  S.deals = [];
  S.clientes = [];
  S.fichas = {};
  S.acessos = {};
  S.tecnicos = [];
  S.semExemplos = true;
  S.stock = Object.fromEntries(Object.keys(S.stock).map((k) => [k, 0])) as Estado["stock"];
  S.role = "comercial"; S.view = "hoje"; S.deal = null; S.op = null;
  if (org) S.org = org;
  return S;
}

/** Lê o Estado guardado neste browser para esta organização (null: não há, é de outra versão, ou é de outra organização). */
export function lerEstadoLocal(chave: string, org: string): Estado | null {
  try {
    const j = JSON.parse(localStorage.getItem(chave) || "null") as Estado | null;
    if (!j || j.v !== VERSAO || j.org !== org || !Array.isArray(j.deals)) return null;
    migrarAdendas(j); garantirTecnicos(j);
    return j;
  } catch {
    return null;
  }
}

/** Uma organização nova: vazia, ou a demonstração se for de demonstração. Marcada com a organização. */
export function estadoInicial(org: string, demonstracao: boolean): Estado {
  if (!demonstracao) return estadoVazio(org);
  const S = demo();
  S.org = org;
  return S;
}

/** O Inventário de uma organização real: sem produtos, fornecedores, encomendas nem stock; só um armazém principal. */
export function inventarioVazio(): Inventario {
  const db = baseVazia();
  db.warehouses = [{ id: "LIS", name: "Armazém principal", code: "ARM-01", addr: "", cp: "", city: "", lat: null, lng: null, manager: "", phone: "", email: "", cap: "",
    active: true, serves: true, deleted: false }];
  db.rc = { ...db.rc, basket: [], rejected: [], queued: [], toSend: [], toConfirm: [], session: [], result: null };
  return db;
}

/** A Frota de uma organização real: sem pessoas, viaturas nem registos. */
export function frotaVazia(): Frota {
  return { ...seedFrota(), pessoas: [], viaturas: [], atrib: [], manut: [], leituras: [], custos: [], ocorr: [], agenda: [], log: [], pedidos: [], importados: [], ligObras: [] };
}

/** Esquece tudo o que vive em memória (de uma organização) e põe o Inventário e a Frota da próxima: vazios numa organização real
 *  (a sincronização traz depois os da base), os de exemplo na demonstração. `org`: a chave da Frota passa a ser a desta organização. */
export function esquecerMemoria(org: string | null, demonstracao: boolean, quem?: string | null): void {
  esquecerPessoas();
  esquecerPessoasFunc();
  esquecerNegociosFunc();
  esquecerDiaADia();
  esquecerV2();
  // a Frota guardada neste browser é a desta organização (a chave dela); sem nada guardado: vazia numa real, a de exemplo na demonstração
  definirChaveFrota(org ? `${org}:${quem || "-"}` : null, demonstracao ? undefined : frotaVazia);
  esquecerInventario();
  if (!demonstracao) substituirInventario(inventarioVazio());
  // os dados de teste do RH (só se carregam se alguém os abriu)
  // CRM: o RH da Emylia (rh/) não veio; o RH é o do CRM.
}
