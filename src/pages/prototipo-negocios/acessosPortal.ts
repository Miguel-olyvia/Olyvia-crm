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
export type DocPortal = "proposta" | "contrato" | "adenda" | "contratoAdenda";
const DOCS: Record<DocPortal, { l: string; m: boolean }> = {
  proposta: { l: "proposta", m: false },
  contrato: { l: "contrato", m: true },
  adenda: { l: "proposta de adenda", m: false },
  contratoAdenda: { l: "contrato da adenda", m: true },
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
const emailOk = (e: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const contas = (S: Estado): Record<string, ContaPortal> => (S.acessos ??= {});

/** O email de acesso do cliente: o da ficha; sem ele, um de teste. */
export const emailCliente = (d: Negocio): string => {
  const e = normal(d.f.email || "");
  return emailOk(e) ? e : `cliente-${d.id}@teste.olyvia.pt`;
};

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
  return { conta: { ...c, deals: [...c.deals] }, comPassword, empresa: EMPRESA_PORTAL, doc, titulo };
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
  return { conta: { ...c }, comPassword, empresa: s.company || EMPRESA_PORTAL };
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

/* ------------------------------------------------------------------ os links */
/** O link do login dos portais (leva a sala, para entrar noutro aparelho na mesma demonstração). */
export function linkLogin(): string {
  if (typeof window === "undefined") return "/prototipo/negocios?login=1";
  let sala: string | null = null;
  try { sala = new URLSearchParams(window.location.search).get("sala"); } catch { /* sem URL */ }
  return `${window.location.origin}/prototipo/negocios?login=1${sala ? "&sala=" + encodeURIComponent(sala) : ""}`;
}

/* ------------------------------------------------------------------ o popup pendente (só neste separador) */
let pendente: EnvioAcesso | null = null, seq = 0;
const ouvintes = new Set<() => void>();
const avisarOuvintes = (): void => { for (const fn of ouvintes) fn(); };
const subscrever = (fn: () => void): (() => void) => { ouvintes.add(fn); return () => { ouvintes.delete(fn); }; };
/** Pede ao protótipo que mostre o popup com as credenciais (o último envio ganha). */
export function mostrarAcesso(e: Omit<EnvioAcesso, "n">): void { pendente = { ...e, n: ++seq }; avisarOuvintes(); }
export function fecharAcesso(): void { if (pendente) { pendente = null; avisarOuvintes(); } }
const lerPendente = (): EnvioAcesso | null => pendente;
export function useAcessoPendente(): EnvioAcesso | null { return useSyncExternalStore(subscrever, lerPendente, lerPendente); }

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
