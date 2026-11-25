// 25/11: o gancho da configuração 3D: as gravações dos eixos e das ligações NÃO se ultrapassam (cada uma parte do que a anterior deixou na base) e as ligações que o ecrã não conhece
// (zona que a base aceita e o ecrã não desenha) sobrevivem a gravar só os eixos. A base é simulada, com estado, como a verdadeira: cat_definir_config_3d grava os DOIS como estado final.
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  guardado: { eixos: null as unknown, ligacoes: null as unknown },
  atrasoDefinir: 0,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async (f: string, a: Record<string, unknown>) => {
      base.chamadas.push({ f, a });
      if (f === "cat_definir_config_3d") {
        await new Promise((r) => setTimeout(r, base.atrasoDefinir));
        base.guardado = { eixos: a.p_eixos, ligacoes: a.p_ligacoes };
        return { data: { alvo: "produto", id: a.p_id, eixos: a.p_eixos, ligacoes: a.p_ligacoes }, error: null };
      }
      const g = base.guardado;
      return { data: { proprio: g.eixos === null && g.ligacoes === null ? null : { eixos: g.eixos, ligacoes: g.ligacoes, orfas: 0 }, subcategoria: null, categoria: null, efectiva: { eixos: g.eixos, eixos_origem: g.eixos ? "produto" : "automatico", ligacoes: g.ligacoes, ligacoes_origem: g.ligacoes ? "produto" : "automatico" } }, error: null };
    }),
  },
}));

import { useConfig3d } from "./useConfig3d";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33", PID = "11111111-2222-4333-8444-555555555555";
const A1 = "aaaaaaaa-0000-4000-a000-000000000001";
const EIXOS = { largura: "comprimento", altura: "largura", profundidade: "espessura" };
const LIG = [{ atributo: A1, zona: "frente", aplicar: true }];
const definidas = () => base.chamadas.filter((c) => c.f === "cat_definir_config_3d").map((c) => c.a);

beforeEach(() => { base.chamadas = []; base.guardado = { eixos: null, ligacoes: null }; base.atrasoDefinir = 0; });
afterEach(cleanup);

const montar = async () => {
  const h = renderHook(() => useConfig3d({ org: ORG, produtoId: PID, podeEditar: true }));
  await waitFor(() => expect(base.chamadas.some((c) => c.f === "cat_ler_config_3d")).toBe(true));
  return h;
};

describe("gravações seguidas, sem esperar umas pelas outras", () => {
  it("gravar os eixos e logo a seguir as ligações envia as ligações COM os eixos acabados de gravar (e não os antigos)", async () => {
    base.atrasoDefinir = 20;
    const h = await montar();
    let r: (string | null)[] = [];
    await act(async () => { r = await Promise.all([h.result.current.gravarEixos(EIXOS), h.result.current.gravarLigacoes(LIG as never)]); });
    expect(r).toEqual([null, null]);
    expect(definidas()).toEqual([
      { p_org: ORG, p_alvo: "produto", p_id: PID, p_eixos: EIXOS, p_ligacoes: null },
      { p_org: ORG, p_alvo: "produto", p_id: PID, p_eixos: EIXOS, p_ligacoes: LIG },
    ]);
    expect(base.guardado).toEqual({ eixos: EIXOS, ligacoes: LIG });
  });
  it("o inverso: gravar as ligações e logo a seguir os eixos mantém as ligações recém-gravadas", async () => {
    base.atrasoDefinir = 20;
    const h = await montar();
    await act(async () => { await Promise.all([h.result.current.gravarLigacoes(LIG as never), h.result.current.gravarEixos(EIXOS)]); });
    expect(base.guardado).toEqual({ eixos: EIXOS, ligacoes: LIG });
  });
  it("uma gravação que falha não impede a seguinte de correr", async () => {
    const h = await montar();
    await act(async () => { await Promise.all([h.result.current.gravarEixos({ largura: "x", altura: "x", profundidade: "x" } as never), h.result.current.gravarEixos(EIXOS)]); });
    expect(base.guardado.eixos).toEqual(EIXOS);
  });
});

describe("ligações que o ecrã não conhece", () => {
  it("uma ligação com zona desconhecida (a base aceita ^[a-z_]{1,20}$) sobrevive a gravar só os eixos", async () => {
    const guardadas = [{ atributo: A1, zona: "frente", aplicar: true }, { atributo: A1, zona: "portinhola", aplicar: false }];
    base.guardado = { eixos: null, ligacoes: guardadas };
    const h = await montar();
    await waitFor(() => expect(h.result.current.config).not.toBeNull());
    await act(async () => { await h.result.current.gravarEixos(EIXOS); });
    expect(definidas()[0].p_ligacoes).toEqual(guardadas);
    expect(base.guardado.ligacoes).toEqual(guardadas);
  });
});
