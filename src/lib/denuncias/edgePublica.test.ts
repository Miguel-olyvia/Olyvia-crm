// O cliente da Edge pública: o que sai (cabeçalhos e corpo, sobretudo numa denúncia anónima) e como se leem as respostas.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FORMULARIO_VAZIO, type DadosFormulario } from "@/components/canal-denuncias/lib/formulario";
import {
  CABECALHO_SESSAO_DENUNCIA, chamarEdge, corpoDeCriacao, erroDeEdge, esquecerSessao, esquecerTodasAsSessoes, guardarSessao, lerSessao,
} from "./edgePublica";

const fetchFalso = vi.fn();

function responder(estado: number, corpo: unknown): void {
  fetchFalso.mockResolvedValueOnce({ ok: estado >= 200 && estado < 300, status: estado, json: () => Promise.resolve(corpo) });
}

beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://exemplo.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "chave-publicavel");
  vi.stubGlobal("fetch", fetchFalso);
  fetchFalso.mockReset();
  esquecerTodasAsSessoes();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const cabecalhosDoUltimoPedido = (): Record<string, string> => fetchFalso.mock.calls.at(-1)![1].headers;
const corpoDoUltimoPedido = (): Record<string, unknown> => JSON.parse(fetchFalso.mock.calls.at(-1)![1].body);

describe("chamarEdge", () => {
  it("faz POST à função com a apikey e a ação no corpo, e SEM Authorization por omissão", async () => {
    responder(200, { ativo: true, nome_org: "Casa Aurora" });
    const r = await chamarEdge("canal", { slug: "casa-aurora" });
    expect(r).toEqual({ ok: true, dados: { ativo: true, nome_org: "Casa Aurora" } });
    const [url, init] = fetchFalso.mock.calls[0];
    expect(url).toBe("https://exemplo.supabase.co/functions/v1/denuncia-publica");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("omit");
    expect(cabecalhosDoUltimoPedido()).toMatchObject({ apikey: "chave-publicavel", "Content-Type": "application/json" });
    expect(cabecalhosDoUltimoPedido()).not.toHaveProperty("Authorization");
    expect(corpoDoUltimoPedido()).toEqual({ slug: "casa-aurora", action: "canal" });
  });

  it("só leva o JWT quando se pede, e a sessão no cabeçalho próprio", async () => {
    responder(200, { sessao: "x" });
    await chamarEdge("ler", {}, { sessao: "tok", jwt: "jwt-1" });
    expect(cabecalhosDoUltimoPedido().Authorization).toBe("Bearer jwt-1");
    expect(cabecalhosDoUltimoPedido()[CABECALHO_SESSAO_DENUNCIA]).toBe("tok");
  });

  it("lê o código de erro do corpo (`error`, como a Edge o envia) e o estado HTTP", async () => {
    responder(401, { error: "codigo_ou_pin_invalido" });
    expect(await chamarEdge("entrar", {})).toEqual({ ok: false, erro: "codigo_ou_pin_invalido", estado: 401 });
  });

  it("uma resposta sem corpo legível ou uma falha de rede é «indisponivel», sem lançar", async () => {
    fetchFalso.mockResolvedValueOnce({ ok: false, status: 502, json: () => Promise.reject(new Error("html")) });
    expect(await chamarEdge("canal", {})).toEqual({ ok: false, erro: "indisponivel", estado: 502 });
    fetchFalso.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await chamarEdge("canal", {})).toEqual({ ok: false, erro: "indisponivel", estado: 0 });
  });

  it("um corpo de sucesso que não é um objeto não conta como sucesso", async () => {
    responder(200, "ok");
    expect((await chamarEdge("canal", {})).ok).toBe(false);
  });
});

describe("erroDeEdge", () => {
  it("traduz o catálogo da Edge e trata o desconhecido como indisponível", () => {
    expect(erroDeEdge("canal_inativo")).toBe("canal_inativo");
    expect(erroDeEdge("sessao_invalida")).toBe("sessao_expirada");
    expect(erroDeEdge("texto_vazio")).toBe("texto_vazio");
    expect(erroDeEdge("fechada")).toBe("fechada");
    expect(erroDeEdge("demasiadas_tentativas")).toBe("limite");
    expect(erroDeEdge("pedido_invalido")).toBe("pedido_invalido");
    expect(erroDeEdge("qualquer_coisa")).toBe("indisponivel");
    expect(erroDeEdge("constructor")).toBe("indisponivel");
  });
});

describe("corpoDeCriacao", () => {
  const preenchido: DadosFormulario = {
    ...FORMULARIO_VAZIO, tipo: "fraude", descricao: "  Despesas duplicadas com a mesma fatura no comercial.  ", quando: " Em Setembro ", boaFe: true,
    nome: "Inês Cardoso", email: "ines@exemplo.pt", telefone: "910000000", podemContactar: true, soResponsavel: false,
  };

  it("uma denúncia ANÓNIMA nunca leva a identidade, mesmo com o formulário preenchido", () => {
    const corpo = corpoDeCriacao({ ...preenchido, anonima: true }, "casa-aurora");
    expect(corpo).toMatchObject({ slug: "casa-aurora", modo: "anonima", tipo: "fraude", boa_fe: true });
    expect(corpo).not.toHaveProperty("identidade");
    expect(JSON.stringify(corpo)).not.toMatch(/Inês|ines@|910000000/);
  });

  it("sem escolha feita (anonima: null) trata-se como anónima: só se identifica quem o disse", () => {
    const corpo = corpoDeCriacao({ ...preenchido, anonima: null }, "s");
    expect(corpo.modo).toBe("anonima");
    expect(corpo).not.toHaveProperty("identidade");
  });

  it("uma identificada leva a identidade e o texto aparado", () => {
    const corpo = corpoDeCriacao({ ...preenchido, anonima: false }, "s");
    expect(corpo).toMatchObject({
      modo: "identificada", descricao: "Despesas duplicadas com a mesma fatura no comercial.", quando: "Em Setembro",
      identidade: { nome: "Inês Cardoso", email: "ines@exemplo.pt", telefone: "910000000", pode_contactar: true, so_responsavel: false },
    });
  });

  it("sem tipo escolhido vai «outro»", () => {
    expect(corpoDeCriacao({ ...preenchido, tipo: "", anonima: true }, "s").tipo).toBe("outro");
  });
});

describe("sessões do acompanhamento: só em memória", () => {
  it("guarda, lê e esquece; não usa armazenamento do navegador", () => {
    const antes = { local: window.localStorage.length, sessao: window.sessionStorage.length };
    guardarSessao("acomp:DEN-1", { token: "t", slug: "s", organizacao: "o" });
    expect(lerSessao("acomp:DEN-1")?.token).toBe("t");
    esquecerSessao("acomp:DEN-1");
    expect(lerSessao("acomp:DEN-1")).toBeUndefined();
    expect({ local: window.localStorage.length, sessao: window.sessionStorage.length }).toEqual(antes);
  });
});
