// 20/11 (auditoria de 19/11, lote 3): o Estúdio aberto pela Visita grava no negócio de poucos em poucos segundos e ao sair (pela ligação
// que a Visita deixa); abre o negócio do endereço; sem projeto deste negócio pede para o abrir pelo negócio; sem negócio abre vazio.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EstudioProjeto from "./EstudioProjeto";
import { PLANTA_VAZIA, retangulo } from "@/emylia/planta";
import type { Projeto } from "./necessidadesEstudio";
import { GRAVAR_NO_NEGOCIO_MS, chaveDoEstudio, desligarEstudio, guardarProjetoLocal, ligarEstudioAoNegocio } from "./projetoGuardado";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const projeto = (extra: Partial<Projeto> = {}): Projeto => ({
  antes: { ...PLANTA_VAZIA, paredes: retangulo(200, 250) }, depois: { ...PLANTA_VAZIA, paredes: retangulo(200, 250) },
  escolhas: {}, acompanha: {}, ajustes: {}, alturas: { peDireito: 250, tetoFalso: null }, estilo: { cores: [], porCategoria: {} }, ...extra,
});
const abrir = () => render(<MemoryRouter><EstudioProjeto /></MemoryRouter>);
const chega = (chave: string, p: Projeto) => act(() => { window.dispatchEvent(new StorageEvent("storage", { key: chave, newValue: JSON.stringify(p) })); });

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); desligarEstudio(); window.history.replaceState({}, "", "/prototipo/estudio"); });
afterEach(() => { cleanup(); vi.useRealTimers(); desligarEstudio(); window.history.replaceState({}, "", "/"); });

describe("o Estúdio de um negócio", () => {
  it("abre o projeto do negócio do endereço e grava-o no negócio de poucos em poucos segundos", () => {
    vi.useFakeTimers();
    window.history.replaceState({}, "", "/prototipo/estudio?negocio=5");
    guardarProjetoLocal(projeto({ negocio: 5, nome: "Casa de banho da Ana", gravadoEm: 1000 }));
    guardarProjetoLocal(projeto({ negocio: 6, nome: "Cozinha do Rui", gravadoEm: 1000 }));
    const gravar = vi.fn();
    ligarEstudioAoNegocio({ negocio: 5, gravar, noNegocio: () => JSON.stringify(projeto({ negocio: 5, nome: "Casa de banho da Ana" })) });
    abrir();
    expect(screen.getByRole("heading", { level: 1, name: "Casa de banho da Ana" })).toBeInTheDocument();
    // igual ao que o negócio tem: nada a gravar
    act(() => { vi.advanceTimersByTime(GRAVAR_NO_NEGOCIO_MS + 10); });
    expect(gravar).not.toHaveBeenCalled();
    // mudou (aqui pelo outro separador): na volta seguinte vai ao negócio, uma vez
    chega(chaveDoEstudio(5), projeto({ negocio: 5, nome: "Casa de banho da Ana (nova)", gravadoEm: 2000 }));
    act(() => { vi.advanceTimersByTime(GRAVAR_NO_NEGOCIO_MS + 10); });
    expect(gravar).toHaveBeenCalledTimes(1);
    expect(JSON.parse(gravar.mock.calls[0][0]).nome).toBe("Casa de banho da Ana (nova)");
    act(() => { vi.advanceTimersByTime(GRAVAR_NO_NEGOCIO_MS * 3); });
    expect(gravar).toHaveBeenCalledTimes(1);
    // o projeto de outro negócio (outra chave) não entra aqui
    chega(chaveDoEstudio(6), projeto({ negocio: 6, nome: "Cozinha do Rui (mudou)" }));
    expect(screen.queryByText("Cozinha do Rui (mudou)")).toBeNull();
  });

  it("ao sair do Estúdio grava no negócio o que ainda não foi; ao «Voltar ao negócio» não (a Visita grava-o ela)", () => {
    window.history.replaceState({}, "", "/prototipo/estudio?negocio=5");
    guardarProjetoLocal(projeto({ negocio: 5, nome: "Ana" }));
    const gravar = vi.fn();
    ligarEstudioAoNegocio({ negocio: 5, gravar, noNegocio: () => JSON.stringify(projeto({ negocio: 5, nome: "Ana" })) });
    const r = abrir();
    chega(chaveDoEstudio(5), projeto({ negocio: 5, nome: "Ana mudou", gravadoEm: 5 }));
    r.unmount();
    expect(gravar).toHaveBeenCalledTimes(1);

    cleanup();
    gravar.mockClear();
    window.history.replaceState({}, "", "/prototipo/estudio?negocio=5");
    ligarEstudioAoNegocio({ negocio: 5, gravar, noNegocio: () => JSON.stringify(projeto({ negocio: 5, nome: "Ana" })) });
    abrir();
    chega(chaveDoEstudio(5), projeto({ negocio: 5, nome: "Ana mudou outra vez", gravadoEm: 6 }));
    fireEvent.click(screen.getByRole("button", { name: /Voltar ao negócio/ }));
    cleanup();
    expect(gravar).not.toHaveBeenCalled();
  });

  it("noutro aparelho (sem projeto deste negócio): não abre o exemplo, pede para o abrir pelo negócio", () => {
    window.history.replaceState({}, "", "/prototipo/estudio?negocio=9");
    abrir();
    expect(screen.getByRole("heading", { name: "O projeto está no negócio" })).toBeInTheDocument();
    expect(screen.queryByText("Casa de banho do Bruno")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Abrir o negócio/ }));
    expect(window.location.pathname + window.location.search).toBe("/negocios?negocio=9&passo=estudio");
  });

  it("sem negócio e sem projeto abre vazio; o exemplo só a pedido", () => {
    abrir();
    expect(screen.getByRole("heading", { level: 1, name: "Novo projeto" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Recomeçar com o exemplo/ }));
    expect(screen.getByRole("heading", { level: 1, name: "Casa de banho do Bruno" })).toBeInTheDocument();
  });

  it("num negócio não há «Recomeçar com o exemplo» (apagava o projeto do negócio)", () => {
    window.history.replaceState({}, "", "/prototipo/estudio?negocio=5");
    guardarProjetoLocal(projeto({ negocio: 5, nome: "Ana" }));
    abrir();
    expect(screen.queryByRole("button", { name: /Recomeçar com o exemplo/ })).toBeNull();
  });
});
