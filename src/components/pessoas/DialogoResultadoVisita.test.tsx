// «Resultado da visita»: o diálogo que regista como correu uma visita (interessado, a pensar, sem interesse, obra inviável). Os dois últimos
// encerram a abordagem e pedem o motivo; nenhum cria negócio. O aviso para o leitor de ecrã só sai depois de o diálogo fechar.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { pessoaBase, visitaPessoaBase } from "./fabricaTestes";
import { DialogoResultadoVisita } from "./DialogoResultadoVisita";

vi.mock("@/hooks/useTranslation", async () => {
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const textos = pessoasPaginaTranslations.pt;
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) =>
        Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.replace(`{${k}}`, String(v)), textos[key] ?? key),
    }),
  };
});
const { sucesso } = vi.hoisted(() => ({ sucesso: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: sucesso } }));

beforeAll(prepararRadixNoJsdom);

const ANA = pessoaBase("a", { nome: "Ana" });
const VISITA = visitaPessoaBase("rv-1", { estado: "feita", data: "2026-10-10", hora: "10:00" });

function montar(extra: Partial<Parameters<typeof DialogoResultadoVisita>[0]> = {}) {
  const props = { aoGuardar: vi.fn(), aoFechar: vi.fn(), aoAnunciar: vi.fn() };
  const r = render(<DialogoResultadoVisita pessoa={ANA} visita={VISITA} comNegocioAberto={false} {...props} {...extra} />);
  return { ...props, ...r };
}
const guardar = () => screen.getByRole("button", { name: "Guardar o resultado" });

describe("DialogoResultadoVisita", () => {
  it("fechado (sem visita) não desenha nada", () => {
    montar({ visita: null });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("pergunta como correu a visita, com os quatro resultados em texto", () => {
    montar();
    const dialogo = screen.getByRole("dialog", { name: "Resultado da visita" });
    expect(within(dialogo).getByText(/Como correu a visita de/)).toBeInTheDocument();
    const grupo = within(dialogo).getByRole("radiogroup", { name: "Resultado" });
    expect(within(grupo).getAllByRole("radio").map((r) => r.parentElement?.textContent)).toEqual(["Interessado", "A pensar", "Sem interesse", "Obra inviável"]);
  });

  it("interessado e a pensar guardam logo, sem pedir motivo", () => {
    const { aoGuardar } = montar();
    expect(guardar()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("radio", { name: "A pensar" }));
    expect(screen.queryByRole("combobox", { name: "Motivo" })).not.toBeInTheDocument();
    fireEvent.click(guardar());
    expect(aoGuardar).toHaveBeenCalledExactlyOnceWith("rv-1", { resultado: "aPensar" });
  });

  it("sem interesse e obra inviável explicam que encerram a abordagem e pedem o motivo; sem ele não guardam", () => {
    const { aoGuardar } = montar();
    fireEvent.click(screen.getByRole("radio", { name: "Obra inviável" }));
    expect(screen.getByText(/encerram a abordagem/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Motivo" })).toBeInTheDocument();
    fireEvent.click(guardar());
    expect(aoGuardar).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("combobox", { name: "Motivo" }), { target: { value: "preco" } });
    fireEvent.click(guardar());
    expect(aoGuardar).toHaveBeenCalledExactlyOnceWith("rv-1", { resultado: "obraInviavel", motivo: "preco", motivoOutro: undefined });
  });

  it("o motivo «Outro» pede o texto e leva-o aparado", () => {
    const { aoGuardar } = montar();
    fireEvent.click(screen.getByRole("radio", { name: "Sem interesse" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Motivo" }), { target: { value: "outro" } });
    fireEvent.click(guardar());
    expect(aoGuardar).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "Escreva o motivo" }), { target: { value: " Mudou de casa " } });
    fireEvent.click(guardar());
    expect(aoGuardar).toHaveBeenCalledExactlyOnceWith("rv-1", { resultado: "semInteresse", motivo: "outro", motivoOutro: "Mudou de casa" });
  });

  it("com um negócio aberto não há abordagem a encerrar: só interessado e a pensar", () => {
    montar({ comNegocioAberto: true });
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.queryByRole("radio", { name: "Sem interesse" })).not.toBeInTheDocument();
  });

  it("depois de guardar pede ao pai para fechar; o aviso fica para quando o diálogo já fechou", () => {
    const { aoFechar, aoAnunciar } = montar();
    fireEvent.click(screen.getByRole("radio", { name: "Interessado" }));
    fireEvent.click(guardar());
    expect(aoFechar).toHaveBeenCalledTimes(1);
    expect(aoAnunciar).not.toHaveBeenCalled();
  });

  it("Cancelar fecha sem guardar nem anunciar", () => {
    const { aoGuardar, aoFechar, aoAnunciar } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(aoFechar).toHaveBeenCalledTimes(1);
    expect(aoGuardar).not.toHaveBeenCalled();
    expect(aoAnunciar).not.toHaveBeenCalled();
    expect(sucesso).not.toHaveBeenCalled();
  });
});

describe("DialogoResultadoVisita: o aviso depois de fechar", () => {
  it("quando o pai fecha o diálogo (visita a null) o aviso sai uma vez, com o nome e o resultado", async () => {
    const aoGuardar = vi.fn();
    const aoAnunciar = vi.fn();
    const props = { pessoa: ANA, comNegocioAberto: false, aoGuardar, aoFechar: vi.fn(), aoAnunciar };
    const { rerender } = render(<DialogoResultadoVisita {...props} visita={VISITA} />);
    fireEvent.click(screen.getByRole("radio", { name: "Interessado" }));
    fireEvent.click(guardar());
    expect(aoAnunciar).not.toHaveBeenCalled();
    rerender(<DialogoResultadoVisita {...props} visita={null} />);
    await waitFor(() => expect(aoAnunciar).toHaveBeenCalledTimes(1));
    expect(aoAnunciar).toHaveBeenCalledWith("Resultado da visita de Ana guardado: Interessado");
  });
});
