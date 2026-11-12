// 12/11 (Rúben: «novas adendas a partir do estúdio da obra deve já vir assinado pela empresa»).
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { acoes } from "../motor";
import type { Ctx } from "../pecas";
import { PropostaDoc } from "../DocsCliente";
import { PortalCliente } from "../PortalCliente";
import { obraDeExemplo } from "./exemploObra";
import { definirQuemAssina } from "./quemAssina";

afterEach(() => { cleanup(); definirQuemAssina(""); });

function preparar() {
  const { S, d } = obraDeExemplo();
  const A = acoes(S, () => {}, (fn) => fn());
  const ti = d.obra.plano!.tasks.findIndex((t) => t.nome === "Revestimento de parede");
  const n = A.ajusteDoCliente(d.id, { k: "atraso", ti, dias: 1 })!;
  const a = d.adendas!.find((x) => x.n === n)!;
  return { S, d, A, a, n };
}

describe("a adenda do Estúdio da obra sai assinada pela empresa", () => {
  it("por disparar ainda não; ao enviar, fica assinada por quem a emite, e o cliente só aceita", () => {
    const { S, d, A, a, n } = preparar();
    expect(a.empresa).toBeUndefined();
    A.verificarEnviarAdenda(d.id, n);
    expect(a.empresa).toMatchObject({ nome: "Filipe Rocha" });
    expect(a.empresa!.q).toBe(a.enviada);
    render(<PropostaDoc S={S} d={d} a={a} />);
    expect(screen.getByRole("img", { name: /^Assinado digitalmente por Filipe Rocha/ })).toBeTruthy();
    expect(screen.getByText(/Só falta a sua aceitação/)).toBeTruthy();
    // a aceitação do cliente continua igual
    A.aceitarAdenda(d.id, n);
    expect(a.estado).toBe("aceite");
  });
  it("numa conta real assina o nome de quem está ligado", () => {
    const { d, A, a, n } = preparar();
    definirQuemAssina("Rúben Carvalho");
    A.verificarEnviarAdenda(d.id, n);
    expect(a.empresa?.nome).toBe("Rúben Carvalho");
  });
  it("no portal do cliente a adenda aparece assinada pela empresa", () => {
    const { S, d, A, n } = preparar();
    A.verificarEnviarAdenda(d.id, n);
    const ctx = { S, A, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
    render(<PortalCliente ctx={ctx} d={d} fechar={() => {}} />);
    expect(screen.getAllByRole("img", { name: /^Assinado digitalmente por Filipe Rocha/ }).length).toBeGreaterThan(0);
  });
  it("uma adenda feita pelo comercial (fora do Estúdio da obra) não muda", () => {
    const { S, d } = obraDeExemplo();
    const A = acoes(S, () => {}, (fn) => fn());
    S.role = "comercial";
    const n = A.criarAdenda(d.id, [{ sid: "pint", q: 10 }], "O cliente pediu")!;
    A.verificarEnviarAdenda(d.id, n);
    expect(d.adendas!.find((x) => x.n === n)!.empresa).toBeUndefined();
  });
});
