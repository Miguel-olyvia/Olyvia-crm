// O percurso do negócio no ecrã: contactos, visitas (e o resultado), levantamento, orçamentos, proposta e contrato por ordem cronológica,
// lidos do que está ligado ao negócio e dos seus detalhes; um negócio perdido acaba com a perda.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MORADA_VAZIA } from "./moradaObra";
import type { NegocioMes } from "./negocioMetas";
import { perderNegocio, repor } from "./negociosAlterados";
import { PainelNegocio } from "./PainelNegocio";
import { PercursoNegocio } from "./PercursoPainel";
import { ligarRegisto, registarContacto, registarLevantamento, registarVisita, repor as reporRegistos } from "./registosPessoa";

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
afterEach(() => { cleanup(); repor(); reporRegistos(); });

const negocio = (extra: Partial<NegocioMes> = {}): NegocioMes => ({
  id: "n1", pessoaId: "p1", pessoa: "Ana", servico: "Cozinha", comercial: "Rui", dias: 20, parado: null, proximoPrazo: null,
  contacto: { telefone: null, email: null }, orcamentos: [], proposta: null, contrato: null, ...extra,
});
const ligar = (tipo: "contacto" | "visita" | "levantamento", id: string) => ligarRegisto({ tipo, id }, "n1");
const itens = () => within(screen.getByRole("list", { name: "Percurso do negócio" })).getAllByRole("listitem").map((li) => li.textContent);

describe("PercursoNegocio", () => {
  it("sem nada, diz que o percurso está vazio (e não mostra uma lista)", () => {
    render(<PercursoNegocio negocio={negocio()} detalhe={null} />);
    expect(screen.getByRole("heading", { name: "Percurso do negócio" })).toBeInTheDocument();
    expect(screen.getByText("Ainda não há nada neste percurso.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("mostra, por ordem cronológica, o contacto, a visita com o resultado, o levantamento, o orçamento, a proposta e o contrato", () => {
    const c = registarContacto({ pessoaId: "p1", data: "2026-10-01", resultado: "atendeuInteressado", nota: "Pediu visita" });
    const v = registarVisita({
      pessoaId: "p1", data: "2026-10-03", hora: "10:00", feitoPor: "Rui", estado: "feita", tipo: "levantamento", quemVaiEstar: "", duracao: "",
      morada: MORADA_VAZIA, igualALead: true, nota: "", resultado: "interessado",
    });
    const l = registarLevantamento({
      pessoaId: "p1", visitaId: v.id, data: "2026-10-03", feitoPor: "Rui",
      rascunho: { linhas: [{ id: "l1", divisao: "cozinha", trabalho: "outro", trabalhoOutro: "Bancada", medida: "3", unidade: "m2", observacoes: "" }], observacoes: "", respostas: {} },
    });
    ligar("contacto", c.id); ligar("visita", v.id); ligar("levantamento", l.id);
    render(
      <PercursoNegocio
        negocio={negocio({ orcamentos: [{ id: "o1", valor: 1000, escolhido: true }], proposta: { estado: "enviada" }, contrato: { estado: "pendente" } })}
        detalhe={{
          orcamentos: { o1: { data: "2026-10-05", estado: "aceite" } }, proposta: { enviadaEm: "2026-10-06", orcamentoIds: ["o1"] }, contrato: { criadoEm: "2026-10-08" },
        }}
      />,
    );
    const texto = itens();
    expect(texto).toHaveLength(6);
    expect(texto[0]).toContain("01/10/2026");
    expect(texto[0]).toContain("Contacto");
    expect(texto[0]).toContain("Atendeu, interessado");
    expect(texto[0]).toContain("Pediu visita");
    expect(texto[1]).toContain("Visita");
    expect(texto[1]).toContain("Feita");
    expect(texto[1]).toContain("Interessada");
    expect(texto[2]).toContain("Levantamento");
    expect(texto[2]).toContain("Feito por Rui, 1 linha");
    expect(texto[3]).toContain("Orçamento");
    expect(texto[3]).toContain("€1.000");
    expect(texto[3]).toContain("Escolhido");
    expect(texto[4]).toContain("Proposta");
    expect(texto[4]).toContain("Enviada");
    expect(texto[5]).toContain("Contrato");
    expect(texto[5]).toContain("Por assinar");
  });

  it("não mostra registos de outro negócio nem os que estão por ligar", () => {
    const meu = registarContacto({ pessoaId: "p1", data: "2026-10-01", resultado: "naoAtendeu", nota: "" });
    const doutro = registarContacto({ pessoaId: "p1", data: "2026-10-02", resultado: "semInteresse", nota: "" });
    registarContacto({ pessoaId: "p1", data: "2026-10-03", resultado: "numeroErrado", nota: "" });
    ligar("contacto", meu.id);
    ligarRegisto({ tipo: "contacto", id: doutro.id }, "n-outro");
    render(<PercursoNegocio negocio={negocio()} detalhe={null} />);
    expect(itens()).toHaveLength(1);
    expect(itens()[0]).toContain("Não atendeu");
  });

  it("um acontecimento sem dia diz «Sem data»", () => {
    render(<PercursoNegocio negocio={negocio({ orcamentos: [{ id: "o1", valor: 50, escolhido: true }], proposta: { estado: "rascunho" } })} detalhe={null} />);
    expect(itens().every((t) => t?.includes("Sem data"))).toBe(true);
  });

  it("um negócio perdido acaba com a perda, a fase em que se perdeu e o motivo", () => {
    const n = negocio({ orcamentos: [{ id: "o1", valor: 50, escolhido: true }], proposta: { estado: "enviada" } });
    render(<PercursoNegocio negocio={n} detalhe={{ proposta: { enviadaEm: "2026-10-06", orcamentoIds: ["o1"] } }} />);
    act(() => perderNegocio(n, "Preço", "2026-10-12"));
    const texto = itens();
    expect(texto[texto.length - 1]).toContain("12/10/2026");
    expect(texto[texto.length - 1]).toContain("Perdido em Proposta: Preço");
  });

  it("cada acontecimento tem o tipo escrito em texto (não só um ícone ou uma cor)", () => {
    const c = registarContacto({ pessoaId: "p1", data: "2026-10-01", resultado: "naoAtendeu", nota: "" });
    ligar("contacto", c.id);
    render(<PercursoNegocio negocio={negocio()} detalhe={null} />);
    expect(within(screen.getAllByRole("listitem")[0]).getByText("Contacto")).toBeVisible();
    for (const icone of document.querySelectorAll("li svg")) expect(icone).toHaveAttribute("aria-hidden", "true");
  });
});

describe("o percurso no painel do negócio", () => {
  it("está no separador Resumo, com o título e o que está ligado ao negócio", () => {
    const c = registarContacto({ pessoaId: "p1", data: "2026-10-01", resultado: "naoAtendeu", nota: "" });
    ligar("contacto", c.id);
    render(
      <MemoryRouter>
        <PainelNegocio negocio={negocio()} hoje="2026-10-13" acoes={{ abrirPessoa: vi.fn(), criarOrcamento: vi.fn() }} aoFechar={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Percurso do negócio" })).toBeInTheDocument();
    expect(itens()).toHaveLength(1);
    expect(itens()[0]).toContain("Não atendeu");
  });
});
