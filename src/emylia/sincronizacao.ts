// O estado partilhado do protótipo (21/10/2026): para testar em live em vários aparelhos (o técnico no telemóvel, o gestor no
// portátil, o cliente no portal), o estado vai para o Supabase e volta para todos.
// · Partes: "global" (o que não é de um negócio), "deal:<id>" (um negócio cada), "inv" (o Inventário), "frota" e, desde 26/10,
//   "catalogo" (as mudanças ao Catálogo: só a diferença para o de base, v2/catalogoParte.ts).
//   23/10: e "rh" (o RH do protótipo: pessoas, ausências e custos; rh/ponteEstado.ts), só da equipa: o portal nunca a lê nem grava.
//   O que é de quem vê (o papel, o ecrã, o negócio aberto, o técnico) não se partilha.
// · Escrever: a cada mudança, as partes que mudaram (comparadas com o último JSON sincronizado) gravam-se com a versão que se
//   conhecia; se entretanto outro aparelho mudou a mesma parte, ganha a dele e avisa-se ("repita a última ação").
// · Ler: de 2 em 2 segundos, as versões de todas as partes; as que mudaram descarregam-se e aplicam-se.
// 2.0 (22/10): onde vive o estado depende de quem entrou (Armazem):
// · a equipa lê e grava a tabela app_estado da sua organização (RLS: só membros);
// · o cliente e o fornecedor não leem a tabela: recebem por app_portal_estado() uma cópia sem custos, só com o que é deles, e gravam
//   por app_portal_gravar() só as suas partes (o cliente os seus negócios; o fornecedor o Inventário, de que a base só aceita o seu).
// Sem rede ou sem tabela, o protótipo continua só neste browser (localStorage), como antes.
// 23/10 (segurança):
// · cada armazém é de UMA organização (`org`): o sincronizador recusa gravar ou aplicar um Estado marcado com outra (S.org), e
//   uma ligação antiga que responde depois de se trocar de organização é ignorada (`geracao`);
// · a equipa lê e grava pelas funções da 0015 (app_estado_ler / app_estado_versoes / app_estado_gravar): a base tira os custos,
//   os salários e as contas a quem não os pode ver e funde ao gravar. Sem as funções (a 0015 ainda não aplicada), a tabela;
// · o que se mudou sem rede fica numa fila (`pendentes`, guardada neste browser): ao voltar a rede, se outra pessoa mudou a
//   mesma parte entretanto, não ganha ninguém em silêncio: abre-se o conflito (ficar com as minhas / com as da base).
// 24/10 (junção com a 0011 do Ben): um só sítio escolhe o caminho (armazemDaConta): o cliente e o fornecedor, as funções do portal;
//   o técnico de obra, as suas (app_tecnico_estado / app_tecnico_gravar: a 0015 recusa-lhe as da equipa); a restante equipa, as da
//   0015 (app_estado_ler / app_estado_versoes / app_estado_gravar), com a tabela como recurso enquanto a 0015 não estiver aplicada.
import { supabase } from "@/integrations/supabase/client";
import type { Estado, Negocio } from "./motor";

const LOCAIS = ["role", "view", "deal", "op", "filtro", "novo", "confirmPerda", "pulse", "revisao", "aspeto", "leitura", "tec", "org"] as const;

const AVISO_GERAL = "Os dados foram atualizados por outra pessoa. Repita a última ação, se for preciso.";
const AVISO_RECUSA = "Sem permissão para gravar esta alteração: ficou a versão guardada.";

export type EstadoSync = "a ligar" | "ao vivo" | "sem ligação";
interface Parte { chave: string; dados: unknown }
export interface Linha { chave: string; dados: unknown; versao: number }
interface Fonte {
  /** O nome da parte e como se lê e aplica. */
  chave: string;
  ler: () => unknown;
  aplicar: (dados: unknown) => void;
}

/** Uma parte mudada sem rede que outra pessoa também mudou entretanto: a pessoa escolhe com qual fica. */
export interface ConflitoSync { chave: string; nome: string; remoto: Linha }

/** A base recusou a gravação (42501): quem grava não tem a permissão. Não é falta de rede. */
export class ErroSemPermissao extends Error {}

/** Onde vive o estado partilhado de quem entrou. */
export interface Armazem {
  /** o nome que o indicador "Ao vivo" mostra */
  nome: string;
  /** a organização deste armazém: só se grava e aplica um Estado com esta marca (S.org) */
  org?: string;
  /** depois de tudo(): a organização é de demonstração (organizacoes.demonstracao, 0015) */
  demonstracao?: boolean;
  /** a equipa começa uma organização vazia (com os dados de exemplo só na de demonstração); o portal nunca */
  podeComecar: boolean;
  tudo(): Promise<Linha[]>;
  /** só as versões (barato); null: este armazém não as dá à parte e compara-se o JSON de tudo() */
  versoes(): Promise<{ chave: string; versao: number }[] | null>;
  partes(chaves: string[]): Promise<Linha[]>;
  /** as partes que quem entrou pode gravar (as outras nunca se enviam) */
  podeGravar(chave: string): boolean;
  /** false: já existe (outro aparelho criou-a): segue o caminho do conflito */
  inserir(chave: string, dados: unknown, v: number): Promise<boolean>;
  /** a versão gravada, ou null se a guardada já não é a `conhecida` (conflito) */
  atualizar(chave: string, dados: unknown, v: number, conhecida: number): Promise<number | null>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface ErroBase { code?: string; message?: string }
/** A função ainda não existe na base (a 0015 por aplicar): PostgREST diz PGRST202; o Postgres, 42883. */
export const semFuncao = (e: ErroBase | null | undefined): boolean => !!e && (e.code === "PGRST202" || e.code === "42883");
const recusada = (e: ErroBase | null | undefined): boolean => !!e && e.code === "42501";

/** A equipa: o estado da organização, pelas funções da 0015 (a base filtra e funde por permissão); sem elas, a tabela app_estado. */
export function armazemEquipa(org: string, nome = "a organização"): Armazem {
  const tabela = () => db.from("app_estado");
  // null: ainda não se sabe; true: as funções da 0015; false: a tabela (base antiga)
  let porFuncoes: boolean | null = null;
  const A: Armazem = {
    nome, org, podeComecar: true, demonstracao: false,
    async tudo() {
      if (porFuncoes !== false) {
        const { data, error } = await db.rpc("app_estado_ler", { p_org: org });
        if (!error) {
          porFuncoes = true;
          const r = (data ?? {}) as { demonstracao?: boolean; partes?: Linha[] };
          A.demonstracao = !!r.demonstracao;
          return r.partes ?? [];
        }
        if (!semFuncao(error)) throw error;
        porFuncoes = false;
      }
      const { data, error } = await tabela().select("chave, dados, versao").eq("organizacao_id", org);
      if (error) throw error;
      return (data ?? []) as Linha[];
    },
    async versoes() {
      if (porFuncoes) {
        const { data, error } = await db.rpc("app_estado_versoes", { p_org: org });
        if (error) throw error;
        return (data ?? []) as { chave: string; versao: number }[];
      }
      const { data, error } = await tabela().select("chave, versao").eq("organizacao_id", org);
      if (error) throw error;
      return (data ?? []) as { chave: string; versao: number }[];
    },
    async partes(chaves) {
      if (porFuncoes) {
        const { data, error } = await db.rpc("app_estado_ler", { p_org: org, p_chaves: chaves });
        if (error) throw error;
        return ((data ?? {}) as { partes?: Linha[] }).partes ?? [];
      }
      const { data, error } = await tabela().select("chave, dados, versao").eq("organizacao_id", org).in("chave", chaves);
      if (error) throw error;
      return (data ?? []) as Linha[];
    },
    podeGravar: () => true,
    async inserir(chave, dados, v) {
      if (porFuncoes) {
        const { data, error } = await db.rpc("app_estado_gravar", { p_org: org, p_chave: chave, p_dados: dados, p_versao: null, p_nova: v });
        if (recusada(error)) throw new ErroSemPermissao(error.message);
        if (error) throw error;
        return data != null;
      }
      const { error } = await tabela().insert({ organizacao_id: org, chave, dados, versao: v });
      if (recusada(error)) throw new ErroSemPermissao(error.message);
      return !error;
    },
    async atualizar(chave, dados, v, conhecida) {
      if (porFuncoes) {
        const { data, error } = await db.rpc("app_estado_gravar", { p_org: org, p_chave: chave, p_dados: dados, p_versao: conhecida, p_nova: v });
        if (recusada(error)) throw new ErroSemPermissao(error.message);
        if (error) throw error;
        return data == null ? null : Number(data);
      }
      const { data, error } = await tabela().update({ dados, versao: v, atualizado: new Date().toISOString() })
        .eq("organizacao_id", org).eq("chave", chave).eq("versao", conhecida).select("chave");
      if (recusada(error)) throw new ErroSemPermissao(error.message);
      if (error) throw error;
      return data?.length ? v : null;
    },
  };
  return A;
}

/** O cliente e o fornecedor: só pelas funções do portal (a base tira os custos ao ler e repõe-nos ao gravar). */
export function armazemPortal(tipo: "cliente" | "fornecedor", deals: number[], org?: string): Armazem {
  const tudo = async (): Promise<Linha[]> => {
    const { data, error } = await db.rpc("app_portal_estado");
    if (error) throw error;
    return (data ?? []) as Linha[];
  };
  return {
    nome: "o portal", org, podeComecar: false, tudo,
    versoes: async () => null,
    partes: async (chaves) => (await tudo()).filter((l) => chaves.includes(l.chave)),
    podeGravar: (chave) => tipo === "fornecedor" ? chave === "inv" : /^deal:\d+$/.test(chave) && deals.includes(Number(chave.slice(5))),
    inserir: async () => false, // o portal nunca cria partes
    async atualizar(chave, dados, _v, conhecida) {
      const { data, error } = await db.rpc("app_portal_gravar", { p_chave: chave, p_dados: dados, p_versao: conhecida });
      if (error) { if (error.code === "40001") return null; if (recusada(error)) throw new ErroSemPermissao(error.message); throw error; }
      return Number(data);
    },
  };
}

/** 23/10 (0011): o técnico de obra: só pelas funções do técnico (as obras onde tem tarefas, sem preços nem custos). Grava só as
 *  obras que lê; a base aceita só o trabalho dele (registos, problemas, imprevistos) e ignora o resto. */
export function armazemTecnico(org: string): Armazem {
  // 24/10: um armazém de UMA organização (como os outros: S.org) e a recusa da base (42501) é "sem permissão", não falta de rede
  let minhas = new Set<string>();
  const tudo = async (): Promise<Linha[]> => {
    const { data, error } = await db.rpc("app_tecnico_estado", { p_org: org });
    if (error) throw error;
    const L = (data ?? []) as Linha[];
    minhas = new Set(L.filter((l) => /^deal:\d+$/.test(l.chave)).map((l) => l.chave));
    return L;
  };
  return {
    nome: "as suas obras", org, podeComecar: false, tudo,
    versoes: async () => null,
    partes: async (chaves) => (await tudo()).filter((l) => chaves.includes(l.chave)),
    podeGravar: (chave) => minhas.has(chave),
    inserir: async () => false, // o técnico nunca cria partes
    async atualizar(chave, dados, _v, conhecida) {
      const { data, error } = await db.rpc("app_tecnico_gravar", { p_org: org, p_chave: chave, p_dados: dados, p_versao: conhecida });
      if (error) { if (error.code === "40001") return null; if (recusada(error)) throw new ErroSemPermissao(error.message); throw error; }
      return Number(data);
    },
  };
}

/** 24/10: o caminho de quem entrou (o único sítio que o decide): o portal (cliente, fornecedor), o técnico de obra ou a equipa.
 *  Sem organização (os testes, ou a equipa à espera do seletor), nenhum: o protótipo fica só neste browser. */
export function armazemDaConta(o: {
  portal?: { tipo: "cliente" | "fornecedor"; deals: number[]; organizacao_id?: string } | null;
  tecnico?: boolean; org: string | null; nome?: string;
}): Armazem | null {
  if (o.portal) return armazemPortal(o.portal.tipo, o.portal.deals, o.portal.organizacao_id ?? o.org ?? undefined);
  if (!o.org) return null;
  return o.tecnico ? armazemTecnico(o.org) : armazemEquipa(o.org, o.nome);
}

const novaVersao = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);

/* ------------------------------------------------------------------ dividir e juntar o Estado */
export function partesDoEstado(S: Estado): Parte[] {
  const g: Record<string, unknown> = { ...S, ordem: S.deals.map((d) => d.id) };
  delete g.deals;
  for (const k of LOCAIS) delete g[k];
  return [{ chave: "global", dados: g }, ...S.deals.map((d) => ({ chave: "deal:" + d.id, dados: d }))];
}
/** Junta as partes remotas ao Estado local: o que é de quem vê fica deste aparelho.
 *  23/10: sem a "global" (ex.: a local está por enviar), um negócio que chega e não está na ordem local junta-se no fim (não se perde);
 *  e os negócios em `manter` (criados sem rede, por enviar) ficam mesmo que a ordem remota ainda não os tenha. */
export function juntarEstado(local: Estado, global: Record<string, unknown> | null, deals: Map<number, Negocio>, manter: readonly number[] = []): Estado {
  const S = { ...local, ...(global ?? {}) } as Estado & { ordem?: number[] };
  for (const k of LOCAIS) (S as unknown as Record<string, unknown>)[k] = (local as unknown as Record<string, unknown>)[k];
  const locais = local.deals.map((d) => d.id);
  const ordem = S.ordem ? [...S.ordem] : [...locais, ...[...deals.keys()].filter((id) => !locais.includes(id))];
  for (const id of manter) if (!ordem.includes(id) && locais.includes(id)) ordem.push(id);
  delete S.ordem;
  S.deals = ordem.map((id) => deals.get(id) ?? local.deals.find((d) => d.id === id)).filter(Boolean) as Negocio[];
  return S;
}

/** 21/10: das partes remotas, as que se aplicam e as que ficam como estão neste aparelho: as que já foram sincronizadas (há o JSON
 *  delas) e mudaram cá desde então, ainda por enviar. Uma parte remota igual à local aplica-se (só atualiza a versão).
 *  22/10: a "global" (contadores, ordem dos negócios) nunca se mantém: aplica-se a remota e, se tinha mudanças cá por enviar, vai
 *  também em `perdidas` (para avisar quem a mudou). */
export function separarRemoto<L extends { chave: string; dados: unknown }>(linhas: L[], locais: Parte[], sincronizado: Map<string, string>): { aplicar: L[]; manter: L[]; perdidas: string[] } {
  const atual = new Map(locais.map((p) => [p.chave, JSON.stringify(p.dados)]));
  const aplicar: L[] = [], manter: L[] = [], perdidas: string[] = [];
  for (const l of linhas) {
    const antes = sincronizado.get(l.chave), agora = atual.get(l.chave);
    const porEnviar = antes != null && agora != null && agora !== antes;
    const diferente = porEnviar && JSON.stringify(l.dados) !== agora;
    if (diferente && l.chave === "global") { aplicar.push(l); perdidas.push(l.chave); }
    else (diferente ? manter : aplicar).push(l);
  }
  return { aplicar, manter, perdidas };
}

/* ------------------------------------------------------------------ o motor da sincronização */
/** O que fica guardado neste browser para a fila do que se mudou sem rede (por organização e pessoa). */
interface Guardado { versoes: Record<string, number>; pendentes: Record<string, number | null> }
const PREFIXO_FILA = "olyvia-sinc-fila:";

/** O nome de uma parte para o diálogo do conflito. */
export function nomeDaParte(l: Linha): string {
  if (l.chave === "global") return "Os dados gerais (clientes, catálogo, definições)";
  if (l.chave === "inv") return "O Inventário";
  if (l.chave === "frota") return "A Frota";
  if (l.chave === "catalogo") return "O Catálogo (produtos, árvore e pacotes)";
  if (l.chave === "rh") return "Os Recursos Humanos (pessoas, ausências e custos)";
  if (l.chave.startsWith("deal:")) {
    const n = (l.dados as { nome?: unknown } | null)?.nome;
    return "O negócio " + (typeof n === "string" && n ? n : "#" + l.chave.slice(5));
  }
  return l.chave;
}

export interface OpcoesLigar {
  /** Onde guardar a fila do que se mudou sem rede (a chave local da organização e de quem entrou). Sem ela, a fila só vive em memória. */
  chaveLocal?: string;
}

export class Sincronizador {
  private versoes = new Map<string, number>();
  private json = new Map<string, string>();
  private fontes: Fonte[] = [];
  private estadoFonte: { ler: () => Estado; aplicar: (S: Estado) => void } | null = null;
  private relogio = 0;
  private aEnviar = 0;
  private ocupado = false;
  estado: EstadoSync = "a ligar";
  private ouvintes = new Set<() => void>();
  private avisarConflito: ((t: string) => void) | null = null;
  private armazem: Armazem | null = null;
  ligado = false;
  /** 23/10: cada ligação tem o seu número; uma resposta de uma ligação anterior (outra organização) ignora-se. */
  private geracao = 0;
  /** 23/10: a 1.ª leitura já chegou (sem ela não se sabe que versões a base tem: nada se grava, fica tudo na fila). */
  private carregado = false;
  /** 23/10: as partes mudadas sem rede, com a versão em que se mudaram (null: a parte era nova). */
  private pendentes = new Map<string, number | null>();
  /** 23/10: os conflitos à espera da escolha de quem mudou sem rede. */
  private abertos: ConflitoSync[] = [];
  private chaveLocal: string | null = null;
  /** 23/10: há versões guardadas de uma sessão anterior (sem elas, antes da 1.ª leitura não se sabe o que mudou: nada vai para a fila). */
  private comBase = false;
  private comecar: ((demonstracao: boolean) => void) | null = null;
  /** 23/10: a organização ligada é de demonstração (organizacoes.demonstracao). */
  demonstracao = false;

  /** O nome do sítio onde o estado vive (para o indicador "Ao vivo"). */
  get onde(): string { return this.armazem?.nome ?? ""; }
  /** Os conflitos por resolver (o diálogo). Sempre o mesmo array até mudar (useSyncExternalStore). */
  get conflitos(): readonly ConflitoSync[] { return this.abertos; }
  /** Quantas partes estão na fila, por enviar. */
  get porEnviar(): number { return this.pendentes.size; }

  ouvir(fn: () => void) { this.ouvintes.add(fn); return () => { this.ouvintes.delete(fn); }; }
  private avisarOuvintes() { for (const f of this.ouvintes) f(); }
  private mudar(e: EstadoSync) { if (this.estado !== e) { this.estado = e; this.avisarOuvintes(); } }

  /** Liga o Estado (as partes global e deal:*), mais as fontes simples (inv, frota). `comecar(demonstracao)`: a organização ainda não tem
   *  nada partilhado (a app põe-na vazia, ou com os dados de exemplo se for de demonstração). */
  async ligar(armazem: Armazem, estado: { ler: () => Estado; aplicar: (S: Estado) => void }, fontes: Fonte[], conflito: (t: string) => void,
    comecar: (demonstracao: boolean) => void, opcoes: OpcoesLigar = {}) {
    // nos testes, nunca: só no browser a sério (23/10: salvo os testes que simulam a base e ligam esta marca, ex.: portaisReais)
    const testeComBase = !!(globalThis as { __olyviaSincNosTestes?: boolean }).__olyviaSincNosTestes;
    if (this.ligado || ((import.meta.env.MODE === "test" || import.meta.env.VITEST) && !testeComBase)) { this.mudar("sem ligação"); return; }
    this.ligado = true;
    const g = ++this.geracao;
    this.armazem = armazem; this.versoes.clear(); this.json.clear(); this.pendentes.clear(); this.carregado = false;
    if (this.abertos.length) { this.abertos = []; this.avisarOuvintes(); }
    this.estadoFonte = estado; this.fontes = fontes; this.avisarConflito = conflito; this.comecar = comecar;
    this.demonstracao = false;
    this.chaveLocal = opcoes.chaveLocal ?? null;
    // a fila de uma sessão anterior (mudanças sem rede, ainda por enviar): as versões que se conheciam e o que ficou por enviar
    const guardado = this.lerGuardado();
    this.comBase = !!guardado;
    if (guardado) {
      for (const [k, v] of Object.entries(guardado.versoes)) this.versoes.set(k, v);
      for (const [k, v] of Object.entries(guardado.pendentes)) this.pendentes.set(k, v);
      // o que está agora no Estado é o que se conhecia (o localStorage desta organização): o que mudar a partir daqui vai para a fila
      for (const p of this.todasAsPartes()) if (this.versoes.has(p.chave)) this.json.set(p.chave, JSON.stringify(p.dados));
    }
    this.mudar("a ligar");
    await this.carregar(g);
    if (g !== this.geracao) return;
    this.relogio = window.setInterval(() => { void this.puxar(); }, 2000);
  }

  desligar() {
    window.clearInterval(this.relogio); window.clearTimeout(this.aEnviar);
    this.ligado = false; this.armazem = null; this.geracao++; this.carregado = false; this.ocupado = false;
    if (this.abertos.length) { this.abertos = []; this.avisarOuvintes(); }
  }

  /** A 1.ª leitura (ou outra vez, ao voltar a rede, se a 1.ª falhou). */
  private async carregar(g: number) {
    const a = this.armazem;
    if (!a) return;
    this.ocupado = true;
    try {
      const linhas = await a.tudo();
      if (g !== this.geracao) return;
      this.demonstracao = !!a.demonstracao;
      if (linhas.some((l) => l.chave === "global")) {
        // já há estado partilhado: aplica-o (é o de todos), salvo o que ficou na fila (que se compara: segue, ou abre o conflito)
        this.aplicarRemoto(linhas, false, true);
        this.carregado = true;
      } else if (a.podeComecar) {
        // a primeira vez nesta organização: começa vazia (ou com os dados de exemplo, se for de demonstração), e não do que este
        // aparelho tinha guardado
        this.comecar?.(this.demonstracao);
        this.pendentes.clear(); this.versoes.clear(); this.json.clear();
        this.carregado = true;
        this.ocupado = false;
        await this.enviar(true);
        if (g !== this.geracao) return;
      } else {
        throw new Error("Ainda não há nada partilhado com este portal");
      }
      this.guardar();
      this.mudar("ao vivo");
    } catch {
      if (g === this.geracao) this.mudar("sem ligação");
    } finally {
      if (g === this.geracao) this.ocupado = false;
    }
    if (g === this.geracao && this.pendentes.size) this.mudou();
  }

  /** Uma mudança local: envia daqui a pouco (junta várias mudanças seguidas). */
  mudou() {
    if (!this.ligado) return;
    window.clearTimeout(this.aEnviar);
    this.aEnviar = window.setTimeout(() => { void this.enviar(false); }, 250);
  }

  private todasAsPartes(): Parte[] {
    const S = this.estadoFonte!.ler();
    return [...partesDoEstado(S), ...this.fontes.map((f) => ({ chave: f.chave, dados: f.ler() }))];
  }

  /** 23/10: o Estado deste aparelho é da organização deste armazém? (S.org; um armazém sem organização — os testes — aceita tudo) */
  private estadoDaOrganizacao(): boolean {
    const org = this.armazem?.org;
    return !org || this.estadoFonte?.ler().org === org;
  }

  /** As partes que mudaram cá e ainda não foram enviadas (para a fila). */
  private porEnviarAgora(): Parte[] {
    const a = this.armazem;
    if (!a) return [];
    return this.todasAsPartes().filter((p) => a.podeGravar(p.chave) && this.json.get(p.chave) !== JSON.stringify(p.dados));
  }

  /** Sem rede: o que mudou fica na fila, com a versão em que se mudou (a 1.ª vez que entra). */
  private paraAFila(partes: Parte[]) {
    let mudou = false;
    for (const p of partes) if (!this.pendentes.has(p.chave)) { this.pendentes.set(p.chave, this.versoes.get(p.chave) ?? null); mudou = true; }
    if (mudou) { this.guardar(); this.avisarOuvintes(); }
  }

  private async enviar(tudo: boolean) {
    if (this.ocupado) { this.mudou(); return; }
    const a = this.armazem, g = this.geracao;
    if (!a || !this.estadoFonte) return;
    // 23/10: nunca se grava numa organização o Estado de outra (ex.: trocou-se de organização a meio)
    if (!this.estadoDaOrganizacao()) {
      console.warn("[sincronização] o Estado deste aparelho não é da organização ligada: nada se grava");
      return;
    }
    // sem a 1.ª leitura não se conhecem as versões da base: o que mudou fica na fila e tenta-se ler outra vez
    // (sem versões de uma sessão anterior não se sabe o que mudou: a fila ficaria com tudo e "Manter as minhas" esmagava a organização)
    if (!this.carregado) { if (this.comBase) this.paraAFila(this.porEnviarAgora()); void this.carregar(g); return; }
    this.ocupado = true;
    const emConflito = new Set(this.abertos.map((c) => c.chave));
    let falhou: Parte[] = [];
    try {
      const partes = this.todasAsPartes();
      for (let i = 0; i < partes.length; i++) {
        const p = partes[i];
        if (!a.podeGravar(p.chave) || emConflito.has(p.chave)) continue;
        const j = JSON.stringify(p.dados);
        if (!tudo && this.json.get(p.chave) === j) continue;
        const conhecida = this.versoes.get(p.chave);
        let v: number | null = novaVersao();
        try {
          if (conhecida == null) {
            if (!(await a.inserir(p.chave, p.dados, v))) { if (g === this.geracao) await this.conflito(p.chave); continue; }
          } else {
            v = await a.atualizar(p.chave, p.dados, v, conhecida);
            if (v == null) { if (g === this.geracao) await this.conflito(p.chave); continue; }
          }
        } catch (e) {
          if (e instanceof ErroSemPermissao) { if (g === this.geracao) await this.recusada(p.chave); continue; }
          // sem rede: esta e as que faltam ficam na fila
          falhou = partes.slice(i).filter((x) => a.podeGravar(x.chave) && !emConflito.has(x.chave) && (tudo || this.json.get(x.chave) !== JSON.stringify(x.dados)));
          throw e;
        }
        if (g !== this.geracao) return;
        this.versoes.set(p.chave, v); this.json.set(p.chave, j);
        if (this.pendentes.delete(p.chave)) this.avisarOuvintes();
      }
      this.guardar();
      this.mudar("ao vivo");
    } catch {
      if (g === this.geracao) { this.paraAFila(falhou); this.mudar("sem ligação"); }
    } finally {
      if (g === this.geracao) this.ocupado = false;
    }
  }

  /** Outro aparelho mudou a mesma parte entretanto: fica a versão dele (23/10: salvo se a nossa é da fila sem rede: abre-se o conflito). */
  private async conflito(chave: string) {
    const data = await this.armazem!.partes([chave]);
    // a parte desapareceu (a organização foi limpa): volta a criar-se com a deste aparelho
    if (!data.length) { this.versoes.delete(chave); this.json.delete(chave); this.mudou(); return; }
    if (this.pendentes.has(chave)) { this.abrirConflitos(data); return; }
    this.aplicarRemoto(data, true);
    this.avisarConflito?.(chave.startsWith("deal:") ? "Alguém mudou este negócio ao mesmo tempo. Já tem a versão dele: repita a última ação, se for preciso." : AVISO_GERAL);
  }

  /** 23/10: a base recusou (sem permissão): fica a versão guardada e diz-se porquê. */
  private async recusada(chave: string) {
    this.pendentes.delete(chave);
    const data = await this.armazem!.partes([chave]).catch(() => [] as Linha[]);
    if (data.length) this.aplicarRemoto(data, true);
    else { this.json.set(chave, JSON.stringify(this.todasAsPartes().find((p) => p.chave === chave)?.dados)); }
    this.avisarConflito?.(AVISO_RECUSA);
  }

  private async puxar() {
    if (this.ocupado || !this.armazem) return;
    const g = this.geracao;
    if (!this.carregado) { await this.carregar(g); return; }
    try {
      const a = this.armazem;
      const vs = await a.versoes();
      if (g !== this.geracao) return;
      if (vs) {
        const mudaram = vs.filter((l) => this.versoes.get(l.chave) !== l.versao).map((l) => l.chave);
        if (mudaram.length) {
          const d2 = await a.partes(mudaram);
          if (g === this.geracao && !this.ocupado) this.aplicarRemoto(d2);
        }
      } else {
        // o portal: vem tudo de uma vez; aplica-se o que mudou (as versões do Inventário do portal são sempre 0: compara-se o JSON)
        const mudaram = (await a.tudo()).filter((l) => this.versoes.get(l.chave) !== l.versao || this.json.get(l.chave) !== JSON.stringify(l.dados));
        if (g === this.geracao && mudaram.length && !this.ocupado) this.aplicarRemoto(mudaram);
      }
      if (g !== this.geracao) return;
      this.mudar("ao vivo");
      // voltou a rede com coisas na fila: envia-as
      if (this.pendentes.size) this.mudou();
    } catch {
      if (g === this.geracao) this.mudar("sem ligação");
    }
  }

  /** 21/10: aplica as partes remotas. Uma parte com mudanças locais ainda por enviar (o envio espera 250 ms) não se escreve por cima:
   *  fica a deste aparelho e envia-se logo a seguir (senão a ação acabada de fazer perdia-se em silêncio).
   *  22/10: a versão conhecida dessa parte NÃO passa a ser a remota: o envio grava com a versão que este aparelho viu, bate no
   *  controlo de versão e segue o caminho do conflito (ganha a remota e avisa-se). Nunca se grava por cima de uma versão remota que
   *  este aparelho não aplicou. A "global" não se mantém (separarRemoto): ganha logo a remota e avisa-se, se tinha mudanças por enviar.
   *  `forcar` (o conflito no envio): ganha a remota, como antes.
   *  23/10: as partes da fila (mudadas sem rede) nunca se escrevem por cima: se a remota ainda é a versão em que se mudaram, envia-se a
   *  nossa; se outra pessoa a mudou entretanto, abre-se o conflito. `inicial`: a 1.ª leitura (não há JSON sincronizado). */
  private aplicarRemoto(linhas: Linha[], forcar = false, inicial = false) {
    const daFila: Linha[] = [], resto: Linha[] = [];
    const emConflito = new Set(this.abertos.map((c) => c.chave));
    for (const l of linhas) (emConflito.has(l.chave) || (!forcar && this.pendentes.has(l.chave)) ? daFila : resto).push(l);
    const novos: Linha[] = [];
    if (daFila.length) {
      const locais = new Map(this.todasAsPartes().map((p) => [p.chave, JSON.stringify(p.dados)]));
      for (const l of daFila) {
        if (emConflito.has(l.chave)) { this.abertos = this.abertos.map((c) => (c.chave === l.chave ? { ...c, remoto: l } : c)); continue; }
        const base = this.pendentes.get(l.chave);
        if (locais.get(l.chave) === JSON.stringify(l.dados)) { this.pendentes.delete(l.chave); resto.push(l); } // afinal iguais
        else if (base != null && base === l.versao) {
          // ninguém lhe mexeu: fica a nossa e envia-se com essa versão
          this.versoes.set(l.chave, l.versao); this.json.set(l.chave, JSON.stringify(l.dados));
        } else novos.push(l);
      }
    }
    const { aplicar, manter, perdidas } = forcar || inicial ? { aplicar: resto, manter: [], perdidas: [] } : separarRemoto(resto, this.estadoFonte ? this.todasAsPartes() : [], this.json);
    if (manter.length) this.mudou();
    this.aplicarLinhas(aplicar);
    if (perdidas.length) this.avisarConflito?.(AVISO_GERAL);
    if (novos.length) this.abrirConflitos(novos);
    else if (daFila.length) this.avisarOuvintes();
  }

  private abrirConflitos(linhas: Linha[]) {
    const ja = new Map(this.abertos.map((c) => [c.chave, c]));
    for (const l of linhas) ja.set(l.chave, { chave: l.chave, nome: nomeDaParte(l), remoto: l });
    this.abertos = [...ja.values()];
    this.avisarOuvintes();
  }

  /** 23/10: a escolha no diálogo do conflito. "minhas": grava-se a deste aparelho por cima da remota (que se viu); "remotas": fica a
   *  remota e a mudança feita sem rede deita-se fora. */
  resolverConflitos(escolha: "minhas" | "remotas") {
    const lista = this.abertos;
    if (!lista.length) return;
    this.abertos = [];
    if (escolha === "minhas") {
      for (const c of lista) {
        this.versoes.set(c.chave, c.remoto.versao); this.json.set(c.chave, JSON.stringify(c.remoto.dados));
        this.pendentes.set(c.chave, c.remoto.versao);
      }
      this.guardar();
      this.avisarOuvintes();
      this.mudou();
    } else {
      for (const c of lista) this.pendentes.delete(c.chave);
      this.aplicarLinhas(lista.map((c) => c.remoto));
      this.guardar();
      this.avisarOuvintes();
    }
  }

  private aplicarLinhas(linhas: Linha[]) {
    if (!linhas.length) return;
    // 23/10: nunca se aplica a parte de uma organização num Estado de outra
    if (!this.estadoDaOrganizacao()) return;
    let global: Record<string, unknown> | null = null;
    const deals = new Map<number, Negocio>();
    for (const l of linhas) {
      this.versoes.set(l.chave, l.versao); this.json.set(l.chave, JSON.stringify(l.dados));
      if (l.chave === "global") global = l.dados as Record<string, unknown>;
      else if (l.chave.startsWith("deal:")) deals.set(Number(l.chave.slice(5)), l.dados as Negocio);
      else this.fontes.find((f) => f.chave === l.chave)?.aplicar(l.dados);
    }
    if (global || deals.size) {
      const local = this.estadoFonte!.ler();
      // os negócios criados sem rede (na fila) não desaparecem por a ordem remota ainda não os ter
      const manter = [...this.pendentes.keys()].filter((k) => k.startsWith("deal:")).map((k) => Number(k.slice(5)));
      this.estadoFonte!.aplicar(juntarEstado(local, global, deals, manter));
    }
    this.guardar(); // as versões conhecidas (a base da fila numa próxima sessão sem rede)
  }

  /* ---------------------------------------------------------------- a fila guardada neste browser */
  private lerGuardado(): Guardado | null {
    if (!this.chaveLocal) return null;
    try {
      const j = JSON.parse(localStorage.getItem(PREFIXO_FILA + this.chaveLocal) || "null") as Guardado | null;
      return j && typeof j === "object" && j.versoes && j.pendentes ? j : null;
    } catch { return null; }
  }
  private guardar() {
    if (!this.chaveLocal) return;
    try {
      localStorage.setItem(PREFIXO_FILA + this.chaveLocal, JSON.stringify({ versoes: Object.fromEntries(this.versoes), pendentes: Object.fromEntries(this.pendentes) } satisfies Guardado));
    } catch { /* sem storage: a fila fica só em memória */ }
  }
}

export const sinc = new Sincronizador();
