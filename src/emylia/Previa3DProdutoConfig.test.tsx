// 25/11: o painel «Medidas» do 3D agora GRAVA (por produto): os eixos nascem dos guardados (ou herdados), «Repor» volta aos guardados, «Guardar neste produto» e «Voltar a herdar» chamam
// quem grava (uma vez cada), a origem lê-se em texto e sem permissão não há botões. Sem a configuração (a função da base por aplicar, ou o formulário de criar) o painel é exactamente o de hoje
// (Modelo3DProdutoFase1.test.tsx continua a passar sem mexer). O Visualizador3D está simulado (jsdom não tem WebGL).
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Eixos } from "./planta3d/eixosMedida";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: (bucket: string) => ({ getPublicUrl: (caminho: string) => ({ data: { publicUrl: `https://cdn.teste/${bucket}/${caminho}` } }) }) } },
}));
vi.mock("./planta3d/Visualizador3D", () => ({
  default: (p: { descricao: string; modelos: Record<string, { dimensoes: { larguraCm: number; alturaCm: number; profundidadeCm: number } }>; espaco: { pecas: { produtoId: string }[] } }) => {
    const m = p.modelos[p.espaco.pecas[0].produtoId];
    return <div data-testid="canvas3d" role="img" aria-label={p.descricao} data-dim={`${m.dimensoes.larguraCm}x${m.dimensoes.alturaCm}x${m.dimensoes.profundidadeCm}`} />;
  },
}));

import { Previa3DProduto } from "./Previa3DProduto";
import type { Config3dPrevia } from "./Previa3DLigacoes";

afterEach(cleanup);

const AUTOMATICO: Eixos = { largura: "largura", altura: "comprimento", profundidade: "espessura" };
const GUARDADOS: Eixos = { largura: "comprimento", altura: "largura", profundidade: "espessura" };
const MEDIDA = { largura: 40, comprimento: 160, espessura: 25 };

const config = (p: Partial<Config3dPrevia["eixos"]> & { podeEditar?: boolean } = {}): Config3dPrevia & { gravar: ReturnType<typeof vi.fn> } => {
  const gravar = vi.fn(async (_: Eixos | null) => null as string | null);
  const { podeEditar = true, ...eixos } = p;
  return {
    podeEditar, gravar,
    eixos: { guardados: null, origem: "automatico", proprio: false, gravar, ...eixos },
    ligacoes: { valor: [], alterado: false, origem: "automatico", proprio: false, atributos: [], orfas: 0, ignoradas: 0, aoMudar: vi.fn(), gravar: vi.fn(async () => null), herdar: vi.fn(async () => null) },
  };
};
const abrir = (c?: Config3dPrevia) => {
  render(<Previa3DProduto nome="Coluna AXIS" sub={null} no={null} arvore={[]} medida={MEDIDA} modelo3d="movel_lavatorio" painelMedidas config3d={c} />);
  return screen.findByTestId("canvas3d");
};
const seletor = (rotulo: string) => screen.getByLabelText(new RegExp(`^${rotulo} =`)) as HTMLSelectElement;

describe("os eixos nascem dos guardados", () => {
  it("com eixos guardados neste produto: os seletores e a peça usam-nos, e a regra diz que estão guardados", async () => {
    const c = await abrir(config({ guardados: GUARDADOS, origem: "produto", proprio: true }));
    expect(seletor("Largura").value).toBe("comprimento");
    expect(seletor("Altura").value).toBe("largura");
    expect(c.getAttribute("data-dim")).toBe("160x40x25");
    expect(screen.getByText("Regra: guardada neste produto")).toBeTruthy();
  });
  it("herdados da categoria: diz de onde vêm", async () => {
    await abrir(config({ guardados: GUARDADOS, origem: "categoria" }));
    expect(screen.getByText("Regra: herdada da categoria")).toBeTruthy();
  });
  it("sem eixos guardados (origem automático): a regra automática do tipo, como hoje", async () => {
    const c = await abrir(config());
    expect(c.getAttribute("data-dim")).toBe("40x160x25");
    expect(screen.getByText("Regra: automática por tipo")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Repor automático" })).toBeTruthy();
  });
  it("escolher à mão muda a peça logo, e «Repor os guardados» volta aos guardados (não ao automático)", async () => {
    const c = await abrir(config({ guardados: GUARDADOS, origem: "produto", proprio: true }));
    fireEvent.change(seletor("Altura"), { target: { value: "espessura" } });
    expect(screen.getByText("Regra: escolhida à mão, por guardar")).toBeTruthy();
    expect(c.getAttribute("data-dim")).not.toBe("160x40x25");
    fireEvent.click(screen.getByRole("button", { name: "Repor os guardados" }));
    expect(c.getAttribute("data-dim")).toBe("160x40x25");
    expect(screen.getByText("Regra: guardada neste produto")).toBeTruthy();
  });
});

describe("guardar e voltar a herdar", () => {
  it("«Guardar neste produto» só actua depois de escolher; grava os eixos em vigor uma vez e diz-o numa região viva", async () => {
    const c = config();
    await abrir(c);
    const guardar = screen.getByRole("button", { name: "Guardar neste produto" });
    expect(guardar.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(guardar);
    expect(c.gravar).not.toHaveBeenCalled();
    fireEvent.change(seletor("Largura"), { target: { value: "comprimento" } });
    expect(guardar.getAttribute("aria-disabled")).toBe("false");
    fireEvent.click(guardar);
    await waitFor(() => expect(c.gravar).toHaveBeenCalledTimes(1));
    expect(c.gravar).toHaveBeenCalledWith({ largura: "comprimento", altura: "largura", profundidade: "espessura" });
    expect(await screen.findByText("Eixos guardados neste produto.")).toBeTruthy();
  });
  it("um segundo clique enquanto grava não grava duas vezes", async () => {
    let acabar: (v: string | null) => void = () => {};
    const c = config();
    c.gravar.mockImplementation(() => new Promise((r) => { acabar = r; }));
    await abrir(c);
    fireEvent.change(seletor("Largura"), { target: { value: "comprimento" } });
    const guardar = screen.getByRole("button", { name: "Guardar neste produto" });
    fireEvent.click(guardar); fireEvent.click(guardar);
    expect(c.gravar).toHaveBeenCalledTimes(1);
    acabar(null);
    await screen.findByText("Eixos guardados neste produto.");
  });
  it("a recusa da base aparece como alerta, em português, e a escolha à mão fica (nada se perde)", async () => {
    const c = config();
    c.gravar.mockResolvedValue("Sem permissão para gravar a configuração 3D.");
    await abrir(c);
    fireEvent.change(seletor("Largura"), { target: { value: "comprimento" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar neste produto" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Sem permissão");
    expect(seletor("Largura").value).toBe("comprimento");
  });
  it("«Voltar a herdar» só actua quando os eixos são deste produto; grava null", async () => {
    const herdado = config({ guardados: GUARDADOS, origem: "categoria", proprio: false });
    await abrir(herdado);
    const b = screen.getByRole("button", { name: "Voltar a herdar os eixos" });
    expect(b.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(b);
    expect(herdado.gravar).not.toHaveBeenCalled();
    cleanup();
    const proprio = config({ guardados: GUARDADOS, origem: "produto", proprio: true });
    await abrir(proprio);
    fireEvent.click(screen.getByRole("button", { name: "Voltar a herdar os eixos" }));
    await waitFor(() => expect(proprio.gravar).toHaveBeenCalledWith(null));
  });
});

describe("sem permissão e sem configuração", () => {
  it("sem products.edit: os eixos usam-se e vêem-se, mas não há botões de guardar nem de voltar a herdar", async () => {
    const c = await abrir(config({ guardados: GUARDADOS, origem: "produto", proprio: true, podeEditar: false }));
    expect(c.getAttribute("data-dim")).toBe("160x40x25");
    expect(screen.queryByRole("button", { name: /Guardar neste produto|Voltar a herdar|Guardar aspeto 3D|Guardar ligações/ })).toBeNull();
    expect(screen.getAllByText(/permissão de editar produtos/i).length).toBeGreaterThan(0);
  });
  it("REGRESSÃO: sem `config3d`, o painel é o de hoje (só para ver, sem botões de gravar, sem painel «Regras do produto»)", async () => {
    await abrir(undefined);
    expect(screen.getByText(/a gravação vem na próxima fase/i)).toBeTruthy();
    expect(screen.getByText("Regra: automática por tipo")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /gravar|guardar/i })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Regras do produto" })).toBeNull();
  });
  it("com configuração, o painel «Regras do produto» aparece (só com a Medida ou não: as ligações não dependem dela)", async () => {
    await abrir(config());
    expect(screen.getByRole("heading", { name: "Regras do produto" })).toBeTruthy();
  });
});
