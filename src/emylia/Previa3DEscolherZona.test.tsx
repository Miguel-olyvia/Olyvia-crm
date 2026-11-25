// 25/11: escolher NO 3D onde vai cada atributo. (1) A lista de atributos do painel «Ligações» e as ligações oferecidas são SÓ os que o produto tem (com valor escolhido), e não todos os do sistema.
// (2) Clicar numa parte da peça escolhe a zona; o painel «Zona: Frente» diz o que a pinta hoje e deixa escolher «Pintar com: …» (a lista de ligações muda e o 3D acompanha, sem gravar até «Guardar
// neste produto»). Os botões do painel «Zonas» escolhem a mesma zona (teclado e leitores de ecrã). O Visualizador3D é simulado (jsdom não tem WebGL): os botões do simulacro fazem o que o clique e o
// rato fazem no canvas (aoClicarZona e aoPassarZona), e o que o 3D recebe está nos `data-*`.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AtributoDef, AtributoProduto } from "./v2/catalogoModelo";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  responder: (() => ({ data: null, error: null })) as (f: string, a: Record<string, unknown>) => { data: unknown; error: unknown },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async (f: string, a: Record<string, unknown>) => { base.chamadas.push({ f, a }); return base.responder(f, a); }),
    storage: { from: (bucket: string) => ({ getPublicUrl: (caminho: string) => ({ data: { publicUrl: `https://cdn.teste/${bucket}/${caminho}` } }) }) },
  },
}));
vi.mock("./planta3d/Visualizador3D", () => ({
  default: (p: {
    descricao: string; zonaRealcada?: string | null; aoClicarZona?: (z: string | null) => void; aoPassarZona?: (z: string | null) => void;
    modelos: Record<string, { mockup3d: { zonas?: unknown } }>; espaco: { pecas: { produtoId: string }[] };
  }) => {
    const m = p.modelos[p.espaco.pecas[0].produtoId];
    return (
      <div data-testid="canvas3d" role="img" aria-label={p.descricao} data-zonas={m.mockup3d.zonas ? JSON.stringify(m.mockup3d.zonas) : ""} data-realce={p.zonaRealcada ?? ""} data-clicavel={p.aoClicarZona ? "sim" : "nao"}>
        <button type="button" data-testid="clicar-frente" onClick={() => p.aoClicarZona?.("frente")} />
        <button type="button" data-testid="clicar-corpo" onClick={() => p.aoClicarZona?.("corpo")} />
        <button type="button" data-testid="clicar-pes" onClick={() => p.aoClicarZona?.("pes")} />
        <button type="button" data-testid="clicar-fora" onClick={() => p.aoClicarZona?.(null)} />
        <button type="button" data-testid="passar-corpo" onClick={() => p.aoPassarZona?.("corpo")} />
        <button type="button" data-testid="passar-nada" onClick={() => p.aoPassarZona?.(null)} />
      </div>
    );
  },
}));

import { Modelo3DFicha } from "./Modelo3DFicha";
import type { FichaProdutoReal } from "./fichaProdutoDados";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33", PID = "11111111-2222-4333-8444-555555555555";
const A_MED = "aaaaaaaa-0000-4000-a000-000000000002", A_FRENTE = "aaaaaaaa-0000-4000-a000-000000000011", A_CORPO = "aaaaaaaa-0000-4000-a000-000000000012";
const A_COR = "aaaaaaaa-0000-4000-a000-000000000013", A_AC_COR = "aaaaaaaa-0000-4000-a000-000000000014", A_AC_FRENTE = "aaaaaaaa-0000-4000-a000-000000000015", A_BRILHO = "aaaaaaaa-0000-4000-a000-000000000016";
const cor = (id: string, nome: string, codigo: string, hex: string, extra: Partial<AtributoDef> = {}): AtributoDef => ({
  id, codigo, nome, tipo: "lista", temHex: true, ordem: 2, opcoes: [{ id: `${id}-1`, valor: nome, nome: `${nome} escolhida`, hex, ordem: 1 }], ...extra,
});
const MEDIDA: AtributoDef = { id: A_MED, codigo: "medida", nome: "Medida", tipo: "medida", temHex: false, ordem: 1, opcoes: [] };
// o SISTEMA tem seis atributos de cor e um Brilho; o produto só tem a «Cor do corpo» e a «Cor da frente»
const DEFS: AtributoDef[] = [
  MEDIDA, cor(A_COR, "Cor", "cor", "#cc0000"), cor(A_AC_COR, "Acabamento da cor", "acabamento_cor", "#00cc00"), cor(A_CORPO, "Cor do corpo", "cor_corpo", "#111111"),
  cor(A_FRENTE, "Cor da frente", "cor_frente", "#eeeeee"), cor(A_AC_FRENTE, "Acabamento da frente", "acabamento_frente", "#0000cc"),
  { id: A_BRILHO, codigo: "brilho", nome: "Brilho", tipo: "lista", temHex: false, temAspeto: true, ordem: 3, opcoes: [{ id: `${A_BRILHO}-1`, valor: "Mate", nome: "Mate", hex: null, ordem: 1, superficie: "mate" }] },
];
const MED: AtributoProduto = { atributoId: A_MED, medida: { tipo: "3D", largura: 40, comprimento: 160, espessura: 25, unidade: "cm" } };
const doProduto = (...ids: string[]): AtributoProduto[] => [MED, ...ids.map((id) => ({ atributoId: id, opcaoId: `${id}-1`, valor: id }))];
const ATTRS = doProduto(A_CORPO, A_FRENTE);
const SEM = { proprio: null, subcategoria: null, categoria: null, efectiva: { eixos: null, eixos_origem: "automatico", ligacoes: null, ligacoes_origem: "automatico" } };
const comLigacoes = (lig: { atributo: string; zona: string; aplicar: boolean }[]) => ({ ...SEM, proprio: { eixos: null, ligacoes: lig, orfas: 0 }, efectiva: { eixos: null, eixos_origem: "automatico", ligacoes: lig, ligacoes_origem: "produto" } });
const REAL = (p: Partial<FichaProdutoReal> = {}): FichaProdutoReal => ({ org: ORG, podeEditar: true, podeMudarPrecos: false, recarregar: vi.fn(async () => undefined), ...p });
const chamadasDe = (f: string) => base.chamadas.filter((c) => c.f === f);

beforeEach(() => { base.chamadas = []; base.responder = (f) => (f === "cat_ler_config_3d" ? { data: SEM, error: null } : { data: null, error: null }); });
afterEach(cleanup);

const abrir = async (o: { real?: FichaProdutoReal; attrs?: AtributoProduto[]; modelo?: string } = {}) => {
  render(<Modelo3DFicha produto={{ id: PID, n: "Móvel", modelo3d: o.modelo ?? "movel_lavatorio" }} real={o.real ?? REAL()} anunciar={vi.fn()} nome="Móvel" sub={null} no={null} arvore={[]} attrs={o.attrs ?? ATTRS} defs={DEFS} />);
  fireEvent.click(screen.getByRole("button", { name: "Ver em 3D" }));
  const c = await screen.findByTestId("canvas3d");
  await waitFor(() => expect(chamadasDe("cat_ler_config_3d")).toHaveLength(1));
  await screen.findByRole("heading", { name: "Ligações" });
  return c;
};
const zonasDe = (c: HTMLElement) => JSON.parse(c.getAttribute("data-zonas") || "{}") as { zonas: Record<string, { atributo: string }> };
const painel = () => screen.getByRole("region", { name: /^Zona: / });
const clicar = (zona: string) => fireEvent.click(screen.getByTestId(`clicar-${zona}`));

describe("(1) o painel «Ligações» lista SÓ os atributos que o produto tem", () => {
  it("o sistema tem seis atributos de cor e um Brilho; o produto tem dois: «Atributos que o 3D lê» mostra esses dois", async () => {
    await abrir();
    const lista = screen.getByRole("heading", { name: "Atributos que o 3D lê" }).parentElement!;
    const nomes = within(lista).getAllByRole("listitem").map((li) => li.querySelector("strong")?.textContent);
    expect(nomes).toEqual(["Cor do corpo", "Cor da frente"]);
    for (const fora of ["Acabamento da cor", "Acabamento da frente", "Brilho"]) expect(within(lista).queryByText(fora, { selector: "strong" })).toBeNull();
  });
  it("o seletor de atributo de uma ligação nova só oferece os do produto", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Acrescentar ligação" }));
    const opcoes = within(screen.getByLabelText("Atributo")).getAllByRole("option").map((o) => o.textContent);
    expect(opcoes).toEqual(["Cor do corpo", "Cor da frente"]);
  });
  it("com o Brilho no produto, o Brilho aparece (lê-se, como superfície)", async () => {
    await abrir({ attrs: doProduto(A_CORPO, A_BRILHO) });
    expect(screen.getByText("Brilho", { selector: "strong" })).toBeTruthy();
  });
  it("um produto sem nenhum atributo que pinte: o painel di-lo em texto simples", async () => {
    await abrir({ attrs: [MED] });
    expect(screen.getByText(/este produto não tem nenhum atributo que pinte o 3D/i)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Atributos que o 3D lê" })).toBeNull();
  });
  it("uma ligação gravada a um atributo que o produto já não tem continua lá, marcada, para a poder remover", async () => {
    base.responder = (f) => (f === "cat_ler_config_3d" ? { data: comLigacoes([{ atributo: A_COR, zona: "corpo", aplicar: true }]), error: null } : { data: null, error: null });
    await abrir();
    const linha = screen.getByRole("group", { name: "Ligação 1" });
    expect(within(linha).getByText(/o produto já não tem este atributo: remova a ligação/i)).toBeTruthy();
    expect(within(screen.getByLabelText("Atributo")).getByRole("option", { name: /Cor \(o produto já não tem este atributo\)/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remover a ligação 1" }));
    expect(screen.queryByRole("group", { name: "Ligação 1" })).toBeNull();
  });
  it("REGRESSÃO: sem clicar em nada o 3D recebe as mesmas zonas de sempre (a «Cor da frente» pinta a frente, a «Cor do corpo» o corpo) e não há painel de zona", async () => {
    const c = await abrir();
    expect(zonasDe(c).zonas.frente.atributo).toBe("Cor da frente");
    expect(zonasDe(c).zonas.corpo.atributo).toBe("Cor do corpo");
    expect(c.getAttribute("data-realce")).toBe("");
    expect(screen.queryByRole("region", { name: /^Zona: / })).toBeNull();
  });
});

describe("(2) clicar numa parte da peça escolhe a zona e abre o painel «Zona»", () => {
  it("o 3D aceita cliques nas zonas (a pré-visualização com várias zonas)", async () => {
    const c = await abrir();
    expect(c.getAttribute("data-clicavel")).toBe("sim");
  });
  it("o clique na frente realça a zona, abre «Zona: Frente», diz o que a pinta hoje (por omissão) e anuncia a escolha", async () => {
    const c = await abrir();
    clicar("frente");
    expect(c.getAttribute("data-realce")).toBe("frente");
    const p = painel();
    expect(within(p).getByRole("heading", { name: "Zona: Frente" })).toBeTruthy();
    expect(within(p).getByText(/Cor da frente \(por omissão\)/)).toBeTruthy();
    expect(screen.getByText("Zona Frente seleccionada").getAttribute("aria-live")).toBe("polite");
  });
  it("«Pintar com:» oferece «Pelo nome», os atributos do produto (com a opção escolhida) e «Nenhum»; a escolha de hoje vem marcada", async () => {
    await abrir();
    clicar("frente");
    const p = painel();
    const radios = within(p).getAllByRole("radio").map((r) => (r.closest("label")?.textContent ?? "").replace(/\s+/g, " ").trim());
    expect(radios).toEqual(["Pelo nome (como por omissão)", "Cor do corpo Cor do corpo escolhida", "Cor da frente Cor da frente escolhida", "Nenhum (não pintar esta zona)"]);
    expect((within(p).getByRole("radio", { name: /Pelo nome/ }) as HTMLInputElement).checked).toBe(true);
  });
  it("escolher outro atributo muda o 3D logo (sem gravar), aparece nas «Ligações» e a zona passa a dizer «por ligação»", async () => {
    const c = await abrir();
    clicar("frente");
    fireEvent.click(within(painel()).getByRole("radio", { name: /Cor do corpo/ }));
    await waitFor(() => expect(zonasDe(c).zonas.frente.atributo).toBe("Cor do corpo"));
    expect(zonasDe(c).zonas.corpo.atributo).toBe("Cor do corpo"); // o corpo não perde a cor que tinha pelo nome
    expect(chamadasDe("cat_definir_config_3d")).toHaveLength(0);
    expect(within(painel()).getByText(/Cor do corpo \(por ligação\)/)).toBeTruthy();
    expect((within(painel()).getByRole("radio", { name: /Cor do corpo/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("group", { name: "Ligação 1" })).toBeTruthy();
  });
  it("«Nenhum» deixa a zona sem cor (as outras ficam); «Pelo nome» volta ao que os nomes davam", async () => {
    const c = await abrir();
    clicar("frente");
    fireEvent.click(within(painel()).getByRole("radio", { name: /Nenhum/ }));
    await waitFor(() => expect(zonasDe(c).zonas.frente).toBeUndefined());
    expect(zonasDe(c).zonas.corpo.atributo).toBe("Cor do corpo");
    expect(within(painel()).getByText(/nenhum atributo/i)).toBeTruthy();
    fireEvent.click(within(painel()).getByRole("radio", { name: /Pelo nome/ }));
    await waitFor(() => expect(zonasDe(c).zonas.frente.atributo).toBe("Cor da frente"));
  });
  it("«Guardar neste produto» grava as ligações (uma vez, com os eixos do produto) e diz-o numa região viva", async () => {
    base.responder = (f) => (f === "cat_ler_config_3d" ? { data: SEM, error: null } : f === "cat_definir_config_3d" ? { data: { alvo: "produto", id: PID }, error: null } : { data: null, error: null });
    await abrir();
    clicar("frente");
    const guardar = within(painel()).getByRole("button", { name: "Guardar neste produto" });
    expect(guardar.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(within(painel()).getByRole("radio", { name: /Cor do corpo/ }));
    fireEvent.click(within(painel()).getByRole("button", { name: "Guardar neste produto" }));
    await waitFor(() => expect(chamadasDe("cat_definir_config_3d")).toHaveLength(1));
    const a = chamadasDe("cat_definir_config_3d")[0].a as { p_eixos: unknown; p_ligacoes: { atributo: string; zona: string; aplicar: boolean }[] };
    expect(a.p_eixos).toBeNull();
    expect(a.p_ligacoes).toEqual(expect.arrayContaining([{ atributo: A_CORPO, zona: "frente", aplicar: true }]));
    expect(await within(painel()).findByText("Ligações guardadas neste produto.")).toBeTruthy();
  });
  it("clicar fora da peça (o fundo) deixa de escolher a zona e fecha o painel", async () => {
    const c = await abrir();
    clicar("frente");
    fireEvent.click(screen.getByTestId("clicar-fora"));
    expect(screen.queryByRole("region", { name: /^Zona: / })).toBeNull();
    expect(c.getAttribute("data-realce")).toBe("");
  });
  it("uma zona que o modelo não pinta (os pés do móvel de lavatório são de metal) não se escolhe", async () => {
    await abrir();
    clicar("pes");
    expect(screen.queryByRole("region", { name: /^Zona: / })).toBeNull();
  });
});

describe("passar o rato por cima de uma parte mostra o nome da zona e o atributo que a pinta", () => {
  it("a etiqueta aparece com a zona e o atributo e realça a zona; ao sair desaparece", async () => {
    const c = await abrir();
    fireEvent.click(screen.getByTestId("passar-corpo"));
    expect(screen.getByTestId("etiqueta-zona").textContent).toBe("Corpo · Cor do corpo");
    expect(c.getAttribute("data-realce")).toBe("corpo");
    fireEvent.click(screen.getByTestId("passar-nada"));
    expect(screen.queryByTestId("etiqueta-zona")).toBeNull();
    expect(c.getAttribute("data-realce")).toBe("");
  });
  it("com uma zona escolhida, passar por outra realça-a e, ao sair, volta a escolhida", async () => {
    const c = await abrir();
    clicar("frente");
    fireEvent.click(screen.getByTestId("passar-corpo"));
    expect(c.getAttribute("data-realce")).toBe("corpo");
    fireEvent.click(screen.getByTestId("passar-nada"));
    expect(c.getAttribute("data-realce")).toBe("frente");
  });
});

describe("a alternativa por teclado e leitores de ecrã: os botões do painel «Zonas» escolhem a mesma zona", () => {
  it("o botão da zona abre o mesmo painel, fica premido (aria-pressed) e a região viva anuncia; premir outra vez deixa de escolher", async () => {
    const c = await abrir();
    const zonas = screen.getByRole("heading", { name: "Zonas" }).closest("section")!;
    const botao = within(zonas).getByRole("button", { name: /^Frente/ });
    expect(botao.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(botao);
    expect(botao.getAttribute("aria-pressed")).toBe("true");
    expect(within(painel()).getByRole("heading", { name: "Zona: Frente" })).toBeTruthy();
    expect(c.getAttribute("data-realce")).toBe("frente");
    expect(screen.getByText("Zona Frente seleccionada")).toBeTruthy();
    fireEvent.click(botao);
    expect(screen.queryByRole("region", { name: /^Zona: / })).toBeNull();
  });
  it("o clique no 3D e o botão são a mesma escolha: o botão fica premido depois de clicar no 3D", async () => {
    await abrir();
    clicar("corpo");
    const zonas = screen.getByRole("heading", { name: "Zonas" }).closest("section")!;
    expect(within(zonas).getByRole("button", { name: /^Corpo/ }).getAttribute("aria-pressed")).toBe("true");
  });
  it("os rádios têm alvos de 44 px (min-h-11) e o painel aponta o campo com a legenda «Pintar com:»", async () => {
    await abrir();
    clicar("frente");
    const grupo = within(painel()).getByRole("group", { name: "Pintar com:" });
    for (const r of within(grupo).getAllByRole("radio")) expect(r.closest("label")?.className).toContain("min-h-11");
  });
});

describe("sem permissão de editar, ou sem configuração", () => {
  it("sem products.edit: escolhe-se a zona e vê-se o que a pinta, mas não há rádios nem botão de gravar", async () => {
    await abrir({ real: REAL({ podeEditar: false }) });
    clicar("frente");
    const p = painel();
    expect(within(p).getByText(/Cor da frente \(por omissão\)/)).toBeTruthy();
    expect(within(p).queryByRole("radio")).toBeNull();
    expect(within(p).queryByRole("button", { name: "Guardar neste produto" })).toBeNull();
    expect(within(p).getByText(/permissão de editar produtos/i)).toBeTruthy();
  });
  it("sem a configuração 3D (a função da base ainda não existe), clicar escolhe a zona só para ver, sem rádios", async () => {
    base.responder = () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.cat_ler_config_3d" } });
    render(<Modelo3DFicha produto={{ id: PID, n: "Móvel", modelo3d: "movel_lavatorio" }} real={REAL()} anunciar={vi.fn()} nome="Móvel" sub={null} no={null} arvore={[]} attrs={ATTRS} defs={DEFS} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver em 3D" }));
    await screen.findByTestId("canvas3d");
    await waitFor(() => expect(chamadasDe("cat_ler_config_3d")).toHaveLength(1));
    clicar("frente");
    expect(within(painel()).getByText(/Cor da frente \(por omissão\)/)).toBeTruthy();
    expect(within(painel()).queryByRole("radio")).toBeNull();
  });
});
