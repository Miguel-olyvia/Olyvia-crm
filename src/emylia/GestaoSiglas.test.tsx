// 16/11: as siglas e a ordem da referência (SKU) nos ecrãs de gestão do Catálogo: sigla de categorias, subcategorias e opções, e o bloco
// «Referência (SKU)», que tem separador próprio. A base é simulada; confere-se o contrato de 20270118000000 (nomes e argumentos).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  responder: (() => ({ data: null, error: null })) as (f: string, a: Record<string, unknown>) => { data: unknown; error: unknown },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn(async (f: string, a: Record<string, unknown>) => { base.chamadas.push({ f, a }); return base.responder(f, a); }) },
}));

import { GestaoCategorias } from "./GestaoCategorias";
import { GestaoSubcategorias } from "./GestaoSubcategorias";
import { GestaoAtributos } from "./GestaoAtributos";
import { GestaoSku } from "./GestaoSku";
import type { FichaProdutoReal } from "./fichaProdutoDados";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const C1 = "c0000000-0000-4000-a000-000000000001", C2 = "c0000000-0000-4000-a000-000000000002";
const S1 = "50000000-0000-4000-a000-000000000001", S2 = "50000000-0000-4000-a000-000000000002";
const A_MED = "aaaaaaaa-0000-4000-a000-000000000002", A_COR = "aaaaaaaa-0000-4000-a000-000000000001", A_BRI = "aaaaaaaa-0000-4000-a000-000000000003";
const O_AZUL = "bbbbbbbb-0000-4000-a000-000000000001", O_VERM = "bbbbbbbb-0000-4000-a000-000000000002";

const categorias = () => ({
  categorias: [
    { id: C1, nome: "Casa de banho", ordem: 1, ativo: true, global: false, usados: 5, sigla: "BC", subcategorias: [
      { id: S1, nome: "Torneiras", ordem: 1, ativo: true, global: false, usados: 3, sigla: "TO" },
      { id: S2, nome: "Louças", ordem: 2, ativo: true, global: false, usados: 0, sigla: null },
    ] },
    { id: C2, nome: "Ferramentas", ordem: 2, ativo: true, global: true, usados: 0, sigla: "FER", subcategorias: [] },
  ],
});
const atributos = () => ({
  atributos: [
    { id: A_MED, codigo: "medida", nome: "Medida", tipo: "medida", tem_hex: false, ordem: 1, ativo: true, usados: 4, sku_ordem: 3, sku_entra: true, opcoes: [] },
    { id: A_COR, codigo: "cor", nome: "Cor", tipo: "lista", tem_hex: false, ordem: 2, ativo: true, usados: 3, sku_ordem: 1, sku_entra: true, opcoes: [
      { id: O_AZUL, valor: "AZUL", nome: "Azul", hex: null, ordem: 1, ativo: true, usados: 2, sigla: "AZ" },
      { id: O_VERM, valor: "VERMELHO", nome: "Vermelho", hex: null, ordem: 2, ativo: true, usados: 0, sigla: null },
    ] },
    { id: A_BRI, codigo: "brilho", nome: "Brilho", tipo: "lista", tem_hex: false, ordem: 3, ativo: true, usados: 0, sku_ordem: 2, sku_entra: false, opcoes: [
      { id: "bbbbbbbb-0000-4000-a000-000000000009", valor: "FOSCO", nome: "Fosco", hex: null, ordem: 1, ativo: true, usados: 0, sigla: "FO" },
    ] },
  ],
});

const erro = (code: string, message: string) => ({ data: null, error: { code, message } });
const REAL = (p: Partial<FichaProdutoReal> = {}): FichaProdutoReal => ({ org: ORG, podeEditar: true, podeMudarPrecos: false, recarregar: vi.fn(async () => undefined), ...p });
const chamadasDe = (f: string) => base.chamadas.filter((c) => c.f === f);
const razao = (b: HTMLElement) => (b.getAttribute("aria-describedby") ?? "").split(" ").map((i) => document.getElementById(i)?.textContent ?? "").join(" ").trim();

beforeEach(() => {
  base.chamadas = [];
  base.responder = (f) => (f === "cat_ler_categorias_gestao" ? { data: categorias(), error: null } : f === "cat_ler_atributos_gestao" ? { data: atributos(), error: null } : { data: { ok: true }, error: null });
});
afterEach(cleanup);

describe("sigla de categorias e subcategorias", () => {
  const abrir = async (r = REAL(), anunciar = vi.fn()) => {
    render(<GestaoCategorias real={r} anunciar={anunciar} />);
    await screen.findByRole("article", { name: "Ferramentas" });
    return anunciar;
  };
  const cb = () => screen.getByRole("article", { name: "Casa de banho" });
  it("mostra a sigla na linha (e «Sem sigla» quando falta), também nas partilhadas, que só se leem", async () => {
    await abrir();
    expect(within(cb()).getByText("Sigla: BC")).toBeInTheDocument();
    expect(within(cb()).getByText("Sigla: TO")).toBeInTheDocument();
    expect(within(cb()).getByText("Sem sigla")).toBeInTheDocument();
    const f = screen.getByRole("article", { name: "Ferramentas" });
    expect(within(f).getByText("Sigla: FER")).toBeInTheDocument();
    expect(within(f).queryByRole("button", { name: /sigla/i })).toBeNull();
  });
  it("sem products.edit não há botão de sigla", async () => {
    await abrir(REAL({ podeEditar: false }));
    expect(screen.queryByRole("button", { name: /Mudar a sigla/ })).toBeNull();
  });
  it("editar: maiúsculas automáticas, dica de que só muda os SKUs futuros, grava com cat_guardar_sigla_categoria, relê e devolve o foco", async () => {
    const anunciar = await abrir();
    fireEvent.click(within(cb()).getByRole("button", { name: "Mudar a sigla de Casa de banho" }));
    const campo = screen.getByLabelText("Sigla da categoria") as HTMLInputElement;
    expect(campo).toHaveAttribute("maxlength", "6");
    expect(screen.getByText(/só muda os SKU futuros/i)).toBeInTheDocument();
    fireEvent.change(campo, { target: { value: "cb" } });
    expect(campo.value).toBe("CB");
    base.responder = (f) => (f === "cat_ler_categorias_gestao" ? { data: { categorias: [{ ...categorias().categorias[0], sigla: "CB" }, categorias().categorias[1]] }, error: null } : { data: { ok: true }, error: null });
    fireEvent.click(screen.getByRole("button", { name: "Guardar sigla" }));
    await waitFor(() => expect(chamadasDe("cat_guardar_sigla_categoria")).toHaveLength(1));
    expect(chamadasDe("cat_guardar_sigla_categoria")[0].a).toEqual({ p_org: ORG, p_id: C1, p_sigla: "CB" });
    await waitFor(() => expect(within(cb()).getByText("Sigla: CB")).toBeInTheDocument());
    expect(anunciar).toHaveBeenCalledWith(expect.stringContaining("CB"));
    expect(screen.queryByLabelText("Sigla da categoria")).toBeNull();
    await waitFor(() => expect(within(cb()).getByRole("button", { name: "Mudar a sigla de Casa de banho" })).toHaveFocus());
  });
  it("uma sigla inválida diz porquê (aria-disabled com razão) e não chama a base", async () => {
    await abrir();
    fireEvent.click(within(cb()).getByRole("button", { name: "Mudar a sigla de Casa de banho" }));
    const campo = screen.getByLabelText("Sigla da categoria");
    fireEvent.change(campo, { target: { value: "12" } });
    const g = screen.getByRole("button", { name: "Guardar sigla" });
    expect(g).toHaveAttribute("aria-disabled", "true");
    expect(razao(g)).toMatch(/pelo menos uma letra/);
    fireEvent.click(g);
    fireEvent.change(campo, { target: { value: "B C" } });
    expect(razao(g)).toMatch(/letras A a Z e algarismos/);
    fireEvent.click(g);
    expect(chamadasDe("cat_guardar_sigla_categoria")).toHaveLength(0);
  });
  it("sigla repetida (CT004): «Já existe outra com esta sigla» no sítio, em vermelho acessível, e o formulário fica aberto", async () => {
    await abrir();
    fireEvent.click(within(cb()).getByRole("button", { name: "Mudar a sigla de Casa de banho" }));
    fireEvent.change(screen.getByLabelText("Sigla da categoria"), { target: { value: "XX" } });
    base.responder = (f) => (f === "cat_guardar_sigla_categoria" ? erro("CT004", "Já existe uma categoria com esta sigla.") : f === "cat_ler_categorias_gestao" ? { data: categorias(), error: null } : { data: { ok: true }, error: null });
    fireEvent.click(screen.getByRole("button", { name: "Guardar sigla" }));
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("Já existe outra com esta sigla.");
    expect(alerta.className).toMatch(/text-red-700/);
    expect(alerta.className).toMatch(/dark:text-red-400/);
    expect(screen.getByLabelText("Sigla da categoria")).toBeInTheDocument();
  });
  it("sem permissão (CT001): mostra a mensagem da base no sítio", async () => {
    await abrir();
    fireEvent.click(within(cb()).getByRole("button", { name: "Mudar a sigla de Torneiras em Casa de banho" }));
    fireEvent.change(screen.getByLabelText("Sigla da subcategoria"), { target: { value: "TX" } });
    base.responder = (f) => (f === "cat_guardar_sigla_categoria" ? erro("CT001", "Sem permissão para esta ação.") : { data: categorias(), error: null });
    fireEvent.click(screen.getByRole("button", { name: "Guardar sigla" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sem permissão para esta ação.");
  });
  it("a subcategoria também se edita no separador Subcategorias", async () => {
    render(<GestaoSubcategorias real={REAL()} anunciar={vi.fn()} />);
    await screen.findByText("Louças");
    expect(screen.getByText("Sigla: TO")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mudar a sigla de Louças em Casa de banho" }));
    fireEvent.change(screen.getByLabelText("Sigla da subcategoria"), { target: { value: "lo" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar sigla" }));
    await waitFor(() => expect(chamadasDe("cat_guardar_sigla_categoria")[0]?.a).toEqual({ p_org: ORG, p_id: S2, p_sigla: "LO" }));
  });
});

describe("Atributos: sigla das opções", () => {
  const abrir = async (r = REAL()) => {
    render(<GestaoAtributos real={r} voltar={vi.fn()} anunciar={vi.fn()} />);
    const cor = await screen.findByRole("region", { name: "Cor" });
    fireEvent.click(within(cor).getAllByRole("button").find((b) => b.hasAttribute("aria-controls"))!);
    return screen.getByRole("region", { name: "Cor" });
  };
  it("mostra a sigla de cada opção, edita com cat_guardar_sigla_opcao e relê", async () => {
    const cor = await abrir();
    expect(within(cor).getByText("Sigla: AZ")).toBeInTheDocument();
    expect(within(cor).getByText("Sem sigla")).toBeInTheDocument();
    fireEvent.click(within(cor).getByRole("button", { name: "Mudar a sigla de Vermelho" }));
    fireEvent.change(screen.getByLabelText("Sigla da opção"), { target: { value: "vm" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar sigla" }));
    await waitFor(() => expect(chamadasDe("cat_guardar_sigla_opcao")[0]?.a).toEqual({ p_org: ORG, p_opcao: O_VERM, p_sigla: "VM" }));
    await waitFor(() => expect(chamadasDe("cat_ler_atributos_gestao").length).toBeGreaterThan(1));
  });
  it("CT004 diz «Já existe outra com esta sigla» ao lado da opção", async () => {
    const cor = await abrir();
    fireEvent.click(within(cor).getByRole("button", { name: "Mudar a sigla de Vermelho" }));
    fireEvent.change(screen.getByLabelText("Sigla da opção"), { target: { value: "AZ" } });
    base.responder = (f) => (f === "cat_guardar_sigla_opcao" ? erro("CT004", "Já existe uma opção com esta sigla neste atributo.") : { data: atributos(), error: null });
    fireEvent.click(screen.getByRole("button", { name: "Guardar sigla" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Já existe outra com esta sigla.");
  });
  it("fechar o painel do atributo fecha o formulário da sigla (não volta aberto)", async () => {
    const cor = await abrir();
    fireEvent.click(within(cor).getByRole("button", { name: "Mudar a sigla de Vermelho" }));
    expect(screen.getByLabelText("Sigla da opção")).toBeInTheDocument();
    const alternar = () => within(screen.getByRole("region", { name: "Cor" })).getAllByRole("button").find((b) => b.hasAttribute("aria-controls"))!;
    fireEvent.click(alternar());
    fireEvent.click(alternar());
    expect(screen.queryByLabelText("Sigla da opção")).toBeNull();
  });
  it("sem products.edit não há botão de sigla", async () => {
    const cor = await abrir(REAL({ podeEditar: false }));
    expect(within(cor).getByText("Sigla: AZ")).toBeInTheDocument();
    expect(within(cor).queryByRole("button", { name: /Mudar a sigla/ })).toBeNull();
  });
});

describe("Separador «Referência (SKU)»", () => {
  const abrir = async (r = REAL(), anunciar = vi.fn(), irPara = vi.fn()) => {
    render(<GestaoSku real={r} anunciar={anunciar} irPara={irPara} />);
    const bloco = await screen.findByRole("region", { name: "Referência (SKU)" });
    await within(bloco).findByText("Cor");
    return { anunciar, irPara, bloco };
  };
  // os blocos configuráveis são os que vêm depois dos três fixos (categoria, subcategoria, número)
  const nomes = (bloco: HTMLElement) => within(bloco).getAllByRole("listitem").slice(3).map((l) => (l.textContent ?? "").replace(/^\d+\.\s*/, "").split(/Entra|Subir|Descer/)[0].trim());
  const escolherCombo = (bloco: HTMLElement, rotulo: string, opcao: string) => {
    fireEvent.click(within(bloco).getByRole("combobox", { name: rotulo }));
    fireEvent.click(screen.getByRole("option", { name: opcao }));
  };
  const comPrever = (sku: string | null) => {
    base.responder = (f) => (f === "cat_ler_categorias_gestao" ? { data: categorias(), error: null } : f === "cat_ler_atributos_gestao" ? { data: atributos(), error: null }
      : f === "cat_prever_sku" ? { data: { sku, faltas: [] }, error: null } : { data: { ok: true }, error: null });
  };
  it("a composição começa por Categoria, Subcategoria e Número, fixos e presos: sem Subir/Descer nem interruptor, com «Fixo: a referência base»", async () => {
    const { bloco } = await abrir();
    const fixos = within(bloco).getAllByRole("listitem").slice(0, 3);
    expect(fixos.map((l) => (l.textContent ?? "").replace(/^\d+\.\s*/, "").split(/Fixo/)[0].trim())).toEqual(["Categoria", "Subcategoria", "Número (4 dígitos)"]);
    for (const l of fixos) {
      expect(within(l).getByText("Fixo: a referência base")).toBeInTheDocument();
      expect(within(l).queryByRole("button", { name: /Subir|Descer/ })).toBeNull();
      expect(within(l).queryByRole("switch")).toBeNull();
    }
  });
  it("lista os atributos configuráveis pela posição no SKU (Cor, Brilho, Medida), com o exemplo ao vivo só dos que entram, e a explicação", async () => {
    const { bloco } = await abrir();
    expect(nomes(bloco)).toEqual(["Cor", "Brilho", "Medida"]);
    expect(within(bloco).getByTestId("exemplo-sku")).toHaveTextContent("BC-TO-0001-AZ-60X30");
    expect(within(bloco).getByText(/simplesmente não entram/)).toBeInTheDocument();
  });
  it("escolher categoria e subcategoria usa as siglas reais, mostra «Sigla: …» e a próxima referência da base (cat_prever_sku)", async () => {
    const { bloco } = await abrir();
    expect(within(bloco).getByRole("combobox", { name: "Subcategoria" })).toBeDisabled();
    expect(within(bloco).getByText(/Escolha primeiro a categoria/)).toBeInTheDocument();
    comPrever("BC-TO-0003");
    escolherCombo(bloco, "Categoria", "Casa de banho");
    expect(within(bloco).getByText("Sigla: BC")).toBeInTheDocument();
    escolherCombo(bloco, "Subcategoria", "Torneiras");
    expect(within(bloco).getByText("Sigla: TO")).toBeInTheDocument();
    await waitFor(() => expect(within(bloco).getByTestId("exemplo-sku")).toHaveTextContent("BC-TO-0003-AZ-60X30"));
    expect(within(bloco).getByText(/A próxima referência desta base:/)).toHaveTextContent("A próxima referência desta base: BC-TO-0003");
    expect(chamadasDe("cat_prever_sku").at(-1)?.a).toEqual({ p_org: ORG, p_categoria: C1, p_subcategoria: S1, p_atributos: [] });
  });
  it("uma subcategoria sem sigla avisa «Falta a sigla» (a vermelho) e o atalho leva ao separador Subcategorias", async () => {
    const { bloco, irPara } = await abrir();
    escolherCombo(bloco, "Categoria", "Casa de banho");
    escolherCombo(bloco, "Subcategoria", "Louças");
    const aviso = within(bloco).getByText("Falta a sigla");
    expect(aviso.className).toMatch(/text-red-700 dark:text-red-400/);
    const atalho = within(bloco).getByRole("button", { name: "Editar a sigla da subcategoria" });
    expect(atalho.className).toContain("min-h-11");
    fireEvent.click(atalho);
    expect(irPara).toHaveBeenCalledWith("subcategorias");
    fireEvent.click(within(bloco).getByRole("button", { name: "Editar a sigla da categoria" }));
    expect(irPara).toHaveBeenLastCalledWith("categorias");
  });
  it("mudar a categoria limpa a subcategoria escolhida", async () => {
    const { bloco } = await abrir();
    escolherCombo(bloco, "Categoria", "Casa de banho");
    escolherCombo(bloco, "Subcategoria", "Torneiras");
    escolherCombo(bloco, "Categoria", "Ferramentas");
    expect(within(bloco).getByRole("combobox", { name: "Subcategoria" })).toHaveValue("");
    expect(within(bloco).getByText("Sigla: FER")).toBeInTheDocument();
  });
  it("Descer/Subir mudam a ordem no ecrã, anunciam a posição e o exemplo acompanha; Guardar manda TODOS os atributos pela ordem nova", async () => {
    const { bloco, anunciar } = await abrir();
    const descer = within(bloco).getByRole("button", { name: "Descer Cor, posição 1 de 3" });
    descer.focus();
    fireEvent.click(descer);
    expect(nomes(bloco)).toEqual(["Brilho", "Cor", "Medida"]);
    expect(anunciar).toHaveBeenCalledWith("«Cor» passou para a posição 2 de 3.");
    expect(within(bloco).getByRole("button", { name: "Descer Cor, posição 2 de 3" })).toHaveFocus();
    fireEvent.click(within(bloco).getByRole("button", { name: "Subir Medida, posição 3 de 3" }));
    expect(nomes(bloco)).toEqual(["Brilho", "Medida", "Cor"]);
    expect(within(bloco).getByTestId("exemplo-sku")).toHaveTextContent("BC-TO-0001-60X30-AZ");
    fireEvent.click(within(bloco).getByRole("button", { name: "Guardar a ordem da referência" }));
    await waitFor(() => expect(chamadasDe("cat_guardar_sku_config")).toHaveLength(1));
    expect(chamadasDe("cat_guardar_sku_config")[0].a).toEqual({ p_org: ORG, p_itens: [
      { atributo: A_BRI, entra: false }, { atributo: A_MED, entra: true }, { atributo: A_COR, entra: true },
    ] });
  });
  it("os extremos não se movem (aria-disabled com razão) e a posição fica no nome do botão", async () => {
    const { bloco } = await abrir();
    const subir = within(bloco).getByRole("button", { name: "Subir Cor, posição 1 de 3" });
    expect(subir).toHaveAttribute("aria-disabled", "true");
    expect(razao(subir)).toBe("Já é o primeiro.");
    fireEvent.click(subir);
    expect(nomes(bloco)).toEqual(["Cor", "Brilho", "Medida"]);
    const descer = within(bloco).getByRole("button", { name: "Descer Medida, posição 3 de 3" });
    expect(razao(descer)).toBe("Já é o último.");
  });
  it("o interruptor «Entra no SKU» liga e desliga e vai no pedido; sem alterações o Guardar diz porque não vale", async () => {
    const { bloco } = await abrir();
    const guardar = () => within(bloco).getByRole("button", { name: "Guardar a ordem da referência" });
    expect(guardar()).toHaveAttribute("aria-disabled", "true");
    expect(razao(guardar())).toBe("Sem alterações para guardar.");
    fireEvent.click(guardar());
    expect(chamadasDe("cat_guardar_sku_config")).toHaveLength(0);
    const brilho = within(bloco).getByRole("switch", { name: "Entra no SKU: Brilho" });
    expect(brilho).not.toBeChecked();
    fireEvent.click(brilho);
    expect(brilho).toBeChecked();
    expect(within(bloco).getByTestId("exemplo-sku")).toHaveTextContent("BC-TO-0001-AZ-FO-60X30");
    fireEvent.click(within(bloco).getByRole("switch", { name: "Entra no SKU: Medida" }));
    fireEvent.click(guardar());
    await waitFor(() => expect(chamadasDe("cat_guardar_sku_config")[0]?.a).toEqual({ p_org: ORG, p_itens: [
      { atributo: A_COR, entra: true }, { atributo: A_BRI, entra: true }, { atributo: A_MED, entra: false },
    ] }));
  });
  it("depois de gravar relê a ordem e anuncia; um erro fica no bloco e a ordem escolhida mantém-se", async () => {
    const { bloco, anunciar } = await abrir();
    fireEvent.click(within(bloco).getByRole("button", { name: "Descer Cor, posição 1 de 3" }));
    base.responder = (f) => (f === "cat_guardar_sku_config" ? erro("CT002", "A ordem do SKU tem de trazer todos os atributos, cada um uma vez.") : { data: atributos(), error: null });
    fireEvent.click(within(bloco).getByRole("button", { name: "Guardar a ordem da referência" }));
    const alerta = await within(bloco).findByRole("alert");
    expect(alerta).toHaveTextContent("A ordem do SKU tem de trazer todos os atributos");
    expect(alerta.className).toMatch(/text-red-700 dark:text-red-400/);
    expect(nomes(bloco)).toEqual(["Brilho", "Cor", "Medida"]);
    expect(anunciar).not.toHaveBeenCalledWith(expect.stringContaining("guardada"));
    // agora corre bem: relê e anuncia
    base.responder = (f) => (f === "cat_ler_atributos_gestao" ? { data: atributos(), error: null } : { data: { ok: true }, error: null });
    const lidas = chamadasDe("cat_ler_atributos_gestao").length;
    fireEvent.click(within(bloco).getByRole("button", { name: "Guardar a ordem da referência" }));
    await waitFor(() => expect(anunciar).toHaveBeenCalledWith("Ordem da referência guardada."));
    expect(chamadasDe("cat_ler_atributos_gestao").length).toBeGreaterThan(lidas);
  });
  it("sem products.edit só se vê: sem botões de mover, sem interruptores e sem Guardar", async () => {
    const { bloco } = await abrir(REAL({ podeEditar: false }));
    expect(within(bloco).queryAllByRole("button")).toHaveLength(0);
    expect(within(bloco).queryByRole("switch")).toBeNull();
    expect(within(bloco).getByText("Cor")).toBeInTheDocument();
  });
  it("a função ainda por aplicar na base: «Ainda não disponível nesta base»", async () => {
    const { bloco } = await abrir();
    fireEvent.click(within(bloco).getByRole("switch", { name: "Entra no SKU: Brilho" }));
    base.responder = (f) => (f === "cat_guardar_sku_config" ? erro("PGRST202", "Could not find the function public.cat_guardar_sku_config") : { data: atributos(), error: null });
    fireEvent.click(within(bloco).getByRole("button", { name: "Guardar a ordem da referência" }));
    expect(await within(bloco).findByRole("alert")).toHaveTextContent("Ainda não disponível nesta base");
  });
  it("o separador Atributos já não tem o bloco da referência", async () => {
    render(<GestaoAtributos real={REAL()} voltar={vi.fn()} anunciar={vi.fn()} />);
    await screen.findByRole("region", { name: "Cor" });
    expect(screen.queryByRole("region", { name: "Referência (SKU)" })).toBeNull();
  });
});
