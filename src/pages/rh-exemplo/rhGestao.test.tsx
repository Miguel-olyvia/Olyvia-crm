// Teste de arranque de cada ecrã de gestão de RH de exemplo: abre sem rebentar, mostra o título e conteúdo da
// organização de exemplo, e não deixa chaves de tradução por traduzir à vista.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { renderRh, reporRhTeste, rhTeste } from "@/test/rhExemploProviders";
import { repor } from "@/components/rh-exemplo/dados/loja";
import { lerGestao, reporGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import RhAssiduidadeEAusencias from "./RhAssiduidadeEAusencias";
import RhCentrosTrabalho from "./RhCentrosTrabalho";
import RhConfiguracaoAdmissao from "./RhConfiguracaoAdmissao";
import RhPortalColaborador from "./RhPortalColaborador";
import RhMeuPonto from "./RhMeuPonto";
import RhMeusDocumentos from "./RhMeusDocumentos";
import RhMinhasAusencias from "./RhMinhasAusencias";
import RhModelosDocumentos from "./RhModelosDocumentos";
import RhProcessamentoSalarial from "./RhProcessamentoSalarial";
import RhRegrasFimContrato from "./RhRegrasFimContrato";

// A organizacao activa, as permissoes e o Supabase vem de src/test/rhExemploProviders.tsx (organizacao de teste, base vazia).
vi.mock("@/contexts/CompanyContext", async () => (await import("@/test/rhExemploProviders")).moduloCompanyFalso());
vi.mock("@/contexts/PermissionsContext", async () => (await import("@/test/rhExemploProviders")).moduloPermissoesFalso());
vi.mock("@/integrations/supabase/client", async () => (await import("@/test/rhExemploProviders")).moduloSupabaseFalso());

// Quem olha tem sessao e uma conta de CRM; a ficha ligada a essa conta (Sofia) vem de `pessoas_contas` e `pessoas`.
vi.mock("@/lib/identity/resolveBusinessUserId", () => ({
  resolveCurrentBusinessUserId: async () => "u-sofia",
  resolveBusinessUserId: async () => "u-sofia",
  __clearResolveBusinessUserIdCache: () => undefined,
}));

const SOFIA = {
  id: "p-sofia", organization_id: "org-teste", primeiro_nome: "Sofia", apelido: "Marques", nome_completo: "Sofia Marques",
  cargo: "Vendedor", cargo_id: null, data_admissao: "2024-03-01", estado_registo: "activo", local_id: null, reporta_a_pessoa_id: null,
};

const renderEm = (caminho: string, padrao: string, elemento: JSX.Element) =>
  renderRh(
    <Routes>
      <Route path={padrao} element={elemento} />
    </Routes>,
    { rota: caminho },
  );

/** Uma chave por traduzir aparece como o próprio identificador, por exemplo `hr.ausencias.minhas.titulo`. */
function semChavesPorTraduzir(): void {
  const texto = document.body.textContent ?? "";
  const soltas = texto.match(/\b(?:hr|rhExemplo|sidebar)\.[A-Za-z]+\.[A-Za-z0-9_.]+/g) ?? [];
  expect(soltas).toEqual([]);
}

beforeEach(() => {
  reporRhTeste();
  rhTeste.isSystemAdmin = true;
  rhTeste.respostas["pessoas_contas"] = [{ pessoa_id: "p-sofia", estado: "activa" }];
  rhTeste.respostas["pessoas"] = [SOFIA];
  window.localStorage.setItem("language", "pt");
  repor();
  reporGestao();
});

describe("RH de exemplo: assiduidade e ausências (gestão)", () => {
  it("abre com os dois domínios e as pendentes de aprovação", () => {
    renderEm("/rh-exemplo/assiduidade-e-ausencias", "/rh-exemplo/assiduidade-e-ausencias", <RhAssiduidadeEAusencias />);
    expect(screen.getByRole("heading", { level: 1, name: "Assiduidade e Ausências" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").length).toBeGreaterThanOrEqual(2);
    // Os pedidos pendentes de exemplo (Rui e Carolina) estão à espera de chefia.
    expect(screen.getAllByText("Rui Amaral").length).toBeGreaterThan(0);
    semChavesPorTraduzir();
  });

  it("muda para o mapa de assiduidade da organização", () => {
    renderEm("/rh-exemplo/assiduidade-e-ausencias?dominio=assiduidade", "/rh-exemplo/assiduidade-e-ausencias", <RhAssiduidadeEAusencias />);
    expect(screen.getByRole("heading", { level: 1, name: "Assiduidade e Ausências" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab").some((aba) => aba.getAttribute("aria-selected") === "true")).toBe(true);
    semChavesPorTraduzir();
  });
});

describe("RH de exemplo: a minha área", () => {
  it("as minhas ausências abrem na ficha da Sofia, com o botão de pedir", async () => {
    renderEm("/rh-exemplo/ausencias", "/rh-exemplo/ausencias", <RhMinhasAusencias />);
    expect(await screen.findByRole("heading", { level: 1, name: "As minhas ausências" })).toBeInTheDocument();
    expect(await screen.findByText(/Sofia Marques|Sofia/)).toBeInTheDocument();
    expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
    semChavesPorTraduzir();
  });

  it("o meu ponto mostra o painel do dia e o mapa do mês", async () => {
    renderEm("/rh-exemplo/assiduidade?aba=calendario", "/rh-exemplo/assiduidade", <RhMeuPonto />);
    expect(await screen.findByRole("heading", { level: 1, name: "O meu ponto" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Mês anterior|Mes anterior/i })).toBeInTheDocument();
    semChavesPorTraduzir();
  });

  it("os meus documentos abrem sem acesso a gestão de RH", async () => {
    renderEm("/rh-exemplo/documentos", "/rh-exemplo/documentos", <RhMeusDocumentos />);
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    semChavesPorTraduzir();
  });
});

describe("RH de exemplo: centros de trabalho", () => {
  it("lista os centros de exemplo", () => {
    renderEm("/rh-exemplo/centros", "/rh-exemplo/centros", <RhCentrosTrabalho />);
    expect(screen.getAllByText("Loja Colombo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Armazém Azambuja").length).toBeGreaterThan(0);
    semChavesPorTraduzir();
  });
});

describe("RH de exemplo: modelos de documentos", () => {
  it("lista os modelos e as cláusulas de exemplo", () => {
    renderEm("/rh-exemplo/documentos/modelos", "/rh-exemplo/documentos/modelos", <RhModelosDocumentos />);
    expect(screen.getAllByText("Contrato de trabalho sem termo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Declaração de vínculo").length).toBeGreaterThan(0);
    semChavesPorTraduzir();
  });
});

describe("RH de exemplo: processamento salarial", () => {
  it("abre na visão geral, e a aba de configuração mostra os códigos de exemplo", async () => {
    renderEm("/rh-exemplo/processamento-salarial", "/rh-exemplo/processamento-salarial", <RhProcessamentoSalarial />);
    expect(screen.getByRole("heading", { level: 1, name: "Processamento Salarial" })).toBeInTheDocument();
    const abas = screen.getAllByRole("tab");
    expect(abas).toHaveLength(3);
    fireEvent.mouseDown(abas[2], { button: 0 });
    await waitFor(() => expect(screen.getAllByText("Prémio de assiduidade").length).toBeGreaterThan(0));
    semChavesPorTraduzir();
  });
});

describe("RH de exemplo: configuração", () => {
  it("a configuração da admissão lista os campos", async () => {
    renderEm("/rh-exemplo/admissao/configuracao", "/rh-exemplo/admissao/configuracao", <RhConfiguracaoAdmissao />);
    expect((await screen.findAllByRole("heading")).length).toBeGreaterThan(0);
    semChavesPorTraduzir();
  });

  it("as regras de fim de contrato mostram a regra de exemplo", async () => {
    renderEm("/rh-exemplo/contratos/configuracao", "/rh-exemplo/contratos/configuracao", <RhRegrasFimContrato />);
    expect((await screen.findAllByRole("heading")).length).toBeGreaterThan(0);
    semChavesPorTraduzir();
  });
});

describe("RH de exemplo: Portal do colaborador (página pública)", () => {
  it("o token de exemplo abre o formulário na ficha de admissão, sem sessão", () => {
    renderEm("/rh-exemplo/portal-colaborador/exemplo", "/rh-exemplo/portal-colaborador/:token", <RhPortalColaborador />);
    expect(screen.getAllByRole("textbox").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Seguinte" })).toBeInTheDocument();
    semChavesPorTraduzir();
  });

  it("um token desconhecido mostra o cartão de ligação inválida", () => {
    renderEm("/rh-exemplo/portal-colaborador/outro", "/rh-exemplo/portal-colaborador/:token", <RhPortalColaborador />);
    expect(screen.queryByRole("button", { name: "Seguinte" })).not.toBeInTheDocument();
    expect(within(document.body).getAllByText(/./).length).toBeGreaterThan(0);
    semChavesPorTraduzir();
  });
});

describe("RH de exemplo: acções que escrevem em memória", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("picar exige dizer onde se está (seletor de exemplo, sem pedir localização ao navegador)", async () => {
    renderEm("/rh-exemplo/assiduidade", "/rh-exemplo/assiduidade", <RhMeuPonto />);
    const antes = lerGestao().picagens.filter((p) => p.pessoa_id === "p-sofia").length;
    const picar = () => fireEvent.click(screen.getByRole("button", { name: /Registar (entrada|saida|saída)/ }));
    picar();
    expect(await screen.findByText("Escolha onde está para poder picar.")).toBeInTheDocument();
    expect(lerGestao().picagens.filter((p) => p.pessoa_id === "p-sofia")).toHaveLength(antes);
    fireEvent.click(screen.getByRole("radio", { name: "Estou no local" }));
    picar();
    await waitFor(() => expect(lerGestao().picagens.filter((p) => p.pessoa_id === "p-sofia")).toHaveLength(antes + 1));
    const ultima = lerGestao().picagens.filter((p) => p.pessoa_id === "p-sofia").at(-1)!;
    expect(ultima.latitude).not.toBeNull();
    expect(ultima.origem).toBe("web");
  });

  it("o botão do relatório mensal gera um PDF e abre-o", async () => {
    const abrir = vi.spyOn(window, "open").mockReturnValue(null);
    const criarUrl = vi.fn(() => "blob:relatorio-exemplo");
    Object.defineProperty(URL, "createObjectURL", { value: criarUrl, configurable: true, writable: true });
    renderEm("/rh-exemplo/assiduidade?aba=calendario", "/rh-exemplo/assiduidade", <RhMeuPonto />);
    fireEvent.click(screen.getByRole("button", { name: "Relatório mensal" }));
    await waitFor(() => expect(abrir).toHaveBeenCalledWith("blob:relatorio-exemplo", "_blank", "noopener"), { timeout: 8000 });
    expect(criarUrl).toHaveBeenCalledTimes(1);
  });

  it("aprovar um pedido pendente tira-o da fila de aprovações", async () => {
    renderEm("/rh-exemplo/assiduidade-e-ausencias", "/rh-exemplo/assiduidade-e-ausencias", <RhAssiduidadeEAusencias />);
    const contagem = () => Number(screen.getByText(/a aguardar a sua decisão/).textContent!.match(/\d+/)![0]);
    const antes = contagem();
    expect(antes).toBeGreaterThanOrEqual(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Abrir" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Aprovar como chefia" }));
    await waitFor(() => expect(contagem()).toBe(antes - 1));
  });

  it("abrir o período do mês no processamento salarial deixa-o aberto", async () => {
    renderEm("/rh-exemplo/processamento-salarial", "/rh-exemplo/processamento-salarial", <RhProcessamentoSalarial />);
    // Setembro ja vem aberto; Outubro (o mes corrente) ainda nao abriu.
    expect(await screen.findByRole("button", { name: /Fechar período/ })).toBeInTheDocument();
    fireEvent.change(document.getElementById("hr-processamento-mes") as HTMLInputElement, { target: { value: "2026-10" } });
    fireEvent.click(await screen.findByRole("button", { name: "Abrir período" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Fechar período/ })).toBeInTheDocument());
    expect(lerGestao().periodos.some((p) => p.ano === 2026 && p.mes === 10 && p.estado === "aberto")).toBe(true);
  });
});
