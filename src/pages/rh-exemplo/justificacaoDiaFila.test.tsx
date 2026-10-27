// A fila de trabalho do mapa de assiduidade com as justificações de dia por decidir, lidas da base: a linha conta no contador do
// separador, a decisão (uma chamada à base) tira-a da fila e o contador desce. A base está simulada em memória
// (src/test/justificacoesDoDiaFalso.ts); nada toca em base nenhuma.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/rh-exemplo/hooks/useJustificacoesDoDia", async () => (await import("@/test/justificacoesDoDiaFalso")).wrapperFalso());

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { repor } from "@/components/rh-exemplo/dados/loja";
import { reporFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { reporGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { reporFluxosC } from "@/components/rh-exemplo/fluxosC/lojaFluxosC";
import { baseFalsa, reporBaseFalsa, semearJustificacao } from "@/test/justificacoesDoDiaFalso";
import RhAssiduidadeOrganizacao from "./RhAssiduidadeOrganizacao";

beforeAll(() => {
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  repor();
  reporGestao();
  reporFluxosB();
  reporFluxosC();
  reporBaseFalsa();
});

const abrirSeparador = (nome: RegExp) => {
  const separador = screen.getByRole("tab", { name: nome });
  fireEvent.mouseDown(separador);
  fireEvent.click(separador);
};

const montar = () => render(<LanguageProvider><MemoryRouter><RhAssiduidadeOrganizacao /></MemoryRouter></LanguageProvider>);

describe("justificações de dia na fila do mapa de assiduidade", () => {
  it("a linha da Inês vem da base, entra no contador, e aceitar decide-a na base, tira-a da fila e desce o contador", async () => {
    semearJustificacao({ id: "jd-ines", pessoaId: "p-ines", data: "2026-10-07" });
    montar();
    const contador = await screen.findByTestId("rhd-contador-fila");
    const antes = Number(contador.textContent);
    abrirSeparador(/Fila de trabalho|Desvios/i);
    const fila = await screen.findByTestId("rhjd-fila");
    const linha = within(fila).getByTestId("rhjd-fila-jd-ines");
    expect(linha).toHaveTextContent("Justificação por decidir");
    expect(linha).toHaveTextContent("Inês Cardoso");
    fireEvent.click(within(linha).getByRole("button", { name: /Aceitar a justificação de Inês Cardoso/ }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Aceitar · não paga" }));
    await waitFor(() => expect(within(fila).queryByTestId("rhjd-fila-jd-ines")).not.toBeInTheDocument());
    expect(baseFalsa.decisoes).toEqual([{ justificacaoId: "jd-ines", decisao: "aceitar_nao_paga", motivo: null }]);
    expect(Number(screen.getByTestId("rhd-contador-fila").textContent)).toBe(antes - 1);
    expect(within(fila).getByTestId("rhjd-fila-aviso")).toHaveTextContent("Justificação aceite · não paga.");
  });

  it("sem justificações na base a fila diz que não há nada por decidir, e o contador não inclui nenhuma", async () => {
    montar();
    abrirSeparador(/Fila de trabalho|Desvios/i);
    const fila = await screen.findByTestId("rhjd-fila");
    expect(within(fila).getByText("Não há justificações por decidir.")).toBeInTheDocument();
    expect(within(fila).getByText("0 por decidir")).toBeInTheDocument();
    expect(within(fila).queryAllByRole("listitem")).toHaveLength(0);
  });

  it("uma justificação já decidida não aparece na fila nem no contador", async () => {
    semearJustificacao({ id: "jd-ines", pessoaId: "p-ines", data: "2026-10-07", estado: "recusada", motivoRecusa: "Sem comprovativo" });
    montar();
    abrirSeparador(/Fila de trabalho|Desvios/i);
    const fila = await screen.findByTestId("rhjd-fila");
    expect(within(fila).queryByTestId("rhjd-fila-jd-ines")).not.toBeInTheDocument();
  });

  it("com as RPCs por aplicar a fila di-lo em vez de partir ou de dizer «nada por decidir»", async () => {
    baseFalsa.indisponivel = true;
    montar();
    abrirSeparador(/Fila de trabalho|Desvios/i);
    expect(await screen.findByTestId("rhjd-fila-indisponivel")).toHaveTextContent("ainda não estão disponíveis");
  });
});
