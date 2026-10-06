import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ObraDadosEmFalta from "../ObraDadosEmFalta";
import ObraEncomendas from "../ObraEncomendas";
import { hrefDoDado, type LinhaEncomenda } from "../../domain/encomendas";

const linha = (p: Partial<LinhaEncomenda>): LinhaEncomenda => ({
  obra_id: "o1",
  obra_codigo: "OB-1",
  obra_titulo: "Cozinha",
  tarefa_id: "t1",
  tarefa_nome: "Bancada",
  inicio_planeado: "2026-10-21",
  produto_id: "p1",
  produto_nome: "Bancada",
  quantidade: 1,
  unidade: "un",
  prazo_dias: 10,
  encomenda_chega: null,
  encomendar_ate: "2026-10-09",
  estado: "esta_semana",
  detalhe: "Encomendar até 09/10",
  ...p,
});

vi.mock("../../lib/encomendas", () => ({
  dadosEmFalta: vi.fn(async () => [
    {
      chave: "sem_ficha_local",
      gravidade: 1,
      titulo: "Ficha do local por preencher",
      detalhe: "O andar, o elevador…",
      onde: "Orçamento → Morada de entrega → Editar",
      link: "/quotes?open=q1",
      destino: "crm",
    },
    {
      chave: "oficio_sem_pessoas",
      gravidade: 1,
      titulo: "Ninguém na equipa com Gás (ITG)",
      detalhe: "A distribuição automática não tem a quem dar estas tarefas.",
      onde: "Definições → Equipa → especialidades",
      link: "/definicoes",
      destino: "ops",
    },
  ]),
  encomendas: vi.fn(async () => [
    linha({ produto_id: "p1", estado: "em_atraso", produto_nome: "Móvel", detalhe: "Devia ter sido encomendado até 01/10" }),
    linha({ produto_id: "p2", estado: "esta_semana", produto_nome: "Bancada" }),
    linha({ produto_id: "p3", estado: "encomendado", produto_nome: "Torneira", encomendar_ate: null, detalhe: "Encomenda em aberto chega a 15/10" }),
  ]),
}));

describe("Dados em falta da obra", () => {
  it("fechado mostra a contagem; aberto, cada um com o sítio onde se preenche", async () => {
    render(
      <MemoryRouter>
        <ObraDadosEmFalta obraId="o1" />
      </MemoryRouter>
    );
    const bloco = await screen.findByTestId("dados-em-falta");
    expect(bloco).toHaveTextContent("Dados em falta que pioram o plano");
    expect(bloco).toHaveTextContent("· 2");
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const crm = screen.getByRole("link", { name: /Orçamento → Morada de entrega → Editar/ });
    expect(crm.getAttribute("href")).toMatch(/\/quotes\?open=q1$/);
    expect(crm.getAttribute("href")).toMatch(/^https?:\/\//);
    expect(screen.getByRole("link", { name: /Definições → Equipa/ }).getAttribute("href")).toBe("/definicoes");
  });

  it("links: o do CRM vai para a Olyvia, o das Operações fica na app", () => {
    const base = { chave: "x", gravidade: 1, titulo: "", detalhe: "", onde: "", link: "/deals?open=d1" };
    expect(hrefDoDado({ ...base, destino: "crm" }, "https://olyvia-ai.com/")).toBe("https://olyvia-ai.com/deals?open=d1");
    expect(hrefDoDado({ ...base, destino: "ops", link: "/definicoes" }, "https://olyvia-ai.com")).toBe("/definicoes");
    expect(hrefDoDado({ ...base, destino: null, link: null }, "https://olyvia-ai.com")).toBeNull();
  });
});

describe("A encomendar, na obra", () => {
  it("mostra só os urgentes, com a data-limite; 'Ver todos' mostra o resto", async () => {
    render(
      <MemoryRouter>
        <ObraEncomendas orgId="org" obraId="o1" />
      </MemoryRouter>
    );
    const bloco = await screen.findByTestId("obra-encomendas");
    expect(bloco).toHaveTextContent("2 urgentes");
    expect(screen.getByText("Móvel")).toBeInTheDocument();
    expect(screen.getByText("Em atraso")).toBeInTheDocument();
    expect(screen.queryByText("Torneira")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver todos (3)" }));
    expect(screen.getByText("Torneira")).toBeInTheDocument();
    expect(screen.getByText("Encomendado")).toBeInTheDocument();
  });
});
