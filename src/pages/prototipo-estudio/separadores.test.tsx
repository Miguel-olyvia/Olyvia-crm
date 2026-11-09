// 9/11 (Rúben: «ao selecionar para trocar o produto a lista faz refresh várias vezes»): com o Estúdio aberto em dois separadores, o que
// chega do outro igual (só com outra hora) não se aplica nem se grava de volta; o que chega diferente aplica-se.
import { act, cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import EstudioProjeto from "./EstudioProjeto";
import { CHAVE_ESTUDIO } from "./daVisita";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

const chega = (valor: string) => act(() => { window.dispatchEvent(new StorageEvent("storage", { key: CHAVE_ESTUDIO, newValue: valor })); });

describe("o Estúdio em dois separadores", () => {
  it("o mesmo projeto com outra hora não volta a gravar (não há pingue-pongue); um projeto diferente passa", () => {
    render(<MemoryRouter><EstudioProjeto /></MemoryRouter>);
    const meu = JSON.parse(localStorage.getItem(CHAVE_ESTUDIO)!);
    const grava = vi.spyOn(Storage.prototype, "setItem");
    chega(JSON.stringify({ ...meu, gravadoEm: meu.gravadoEm + 5000 }));
    chega(JSON.stringify({ ...meu, gravadoEm: meu.gravadoEm + 9000 }));
    expect(grava.mock.calls.filter(([k]) => k === CHAVE_ESTUDIO)).toHaveLength(0);
    // o outro separador mudou o nome: aplica-se, e também não se grava de volta
    chega(JSON.stringify({ ...meu, nome: "Casa de banho do outro separador", gravadoEm: meu.gravadoEm + 12000 }));
    expect(document.body.textContent).toContain("Casa de banho do outro separador");
    expect(grava.mock.calls.filter(([k]) => k === CHAVE_ESTUDIO)).toHaveLength(0);
  });
});
