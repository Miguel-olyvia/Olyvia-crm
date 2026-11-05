// A fonte real da página leva as permissões do fecho que a sessão tem (documentos, reabrir, converter) e a ficha passa-as aos ecrãs do negócio.
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useDadosNegocio } from "@/components/negocio-metas/costuraNegocio";
import { mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import { fichaDb, pessoaDb } from "@/hooks/pessoas/fichaFabrica";
import { FontePessoasContext, useFontePessoas, type FontePessoas } from "@/hooks/pessoas/useFontePessoas";
import type { NegociosAtivos } from "@/hooks/pessoas/useNegociosAtivos";
import { NegociosDaFichaReal } from "./NegociosDaFichaReal";
import { PessoasRota } from "./PessoasRota";

vi.mock("@/hooks/useTranslation", async () => (await import("./traducaoTeste")).moduloTraducao());
// negocios.proposta.decidir lê-se por fn_cat_pode (usePodeDecidirProposta); aqui simula-se a resposta.
const decidir = vi.hoisted(() => ({ valor: { pode: false, aLer: false } }));
vi.mock("@/hooks/usePodeDecidirProposta", () => ({ PERMISSAO_DECIDIR_PROPOSTA: "negocios.proposta.decidir", usePodeDecidirProposta: () => decidir.valor }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
const ativosMock = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/pessoas/useNegociosAtivos", () => ({ useNegociosAtivos: () => ativosMock(), useRepetirNegociosAtivos: () => vi.fn() }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-nike" }, isLoading: false }) }));
const escopo = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/usePermissionScope", () => ({ usePermissionScope: () => escopo() }));
vi.mock("@/hooks/pessoas/useMutacoesNegocio", () => ({ useMutacoesNegocio: () => mutacoesFalsas() }));
const comerciaisMock = vi.hoisted(() => ({ valor: [{ id: "u1", nome: "Rita Gomes" }] as { id: string; nome: string }[], pedidos: [] as boolean[] }));
vi.mock("@/hooks/pessoas/useComerciaisNegocio", () => ({
  useComerciaisNegocio: (ativo: boolean) => { comerciaisMock.pedidos.push(ativo); return { comerciais: comerciaisMock.valor, isLoading: false, isError: false, repetir: () => undefined }; },
}));

const vistas: FontePessoas[] = [];
function Sonda() {
  vistas.push(useFontePessoas());
  return <p>PAGINA</p>;
}

beforeEach(() => { vistas.length = 0; escopo.mockReset(); decidir.valor = { pode: false, aLer: false }; });
afterEach(cleanup);

describe("PessoasRota: permissões do fecho na fonte", () => {
  it("a fonte real leva só as que a sessão tem", () => {
    escopo.mockReturnValue({ anewUserId: "u1", getPermissionScope: (c: string) => (["proposals.edit", "pessoas.reopen"].includes(c) ? "ORG" : "NONE") });
    ativosMock.mockReturnValue({ ativo: true, momentoGanho: "manual", isLoading: false, isError: false, erroSemResposta: false, aRepetir: false } satisfies NegociosAtivos);
    render(
      <MemoryRouter initialEntries={["/pessoas"]}>
        <Routes><Route path="/pessoas" element={<PessoasRota><Sonda /></PessoasRota>} /></Routes>
      </MemoryRouter>,
    );
    const fonte = vistas[vistas.length - 1];
    expect(fonte.modo === "real" && [...(fonte.permissoesFecho ?? [])].sort()).toEqual(["pessoas.reopen", "proposals.edit"]);
  });

  // 05/11/2026: aceitar/recusar uma proposta de um negócio pede negocios.proposta.decidir na base; a fonte leva-a quando fn_cat_pode diz que sim.
  const montarRota = () => {
    escopo.mockReturnValue({ anewUserId: "u1", getPermissionScope: (c: string) => (c === "proposals.edit" ? "ORG" : "NONE") });
    ativosMock.mockReturnValue({ ativo: true, momentoGanho: "manual", isLoading: false, isError: false, erroSemResposta: false, aRepetir: false } satisfies NegociosAtivos);
    render(
      <MemoryRouter initialEntries={["/pessoas"]}>
        <Routes><Route path="/pessoas" element={<PessoasRota><Sonda /></PessoasRota>} /></Routes>
      </MemoryRouter>,
    );
    const fonte = vistas[vistas.length - 1];
    return fonte.modo === "real" ? fonte.permissoesFecho : null;
  };

  it("com negocios.proposta.decidir (fn_cat_pode) a fonte leva-a", () => {
    decidir.valor = { pode: true, aLer: false };
    expect([...(montarRota() ?? [])].sort()).toEqual(["negocios.proposta.decidir", "proposals.edit"]);
  });

  it("sem ela a lista fica só com as do perfil; enquanto se lê a lista é desconhecida (undefined)", () => {
    expect(montarRota()).toEqual(["proposals.edit"]);
    cleanup(); vistas.length = 0;
    decidir.valor = { pode: false, aLer: true };
    expect(montarRota()).toBeUndefined();
  });
});

const FICHA = fichaDb({ pessoa: pessoaDb({ id: "11111111-1111-4111-8111-111111111111", nome: "Ana Lopes" }) });

function SondaDados() {
  const dados = useDadosNegocio();
  return <p data-testid="s">{`reabrir:${String(dados?.podeReabrir)} proposta:${String(dados?.podeNoDocumento?.("proposta", "edit"))} comerciais:${(dados?.comerciais ?? []).join("|")}`}</p>;
}

function PedeComerciais() {
  const pedir = useDadosNegocio()?.pedirComerciais;
  useEffect(() => { pedir?.(); }, [pedir]);
  return <p>pede</p>;
}

const montar = (fonte: FontePessoas) => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FontePessoasContext.Provider value={fonte}>
        <MemoryRouter>
          <NegociosDaFichaReal ficha={FICHA} pessoaAberta={FICHA.pessoa.id} negocioDoEndereco={null}>{() => <SondaDados />}</NegociosDaFichaReal>
        </MemoryRouter>
      </FontePessoasContext.Provider>
    </QueryClientProvider>,
  );
  return screen.getByTestId("s").textContent;
};

describe("NegociosDaFichaReal: permissões do fecho", () => {
  it("vêm da fonte real", () => {
    expect(montar({ modo: "real", organizationId: "org-1", momentoGanho: "manual", permissoesFecho: ["pessoas.reopen", "proposals.edit"] })).toBe("reabrir:true proposta:true comerciais:Rita Gomes");
  });

  it("os comerciais só se leem quando um ecrã os pede: abrir a ficha não paga a leitura", () => {
    comerciaisMock.pedidos.length = 0;
    montar({ modo: "real", organizationId: "org-1", momentoGanho: "manual" });
    expect(comerciaisMock.pedidos.every((ativo) => ativo === false)).toBe(true);
  });

  it("pedir os comerciais (como faz o «Feito por») liga a leitura", () => {
    comerciaisMock.pedidos.length = 0;
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FontePessoasContext.Provider value={{ modo: "real", organizationId: "org-1", momentoGanho: "manual" }}>
          <MemoryRouter>
            <NegociosDaFichaReal ficha={FICHA} pessoaAberta={FICHA.pessoa.id} negocioDoEndereco={null}>{() => <PedeComerciais />}</NegociosDaFichaReal>
          </MemoryRouter>
        </FontePessoasContext.Provider>
      </QueryClientProvider>,
    );
    expect(comerciaisMock.pedidos[comerciaisMock.pedidos.length - 1]).toBe(true);
  });

  it("sem a indicação da fonte nada se restringe (campos ausentes)", () => {
    expect(montar({ modo: "real", organizationId: "org-1", momentoGanho: "manual" })).toBe("reabrir:undefined proposta:undefined comerciais:Rita Gomes");
  });
});
