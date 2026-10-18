// Os negócios criados com "Novo negócio" entram em todas as vistas da página; sem nenhum, os números são os de sempre.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NegocioMetas from "./NegocioMetas";
import { criarNegocioNovo, repor } from "@/components/negocio-metas/negociosNovos";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import { registarLevantamento, registarVisita, repor as reporRegistos } from "@/components/negocio-metas/registosPessoa";
import type { VisitaNegocio } from "@/components/negocio-metas/negocioMetas";

vi.mock("@/hooks/useTranslation", async () => {
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) => {
        let texto = negocioMetasTranslations.pt[key] ?? key;
        Object.entries(params ?? {}).forEach(([k, v]) => { texto = texto.replace(`{${k}}`, String(v)); });
        return texto;
      },
    }),
  };
});

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

const renderPage = () => render(<MemoryRouter><NegocioMetas /></MemoryRouter>);
const estado = () => screen.getAllByRole("status")[0].textContent;
const verTodos = () =>
  fireEvent.click(within(screen.getByRole("group", { name: "Mostrar" })).getByRole("button", { name: "Todos" }));

/** "No Quadro" e "Por fechar" do Dashboard, só os números. */
const numerosDoQuadro = () => {
  const secao = screen.getByRole("heading", { name: "Números do Quadro" }).closest("section")!;
  return within(secao).getAllByRole("listitem").slice(0, 2).map((li) => li.querySelector("p")!.textContent);
};

beforeEach(() => window.localStorage.clear());
afterEach(() => { repor(); reporRegistos(); });

describe("Novo negócio na página", () => {
  it("tem o botão primário Novo negócio no cabeçalho, ao lado do Workflow", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Novo negócio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Workflow" })).toBeInTheDocument();
  });

  it("sem negócios novos os números são os dos 10 originais", () => {
    renderPage();
    verTodos();
    expect(estado()).toBe("10 negócios");
    expect(screen.getByText(/3 \(de 10\) no Quadro|10 no Quadro/)).toBeInTheDocument();
  });

  it("um negócio novo entra no Quadro, no resumo e na contagem do Dashboard, sem contar como ganho", () => {
    criarNegocioNovo(
      { pessoa: { id: "p-marta", nome: "Marta Silveira" }, comercial: "Ana Ribeiro" }, HOJE_EXEMPLO,
    );
    renderPage();
    verTodos();
    expect(estado()).toBe("11 negócios");
    expect(document.body.textContent).not.toContain("undefined");
    expect(screen.getByRole("button", { name: /^Marta Silveira · Ana Ribeiro/ })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Dashboard" }));
    // No Quadro 10 passam a 11 e Por fechar 4 passam a 5 (o novo está aberto).
    expect(numerosDoQuadro()).toEqual(["11", "5"]);
    const metas = screen.getByRole("heading", { name: "Metas do mês" }).closest("section")!;
    // O valor ganho não muda (77%), porque o novo não é ganho.
    expect(within(metas).getByText("77%")).toBeInTheDocument();
  });
});

describe("Levantamento no painel do negócio criado (deriva do registo ligado)", () => {
  const levantamento = {
    linhas: [{ id: "l1", divisao: "cozinha", trabalho: "outro", trabalhoOutro: "Bancada nova", medida: "3,5", unidade: "m2", observacoes: "Ver canos" }],
    observacoes: "Cliente em casa de manhã", respostas: {},
  };
  const abrirPainel = (comLevantamento: boolean) => {
    const registo = comLevantamento
      ? registarLevantamento({ pessoaId: "p-marta", visitaId: null, data: "2026-10-13", feitoPor: "Bruno Costa", rascunho: levantamento })
      : null;
    const criado = criarNegocioNovo(
      {
        pessoa: { id: "p-marta", nome: "Marta Silveira" }, comercial: "Ana Ribeiro",
        ligar: registo ? { registos: [], levantamento: { tipo: "existente", id: registo.id } } : { registos: [], levantamento: { tipo: "dispensar" } },
      }, HOJE_EXEMPLO,
    );
    render(<MemoryRouter initialEntries={[`/?open=${criado.id}`]}><NegocioMetas /></MemoryRouter>);
    return screen.getByRole("dialog");
  };

  it("mostra a secção Levantamento no Resumo, só de leitura, com o estado, a data, quem fez e as linhas", () => {
    const painel = abrirPainel(true);
    const secao = within(painel).getByRole("heading", { name: "Levantamento" }).closest("section")!;
    expect(within(secao).getByText("Feito · 13/10/2026 · Bruno Costa")).toBeInTheDocument();
    expect(within(secao).getByRole("listitem")).toHaveTextContent("Cozinha: Bancada nova, 3.5 m² (Ver canos)");
    expect(within(secao).getByText("Cliente em casa de manhã")).toBeInTheDocument();
  });

  it("sem levantamento o Resumo não traz a secção", () => {
    const painel = abrirPainel(false);
    expect(within(painel).queryByRole("heading", { name: "Levantamento" })).not.toBeInTheDocument();
  });
});

describe("Qualificação e morada da obra no painel do negócio criado", () => {
  const abrirPainel = (extra: Record<string, unknown>) => {
    const criado = criarNegocioNovo({ pessoa: { id: "p-marta", nome: "Marta Silveira" }, comercial: "Ana Ribeiro", ...extra }, HOJE_EXEMPLO);
    render(<MemoryRouter initialEntries={[`/?open=${criado.id}`]}><NegocioMetas /></MemoryRouter>);
    return screen.getByRole("dialog");
  };

  it("mostra Qualificação e Morada da obra no Resumo, só de leitura, com o que foi respondido", () => {
    const painel = abrirPainel({
      qualificacao: [{ pergunta: "Tipo de imóvel", resposta: "Apartamento" }],
      moradaObra: { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "3.º Esq." },
    });
    const qualificacao = within(painel).getByRole("heading", { name: "Qualificação" }).closest("section")!;
    expect(within(qualificacao).getByRole("listitem")).toHaveTextContent("Tipo de imóvel: Apartamento");
    const morada = within(painel).getByRole("heading", { name: "Morada da obra" }).closest("section")!;
    expect(within(morada).getByText("Rua A 1, 1000-001 Lisboa")).toBeInTheDocument();
    expect(within(morada).getByText("3.º Esq.")).toBeInTheDocument();
  });

  it("sem respostas o Resumo não traz nenhuma das secções", () => {
    const painel = abrirPainel({});
    for (const nome of ["Qualificação", "Morada da obra", "Visita"]) {
      expect(within(painel).queryByRole("heading", { name: nome })).not.toBeInTheDocument();
    }
  });
});

describe("Visitas no painel do negócio criado (derivam dos registos ligados)", () => {
  const visita = (id: string, parcial: Partial<VisitaNegocio> = {}): VisitaNegocio => ({
    id, data: "2026-10-15", hora: "10:00", feitoPor: "Bruno Costa", estado: "feita", tipo: "levantamento", quemVaiEstar: "", duracao: "",
    morada: { rua: "Rua A 1", codigoPostal: "1000-001", localidade: "Lisboa", andar: "" }, igualALead: false, nota: "", ...parcial,
  });
  const abrirPainel = (visitas: VisitaNegocio[]) => {
    const registadas = visitas.map((v) => registarVisita({ ...v, pessoaId: "p-marta" }));
    const criado = criarNegocioNovo(
      {
        pessoa: { id: "p-marta", nome: "Marta Silveira" }, comercial: "Ana Ribeiro",
        ligar: { registos: registadas.map((v) => ({ tipo: "visita" as const, id: v.id })), levantamento: { tipo: "dispensar" } },
      }, HOJE_EXEMPLO,
    );
    render(<MemoryRouter initialEntries={[`/?open=${criado.id}`]}><NegocioMetas /></MemoryRouter>);
    return screen.getByRole("dialog");
  };

  it("lista as visitas por ordem, com o estado em texto, e destaca a «Próxima visita» quando há uma Por fazer", () => {
    const painel = abrirPainel([
      visita("v2", { estado: "porFazer", tipo: "revisita", data: "2026-10-22", hora: "" }),
      visita("v1"),
    ]);
    const secao = within(painel).getByRole("heading", { name: "Visitas" }).closest("section")!;
    const itens = within(secao).getAllByRole("listitem");
    expect(itens[0]).toHaveTextContent("1.ª visita · Feita · 15/10/2026 · 10:00 · Bruno Costa · Levantamento");
    expect(itens[0]).not.toHaveTextContent("Veio da pessoa");
    expect(itens[1]).toHaveTextContent("2.ª visita · Por fazer · 22/10/2026 · Bruno Costa · Revisita");
    expect(within(secao).getByText("Próxima visita").closest("div")).toHaveTextContent("2.ª visita · Por fazer · 22/10/2026");
  });

  it("sem nenhuma Por fazer não há «Próxima visita»", () => {
    const painel = abrirPainel([visita("v1")]);
    expect(within(painel).queryByText("Próxima visita")).not.toBeInTheDocument();
    expect(within(painel).getByRole("heading", { name: "Visitas" })).toBeInTheDocument();
  });

  it("sem visitas o Resumo não traz a secção", () => {
    expect(within(abrirPainel([])).queryByRole("heading", { name: "Visitas" })).not.toBeInTheDocument();
  });
});
