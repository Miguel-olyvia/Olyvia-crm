/**
 * A faixa vermelha de falta tem de ser PROPORCIONAL ao que faltou, nao uma
 * largura fixa. Uma falta do dia inteiro (sem nada realizado nesse dia) cobre
 * a celula toda; uma falta parcial ocupa so a fraccao que lhe corresponde.
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (chave: string) => chave,
    language: "pt-PT",
  }),
}));

import { MapaAssiduidadeMes } from "@/components/hr/assiduidade/MapaAssiduidadeMes";
import { chaveCelula, type CelulaDoDia } from "@/hooks/useAssiduidadeDaOrganizacao";

function celula(overrides: Partial<CelulaDoDia>): CelulaDoDia {
  return {
    minutosRealizados: 0,
    minutosEmFalta: 0,
    locais: [],
    temDesvio: false,
    faltas: 0,
    faltasJustificadas: 0,
    ...overrides,
  };
}

const PESSOA = { id: "p1", nome: "Dulce Ramos" };
const DIA = "2026-09-16";

function renderComCelula(dados: CelulaDoDia) {
  const celulas = new Map([[chaveCelula(PESSOA.id, DIA), dados]]);
  const { container } = render(
    <MapaAssiduidadeMes
      pessoas={[PESSOA]}
      dias={[DIA]}
      celulas={celulas}
      locais={[]}
      onAbrirDia={() => {}}
    />,
  );
  const gridcell = container.querySelector('[data-celula="0-0"]') as HTMLElement;
  return gridcell.querySelectorAll<HTMLElement>("span[aria-hidden='true']");
}

function diasDoMes(ano: number, mes: number): string[] {
  const doisDigitos = (valor: number) => String(valor).padStart(2, "0");
  const ultimo = new Date(ano, mes + 1, 0).getDate();
  return Array.from(
    { length: ultimo },
    (_, indice) => `${ano}-${doisDigitos(mes + 1)}-${doisDigitos(indice + 1)}`,
  );
}

describe("MapaAssiduidadeMes - grelha alinhada com o numero de dias", () => {
  it.each([
    [2026, 8, 30], // Setembro de 2026
    [2026, 1, 28], // Fevereiro de 2026 (nao bissexto)
    [2026, 0, 31], // Janeiro de 2026
  ])("gera exactamente %i colunas de cabecalho e %i colunas de celulas para o mes %i/%i", (ano, mes, totalDias) => {
    const dias = diasDoMes(ano, mes);
    expect(dias).toHaveLength(totalDias);

    const { container } = render(
      <MapaAssiduidadeMes
        pessoas={[PESSOA]}
        dias={dias}
        celulas={new Map()}
        locais={[]}
        onAbrirDia={() => {}}
      />,
    );

    const colunasDeCabecalho = container.querySelectorAll('[role="columnheader"]');
    const colunasDeCelula = container.querySelectorAll('[role="gridcell"]');
    // Cada colecao inclui a coluna "Pessoa" a mais no cabecalho, por isso o
    // numero de colunas de DIA e o total menos essa unica coluna fixa.
    expect(colunasDeCabecalho.length - 1).toBe(totalDias);
    expect(colunasDeCelula.length).toBe(totalDias);
  });

  it("o cabecalho de dias e as celulas usam a mesma caixa (mesma margem), para nao desalinhar", () => {
    const dias = diasDoMes(2026, 8);
    const { container } = render(
      <MapaAssiduidadeMes
        pessoas={[PESSOA]}
        dias={dias}
        celulas={new Map()}
        locais={[]}
        onAbrirDia={() => {}}
      />,
    );

    const cabecalhosDeDia = [...container.querySelectorAll('[role="columnheader"]')].slice(1);
    const celulas = [...container.querySelectorAll('[role="gridcell"]')];

    for (const cabecalho of cabecalhosDeDia) {
      expect(cabecalho.className).toContain("m-px");
    }
    for (const celula of celulas) {
      expect(celula.className).toContain("m-px");
    }
  });
});

describe("MapaAssiduidadeMes - faixa de falta proporcional", () => {
  it("sem faltas nao mostra faixa vermelha nenhuma", () => {
    const faixas = renderComCelula(
      celula({ minutosRealizados: 480, locais: ["localA"] }),
    );
    const vermelhas = [...faixas].filter((f) => f.className.includes("bg-destructive"));
    expect(vermelhas).toHaveLength(0);
  });

  it("falta do dia inteiro (sem nada realizado) cobre a celula toda", () => {
    const faixas = renderComCelula(
      celula({ minutosRealizados: 0, minutosEmFalta: 480, faltas: 1, locais: [] }),
    );
    const vermelhas = [...faixas].filter((f) => f.className.includes("bg-destructive"));
    expect(vermelhas).toHaveLength(1);
    expect(vermelhas[0].className).toContain("flex-1");
    expect(vermelhas[0].style.flex).toBe("");
  });

  it("falta parcial (25% do total conhecido do dia) fica proporcionalmente estreita", () => {
    // 360 minutos realizados + 120 minutos de falta = 480 minutos no total,
    // a falta e 120/480 = 25% da largura.
    const faixas = renderComCelula(
      celula({
        minutosRealizados: 360,
        minutosEmFalta: 120,
        faltas: 1,
        locais: ["localA"],
      }),
    );
    const vermelhas = [...faixas].filter((f) => f.className.includes("bg-destructive"));
    expect(vermelhas).toHaveLength(1);
    expect(vermelhas[0].style.flex).toBe("0.25 1 0%");

    const local = [...faixas].find((f) => !f.className.includes("bg-destructive"));
    expect(local?.style.flex).toBe("0.75 1 0%");
  });

  it("falta parcial pequena (10 minutos numa manha de 480) fica bem mais estreita que uma falta de metade do dia", () => {
    const faixasPequena = renderComCelula(
      celula({ minutosRealizados: 470, minutosEmFalta: 10, faltas: 1, locais: ["localA"] }),
    );
    const faixasGrande = renderComCelula(
      celula({ minutosRealizados: 240, minutosEmFalta: 240, faltas: 1, locais: ["localA"] }),
    );

    const vermelhaPequena = [...faixasPequena].find((f) =>
      f.className.includes("bg-destructive"),
    )!;
    const vermelhaGrande = [...faixasGrande].find((f) =>
      f.className.includes("bg-destructive"),
    )!;

    const proporcao = (elemento: HTMLElement) => parseFloat(elemento.style.flex.split(" ")[0]);
    expect(proporcao(vermelhaPequena)).toBeLessThan(proporcao(vermelhaGrande));
  });
});
