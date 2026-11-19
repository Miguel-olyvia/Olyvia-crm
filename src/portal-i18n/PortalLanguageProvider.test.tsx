// O idioma do portal: omissão pt, guardado numa chave própria, independente do CRM e do navegador, lido com
// try/catch, com <html lang> acertado enquanto o Provider está montado, e a funcionar também sem Provider.
import type { ReactNode } from "react";
import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./dicionarios", () => ({
  dicionarios: {
    pt: { "pc.ola": "Olá", "pc.saudacao": "Olá, {nome}!", "pc.n.um": "{n} item", "pc.n.varios": "{n} itens" },
    en: { "pc.ola": "Hello", "pc.saudacao": "Hello, {nome}!", "pc.n.um": "{n} item", "pc.n.varios": "{n} items" },
  },
}));

import { PortalLanguageProvider } from "./PortalLanguageProvider";
import { usePortalIdioma } from "./usePortalIdioma";
import { usePortalT } from "./usePortalT";
import { usePortalFormato } from "./usePortalFormato";
import { CHAVE_IDIOMA_PORTAL } from "./tipos";
import { reporIdiomaEmMemoria } from "./armazemIdioma";

const comProvider = ({ children }: { children: ReactNode }) => <PortalLanguageProvider>{children}</PortalLanguageProvider>;

beforeEach(() => {
  window.localStorage.clear();
  reporIdiomaEmMemoria();
  document.documentElement.lang = "";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("idioma do portal sem Provider", () => {
  it("a chave de armazenamento é própria do portal", () => {
    expect(CHAVE_IDIOMA_PORTAL).toBe("olyvia_portal_language");
  });

  it("a omissão é pt, mesmo com o navegador em inglês", () => {
    expect(navigator.language.toLowerCase().startsWith("en")).toBe(true);
    const { result } = renderHook(() => usePortalIdioma());
    expect(result.current.idioma).toBe("pt");
    expect(renderHook(() => usePortalT().t("pc.ola")).result.current).toBe("Olá");
  });

  it("lê o idioma guardado", () => {
    window.localStorage.setItem(CHAVE_IDIOMA_PORTAL, "en");
    const { result } = renderHook(() => usePortalT());
    expect(result.current.idioma).toBe("en");
    expect(result.current.t("pc.ola")).toBe("Hello");
  });

  it("ignora um valor guardado que não é pt nem en", () => {
    window.localStorage.setItem(CHAVE_IDIOMA_PORTAL, "fr");
    expect(renderHook(() => usePortalIdioma()).result.current.idioma).toBe("pt");
  });

  it("não depende do idioma do CRM (chave 'language') nem o altera", () => {
    window.localStorage.setItem("language", "en");
    const { result } = renderHook(() => usePortalIdioma());
    expect(result.current.idioma).toBe("pt");
    act(() => result.current.setIdioma("en"));
    expect(window.localStorage.getItem("language")).toBe("en");
    window.localStorage.setItem("language", "de");
    act(() => result.current.setIdioma("pt"));
    expect(window.localStorage.getItem("language")).toBe("de");
  });

  it("setIdioma muda o idioma e guarda-o", () => {
    const { result } = renderHook(() => usePortalIdioma());
    act(() => result.current.setIdioma("en"));
    expect(result.current.idioma).toBe("en");
    expect(window.localStorage.getItem(CHAVE_IDIOMA_PORTAL)).toBe("en");
  });

  it("setIdioma ignora um idioma inválido", () => {
    const { result } = renderHook(() => usePortalIdioma());
    act(() => result.current.setIdioma("fr" as never));
    expect(result.current.idioma).toBe("pt");
    expect(window.localStorage.getItem(CHAVE_IDIOMA_PORTAL)).toBeNull();
  });

  it("dois componentes sem Provider mudam juntos", () => {
    const a = renderHook(() => usePortalT());
    const b = renderHook(() => usePortalIdioma());
    act(() => b.result.current.setIdioma("en"));
    expect(a.result.current.t("pc.ola")).toBe("Hello");
  });

  it("acompanha uma mudança feita noutro separador (evento storage)", () => {
    const { result } = renderHook(() => usePortalIdioma());
    act(() => {
      window.localStorage.setItem(CHAVE_IDIOMA_PORTAL, "en");
      window.dispatchEvent(new StorageEvent("storage", { key: CHAVE_IDIOMA_PORTAL, newValue: "en" }));
    });
    expect(result.current.idioma).toBe("en");
  });

  it("não rebenta quando ler do localStorage lança, e continua a poder mudar de idioma", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("cheio", "QuotaExceededError");
    });
    const { result } = renderHook(() => usePortalIdioma());
    expect(result.current.idioma).toBe("pt");
    act(() => result.current.setIdioma("en"));
    expect(result.current.idioma).toBe("en");
  });

  it("depois de o armazenamento voltar ao normal, o que lá está é que manda", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    const { result } = renderHook(() => usePortalIdioma());
    act(() => result.current.setIdioma("en"));
    vi.restoreAllMocks();
    window.localStorage.clear();
    expect(renderHook(() => usePortalIdioma()).result.current.idioma).toBe("pt");
  });
});

describe("usePortalT", () => {
  it("t aplica parâmetros e fallback, e tn escolhe o plural", () => {
    window.localStorage.setItem(CHAVE_IDIOMA_PORTAL, "en");
    const { result } = renderHook(() => usePortalT());
    expect(result.current.t("pc.saudacao", { nome: "Rita" })).toBe("Hello, Rita!");
    expect(result.current.t("pc.falta")).toBe("pc.falta");
    expect(result.current.tn("pc.n.um", "pc.n.varios", 1)).toBe("1 item");
    expect(result.current.tn("pc.n.um", "pc.n.varios", 4)).toBe("4 items");
  });

  it("t e tn mantêm a mesma identidade enquanto o idioma não muda e mudam quando muda", () => {
    const { result, rerender } = renderHook(() => usePortalT());
    const primeiro = result.current;
    rerender();
    expect(result.current.t).toBe(primeiro.t);
    expect(result.current.tn).toBe(primeiro.tn);
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: null })));
    expect(result.current.t).toBe(primeiro.t);
    const idioma = renderHook(() => usePortalIdioma());
    act(() => idioma.result.current.setIdioma("en"));
    expect(result.current.t).not.toBe(primeiro.t);
  });
});

describe("usePortalFormato", () => {
  it("formata no idioma do portal", () => {
    const { result } = renderHook(() => usePortalFormato());
    const data = new Date(2025, 2, 5, 14, 30);
    expect(result.current.formatarData(data, "longo")).toBe("5 de março de 2025");
    const idioma = renderHook(() => usePortalIdioma());
    act(() => idioma.result.current.setIdioma("en"));
    expect(result.current.idioma).toBe("en");
    expect(result.current.formatarData(data, "longo")).toBe("5 March 2025");
    expect(result.current.formatarDataHora(data, "longo")).toBe("5 March 2025 at 14:30");
    expect(result.current.formatarData(data, "numerico")).toBe("05/03/2025");
    expect("formatarMoeda" in result.current).toBe(false);
    expect("formatarNumero" in result.current).toBe(false);
  });
});

describe("PortalLanguageProvider", () => {
  function Mostra() {
    const { t, idioma } = usePortalT();
    const { setIdioma } = usePortalIdioma();
    return (
      <div>
        <p data-testid="texto">{t("pc.ola")}</p>
        <p data-testid="idioma">{idioma}</p>
        <button onClick={() => setIdioma(idioma === "pt" ? "en" : "pt")}>alternar</button>
      </div>
    );
  }

  it("mostra pt por omissão e põe <html lang> a pt enquanto está montado", () => {
    render(<Mostra />, { wrapper: comProvider });
    expect(screen.getByTestId("texto")).toHaveTextContent("Olá");
    expect(document.documentElement.lang).toBe("pt");
  });

  it("começa em en quando é isso que está guardado", () => {
    window.localStorage.setItem(CHAVE_IDIOMA_PORTAL, "en");
    render(<Mostra />, { wrapper: comProvider });
    expect(screen.getByTestId("texto")).toHaveTextContent("Hello");
    expect(document.documentElement.lang).toBe("en");
  });

  it("acerta <html lang> a cada mudança e persiste", () => {
    render(<Mostra />, { wrapper: comProvider });
    act(() => screen.getByText("alternar").click());
    expect(screen.getByTestId("idioma")).toHaveTextContent("en");
    expect(document.documentElement.lang).toBe("en");
    expect(window.localStorage.getItem(CHAVE_IDIOMA_PORTAL)).toBe("en");
    act(() => screen.getByText("alternar").click());
    expect(document.documentElement.lang).toBe("pt");
  });

  it("repõe o <html lang> anterior ao desmontar", () => {
    document.documentElement.lang = "de";
    const { unmount } = render(<Mostra />, { wrapper: comProvider });
    expect(document.documentElement.lang).toBe("pt");
    unmount();
    expect(document.documentElement.lang).toBe("de");
  });

  it("repõe o anterior mesmo depois de mudar para en", () => {
    document.documentElement.lang = "fr";
    const { unmount } = render(<Mostra />, { wrapper: comProvider });
    act(() => screen.getByText("alternar").click());
    unmount();
    expect(document.documentElement.lang).toBe("fr");
  });

  it("aguenta o React.StrictMode (monta, desmonta e monta de novo) sem perder o lang original", async () => {
    const { StrictMode } = await import("react");
    document.documentElement.lang = "es";
    const { unmount } = render(
      <StrictMode>
        <PortalLanguageProvider>
          <Mostra />
        </PortalLanguageProvider>
      </StrictMode>,
    );
    expect(document.documentElement.lang).toBe("pt");
    unmount();
    expect(document.documentElement.lang).toBe("es");
  });

  it("os filhos mudam de língua quando outro componente (sem ser o Provider) muda o idioma", () => {
    render(<Mostra />, { wrapper: comProvider });
    const outro = renderHook(() => usePortalIdioma());
    act(() => outro.result.current.setIdioma("en"));
    expect(screen.getByTestId("texto")).toHaveTextContent("Hello");
    expect(document.documentElement.lang).toBe("en");
  });

  it("com o armazenamento a lançar, o Provider monta em pt e não rebenta", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    render(<Mostra />, { wrapper: comProvider });
    expect(screen.getByTestId("texto")).toHaveTextContent("Olá");
    expect(document.documentElement.lang).toBe("pt");
  });
});
