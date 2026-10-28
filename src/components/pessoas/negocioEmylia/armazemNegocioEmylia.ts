// O estado da Emylia para o Pipeline: o MESMO motor, o MESMO catálogo e a MESMA gravação de /negocios (NegociosEmylia.tsx), mas fora do React.
// Um armazém por organização E por utilizador, que sobrevive ao fecho da ficha: fechar a ficha não cancela uma gravação em curso. A leitura é a de
// sempre (carregarCatalogo + neg_ler_negocios: a base só aceita a organização, não um negócio) e a gravação é a única via do Ben
// (sincronizarNegocios.gravarMudancas -> neg_guardar_negocio). Nada aqui escreve em negocios, faturas ou contratos por outro caminho.
//
// Contra dados velhos (o armazém não é cache eterna):
//  - ao abrir uma ficha relê-se a organização (`atualizar`), se não houver nada por gravar;
//  - antes de gravar relê-se, e se um negócio por gravar mudou na base desde a última leitura NÃO se grava por cima: relê-se e diz-se;
//  - mudar de utilizador (ou de sessão) deita fora os armazéns anteriores.
// Um negócio com documentos do CRM só se lê: o que mudar nele em memória volta à cópia lida, e diz-se.
import type { SupabaseClient } from "@supabase/supabase-js";
import { acoes, type Aviso, type Estado, type Negocio } from "@/emylia/motor";
import { estadoVazio } from "@/emylia/estadoOrganizacao";
import { carregarCatalogo } from "@/emylia/real/carregarCatalogo";
import { deLinhas, garantirServicosDosNegocios } from "@/emylia/real/negocioReal";
import { idsServico, lerNegocios, type IdsServico, type NegocioLido } from "@/emylia/real/negocioBase";
import { fotografarNegocios, gravarMudancas, marcaNegocio, negociosMudados, type RefNegocio } from "@/emylia/real/sincronizarNegocios";

export type LeituraEmylia = { k: "a-ler" } | { k: "erro"; t: string } | { k: "pronto" };
export type GravacaoEmylia = { k: "parado" } | { k: "a-gravar" } | { k: "gravado"; n: number } | { k: "erro"; t: string };
export interface AvisoEmylia extends Aviso { id: number }

const VISTAS = new Set(["negocios", "negocio"]);
const DURACAO_AVISO_MS = 5200;
/** Uma leitura mais nova do que isto não se repete só por se abrir outra ficha (a criação do armazém já leu). */
const LEITURA_FRESCA_MS = 3000;

export interface ArmazemEmylia {
  readonly org: string;
  readonly S: Estado;
  readonly A: ReturnType<typeof acoes>;
  readonly run: (fn: () => void) => void;
  readonly go: (fn: () => void) => () => void;
  /** Muda sempre que algo muda (para o useSyncExternalStore). */
  versao(): number;
  leitura(): LeituraEmylia;
  gravacao(): GravacaoEmylia;
  avisos(): readonly AvisoEmylia[];
  subscrever(fn: () => void): () => void;
  /** Chamado no fim de cada gravação com negócios gravados (o Pipeline refaz o quadro para a coluna mudar). */
  aoGravar(fn: () => void): () => void;
  /** O negócio da base (`negocios.id`) como a Emylia o vê; `undefined` se a organização não o devolveu. */
  negocioDaBase(id: string): Negocio | undefined;
  /** O negócio tem orçamentos, contratos ou vendas diretas do CRM: lê-se, mas não se grava por aqui (a base recusa-o, NE005). */
  docsCrm(id: string): boolean;
  /** Abre o negócio no motor (S.deal e S.view), para as ações que olham para S.deal. */
  abrir(d: Negocio): void;
  /** Ler outra vez a organização (depois de um erro). `false` se não se leu: há uma gravação em curso ou alterações por gravar (diz-se). */
  reler(): boolean;
  /** Ao abrir uma ficha: relê sem esconder o que está à vista, se a última leitura não é fresca e não há nada por gravar. Um erro diz-se num aviso. */
  atualizar(): void;
  /** Volta a gravar o que ficou por gravar (depois de um erro de gravação). */
  regravar(): void;
  /** Há alterações por gravar. */
  porGravar(): boolean;
  /** Uma gravação está a correr ou por fazer. */
  aGravar(): boolean;
}

const armazens = new Map<string, ArmazemEmylia>();
let utilizadorAtual: string | null = null;

/** Só para testes (e para a saída da conta). */
export function reporArmazens(): void { armazens.clear(); utilizadorAtual = null; }

export function obterArmazem(sb: SupabaseClient, org: string, utilizador = ""): ArmazemEmylia {
  // outro utilizador (ou outra sessão): nada do que o anterior leu serve
  if (utilizadorAtual !== null && utilizadorAtual !== utilizador) armazens.clear();
  utilizadorAtual = utilizador;
  const existente = armazens.get(org);
  if (existente) return existente;
  const novo = criarArmazem(sb, org);
  armazens.set(org, novo);
  return novo;
}

function criarArmazem(sb: SupabaseClient, org: string): ArmazemEmylia {
  // o Estado de uma organização real: sem stock, técnicos nem negócios de exemplo (nada de exemplo a parecer real no Financeiro e na Obra)
  const S = estadoVazio(org);
  S.role = "direcao"; S.view = "negocios"; S.deal = null;
  let versao = 0;
  let leitura: LeituraEmylia = { k: "a-ler" };
  let gravacao: GravacaoEmylia = { k: "parado" };
  let avisosAtuais: AvisoEmylia[] = [];
  let seq = 0;
  let emGravacao = false;
  let deNovo = false;
  let lidaEm = 0;
  let refs = new Map<number, RefNegocio>();
  // os negócios com documentos do CRM (pelo número da Emylia, para gravarMudancas; pelo id da base, para a ficha) e a cópia lida de cada um
  let soLeitura = new Set<number>();
  let docsPorId = new Set<string>();
  let lidos = new Map<number, NegocioLido>();
  let foto = new Map<number, string>();
  let ids: IdsServico | null = null;
  const ouvintes = new Set<() => void>();
  const aposGravar = new Set<() => void>();
  const mudou = (): void => { versao++; for (const f of [...ouvintes]) f(); };

  const avisar = (a: Aviso): void => {
    const mostra = (): void => {
      const id = ++seq;
      avisosAtuais = [...avisosAtuais, { ...a, id }].slice(-3);
      mudou();
      setTimeout(() => { avisosAtuais = avisosAtuais.filter((x) => x.id !== id); mudou(); }, a.act || a.kind === "bad" ? 8000 : DURACAO_AVISO_MS);
    };
    if (a.atraso) setTimeout(mostra, a.atraso); else mostra();
  };

  /** O que a base devolveu passa a ser o estado: negócios, referências, os só de leitura e a fotografia do que está gravado. */
  const aplicarLeitura = (novos: readonly NegocioLido[]): void => {
    refs = new Map(novos.map((n) => [n.linhas.negocio.numero, { id: n.id, entityId: n.entityId }]));
    lidos = new Map(novos.map((n) => [n.linhas.negocio.numero, n]));
    soLeitura = new Set(novos.filter((n) => n.docsCrm).map((n) => n.linhas.negocio.numero));
    docsPorId = new Set(novos.filter((n) => n.docsCrm).map((n) => n.id));
    S.deals = novos.map((n) => deLinhas(n.linhas));
    // os serviços do Catálogo fora do modelo, que os negócios já usam, entram em S.svc
    garantirServicosDosNegocios(S, S.deals);
    S.seq = Math.max(1000, ...S.deals.map((d) => d.id)) + 1;
    foto = fotografarNegocios(S.deals);
    lidaEm = Date.now();
  };

  /** Os só de leitura que mudaram em memória voltam à cópia lida (a base recusava-os; ficava o ecrã a mentir). */
  const reverterSoLeitura = (): void => {
    const mudados = negociosMudados(S.deals, foto).filter((d) => soLeitura.has(d.id));
    if (mudados.length === 0) return;
    for (const d of mudados) {
      const lido = lidos.get(d.id);
      const i = S.deals.findIndex((x) => x.id === d.id);
      if (lido && i >= 0) S.deals[i] = deLinhas(lido.linhas);
    }
    avisar({ msg: "Este negócio é do CRM: a alteração não foi guardada", sub: mudados.map((d) => d.nome).join(", ") + ". Faz-se em Contratos e Propostas.", kind: "bad" });
  };

  /** Relê a base e vê se algum negócio por gravar mudou lá desde a última leitura. Devolve o texto do conflito, ou `null` se se pode gravar. */
  const conflito = async (): Promise<string | null> => {
    const porGravar = negociosMudados(S.deals, foto).filter((d) => !soLeitura.has(d.id));
    if (porGravar.length === 0 || !ids) return null;
    const frescos = await lerNegocios(sb, org, ids);
    const porNumero = new Map(frescos.map((n) => [n.linhas.negocio.numero, n]));
    const emConflito = porGravar.filter((d) => {
      const fresco = porNumero.get(d.id);
      return fresco !== undefined && marcaNegocio(deLinhas(fresco.linhas)) !== foto.get(d.id);
    });
    if (emConflito.length === 0) return null;
    aplicarLeitura(frescos);
    return `${emConflito.map((d) => d.nome).join(", ")} mudou noutro sítio desde que o abriu. Relido: veja o que lá está e refaça a alteração, se ainda for preciso.`;
  };

  // grava o que mudou; se mudar outra vez enquanto grava, volta a gravar no fim (a mesma regra de /negocios)
  const gravar = async (): Promise<void> => {
    if (!ids) return;
    if (emGravacao) { deNovo = true; return; }
    emGravacao = true;
    gravacao = { k: "a-gravar" }; mudou();
    let gravados = 0;
    try {
      do {
        deNovo = false;
        reverterSoLeitura();
        const choque = await conflito();
        if (choque) { gravacao = { k: "erro", t: choque }; avisar({ msg: "Não gravou: o negócio mudou", sub: choque, kind: "bad" }); break; }
        const r = await gravarMudancas(sb, org, S, refs, foto, ids, soLeitura);
        gravados += r.gravados;
        if (r.erros.length) { gravacao = { k: "erro", t: r.erros.join(" · ") }; avisar({ msg: "Não gravou", sub: r.erros[0], kind: "bad" }); }
        else gravacao = { k: "gravado", n: r.gravados };
        for (const a of r.avisos) avisar({ msg: "Gravado, com um aviso", sub: a, kind: "" });
      } while (deNovo);
    } catch (e) {
      // gravarMudancas apanha o erro de cada negócio; isto é o que escapou (nunca engolido)
      gravacao = { k: "erro", t: (e as Error).message };
      avisar({ msg: "Não gravou", sub: (e as Error).message, kind: "bad" });
    } finally {
      emGravacao = false;
      mudou();
    }
    if (gravados > 0) for (const f of [...aposGravar]) f();
  };

  const run = (fn: () => void): void => {
    fn();
    if (!VISTAS.has(S.view)) {
      avisar({ msg: "Este ecrã ainda não está ligado", sub: "As Operações e o Inventário chegam nas próximas fases. Fica no negócio.", kind: "" });
      S.view = S.deal ? "negocio" : "negocios";
    }
    mudou();
    void gravar();
  };
  const go = (fn: () => void) => () => run(fn);
  const A = acoes(S, avisar, run);
  const porGravar = (): boolean => emGravacao || negociosMudados(S.deals, foto).length > 0;

  const ler = (silencioso: boolean): void => {
    if (!silencioso) { leitura = { k: "a-ler" }; mudou(); }
    void (async () => {
      const cat = await carregarCatalogo(sb, org, S);
      ids = idsServico(cat.M.ids.servico);
      aplicarLeitura(await lerNegocios(sb, org, ids));
      leitura = { k: "pronto" }; mudou();
    })().catch((e: Error) => {
      const texto = e.message || "Não foi possível ler os negócios.";
      if (silencioso) { avisar({ msg: "Não foi possível atualizar o negócio", sub: texto, kind: "bad" }); return; }
      leitura = { k: "erro", t: texto }; mudou();
    });
  };
  ler(false);

  return {
    org, S, A, run, go,
    versao: () => versao, leitura: () => leitura, gravacao: () => gravacao, avisos: () => avisosAtuais,
    subscrever: (fn) => { ouvintes.add(fn); return () => { ouvintes.delete(fn); }; },
    aoGravar: (fn) => { aposGravar.add(fn); return () => { aposGravar.delete(fn); }; },
    negocioDaBase: (id) => {
      for (const [numero, r] of refs) if (r.id === id) return S.deals.find((d) => d.id === numero);
      return undefined;
    },
    docsCrm: (id) => docsPorId.has(id),
    abrir: (d) => { S.deal = d.id; S.view = "negocio"; },
    reler: () => {
      if (porGravar()) { avisar({ msg: "Há alterações por gravar", sub: "Não se relê a organização enquanto houver alterações por gravar.", kind: "bad" }); return false; }
      ler(false);
      return true;
    },
    atualizar: () => {
      if (leitura.k !== "pronto" || porGravar() || Date.now() - lidaEm < LEITURA_FRESCA_MS) return;
      ler(true);
    },
    regravar: () => { void gravar(); },
    porGravar,
    aGravar: () => emGravacao,
  };
}
