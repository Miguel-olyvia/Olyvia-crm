// NG001 («este negócio já não está disponível») nos diálogos que gravam contra a base: o diálogo fecha-se e volta-se à ficha (já refeita),
// com o aviso por toast e por anúncio (o alerta de dentro do diálogo desapareceria com ele). Cobre perder (a casca partilhada por perder,
// anular e ganhar) e o painel «Novo negócio».
import { useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AnuncioFichaContext } from "@/components/ficha-comum/anuncioFicha";
import { negocioBase } from "@/components/pessoas/fabricaTestes";
import { NovoNegocioReal } from "@/components/pessoas/NovoNegocioReal";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { ComCostura, dadosFalsos, erroNegFalso, mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import { PerderNegocioDialogo } from "@/components/negocio-metas/PerderNegocioDialogo";
import { MOTIVOS_PREDEFINIDOS } from "@/components/negocio-metas/workflowNegocio";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
const { erro } = vi.hoisted(() => ({ erro: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: erro, success: vi.fn() } }));

const NG001 = erroNegFalso("pessoasPagina.erroNeg.ng001", "NG001");
const TEXTO = "Este negócio já não está disponível.";

beforeAll(prepararRadixNoJsdom);
beforeEach(() => { vi.stubGlobal("crypto", { randomUUID: () => "id-1" }); });
afterEach(() => { cleanup(); erro.mockReset(); vi.unstubAllGlobals(); });

describe("NG001 ao perder (a casca partilhada dos diálogos de envio)", () => {
  const negocio = negocioBase("n1", { pessoa: "Ana", servico: "Cozinha", estadoReal: "aberto" });

  it("fecha o diálogo e avisa por toast e por anúncio", async () => {
    const aoFechar = vi.fn();
    const anunciar = vi.fn();
    render(
      <AnuncioFichaContext.Provider value={anunciar}>
        <ComCostura mutacoes={mutacoesFalsas({ perder: vi.fn(async () => { throw NG001; }) })}>
          <PerderNegocioDialogo negocio={negocio} hoje="2026-10-19" motivos={MOTIVOS_PREDEFINIDOS} aoFechar={aoFechar} />
        </ComCostura>
      </AnuncioFichaContext.Provider>,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Motivo da perda" }), { target: { value: "Preço" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar a perda" }));
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
    expect(erro).toHaveBeenCalledWith(TEXTO);
    expect(anunciar).toHaveBeenCalledWith(TEXTO);
  });

  it("os outros erros ficam dentro do diálogo, que não fecha", async () => {
    const aoFechar = vi.fn();
    render(
      <ComCostura mutacoes={mutacoesFalsas({ perder: vi.fn(async () => { throw erroNegFalso("pessoasPagina.erroNeg.ng002", "NG002"); }) })}>
        <PerderNegocioDialogo negocio={negocio} hoje="2026-10-19" motivos={MOTIVOS_PREDEFINIDOS} aoFechar={aoFechar} />
      </ComCostura>,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Motivo da perda" }), { target: { value: "Preço" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar a perda" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("O estado atual não permite esta ação.");
    expect(aoFechar).not.toHaveBeenCalled();
    expect(erro).not.toHaveBeenCalled();
  });
});

describe("NG001 ao criar um negócio", () => {
  function Harness({ aoMudar }: { aoMudar: (a: boolean) => void }) {
    const [aberto, setAberto] = useState(true);
    return <NovoNegocioReal pessoaId="a" pessoaNome="Ana" aberto={aberto} aoCriado={vi.fn()} aoMudarAberto={(v) => { aoMudar(v); setAberto(v); }} />;
  }

  it("fecha o painel e avisa por toast e por anúncio", async () => {
    const aoMudar = vi.fn();
    const anunciar = vi.fn();
    render(
      <AnuncioFichaContext.Provider value={anunciar}>
        <ComCostura mutacoes={mutacoesFalsas({ criar: vi.fn(async () => { throw NG001; }) })} dados={dadosFalsos()}><Harness aoMudar={aoMudar} /></ComCostura>
      </AnuncioFichaContext.Provider>,
    );
    fireEvent.change(screen.getByRole("textbox", { name: /^Título do negócio/ }), { target: { value: "Sala" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar o negócio" }));
    await waitFor(() => expect(aoMudar).toHaveBeenCalledWith(false));
    expect(erro).toHaveBeenCalledWith(TEXTO);
    expect(anunciar).toHaveBeenCalledWith(TEXTO);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
