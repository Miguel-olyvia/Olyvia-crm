// 12/11 (Rúben: «isto deve ser só um "está certo?" e ele clica ok ou reagenda»): o alerta do fim da obra depois do previsto.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { acoes } from "../motor";
import type { Ctx } from "../pecas";
import { EstudioObra } from "./EstudioObra";
import { obraDeExemplo } from "./exemploObra";
import { alertasDaObra } from "./alertasObra";
import { derrapagem } from "./planoVivo";
import { ocupacaoDosTecnicos } from "../preparacaoObra";

afterEach(cleanup);

function montar() {
  const { S, d } = obraDeExemplo();
  const A = acoes(S, () => {}, (fn) => fn());
  const ctx = { S, A, run: (fn: () => void) => { fn(); r.rerender(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />); }, go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
  const r = render(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />);
  return { S, A, d };
}
const cartao = () => within(screen.getByRole("region", { name: "Alertas" })).queryByRole("group", { name: /depois do previsto\. Está certo\?$/ });

describe("o fim da obra depois do previsto: «Está certo?»", () => {
  it("OK confirma (quem e quando) e o alerta sai; volta só se o atraso crescer", () => {
    const { S, A, d } = montar();
    const c = cartao()!;
    expect(within(c).getAllByRole("button").map((b) => b.textContent)).toEqual(["OK", "Reagendar"]);
    fireEvent.click(within(c).getByRole("button", { name: "OK" }));
    const p = d.obra.plano!;
    expect(p.fimAceite).toMatchObject({ dias: derrapagem(p), quem: "Filipe Rocha" });
    expect(alertasDaObra(d, S, ocupacaoDosTecnicos(S, d.id)).some((x) => x.id === "derrapagem")).toBe(false);
    expect(d.obra.diario!.at(-1)!.t).toMatch(/Fim da obra confirmado/);
    // o atraso cresce: o alerta volta
    const rev = p.tasks.findIndex((t) => t.nome === "Revestimento de parede");
    A.ajusteNosso(d.id, { k: "atraso", ti: rev, dias: 3 });
    expect(alertasDaObra(d, S, ocupacaoDosTecnicos(S, d.id)).some((x) => x.id === "derrapagem")).toBe(true);
  });
  it("Reagendar abre o replaneamento", () => {
    montar();
    fireEvent.click(within(cartao()!).getByRole("button", { name: "Reagendar" }));
    expect(screen.getByRole("region", { name: "Antes de aplicar" })).toBeTruthy();
  });
});
