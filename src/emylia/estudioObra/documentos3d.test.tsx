// 12/11 (Rúben: «falta… os documentos enviados ao cliente, ter também a parte do 3D para ver»).
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { acoes } from "../motor";
import type { Ctx } from "../pecas";
import { EstudioObra } from "./EstudioObra";
import { obraDeExemplo } from "./exemploObra";
import { documentosEnviados } from "./enviadosAoCliente";
import { obraEm3D } from "./obra3d";

afterEach(cleanup);

function montar() {
  const { S, d } = obraDeExemplo();
  const A = acoes(S, () => {}, (fn) => fn());
  const ctx = { S, A, run: (fn: () => void) => { fn(); r.rerender(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />); }, go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
  const r = render(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />);
  return { S, A, d };
}

describe("os documentos enviados ao cliente", () => {
  it("a proposta, o contrato e a fatura com o estado; a adenda só depois de disparada", () => {
    const { S, d } = obraDeExemplo();
    const A = acoes(S, () => {}, (fn) => fn());
    const L = documentosEnviados(d, S);
    expect(L.find((x) => x.k === "proposta")).toMatchObject({ numero: "PR 2026/1027", tom: "ok" });
    expect(L.find((x) => x.k === "fatura")?.estado).toMatch(/^Paga/);
    const ti = d.obra.plano!.tasks.findIndex((t) => t.nome === "Revestimento de parede");
    const n = A.ajusteDoCliente(d.id, { k: "atraso", ti, dias: 1 })!;
    expect(documentosEnviados(d, S).some((x) => x.numero === n)).toBe(false); // por disparar: nada foi ao cliente
    A.verificarEnviarAdenda(d.id, n);
    expect(documentosEnviados(d, S).find((x) => x.numero === n)).toMatchObject({ k: "propostaAdenda", estado: "Por responder", tom: "espera" });
  });
  it("no Estúdio: abrir o documento por cima, fechar, e reenviar com confirmação", () => {
    const { d } = montar();
    fireEvent.click(screen.getByRole("tab", { name: /Documentos/ }));
    const sec = screen.getByRole("region", { name: "Documentos enviados ao cliente" });
    fireEvent.click(within(sec).getByRole("button", { name: /^Proposta PR 2026\/1027: .*Abrir$/ }));
    const dlg = screen.getByRole("dialog", { name: "Proposta PR 2026/1027" });
    expect(within(dlg).getAllByText(/PR 2026\/1027/).length).toBeGreaterThan(0);
    fireEvent.click(within(dlg).getAllByRole("button", { name: "Fechar" }).at(-1)!);
    expect(screen.queryByRole("dialog", { name: "Proposta PR 2026/1027" })).toBeNull();
    const linha = within(sec).getByRole("button", { name: /^Proposta PR 2026\/1027/ }).closest("li")!;
    fireEvent.click(within(linha as HTMLElement).getByRole("button", { name: "Reenviar" }));
    fireEvent.click(within(linha as HTMLElement).getByRole("button", { name: "Sim, reenviar" }));
    expect(d.hist.some((x) => /Reenviado ao cliente: Proposta PR 2026\/1027/.test(x.t))).toBe(true);
  });
});

describe("o projeto em 3D", () => {
  it("o que está feito a cores e o que falta transparente; com a obra acabada, tudo feito", () => {
    const { d } = obraDeExemplo();
    const O = obraEm3D(d)!;
    expect(O.total).toBeGreaterThan(0);
    expect(O.feitas).toBeLessThan(O.total);
    expect(O.cena.caixas.some((c) => c.vidro && /por fazer/.test(c.nome))).toBe(true);
    d.obra.plano!.estado = "concluída";
    const F = obraEm3D(d)!;
    expect(F.feitas).toBe(F.total);
  });
  it("no Estúdio, o separador 3D mostra a obra e o antes; sem projeto, diz porquê", () => {
    const { d } = montar();
    fireEvent.click(screen.getByRole("tab", { name: /3D/ }));
    const sec = screen.getByRole("region", { name: "O projeto em 3D" });
    expect(within(sec).getByRole("img", { name: /A obra em 3D/ })).toBeTruthy();
    fireEvent.click(within(sec).getByRole("button", { name: "Antes" }));
    expect(within(sec).getByRole("img", { name: /antes da obra/ })).toBeTruthy();
    delete d.f.estudio;
    expect(obraEm3D(d)).toBeNull();
  });
});
