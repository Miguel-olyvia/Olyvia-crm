// As contas dos portais no protótipo (22/10/2026): o login dos portais (?login=1, LoginPortal.tsx) e o popup com as credenciais
// (AcessoPortalDialog.tsx), para testar sem emails a sério. Só dados de teste no Estado (S.acessos, na parte "global" da sincronização):
// nada de Supabase Auth nem de edge functions.
// · Cliente: a conta nasce no primeiro envio ao portal (proposta, contrato, adenda, contrato da adenda), com o email da ficha do cliente e
//   uma password temporária de 8 caracteres (como create-client-portal-access). Nos envios seguintes, só o link ("Nova … disponível").
// · Fornecedor: a conta nasce com o convite ("Enviar acesso"), com uma password temporária de 16 caracteres (create-supplier-portal-access);
//   "Reenviar" gera outra (como "Reenviar credenciais").
// · O popup pendente vive só neste separador (fora do Estado): quem está a ver noutro aparelho não o recebe.
import { useSyncExternalStore } from "react";
import type { Estado, Negocio } from "./motor";

/** A empresa que envia (a mesma das folhas dos documentos, DocsCliente.tsx). */
export const EMPRESA_PORTAL = "Mudelar";

export type TipoConta = "cliente" | "fornecedor";
export interface ContaPortal {
  /** sempre em minúsculas (é a chave em S.acessos) */
  email: string;
  password: string;
  tipo: TipoConta;
  /** cliente: o negócio do último envio; fornecedor: o id do fornecedor no Inventário */
  ref: string;
  nome: string;
  /** já trocou a password temporária (no primeiro acesso) */
  mudouPassword: boolean;
  criadoEm: string;
  /** cliente: os negócios com documentos enviados, o mais recente primeiro */
  deals?: number[];
}

/** O documento que foi ao portal do cliente (o assunto e o texto do email). */
export type DocPortal = "proposta" | "contrato" | "adenda" | "contratoAdenda" | "fatura" | "auto";
const DOCS: Record<DocPortal, { l: string; m: boolean }> = {
  proposta: { l: "proposta", m: false },
  contrato: { l: "contrato", m: true },
  adenda: { l: "proposta de adenda", m: false },
  contratoAdenda: { l: "contrato da adenda", m: true },
  // 24/10 (2.0): também o aviso por email da fatura e do auto de receção
  fatura: { l: "fatura", m: false },
  auto: { l: "auto de receção", m: true },
};
/** "uma proposta" / "um contrato", "Nova proposta" / "Novo contrato". */
export const docComArtigo = (d: DocPortal): string => (DOCS[d].m ? "um " : "uma ") + DOCS[d].l;
export const docNovo = (d: DocPortal): string => (DOCS[d].m ? "Novo " : "Nova ") + DOCS[d].l;
export const docUmNovo = (d: DocPortal): string => (DOCS[d].m ? "um novo " : "uma nova ") + DOCS[d].l;

/** O que o popup mostra: a conta (uma cópia), se o email leva a password temporária e o que se enviou. */
export interface EnvioAcesso {
  conta: ContaPortal;
  /** com credenciais (conta nova, ou password reposta): o email leva a password temporária */
  comPassword: boolean;
  empresa: string;
  /** só no cliente */
  doc?: DocPortal;
  titulo?: string;
  /** 22/10: só no fornecedor, a encomenda (PO) que acabou de seguir para ele: o popup mostra o email da encomenda e o login abre-a */
  po?: PoEnviada;
  n: number;
}

/** 22/10: a PO aprovada e enviada ao fornecedor. `publicada`: foi ao portal (portal ativo); senão seguiu o PDF por email.
 *  `acessoNovo`: o fornecedor não tinha acesso ao portal e o envio da PO deu-lho agora (como "Enviar acesso"). */
export interface PoEnviada { id: string; publicada: boolean; acessoNovo: boolean }

/* ------------------------------------------------------------------ as contas */
const LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
/** Uma password temporária (sem letras que se confundem: 0/O, 1/l/I). */
export function gerarPassword(n: number): string {
  const r = new Uint32Array(n);
  try { crypto.getRandomValues(r); } catch { for (let i = 0; i < n; i++) r[i] = Math.floor(Math.random() * 2 ** 32); }
  return Array.from(r, (x) => LETRAS[x % LETRAS.length]).join("");
}

const normal = (e: string): string => e.trim().toLowerCase();
/** 23/10: a mesma regra da Edge Function criar-conta-portal (o domínio com 2 letras ou mais). */
export const emailOk = (e: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;
const contas = (S: Estado): Record<string, ContaPortal> => (S.acessos ??= {});

/** 23/10: o email da ficha do cliente, se for válido (senão null). */
export const emailDaFicha = (d: Negocio): string | null => {
  const e = normal(d.f.email || "");
  return emailOk(e) ? e : null;
};
/** O email de acesso do cliente: o da ficha; sem ele, um de teste (só no protótipo de sempre: na 2.0 o envio pede o email antes,
 *  pedirEmailPortal, para nunca criar uma conta real com um email inventado). */
export const emailCliente = (d: Negocio): string => emailDaFicha(d) ?? `cliente-${d.id}@teste.olyvia.pt`;

/** Cria (ou encontra) a conta do cliente de um negócio, ao enviar um documento ao portal. */
export function contaCliente(S: Estado, d: Negocio, doc: DocPortal, titulo: string): Omit<EnvioAcesso, "n"> {
  const C = contas(S), email = emailCliente(d);
  let c = C[email], comPassword = false;
  if (!c || c.tipo !== "cliente") {
    c = { email, password: gerarPassword(8), tipo: "cliente", ref: String(d.id), nome: d.f.nome_fiscal || d.nome, mudouPassword: false, criadoEm: new Date().toISOString(), deals: [] };
    C[email] = c;
    comPassword = true;
  }
  c.ref = String(d.id);
  c.deals = [d.id, ...(c.deals ?? []).filter((x) => x !== d.id)];
  return { conta: { ...c, deals: [...c.deals] }, comPassword, empresa: empresaQueEnvia(), doc, titulo };
}

/** O fornecedor como o Inventário o tem (só o que a conta precisa). */
export interface FornConta { id: string; name: string; email: string; contact?: string; company?: string; invite?: { email: string; name: string } }
/** Cria (ou encontra) a conta do fornecedor ao enviar o acesso; `reenviar` gera uma password temporária nova. Uma conta por fornecedor:
 *  se o email do convite mudou, a conta antiga sai. */
export function contaFornecedor(S: Estado, s: FornConta, reenviar: boolean): Omit<EnvioAcesso, "n"> {
  const C = contas(S), email = normal(s.invite?.email || s.email);
  for (const k of Object.keys(C)) if (k !== email && C[k].tipo === "fornecedor" && C[k].ref === s.id) delete C[k];
  let c = C[email], comPassword = false;
  if (!c || c.tipo !== "fornecedor" || c.ref !== s.id) {
    c = { email, password: gerarPassword(16), tipo: "fornecedor", ref: s.id, nome: s.invite?.name || s.contact || s.name, mudouPassword: false, criadoEm: new Date().toISOString() };
    C[email] = c;
    comPassword = true;
  } else if (reenviar) {
    c.password = gerarPassword(16); c.mudouPassword = false;
    comPassword = true;
  }
  return { conta: { ...c }, comPassword, empresa: s.company || empresaQueEnvia() };
}

/** 22/10: a conta do fornecedor ao enviar-lhe uma PO: a que já existe (a password não muda) ou uma nova com password temporária, e a PO. */
export function contaFornecedorPo(S: Estado, s: FornConta, po: PoEnviada): Omit<EnvioAcesso, "n"> {
  return { ...contaFornecedor(S, s, false), po: { ...po } };
}

/** 22/10: o login a abrir pelo popup de uma PO: o email da conta e a encomenda (só se foi publicada no portal; por email não está lá). */
export const prefillDaPo = (e: EnvioAcesso): Omit<LoginPrefill, "n"> | null =>
  e.po && e.conta.tipo === "fornecedor" ? { email: e.conta.email, po: e.po.publicada ? e.po.id : null } : null;

/** O login: a conta com este email e esta password (ou null). */
export function entrar(S: Estado, email: string, password: string): ContaPortal | null {
  const c = S.acessos?.[normal(email)];
  return c && c.password === password ? c : null;
}

/** A password nova do primeiro acesso (ou do assistente do fornecedor). */
export function mudarPassword(S: Estado, email: string, nova: string): void {
  const c = S.acessos?.[normal(email)];
  if (c) { c.password = nova; c.mudouPassword = true; }
}


/** Há alguma coisa do negócio no portal (a proposta ou uma adenda enviadas). */
const noPortal = (d: Negocio): boolean => !!d.orc?.enviada || !!d.adendas?.some((a) => !!a.enviada);
/** O negócio que o portal do cliente abre: o do envio mais recente que ainda lá está; senão um do mesmo email. */
export function negocioDaConta(S: Estado, c: ContaPortal): Negocio | undefined {
  const ids = [...(c.deals ?? []), Number(c.ref), ...S.deals.filter((d) => emailCliente(d) === c.email).map((d) => d.id)];
  const ds = ids.map((id) => S.deals.find((d) => d.id === id)).filter((d): d is Negocio => !!d);
  return ds.find(noPortal) ?? ds[0];
}

/** 22/10: o login aberto pelo Inventário ("Abrir como fornecedor →", "Simular"): o email da conta já posto (a password fica vazia) e a
 *  encomenda a abrir no portal depois de entrar. Só em memória, neste separador (como o Inventário); `n` volta a montar o login. */
export interface LoginPrefill { email: string; po: string | null; n: number }

/* ------------------------------------------------------------------ o modo real (2.0: a app ligada à base, contasReais.ts) */
// Aqui e não em contasReais.ts: este ficheiro não pode puxar o supabase-js (o RH de exemplo importa-o e fica sem base).
let orgReal: string | null = null, nomeReal = "", fiscalReal: { nome: string; nif: string } = { nome: "", nif: "" };
/** A organização de quem está a enviar (null: o protótipo de sempre, com as contas de teste no Estado). `fiscal`: o nome fiscal e o
 *  NIF da organização, para os documentos. */
export const definirModoReal = (org: string | null, nome = "", fiscal: { nome?: string | null; nif?: string | null } = {}): void => {
  orgReal = org; nomeReal = nome; fiscalReal = { nome: fiscal.nome ?? "", nif: fiscal.nif ?? "" };
};
/** O nome da empresa nos emails do portal: a organização de quem envia; no protótipo de sempre, a Mudelar. */
const empresaQueEnvia = (): string => (orgReal && nomeReal) || EMPRESA_PORTAL;
export const orgDoModoReal = (): string | null => orgReal;
/** 23/10: o nome da empresa nos documentos (proposta, contrato, fatura): a organização da equipa ou a da conta do portal. */
export const nomeEmpresa = (): string => nomeReal || EMPRESA_PORTAL;
/** O NIF da organização, se a organização o tiver (vazio: o do exemplo). */
export const nifEmpresa = (): string => fiscalReal.nif;
/** O nome fiscal da organização, se o tiver. */
export const nomeFiscalEmpresa = (): string => fiscalReal.nome;
export const modoReal = (): boolean => orgReal != null;

/* ------------------------------------------------------------------ os links */
/** O link do login dos portais (leva a sala, para entrar noutro aparelho na mesma demonstração).
 *  23/10: `po`, a encomenda a abrir depois de entrar (2.0: o portal do fornecedor lê-a do link, lerPoDoLink). */
export function linkLogin(po?: string): string {
  if (typeof window === "undefined") return "/prototipo/negocios?login=1";
  // 2.0: com a base ligada, o login real é a entrada da app
  if (modoReal()) return `${window.location.origin}/${po ? "?po=" + encodeURIComponent(po) : ""}`;
  let sala: string | null = null;
  try { sala = new URLSearchParams(window.location.search).get("sala"); } catch { /* sem URL */ }
  return `${window.location.origin}/prototipo/negocios?login=1${sala ? "&sala=" + encodeURIComponent(sala) : ""}`;
}

/* ------------------------------------------------------------------ o popup pendente (só neste separador) */
let pendente: EnvioAcesso | null = null, seq = 0;
const ouvintes = new Set<() => void>();
const avisarOuvintes = (): void => { for (const fn of ouvintes) fn(); };
const subscrever = (fn: () => void): (() => void) => { ouvintes.add(fn); return () => { ouvintes.delete(fn); }; };
/** Pede ao protótipo que mostre o popup com as credenciais (o último envio ganha). Devolve o envio, com o seu número. */
export function mostrarAcesso(e: Omit<EnvioAcesso, "n">): EnvioAcesso { pendente = { ...e, n: ++seq }; avisarOuvintes(); return pendente; }
export function fecharAcesso(): void { if (pendente) { pendente = null; avisarOuvintes(); } }
const lerPendente = (): EnvioAcesso | null => pendente;
export function useAcessoPendente(): EnvioAcesso | null { return useSyncExternalStore(subscrever, lerPendente, lerPendente); }

/* ------------------------------------------------------------------ 23/10 (2.0): a conta real nasce no próprio envio */
// Antes, a conta real criava-se num efeito do ecrã que mostrava o popup: se o popup mudasse ou fechasse, ou a criação falhasse, ninguém
// ficava a saber. Agora o envio (proposta, contrato, adenda, acesso, PO) chama enviarAcesso: mostra o popup E pede a conta, uma vez, a
// quem a sabe criar (o protótipo ligado à base regista-se com definirCriadorContas). O estado fica gravado no negócio (d.acesso) ou na
// ficha do fornecedor (s.contaPortal), à vista na página do negócio e no Inventário, com "Tentar de novo" (estadoContaPortal.ts).

/** O estado da conta real do portal, gravado no negócio ou no fornecedor. `em`: ISO, quando mudou. */
export interface EstadoContaPortal {
  estado: "a criar" | "ok" | "erro"; email: string; msg?: string; em: string;
  /** 24/10: o email do envio: seguiu, ou falhou (com `envioMsg`) e a página diz "Email não enviado — Tentar de novo" */
  envio?: "enviado" | "falhou"; envioMsg?: string;
  /** 24/10: o email que falhou levava as credenciais: "Tentar de novo" pede credenciais novas (a pessoa ainda não entrou) */
  credenciaisPorEnviar?: boolean;
}
/** O que aconteceu à conta real de um envio (o popup mostra-o). Igual a ContaReal (contasReais.ts), que o reexporta. */
export type ResultadoConta =
  | { fase: "a criar" }
  /** `nova`: criada agora; `password` é a temporária gerada no servidor. Senão já existia e a pessoa usa a dela */
  | { fase: "pronta"; nova: boolean; password?: string;
      /** 24/10: o email do envio (SMTP da organização): seguiu, ou não e porquê (o popup mostra então as credenciais) */
      email?: { enviado: boolean; para?: string; mensagem?: string; motivo?: string } }
  | { fase: "erro"; msg: string };

let criador: ((e: EnvioAcesso) => void) | null = null;
/** Quem cria a conta real (o protótipo com a equipa ligada à base). Devolve como desligar. */
export function definirCriadorContas(fn: (e: EnvioAcesso) => void): () => void {
  criador = fn;
  return () => { if (criador === fn) criador = null; };
}
/** O envio ao portal: o popup com o email de acesso e, na 2.0, o pedido da conta real (uma vez por envio). */
export function enviarAcesso(e: Omit<EnvioAcesso, "n">): EnvioAcesso {
  const x = mostrarAcesso(e);
  criador?.(x);
  return x;
}

// o resultado da conta real de cada envio (pelo número do envio), para o popup: só neste separador
const resultados = new Map<number, ResultadoConta>();
export function definirResultadoConta(n: number, r: ResultadoConta): void { resultados.set(n, r); avisarOuvintes(); }
export const lerResultadoConta = (n: number | undefined): ResultadoConta | undefined => (n == null ? undefined : resultados.get(n));
export function useResultadoConta(n: number | undefined): ResultadoConta | undefined {
  return useSyncExternalStore(subscrever, () => lerResultadoConta(n), () => lerResultadoConta(n));
}

/* ------------------------------------------------------------------ 23/10 (2.0): sem email válido não se envia ao portal */
/** O envio que ficou à espera do email do cliente: qual negócio, o que se ia enviar (e a adenda). Só neste separador. */
export type EnvioPortal = "proposta" | "contrato" | "adenda" | "contratoAdenda" | "acesso";
export interface PedidoEmail { deal: number; acao: EnvioPortal; n?: string }
let pedidoEmail: PedidoEmail | null = null;
export function pedirEmailPortal(p: PedidoEmail | null): void { pedidoEmail = p; avisarOuvintes(); }
export const lerPedidoEmail = (): PedidoEmail | null => pedidoEmail;
export function usePedidoEmail(): PedidoEmail | null { return useSyncExternalStore(subscrever, lerPedidoEmail, lerPedidoEmail); }

/* ------------------------------------------------------------------ o acesso do fornecedor, pedido no Inventário */
/** O Inventário não conhece o Estado: pede ao protótipo que crie a conta do fornecedor (e mostre o popup). Sem quem ouça, não faz nada.
 *  22/10: `po`, a encomenda acabada de enviar ao fornecedor (o popup em modo "encomenda"; nunca gera password nova se a conta existe). */
export interface PedidoAcessoForn { sid: string; reenviar: boolean; po?: PoEnviada }
let ouvinteForn: ((p: PedidoAcessoForn) => void) | null = null;
export function pedirAcessoForn(p: PedidoAcessoForn): void { ouvinteForn?.(p); }
export function ouvirAcessoForn(fn: (p: PedidoAcessoForn) => void): () => void {
  ouvinteForn = fn;
  return () => { if (ouvinteForn === fn) ouvinteForn = null; };
}
