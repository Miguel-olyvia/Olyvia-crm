/**
 * @vitest-environment node
 *
 * CONTRATO DE TRES LADOS do canal de denuncias publico: o corpo REAL que o cliente monta
 * (`src/lib/denuncias/edgePublica.ts`) passa pelo handler REAL da Edge, e o handler chama
 * uma base simulada que so aceita as ASSINATURAS do SQL (NOVO-20261231994000, seccao C, e a
 * lista k_servico do bloco "Conferir"). Sem rede e sem base: o `fetch` do cliente vai direito
 * ao handler. Os testes de cada lado com o seu simulado nao apanhavam as divergencias
 * (accao/action, erro/error, identidade aninhada, envelope `denuncia`, nomes das RPCs).
 *
 * Se uma RPC mudar de argumentos no SQL, muda-se ASSINATURAS aqui no mesmo envio (a base
 * confirma as assinaturas no bloco "Conferir" da migration e em TESTE-denuncias.sql).
 */
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FORMULARIO_VAZIO, type DadosFormulario } from "@/components/canal-denuncias/lib/formulario";
import {
  ERRO_POR_CODIGO_EDGE, chamarEdge, corpoDeCriacao, erroDeEdge, vistaDaEdge,
} from "@/lib/denuncias/edgePublica";
import { CODIGOS_PUBLICOS } from "./erros.ts";
import { criarHandler, type DepsDenuncia } from "./handler.ts";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const UTILIZADOR = "33333333-3333-4333-8333-333333333333";
const PIN_PEPPER = "p".repeat(48);
const IP_PEPPER = "i".repeat(48);
const SLUG = "nike-canal";
const CODIGO = "DEN-2026-0007";

/** Os argumentos de cada RPC de servico, como estao no SQL (nenhum tem DEFAULT: todos obrigatorios). */
const ASSINATURAS: Readonly<Record<string, readonly string[]>> = {
  rpc_denuncia_publica_limitar: ["p_balde", "p_chave_ip"],
  rpc_denuncia_publica_canal: ["p_slug"],
  rpc_denuncia_publica_reservar_codigo: ["p_slug", "p_chave_ip", "p_reserva_hash"],
  rpc_denuncia_publica_criar: ["p_slug", "p_codigo", "p_reserva_hash", "p_dados", "p_pin_hash", "p_identidade", "p_auth_user_id", "p_impedidos"],
  rpc_denuncia_publica_entrar: ["p_slug", "p_codigo", "p_pin_hash", "p_sessao_hash", "p_chave_ip"],
  rpc_denuncia_publica_ler: ["p_sessao_hash"],
  rpc_denuncia_publica_responder: ["p_sessao_hash", "p_texto"],
};

/** As chaves que a `_criar` aceita em p_dados (k_chaves no SQL); `anonima` e obrigatoria e booleana. */
const K_CHAVES = ["anonima", "tipo", "descricao", "quando", "onde", "envolvidos", "ainda_acontece", "testemunhas", "ja_reportado", "boa_fe"];

type Args = Record<string, unknown>;

/** Uma base simulada que recusa como o PostgREST (assinatura errada) e como o SQL (p_dados e baldes). */
function baseSimulada() {
  const chamadas: Array<{ fn: string; args: Args }> = [];
  let reserva: { codigo: string; hash: string } | null = null;
  let pinHashGuardado: string | null = null;
  const respostas: string[] = [];

  const erro = (message: string, code: string) => ({ data: null, error: { message, code } });
  const vista = () => ({
    id: "55555555-5555-4555-8555-555555555555", codigo: CODIGO, tipo: "fraude", descricao: "x", quando: "y", onde: null, anonima: true,
    estado: "concluida", recebida_em: "2026-10-28", confirmada_em: "2026-10-29", prazo_confirmar: "2026-11-04",
    prazo_seguimento: "2027-01-28", fechada_em: "2026-11-02",
    desfecho: { resultado: "procedente", medidas: "Formacao obrigatoria" },
    mensagens: respostas.map((texto, i) => ({ id: `m${i}`, autor: "denunciante", pedido_informacao: false, texto, em: "2026-10-28T00:00:00Z" })),
  });

  const rpc = async (fn: string, args: Args) => {
    chamadas.push({ fn, args });
    const esperado = ASSINATURAS[fn];
    if (!esperado) return erro(`Could not find the function public.${fn}`, "PGRST202");
    if (JSON.stringify(Object.keys(args).sort()) !== JSON.stringify([...esperado].sort())) {
      return erro(`Could not find the function public.${fn}(${Object.keys(args).join(", ")})`, "PGRST202");
    }
    switch (fn) {
      case "rpc_denuncia_publica_limitar":
        if (!["canal", "sessao"].includes(String(args.p_balde))) return erro("dados_invalidos", "HRD23");
        return { data: true, error: null };
      case "rpc_denuncia_publica_canal":
        return args.p_slug === SLUG
          ? { data: { ativo: true, organization_id: ORG, organizacao: "Nike", responsaveis: [] }, error: null }
          : { data: { ativo: false }, error: null };
      case "rpc_denuncia_publica_reservar_codigo":
        if (!/^[0-9a-f]{64}$/.test(String(args.p_reserva_hash))) return erro("dados_invalidos", "HRD23");
        reserva = { codigo: CODIGO, hash: String(args.p_reserva_hash) };
        return { data: { organization_id: ORG, codigo: CODIGO }, error: null };
      case "rpc_denuncia_publica_criar": {
        const dados = args.p_dados as Args;
        if (!reserva || reserva.codigo !== args.p_codigo || reserva.hash !== args.p_reserva_hash) return erro("codigo_invalido", "HRD26");
        if (Object.keys(dados).some((k) => !K_CHAVES.includes(k)) || typeof dados.anonima !== "boolean") return erro("dados_invalidos", "HRD23");
        if (args.p_impedidos !== null && !Array.isArray(args.p_impedidos)) return erro("dados_invalidos", "HRD23");
        reserva = null;
        pinHashGuardado = String(args.p_pin_hash);
        return { data: { codigo: CODIGO }, error: null };
      }
      case "rpc_denuncia_publica_entrar":
        return { data: args.p_slug === SLUG && args.p_pin_hash === pinHashGuardado, error: null };
      case "rpc_denuncia_publica_ler":
        return { data: vista(), error: null };
      case "rpc_denuncia_publica_responder":
        respostas.push(String(args.p_texto));
        return { data: vista(), error: null };
      default:
        return erro("inesperado", "XX000");
    }
  };
  return { chamadas, rpc, criadoCom: () => chamadas.find((c) => c.fn === "rpc_denuncia_publica_criar")?.args };
}

let base: ReturnType<typeof baseSimulada>;

function ligarClienteAoHandler(): void {
  const deps: DepsDenuncia = {
    supabaseUrl: "https://exemplo.supabase.co",
    serviceKey: "service-key-simulada",
    pinPepper: PIN_PEPPER,
    ipPepper: IP_PEPPER,
    criarCliente: () => ({
      auth: { getUser: async (jwt: string) => (jwt === "jwt-da-app" ? { data: { user: { id: UTILIZADOR } }, error: null } : { data: { user: null }, error: {} }) },
      rpc: base.rpc,
    }),
    registarErro: () => {},
    corsHeaders: () => ({}),
    ipDoPedido: () => "203.0.113.7",
    agora: () => 0,
    hoje: () => "2026-10-28",
    dormir: async () => {},
  };
  const handler = criarHandler(deps);
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => handler(new Request(url, init)));
}

beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://exemplo.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "chave-publicavel");
  base = baseSimulada();
  ligarClienteAoHandler();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const FORMULARIO: DadosFormulario = {
  ...FORMULARIO_VAZIO, tipo: "fraude", descricao: "Despesas lancadas duas vezes com a mesma fatura no comercial.", quando: "Em Setembro",
  boaFe: true, nome: "Ines Cardoso", email: "ines@exemplo.pt", telefone: "910000000", podemContactar: true, soResponsavel: false,
};

describe("contrato cliente -> Edge -> SQL", () => {
  it("canal: o cliente envia `action` e le o nome que a Edge tira de `organizacao`", async () => {
    const r = await chamarEdge<{ ativo?: boolean; nome_org?: string }>("canal", { slug: SLUG });
    expect(r).toEqual({ ok: true, dados: { ok: true, ativo: true, nome_org: "Nike" } });
    expect(base.chamadas.map((c) => c.fn)).toEqual(["rpc_denuncia_publica_limitar", "rpc_denuncia_publica_canal"]);
  });

  it("criar ANONIMA: as RPCs recebem as assinaturas do SQL e p_dados com anonima=true, sem identidade", async () => {
    const r = await chamarEdge<{ codigo?: string; pin?: string }>("criar", corpoDeCriacao({ ...FORMULARIO, anonima: true }, SLUG));
    expect(r.ok).toBe(true);
    const args = base.criadoCom()!;
    expect((args.p_dados as Args).anonima).toBe(true);
    expect(args.p_identidade).toBeNull();
    expect(args.p_auth_user_id).toBeNull();
    expect(JSON.stringify(base.chamadas)).not.toMatch(/Ines|ines@|910000000/);
  });

  it("criar IDENTIFICADA na pagina publica: a identidade aninhada do cliente chega inteira a p_identidade, com anonima=false", async () => {
    const r = await chamarEdge("criar", corpoDeCriacao({ ...FORMULARIO, anonima: false }, SLUG));
    expect(r.ok).toBe(true);
    const args = base.criadoCom()!;
    expect((args.p_dados as Args).anonima).toBe(false);
    expect(args.p_identidade).toEqual({ nome: "Ines Cardoso", email: "ines@exemplo.pt", telefone: "910000000", pode_contactar: true, so_responsavel: false });
  });

  it("criar IDENTIFICADA na app: o JWT valido vira p_auth_user_id (id do Auth; a base resolve a conta)", async () => {
    const r = await chamarEdge("criar", corpoDeCriacao({ ...FORMULARIO, anonima: false }, SLUG), { jwt: "jwt-da-app" });
    expect(r.ok).toBe(true);
    const args = base.criadoCom()!;
    expect(args.p_auth_user_id).toBe(UTILIZADOR);
    expect((args.p_identidade as Args).pode_contactar).toBe(true);
  });

  it("entrar com o codigo e o PIN que criar devolveu, ler e responder: a vista sai em `denuncia` e o cliente mapeia-a", async () => {
    const criado = await chamarEdge<{ codigo: string; pin: string }>("criar", corpoDeCriacao({ ...FORMULARIO, anonima: true }, SLUG));
    if (!criado.ok) throw new Error("criar falhou");
    const { codigo, pin } = criado.dados;
    expect(base.criadoCom()!.p_pin_hash).toBe(createHmac("sha256", PIN_PEPPER).update(`den-pin|${ORG}|${codigo}|${pin}`).digest("hex"));

    const entrou = await chamarEdge<{ sessao: string }>("entrar", { slug: SLUG, codigo, pin });
    expect(entrou.ok).toBe(true);
    if (!entrou.ok) return;
    const lido = await chamarEdge<{ denuncia?: unknown }>("ler", {}, { sessao: entrou.dados.sessao });
    expect(lido.ok).toBe(true);
    if (!lido.ok) return;
    const d = vistaDaEdge(lido.dados, SLUG, `acomp:${codigo}`);
    expect(d).toMatchObject({ codigo: CODIGO, estado: "concluida", anonima: true, decisao: { resultado: "procedente", medidas: "Formacao obrigatoria" } });

    const respondido = await chamarEdge<{ denuncia?: unknown }>("responder", { texto: "Mais um pormenor." }, { sessao: entrou.dados.sessao });
    expect(respondido.ok).toBe(true);
    if (!respondido.ok) return;
    expect(vistaDaEdge(respondido.dados, SLUG, `acomp:${codigo}`).mensagens.map((m) => m.texto)).toEqual(["Mais um pormenor."]);
  });

  it("PIN errado chega ao cliente como `codigo_ou_pin_invalido` (lido de `error`)", async () => {
    await chamarEdge("criar", corpoDeCriacao({ ...FORMULARIO, anonima: true }, SLUG));
    const r = await chamarEdge("entrar", { slug: SLUG, codigo: CODIGO, pin: "000000" });
    expect(r).toMatchObject({ ok: false, erro: "codigo_ou_pin_invalido", estado: 401 });
  });

  it("nenhuma chamada da Edge falhou por assinatura (PGRST202) em todo o percurso", async () => {
    await chamarEdge("canal", { slug: SLUG });
    const criado = await chamarEdge<{ codigo: string; pin: string }>("criar", corpoDeCriacao({ ...FORMULARIO, anonima: false }, SLUG), { jwt: "jwt-da-app" });
    if (criado.ok) {
      const e = await chamarEdge<{ sessao: string }>("entrar", { slug: SLUG, codigo: criado.dados.codigo, pin: criado.dados.pin });
      if (e.ok) {
        await chamarEdge("ler", {}, { sessao: e.dados.sessao });
        await chamarEdge("responder", { texto: "ok" }, { sessao: e.dados.sessao });
      }
    }
    const fns = base.chamadas.map((c) => c.fn);
    for (const fn of Object.keys(ASSINATURAS)) expect(fns).toContain(fn);
    for (const c of base.chamadas) expect(Object.keys(c.args).sort()).toEqual([...ASSINATURAS[c.fn]].sort());
  });
});

describe("catalogo de erros partilhado", () => {
  it("cada codigo publico da Edge tem um destino EXPLICITO no cliente", () => {
    const semDestino = CODIGOS_PUBLICOS.filter((c) => !Object.prototype.hasOwnProperty.call(ERRO_POR_CODIGO_EDGE, c));
    expect(semDestino).toEqual([]);
    expect(Object.keys(ERRO_POR_CODIGO_EDGE).sort()).toEqual([...CODIGOS_PUBLICOS].sort());
    expect(erroDeEdge("demasiadas_tentativas")).toBe("limite");
  });
});
