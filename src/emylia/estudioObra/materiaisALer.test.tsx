// 25/11 (Rúben, no 1048): enquanto a encomenda de cliente vem da base (lenta), o separador Materiais e o arranque diziam «sem materiais»
// e «sem encomenda». Agora dizem que estão a ler; quando a leitura acaba (ou falha), volta ao normal.
import { afterEach, describe, expect, it } from "vitest";
import { acoes } from "../motor";
import type { Ctx } from "../pecas";
import { definirEncomendasReais, estadoEncomendasReais, leituraEncomendasFalhou, marcarEncomendasALer, materiaisALer } from "../real/encomendaReal";
import { pontosDoArranque, type Ir } from "./ComandoObra";
import { obraDeExemplo } from "./exemploObra";

afterEach(() => definirEncomendasReais(null));
const ir = new Proxy({}, { get: () => () => undefined }) as unknown as Ir;

describe("a encomenda da obra a chegar da base", () => {
  it("o estado: fora → a ler → lidas; as releituras não voltam a «a ler»; uma falha deixa de dizer «a ler»", () => {
    expect(estadoEncomendasReais()).toBe("fora");
    expect(materiaisALer(0)).toBe(false);
    marcarEncomendasALer();
    expect(materiaisALer(0)).toBe(true);
    expect(materiaisALer(3)).toBe(false);
    leituraEncomendasFalhou();
    expect(estadoEncomendasReais()).toBe("fora");
    marcarEncomendasALer();
    definirEncomendasReais(new Map());
    expect(estadoEncomendasReais()).toBe("lidas");
    marcarEncomendasALer();
    expect(estadoEncomendasReais()).toBe("lidas");
  });

  it("o arranque de uma obra sem materiais diz «a ler» enquanto a encomenda não chega, e «sem encomenda» depois", () => {
    const { S, d } = obraDeExemplo();
    d.obra.ec = undefined as never; d.obra.mats = [];
    const ctx = { S, A: acoes(S, () => {}, (fn) => fn()), run: (fn: () => void) => fn() } as unknown as Ctx;
    marcarEncomendasALer();
    expect(pontosDoArranque(ctx, d, ir, "2026-11-30").find((x) => x.k === "materiais")!.t).toBe("Materiais: a ler a encomenda...");
    definirEncomendasReais(new Map());
    expect(pontosDoArranque(ctx, d, ir, "2026-11-30").find((x) => x.k === "materiais")!.t).toBe("Materiais: sem encomenda");
  });
});
