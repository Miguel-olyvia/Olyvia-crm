/**
 * A fila deixou de ser uma lista plana ordenada por pessoa: agora agrupa por
 * dia (mais recente primeiro) e deixa filtrar por pessoa. Sem isto, com
 * dezenas de desvios ninguem consegue responder "o que aconteceu no dia 9".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (chave: string, valores?: Record<string, string>) => {
      if (chave === "hr.assiduidade.desvios.contagem") return `${valores?.quantos} desvios`;
      if (chave === "hr.assiduidade.desvios.contagemFiltrada")
        return `${valores?.quantos} desvios (>= ${valores?.minutos}m)`;
      if (chave === "common.all") return "Todas";
      return chave;
    },
    language: "pt-PT",
  }),
}));

import { FilaDesvios } from "@/components/hr/assiduidade/FilaDesvios";
import type { Desvio } from "@/types/hrAssiduidade";

// O Select (Radix) precisa destas duas APIs, que o jsdom nao implementa.
beforeEach(() => {
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => {});
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
});

function desvio(overrides: Partial<Desvio>): Desvio {
  return {
    organization_id: "org1",
    pessoa_id: "p1",
    data: "2026-09-01",
    tipo: "planeado_sem_realizado",
    hora_inicio: null,
    hora_fim: null,
    minutos: null,
    planeado_id: null,
    local_id: null,
    referencia_id: null,
    detalhe: null,
    ...overrides,
  };
}

const NOMES = new Map([
  ["p1", "Dulce Ramos"],
  ["p2", "Rui Nogueira"],
]);

/** Abre o Select cujo trigger tem este id, devolvendo a lista de opcoes. */
async function abrirSelector(idTrigger: string) {
  const trigger = document.getElementById(idTrigger) as HTMLElement;
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  fireEvent.click(trigger);
  return screen.findAllByRole("option");
}

describe("FilaDesvios", () => {
  it("agrupa por dia, com o dia mais recente primeiro, e o cabecalho e um heading", () => {
    const desvios = [
      desvio({ pessoa_id: "p1", data: "2026-09-01", minutos: 20 }),
      desvio({ pessoa_id: "p2", data: "2026-09-09", minutos: 20 }),
      desvio({ pessoa_id: "p1", data: "2026-09-09", minutos: 20 }),
    ];

    render(
      <FilaDesvios
        desvios={desvios}
        nomePorPessoaId={NOMES}
        onAbrirDia={vi.fn()}
        idPrefixo="teste"
      />,
    );

    // CardTitle tambem e um <h3>; filtramos so os cabecalhos de dia.
    const headings = screen
      .getAllByRole("heading", { level: 3 })
      .filter((heading) => heading.id.startsWith("teste-dia-"));
    expect(headings).toHaveLength(2);
    // O dia 9 (mais recente) vem antes do dia 1.
    expect(headings[0].textContent).toContain("09");
    expect(headings[1].textContent).toContain("01");

    const grupoDia9 = headings[0].closest("section");
    expect(grupoDia9).not.toBeNull();
    expect(within(grupoDia9 as HTMLElement).getByText("Dulce Ramos")).toBeInTheDocument();
    expect(within(grupoDia9 as HTMLElement).getByText("Rui Nogueira")).toBeInTheDocument();
  });

  it("o selector de pessoa so lista quem tem desvios na janela, por ordem alfabetica", async () => {
    const desvios = [
      desvio({ pessoa_id: "p2", data: "2026-09-09", minutos: 20 }),
      desvio({ pessoa_id: "p1", data: "2026-09-01", minutos: 20 }),
    ];

    render(
      <FilaDesvios
        desvios={desvios}
        nomePorPessoaId={NOMES}
        onAbrirDia={vi.fn()}
        idPrefixo="teste"
      />,
    );

    const opcoes = await abrirSelector("teste-pessoa");
    // "Todas" primeiro, depois Dulce Ramos antes de Rui Nogueira (alfabetico).
    expect(opcoes.map((opcao) => opcao.textContent)).toEqual([
      "Todas",
      "Dulce Ramos",
      "Rui Nogueira",
    ]);
  });

  it("filtrar por pessoa reduz a lista e a contagem no topo", async () => {
    const desvios = [
      desvio({ pessoa_id: "p1", data: "2026-09-01", minutos: 20 }),
      desvio({ pessoa_id: "p2", data: "2026-09-09", minutos: 20 }),
    ];

    render(
      <FilaDesvios
        desvios={desvios}
        nomePorPessoaId={NOMES}
        onAbrirDia={vi.fn()}
        idPrefixo="teste"
      />,
    );

    const opcoes = await abrirSelector("teste-pessoa");
    const dulce = opcoes.find((opcao) => opcao.textContent === "Dulce Ramos");
    expect(dulce).toBeDefined();
    fireEvent.click(dulce as HTMLElement);

    // "Dulce Ramos" aparece agora duas vezes: no valor escolhido do Select e
    // na linha da lista -- o que interessa e que Rui Nogueira desapareceu.
    expect(await screen.findAllByText("Dulce Ramos")).not.toHaveLength(0);
    expect(screen.queryByText("Rui Nogueira")).not.toBeInTheDocument();
    expect(screen.getAllByText(/^1 desvios/).length).toBeGreaterThan(0);
  });
});
