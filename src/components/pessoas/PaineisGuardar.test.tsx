// A guardar: o texto «A guardar…» no botão, o Cancelar bloqueado enquanto há uma ação em voo e o anúncio quando o painel já saiu.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { AnuncioFichaContext } from "@/components/ficha-comum/anuncioFicha";
import { BotoesPainel } from "./BotoesPainel";
import { DialogoResultadoVisita } from "./DialogoResultadoVisita";
import { pessoaBase, resumoBase, visitaPessoaBase } from "./fabricaTestes";
import { PainelAdiar } from "./PainelAdiar";
import type { AcoesFicha } from "./PainelBase";
import { useExecutarAcao } from "./useExecutarAcao";

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

beforeAll(prepararRadixNoJsdom);

const pendente = () => {
  let resolver: () => void = () => undefined;
  let rejeitar: (e: unknown) => void = () => undefined;
  const promessa = new Promise<void>((res, rej) => { resolver = res; rejeitar = rej; });
  return { promessa, resolver, rejeitar };
};

describe("BotoesPainel a guardar", () => {
  const montar = (aGuardar: boolean) => {
    const props = { guardar: vi.fn(), aoCancelar: vi.fn() };
    render(<BotoesPainel {...props} desativado={false} dica="" aGuardar={aGuardar} />);
    return props;
  };

  it("o botão diz «A guardar…» e fica ocupado", () => {
    montar(true);
    const botao = screen.getByRole("button", { name: "A guardar…" });
    expect(botao).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull();
  });

  it("o Cancelar fica aria-disabled e ignora o clique", () => {
    const props = montar(true);
    const cancelar = screen.getByRole("button", { name: "Cancelar" });
    expect(cancelar).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(cancelar);
    expect(props.aoCancelar).not.toHaveBeenCalled();
  });

  it("sem ação em voo o Cancelar funciona e o botão diz «Guardar»", () => {
    const props = montar(false);
    expect(screen.getByRole("button", { name: "Guardar" })).not.toHaveAttribute("aria-busy");
    const cancelar = screen.getByRole("button", { name: "Cancelar" });
    expect(cancelar).not.toHaveAttribute("aria-disabled");
    fireEvent.click(cancelar);
    expect(props.aoCancelar).toHaveBeenCalledTimes(1);
  });
});

describe("PainelAdiar a guardar", () => {
  it("o Cancelar fica bloqueado enquanto a ação corre e volta quando termina", async () => {
    const p = pendente();
    const pessoa = pessoaBase("a", { nome: "Ana" });
    const aoFechar = vi.fn();
    const acoes = { adiar: vi.fn(() => p.promessa) } as unknown as AcoesFicha;
    render(
      <PainelAdiar
        id="p" titulo="Adiar" ativo pessoa={pessoa} resumo={resumoBase(pessoa)} hoje="2026-10-13" acoes={acoes}
        aoFechar={aoFechar} aoConcluir={vi.fn()} aoMudarConteudo={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Amanhã/ }));
    const cancelar = screen.getByRole("button", { name: "Cancelar" });
    expect(cancelar).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(cancelar);
    expect(aoFechar).not.toHaveBeenCalled();
    await act(async () => { p.resolver(); await p.promessa; });
    expect(screen.getByRole("button", { name: "Cancelar" })).not.toHaveAttribute("aria-disabled");
  });
});

describe("DialogoResultadoVisita: Cancelar durante o guardar", () => {
  it("fica bloqueado enquanto a ação corre", () => {
    const p = pendente();
    const aoFechar = vi.fn();
    render(
      <DialogoResultadoVisita
        pessoa={pessoaBase("a", { nome: "Ana" })} visita={visitaPessoaBase("rv-1", { estado: "feita", data: "2026-10-10" })} comNegocioAberto={false}
        aoGuardar={() => p.promessa} aoFechar={aoFechar} aoAnunciar={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Interessado" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar o resultado" }));
    const cancelar = screen.getByRole("button", { name: "Cancelar" });
    expect(cancelar).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(cancelar);
    expect(aoFechar).not.toHaveBeenCalled();
  });
});

describe("useExecutarAcao: anúncios na região da ficha", () => {
  const montar = (anunciar: (m: string) => void) => {
    const wrapper = ({ children }: { children: ReactNode }) => <AnuncioFichaContext.Provider value={anunciar}>{children}</AnuncioFichaContext.Provider>;
    return renderHook(() => useExecutarAcao(), { wrapper });
  };

  it("ao começar uma ação assíncrona anuncia «A guardar…»", async () => {
    const anunciar = vi.fn();
    const { result } = montar(anunciar);
    const p = pendente();
    act(() => result.current.executar(() => p.promessa, vi.fn()));
    expect(anunciar).toHaveBeenCalledWith("A guardar…");
    await act(async () => { p.resolver(); await p.promessa; });
  });

  it("uma ação síncrona não anuncia nada", () => {
    const anunciar = vi.fn();
    const { result } = montar(anunciar);
    act(() => result.current.executar(() => undefined, vi.fn()));
    expect(anunciar).not.toHaveBeenCalled();
  });

  it("se o painel já saiu, o sucesso anuncia a mensagem dada", async () => {
    const anunciar = vi.fn();
    const { result, unmount } = montar(anunciar);
    const p = pendente();
    act(() => result.current.executar(() => p.promessa, vi.fn(), "Nota de Ana registada"));
    unmount();
    anunciar.mockClear();
    await act(async () => { p.resolver(); await p.promessa; });
    expect(anunciar).toHaveBeenCalledExactlyOnceWith("Nota de Ana registada");
  });

  it("se o painel já saiu, a falha anuncia o erro traduzido (e a mensagem extra, se houver)", async () => {
    const anunciar = vi.fn();
    const { result, unmount } = montar(anunciar);
    const p = pendente();
    act(() => result.current.executar(() => p.promessa, vi.fn(), "ok"));
    unmount();
    anunciar.mockClear();
    const erro = Object.assign(new Error("x"), { chave: "pessoasPagina.real.ficha.partialCall", chaveExtra: "pessoasPagina.erroNeg.ng011" });
    await act(async () => { p.rejeitar(erro); await p.promessa.catch(() => undefined); });
    expect(anunciar).toHaveBeenCalledTimes(1);
    const texto = anunciar.mock.calls[0][0] as string;
    expect(texto).toContain("O contacto ficou registado");
    expect(texto).toContain("Perca ou ganhe os negócios abertos");
  });

  it("com o painel ainda montado não repete o anúncio de fim (o painel trata de si)", async () => {
    const anunciar = vi.fn();
    const { result } = montar(anunciar);
    const p = pendente();
    act(() => result.current.executar(() => p.promessa, vi.fn(), "ok"));
    anunciar.mockClear();
    await act(async () => { p.resolver(); await p.promessa; });
    expect(anunciar).not.toHaveBeenCalled();
  });

  it("expõe a chave extra do erro ao lado da principal", async () => {
    const { result } = montar(vi.fn());
    const p = pendente();
    act(() => result.current.executar(() => p.promessa, vi.fn()));
    const erro = Object.assign(new Error("x"), { chave: "a.principal", chaveExtra: "a.extra" });
    await act(async () => { p.rejeitar(erro); await p.promessa.catch(() => undefined); });
    expect(result.current.erro).toBe("a.principal");
    expect(result.current.erroExtra).toBe("a.extra");
  });
});
