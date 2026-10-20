// O painel «Visita e levantamento» (modo `registos`) com uma gravação ASSÍNCRONA (a ficha real grava na base): fecha só quando a gravação devolve
// `true`, fica aberto com `false`, mostra-se ocupado enquanto grava (e não aceita um segundo envio), e a data de uma visita nova parte do dia
// de hoje que lhe dão (e não do dia do exemplo). O exemplo, síncrono, continua a fechar logo (ver RegistosPainelVisitas.test).
import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NovoNegocioDialogo } from "./NovoNegocioDialogo";
import type { RascunhoLevantamento } from "./novoNegocio";
import type { VisitaNegocio } from "./negocioMetas";

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

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

type AoGuardar = (r: RascunhoLevantamento, v: VisitaNegocio[], c: string) => boolean | Promise<boolean>;

function abrir(aoGuardar: AoGuardar, extra: { aGuardar?: boolean; hoje?: string } = {}) {
  const fechou = vi.fn();
  render(
    <NovoNegocioDialogo
      pessoas={[{ id: "p1", nome: "Paulo Neves" }]} modo="registos" aberto semBotao aoMudarAberto={fechou} hoje={extra.hoje}
      valoresIniciais={{ pessoaId: "p1", comercial: "Bruno Costa" }}
      aGuardar={extra.aGuardar} guardarLevantamento={{ texto: "Guardar o levantamento", aoGuardar }}
    />,
  );
  const dialogo = screen.getByRole("dialog", { name: "Novo negócio" });
  return { dialogo, fechou, guardar: () => fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar o levantamento" })) };
}

describe("gravação assíncrona", () => {
  it("fecha só quando a gravação devolve true", async () => {
    let concluir: ((fechar: boolean) => void) | undefined;
    const { guardar, fechou } = abrir(() => new Promise<boolean>((r) => { concluir = r; }));
    guardar();
    expect(fechou).not.toHaveBeenCalledWith(false);
    await act(async () => { concluir?.(true); });
    await waitFor(() => expect(fechou).toHaveBeenCalledWith(false));
  });

  it("com false fica aberto (o que se escreveu não se perde)", async () => {
    const aoGuardar = vi.fn(() => Promise.resolve(false));
    const { guardar, fechou, dialogo } = abrir(aoGuardar);
    guardar();
    await waitFor(() => expect(aoGuardar).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); });
    expect(fechou).not.toHaveBeenCalledWith(false);
    expect(dialogo).toBeInTheDocument();
  });

  it("a gravação síncrona do exemplo continua a fechar já, no mesmo instante", () => {
    const { guardar, fechou } = abrir(() => true);
    guardar();
    expect(fechou).toHaveBeenCalledWith(false);
  });
});

describe("a gravar", () => {
  it("o botão fica ocupado (aria-busy e aria-disabled) e um envio nesse estado não grava outra vez", () => {
    const aoGuardar = vi.fn(() => true);
    const { dialogo, guardar } = abrir(aoGuardar, { aGuardar: true });
    const botao = within(dialogo).getByRole("button", { name: "Guardar o levantamento" });
    expect(botao).toHaveAttribute("aria-busy", "true");
    expect(botao).toHaveAttribute("aria-disabled", "true");
    guardar();
    expect(aoGuardar).not.toHaveBeenCalled();
  });

  it("fora de uma gravação o botão não está ocupado", () => {
    const { dialogo } = abrir(() => true);
    const botao = within(dialogo).getByRole("button", { name: "Guardar o levantamento" });
    expect(botao).not.toHaveAttribute("aria-busy");
    expect(botao).not.toHaveAttribute("aria-disabled");
  });
});

describe("o dia de hoje", () => {
  it("uma visita nova parte do dia que o painel recebe (daqui a 2 dias), não do dia do exemplo", async () => {
    const { dialogo } = abrir(() => true, { hoje: "2030-01-10" });
    fireEvent.mouseDown(within(dialogo).getByRole("tab", { name: /^Visita/ }));
    fireEvent.click(within(dialogo).getByRole("button", { name: /^Visitas/ }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Adicionar visita" }));
    expect(await within(dialogo).findByLabelText("Data da visita")).toHaveValue("2030-01-12");
  });
});
