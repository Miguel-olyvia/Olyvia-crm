// 27/11: o GLB PRÓPRIO na página de Modelos (GestaoModelos.tsx): o chip «GLB · 1,2 MB» / «Sem GLB» em cada linha e o botão «Modelo 3D próprio…» ao lado do seletor do modelo 3D, que abre
// o diálogo (ModeloGlbDialogo.tsx). Sem permissão o botão fica à vista e bloqueado, com a razão; depois de gravar a página relê, anuncia e o foco volta ao botão. A base e a validação
// estão simuladas (a gravação é o contrato de modeloGlbDados.ts).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  glb: null as { caminho: string; bytes: number } | null,
  guardar: vi.fn(),
  remover: vi.fn(),
  analisar: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(async (f: string, a: Record<string, unknown>) => {
    base.chamadas.push({ f, a });
    if (f === "cat_ler_modelos_gestao") return { data: { modelos: MODELOS() }, error: null };
    if (f === "cat_ler_categorias_gestao") return { data: { categorias: [] }, error: null };
    return { data: null, error: null };
  }) },
}));
vi.mock("./modeloGlbDados", async (original) => ({
  ...(await original<typeof import("./modeloGlbDados")>()),
  guardarGlbProprio: base.guardar, removerGlbProprio: base.remover, urlDoGlbProprio: (c: string | null) => (c ? `https://cdn.teste/${c}` : null),
}));
vi.mock("./planta3d/glbValidar", async (original) => ({ ...(await original<typeof import("./planta3d/glbValidar")>()), analisarGlb: base.analisar }));

import { GestaoModelos } from "./GestaoModelos";
import type { FichaProdutoReal } from "./fichaProdutoDados";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const C1 = "c0000000-0000-4000-a000-000000000001", S1 = "50000000-0000-4000-a000-000000000001";
const M1 = "e0000000-0000-4000-a000-000000000001", M2 = "e0000000-0000-4000-a000-000000000002";
const CAMINHO = `${ORG}/aaaaaaaa-bbbb-4ccc-8ddd-000000000001.glb`;
const sub = { id: S1, nome: "Bases de Duche", sigla: "BD", ativo: true };
const cat = { id: C1, nome: "Casa de banho", sigla: "CB" };
/** M1 (SORTY, 3 produtos) leva o GLB que o teste puser em `base.glb`; M2 nunca leva e a leitura nem traz a chave. */
const MODELOS = () => [
  { id: M1, nome: "SORTY", numero: 1, ativo: true, usados: 3, subcategoria: sub, categoria: cat, ...(base.glb ? { glb_caminho: base.glb.caminho, glb_bytes: base.glb.bytes } : { glb_caminho: null, glb_bytes: null }) },
  { id: M2, nome: "STONE PLUS", numero: 2, ativo: true, usados: 0, subcategoria: sub, categoria: cat },
];

const REAL = (p: Partial<FichaProdutoReal> = {}): FichaProdutoReal => ({ org: ORG, podeEditar: true, podeMudarPrecos: false, recarregar: vi.fn(async () => undefined), ...p });
const relatorio = { ok: true, erros: [], avisos: [], triangulos: 1200, malhas: 1, materiais: ["corpo"], bytes: 1_258_291, abriu: true };
const leituras = () => base.chamadas.filter((c) => c.f === "cat_ler_modelos_gestao").length;

beforeEach(() => {
  base.chamadas = []; base.glb = null;
  base.guardar.mockReset(); base.remover.mockReset(); base.analisar.mockReset();
  base.analisar.mockResolvedValue(relatorio);
  base.guardar.mockImplementation(async () => { base.glb = { caminho: CAMINHO, bytes: 1_258_291 }; return { ok: true, v: { alvo: "modelo", id: M1, caminho: CAMINHO, anterior: null, anteriorOrfao: false, avisos: [], bytes: 1_258_291, triangulos: 1200 } }; });
  base.remover.mockImplementation(async () => { base.glb = null; return { ok: true, v: { alvo: "modelo", id: M1, caminho: null, anterior: CAMINHO, anteriorOrfao: true } }; });
});
afterEach(cleanup);

const abrir = async (r: FichaProdutoReal = REAL(), anunciar = vi.fn()) => {
  render(<GestaoModelos real={r} anunciar={anunciar} />);
  await screen.findByText("0001 · SORTY");
  return anunciar;
};
const linha = (texto: string) => screen.getAllByRole("listitem", { hidden: true }).find((x) => (x.textContent ?? "").startsWith(texto))!;
const razao = (b: HTMLElement) => (b.getAttribute("aria-describedby") ?? "").split(" ").map((i) => document.getElementById(i)?.textContent ?? "").join(" ").trim();
const botaoGlb = (nome: string) => within(linha(nome)).getByRole("button", { name: /^Modelo 3D próprio d/, hidden: true });
const escolherFicheiro = async () => {
  fireEvent.change(screen.getByLabelText("Ficheiro GLB"), { target: { files: [new File([new Uint8Array(64)], "sorty.glb")] } });
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Ficheiro válido/));
};

describe("Modelos: o chip e o botão do GLB próprio", () => {
  it("cada linha diz se tem GLB («GLB · 1,2 MB») ou «Sem GLB» (também quando a leitura não traz a chave)", async () => {
    base.glb = { caminho: CAMINHO, bytes: 1_258_291 };
    await abrir();
    expect(linha("0001 · SORTY")).toHaveTextContent("GLB · 1,2 MB");
    expect(linha("0001 · SORTY")).not.toHaveTextContent("Sem GLB");
    expect(linha("0002 · STONE PLUS")).toHaveTextContent("Sem GLB");
  });

  it("o botão «Modelo 3D próprio…» fica ao lado do seletor do modelo 3D, com o nome do modelo", async () => {
    await abrir();
    const b = botaoGlb("0001 · SORTY");
    expect(b).toHaveTextContent("Modelo 3D próprio…");
    expect(b).toHaveAccessibleName("Modelo 3D próprio do modelo SORTY");
    expect(b).toHaveAttribute("aria-haspopup", "dialog");
    const seletor = within(linha("0001 · SORTY")).getByRole("button", { name: "Mudar o modelo 3D do modelo SORTY" });
    expect(b.parentElement).toBe(seletor.parentElement);
    expect(b).not.toHaveAttribute("aria-disabled");
  });

  it("sem permissão para editar, o botão fica à vista e bloqueado, com a razão; clicar não abre nada; o chip continua a ver-se", async () => {
    base.glb = { caminho: CAMINHO, bytes: 1_258_291 };
    await abrir(REAL({ podeEditar: false }));
    const b = botaoGlb("0001 · SORTY");
    expect(b).toHaveAttribute("aria-disabled", "true");
    expect(razao(b)).toMatch(/Só quem pode editar produtos/);
    fireEvent.click(b);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(linha("0001 · SORTY")).toHaveTextContent("GLB · 1,2 MB");
  });
});

describe("Modelos: carregar, substituir e remover pelo diálogo", () => {
  it("abre o diálogo do modelo certo, e ao fechar o foco volta ao botão", async () => {
    await abrir();
    fireEvent.click(botaoGlb("0001 · SORTY"));
    expect(await screen.findByRole("dialog", { name: "Modelo 3D próprio" })).toHaveAccessibleDescription(/Do modelo «SORTY»/);
    expect(botaoGlb("0001 · SORTY")).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getAllByRole("button", { name: "Fechar" })[0]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(botaoGlb("0001 · SORTY")));
  });

  it("carregar: a confirmação diz os produtos do modelo, grava com o alvo «modelo», relê, anuncia, avisa o Catálogo e mostra o chip novo", async () => {
    const real = REAL();
    const anunciar = await abrir(real);
    const antes = leituras();
    fireEvent.click(botaoGlb("0001 · SORTY"));
    await screen.findByRole("dialog");
    await escolherFicheiro();
    fireEvent.click(screen.getByRole("button", { name: "Carregar" }));
    const conf = await screen.findByRole("group", { name: /Carregar este modelo 3D em «SORTY»/ });
    expect(conf).toHaveTextContent("3 produtos");
    fireEvent.click(within(conf).getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(base.guardar).toHaveBeenCalledTimes(1));
    expect(base.guardar.mock.calls[0].slice(0, 3)).toEqual([ORG, "modelo", M1]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(leituras()).toBeGreaterThan(antes);
    expect(anunciar).toHaveBeenCalledWith("Modelo 3D próprio de «SORTY» carregado (1,2 MB).");
    expect(real.recarregar).toHaveBeenCalled();
    await waitFor(() => expect(linha("0001 · SORTY")).toHaveTextContent("GLB · 1,2 MB"));
    await waitFor(() => expect(document.activeElement).toBe(botaoGlb("0001 · SORTY")));
  });

  it("substituir: com GLB o diálogo oferece Substituir e Remover", async () => {
    base.glb = { caminho: CAMINHO, bytes: 1_258_291 };
    await abrir();
    fireEvent.click(botaoGlb("0001 · SORTY"));
    await screen.findByRole("dialog");
    expect(screen.getByRole("button", { name: "Substituir" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Remover/ })).toBeInTheDocument();
  });

  it("remover: pede confirmação, grava com o alvo «modelo», relê e anuncia; o chip passa a «Sem GLB»", async () => {
    base.glb = { caminho: CAMINHO, bytes: 1_258_291 };
    const anunciar = await abrir();
    fireEvent.click(botaoGlb("0001 · SORTY"));
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: /^Remover/ }));
    fireEvent.click(within(await screen.findByRole("group", { name: /Remover o modelo 3D próprio de «SORTY»/ })).getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(base.remover).toHaveBeenCalledWith(ORG, "modelo", M1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(anunciar).toHaveBeenCalledWith("Modelo 3D próprio de «SORTY» removido: o 3D volta ao modelo escolhido ou ao automático.");
    await waitFor(() => expect(linha("0001 · SORTY")).toHaveTextContent("Sem GLB"));
  });

  it("uma falha da base fica no diálogo (em português), a página relê na mesma e não anuncia nada", async () => {
    base.guardar.mockResolvedValue({ ok: false, erro: "O ficheiro do modelo 3D é de outra organização.", codigo: "CT002" });
    const anunciar = await abrir();
    const antes = leituras();
    fireEvent.click(botaoGlb("0001 · SORTY"));
    await screen.findByRole("dialog");
    await escolherFicheiro();
    fireEvent.click(screen.getByRole("button", { name: "Carregar" }));
    fireEvent.click(within(await screen.findByRole("group", { name: /Carregar este modelo/ })).getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("O ficheiro do modelo 3D é de outra organização."));
    await waitFor(() => expect(leituras()).toBeGreaterThan(antes));
    expect(anunciar).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
