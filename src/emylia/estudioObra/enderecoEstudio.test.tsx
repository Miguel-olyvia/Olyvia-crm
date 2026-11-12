// 12/11 (o «voltar» do browser): no Estúdio da obra, o separador (?aba=) e o painel aberto (?painel=) vivem no endereço; recarregar volta
// ao mesmo sítio; «Voltar ao negócio» tira-os do endereço.
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { acoes } from "../motor";
import type { Ctx } from "../pecas";
import { EnderecoAtivo } from "../usarParamUrl";
import { EstudioObra } from "./EstudioObra";
import { obraDeExemplo } from "./exemploObra";

afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });

function montar(fechar: (mexeu?: boolean) => void = () => {}) {
  const { S, d } = obraDeExemplo();
  const A = acoes(S, () => {}, (fn) => fn());
  const el = () => <EnderecoAtivo.Provider value="pesquisa"><EstudioObra ctx={ctx} d={d} fechar={fechar} /></EnderecoAtivo.Provider>;
  const ctx = { S, A, run: (fn: () => void) => { fn(); r.rerender(el()); }, go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
  const r = render(el());
  return { d, el, r };
}
const q = () => new URLSearchParams(window.location.search);

describe("o Estúdio da obra no endereço", () => {
  it("o separador e o painel vão para o endereço; recarregar abre no mesmo sítio", () => {
    const { d } = montar();
    fireEvent.click(screen.getByRole("tab", { name: /Equipa/ }));
    expect(q().get("aba")).toBe("equipa");
    fireEvent.click(screen.getByRole("tab", { name: /Plano/ }));
    expect(q().get("aba")).toBeNull(); // o separador por omissão não se escreve
    const ti = d.obra.plano!.tasks.findIndex((t) => t.nome === "Montagem de móveis");
    fireEvent.click(screen.getByRole("button", { name: /^Montagem de móveis:/ }));
    expect(q().get("painel")).toBe(`tarefa-${ti}`);
    // o «Porquê?» também (com o ajuste)
    fireEvent.click(within(screen.getByRole("complementary", { name: "A tarefa" })).getByRole("button", { name: "Dura: mais" }));
    expect(q().get("painel")).toMatch(/^porque-\{"k":"prolongar"/);
    // «recarregar»: um Estúdio novo com o mesmo endereço abre o «Porquê?»
    cleanup();
    montar();
    expect(screen.getByRole("complementary", { name: "Quem paga a mudança" })).toBeTruthy();
  });
  it("o «voltar» do browser volta ao separador anterior", async () => {
    montar();
    fireEvent.click(screen.getByRole("tab", { name: /Equipa/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Cliente/ }));
    expect(q().get("aba")).toBe("cliente");
    await act(async () => { window.history.back(); await new Promise((r) => setTimeout(r, 30)); });
    expect(q().get("aba")).toBe("equipa");
    expect(screen.getByRole("tab", { name: /Equipa/ }).getAttribute("aria-selected")).toBe("true");
  });
  it("«Voltar ao negócio» tira o separador e o painel do endereço", () => {
    let mexeu: boolean | undefined;
    montar((m) => { mexeu = m; });
    fireEvent.click(screen.getByRole("tab", { name: /Materiais/ }));
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao negócio" }));
    expect(q().get("aba")).toBeNull();
    expect(q().get("painel")).toBeNull();
    expect(mexeu).toBe(true);
  });
});
