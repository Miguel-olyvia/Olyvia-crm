// 25/11: a configuração 3D na ficha do produto: lê-se UMA vez, só ao abrir «Ver em 3D» (cat_ler_config_3d); os eixos guardados e as ligações atributo → zona mandam no 3D; guardar chama
// cat_definir_config_3d (e relê); sem a função da base (migration por aplicar), sem permissão ou sem configuração, o 3D e os painéis são exactamente os de hoje. A base é simulada e o
// Visualizador3D também (jsdom não tem WebGL): o que ele recebe está nos `data-*`.
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
  default: (p: { descricao: string; modelos: Record<string, { dimensoes: { larguraCm: number; alturaCm: number; profundidadeCm: number }; mockup3d: { zonas?: unknown; cor?: string } }>; espaco: { pecas: { produtoId: string }[] } }) => {
    const m = p.modelos[p.espaco.pecas[0].produtoId];
    return <div data-testid="canvas3d" role="img" aria-label={p.descricao} data-dim={`${m.dimensoes.larguraCm}x${m.dimensoes.alturaCm}x${m.dimensoes.profundidadeCm}`} data-cor={m.mockup3d.cor ?? ""} data-zonas={m.mockup3d.zonas ? JSON.stringify(m.mockup3d.zonas) : ""} />;
  },
}));

import { Modelo3DFicha } from "./Modelo3DFicha";
import type { FichaProdutoReal } from "./fichaProdutoDados";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33", PID = "11111111-2222-4333-8444-555555555555";
const A_MED = "aaaaaaaa-0000-4000-a000-000000000002", A_FRENTE = "aaaaaaaa-0000-4000-a000-000000000011", A_CORPO = "aaaaaaaa-0000-4000-a000-000000000012";
const cor = (id: string, nome: string, codigo: string): AtributoDef => ({ id, codigo, nome, tipo: "lista", temHex: true, ordem: 2, opcoes: [{ id: `${id}-1`, valor: "Preto", nome: "Preto", hex: "#000000", ordem: 1 }, { id: `${id}-2`, valor: "Branco", nome: "Branco", hex: "#ffffff", ordem: 2 }] });
const DEFS: AtributoDef[] = [{ id: A_MED, codigo: "medida", nome: "Medida", tipo: "medida", temHex: false, ordem: 1, opcoes: [] }, cor(A_CORPO, "Cor do corpo", "cor_corpo"), cor(A_FRENTE, "Cor da frente", "cor_frente")];
const ATTRS: AtributoProduto[] = [
  { atributoId: A_MED, medida: { tipo: "3D", largura: 40, comprimento: 160, espessura: 25, unidade: "cm" } },
  { atributoId: A_CORPO, opcaoId: `${A_CORPO}-1`, valor: "Preto" }, { atributoId: A_FRENTE, opcaoId: `${A_FRENTE}-2`, valor: "Branco" },
];
const GUARDADOS = { largura: "comprimento", altura: "largura", profundidade: "espessura" };
const SEM = { proprio: null, subcategoria: null, categoria: null, efectiva: { eixos: null, eixos_origem: "automatico", ligacoes: null, ligacoes_origem: "automatico" } };
const comEixos = { proprio: { eixos: GUARDADOS, ligacoes: null, orfas: 0 }, subcategoria: null, categoria: null, efectiva: { eixos: GUARDADOS, eixos_origem: "produto", ligacoes: null, ligacoes_origem: "automatico" } };
const REAL = (p: Partial<FichaProdutoReal> = {}): FichaProdutoReal => ({ org: ORG, podeEditar: true, podeMudarPrecos: false, recarregar: vi.fn(async () => undefined), ...p });
const chamadasDe = (f: string) => base.chamadas.filter((c) => c.f === f);

beforeEach(() => { base.chamadas = []; base.responder = (f) => (f === "cat_ler_config_3d" ? { data: SEM, error: null } : { data: null, error: null }); });
afterEach(cleanup);

const abrir = async (o: { real?: FichaProdutoReal; modelo?: string; attrs?: AtributoProduto[] } = {}) => {
  render(<Modelo3DFicha produto={{ id: PID, n: "Coluna AXIS", modelo3d: o.modelo ?? "movel_lavatorio" }} real={o.real ?? REAL()} anunciar={vi.fn()} nome="Coluna AXIS" sub={null} no={null} arvore={[]} attrs={o.attrs ?? ATTRS} defs={DEFS} />);
  fireEvent.click(screen.getByRole("button", { name: "Ver em 3D" }));
  return screen.findByTestId("canvas3d");
};
const seletor = (rotulo: string) => screen.getByLabelText(new RegExp(`^${rotulo} =`)) as HTMLSelectElement;

describe("ler a configuração: uma vez, só ao abrir o 3D", () => {
  it("não lê nada enquanto o 3D está fechado; ao abrir lê com a organização, o alvo 'produto' e o id, uma só vez", async () => {
    render(<Modelo3DFicha produto={{ id: PID, n: "Coluna AXIS", modelo3d: "movel_lavatorio" }} real={REAL()} anunciar={vi.fn()} nome="Coluna AXIS" sub={null} no={null} arvore={[]} attrs={ATTRS} defs={DEFS} />);
    expect(chamadasDe("cat_ler_config_3d")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Ver em 3D" }));
    await screen.findByTestId("canvas3d");
    await waitFor(() => expect(chamadasDe("cat_ler_config_3d")).toHaveLength(1));
    expect(chamadasDe("cat_ler_config_3d")[0].a).toEqual({ p_org: ORG, p_alvo: "produto", p_id: PID });
  });
  it("os eixos guardados mandam na peça e o painel diz que estão guardados neste produto", async () => {
    base.responder = (f) => (f === "cat_ler_config_3d" ? { data: comEixos, error: null } : { data: null, error: null });
    const c = await abrir();
    await waitFor(() => expect(c.getAttribute("data-dim")).toBe("160x40x25"));
    expect(screen.getByText("Regra: guardada neste produto")).toBeTruthy();
  });
  it("REGRESSÃO: sem configuração nenhuma, o 3D é exactamente o de hoje (mesmas medidas e mesmas zonas que sem ler nada)", async () => {
    const c = await abrir();
    await waitFor(() => expect(chamadasDe("cat_ler_config_3d")).toHaveLength(1));
    const comConfig = [c.getAttribute("data-dim"), c.getAttribute("data-zonas")];
    cleanup();
    base.responder = () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.cat_ler_config_3d" } });
    const c2 = await abrir();
    await waitFor(() => expect(chamadasDe("cat_ler_config_3d")).toHaveLength(2));
    expect([c2.getAttribute("data-dim"), c2.getAttribute("data-zonas")]).toEqual(comConfig);
    expect(comConfig[0]).toBe("40x160x25");
  });
});

describe("a base sem a função, sem permissão ou com erro: o ecrã não rebenta", () => {
  it("função em falta (PGRST202): o painel é o de hoje, só para ver, sem erro escrito nem botões de gravar", async () => {
    base.responder = () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.cat_ler_config_3d" } });
    await abrir();
    await waitFor(() => expect(chamadasDe("cat_ler_config_3d")).toHaveLength(1));
    expect(screen.getByText(/a gravação vem na próxima fase/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Guardar neste produto|Guardar aspeto 3D|Guardar ligações/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Regras do produto" })).toBeNull();
    expect(screen.queryByText(/Não foi possível ler a configuração/)).toBeNull();
  });
  it("sem permissão para ler (CT001): fica escondido, sem erro", async () => {
    base.responder = () => ({ data: null, error: { code: "CT001", message: "Sem permissão." } });
    await abrir();
    await waitFor(() => expect(chamadasDe("cat_ler_config_3d")).toHaveLength(1));
    expect(screen.queryByRole("heading", { name: "Regras do produto" })).toBeNull();
    expect(screen.queryByText(/Não foi possível ler a configuração/)).toBeNull();
  });
  it("outro erro: uma frase em português a dizer que o 3D usa a regra automática (nunca o erro em bruto)", async () => {
    base.responder = () => ({ data: null, error: { code: "XX000", message: "internal server error" } });
    await abrir();
    expect(await screen.findByText(/Não foi possível ler a configuração 3D/)).toBeTruthy();
    expect(screen.queryByText(/internal server error/)).toBeNull();
  });
});

describe("guardar os eixos", () => {
  it("chama cat_definir_config_3d (org, alvo, id, eixos, ligações) uma vez, relê a configuração e anuncia", async () => {
    let lidas = 0;
    base.responder = (f) => {
      if (f === "cat_ler_config_3d") { lidas += 1; return { data: lidas === 1 ? SEM : comEixos, error: null }; }
      if (f === "cat_definir_config_3d") return { data: { alvo: "produto", id: PID, eixos: GUARDADOS, ligacoes: null, anterior: { eixos: null, ligacoes: null } }, error: null };
      return { data: null, error: null };
    };
    const c = await abrir();
    await waitFor(() => expect(chamadasDe("cat_ler_config_3d")).toHaveLength(1));
    fireEvent.change(seletor("Largura"), { target: { value: "comprimento" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar neste produto" }));
    await waitFor(() => expect(chamadasDe("cat_definir_config_3d")).toHaveLength(1));
    expect(chamadasDe("cat_definir_config_3d")[0].a).toEqual({ p_org: ORG, p_alvo: "produto", p_id: PID, p_eixos: GUARDADOS, p_ligacoes: null });
    await screen.findByText("Eixos guardados neste produto.");
    expect(chamadasDe("cat_ler_config_3d")).toHaveLength(2);
    await waitFor(() => expect(screen.getByText("Regra: guardada neste produto")).toBeTruthy());
    expect(c.getAttribute("data-dim")).toBe("160x40x25");
  });
  it("guardar os eixos mantém as ligações que o produto já tinha (a base recebe os dois como estado final)", async () => {
    const lig = [{ atributo: A_FRENTE, zona: "frente", aplicar: true }];
    base.responder = (f) => (f === "cat_ler_config_3d" ? { data: { ...SEM, proprio: { eixos: null, ligacoes: lig, orfas: 0 }, efectiva: { eixos: null, eixos_origem: "automatico", ligacoes: lig, ligacoes_origem: "produto" } }, error: null }
      : f === "cat_definir_config_3d" ? { data: { alvo: "produto", id: PID }, error: null } : { data: null, error: null });
    await abrir();
    await waitFor(() => expect(chamadasDe("cat_ler_config_3d")).toHaveLength(1));
    await screen.findByRole("heading", { name: "Regras do produto" });
    fireEvent.change(seletor("Largura"), { target: { value: "comprimento" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar neste produto" }));
    await waitFor(() => expect(chamadasDe("cat_definir_config_3d")).toHaveLength(1));
    expect(chamadasDe("cat_definir_config_3d")[0].a).toMatchObject({ p_ligacoes: lig });
  });
  it("a recusa da base (CT001) aparece como alerta em português", async () => {
    base.responder = (f) => (f === "cat_ler_config_3d" ? { data: SEM, error: null } : { data: null, error: { code: "CT001", message: "Sem permissão para gravar a configuração 3D." } });
    await abrir();
    await screen.findByRole("button", { name: "Guardar neste produto" });
    fireEvent.change(seletor("Largura"), { target: { value: "comprimento" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar neste produto" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Sem permissão para gravar a configuração 3D.");
  });
  it("sem products.edit: lê e usa a configuração, mas não há botões de gravar", async () => {
    base.responder = (f) => (f === "cat_ler_config_3d" ? { data: comEixos, error: null } : { data: null, error: null });
    const c = await abrir({ real: REAL({ podeEditar: false }) });
    await waitFor(() => expect(c.getAttribute("data-dim")).toBe("160x40x25"));
    expect(screen.queryByRole("button", { name: /Guardar neste produto|Voltar a herdar|Guardar aspeto 3D|Guardar ligações/ })).toBeNull();
  });
});

describe("as ligações atributo → zona", () => {
  const ligacoes = [{ atributo: A_FRENTE, zona: "pes", aplicar: true }];
  const comLigacoes = { ...SEM, proprio: { eixos: null, ligacoes, orfas: 0 }, efectiva: { eixos: null, eixos_origem: "automatico", ligacoes, ligacoes_origem: "produto" } };
  const MODULO: AtributoProduto[] = [{ atributoId: A_MED, medida: { tipo: "3D", largura: 120, comprimento: 80, espessura: 75, unidade: "cm" } }, ATTRS[1], ATTRS[2]];
  const zonasDe = (c: HTMLElement) => JSON.parse(c.getAttribute("data-zonas") || "{}") as { zonas: Record<string, { atributo: string }> };

  it("a ligação guardada manda sobre o nome: a «Cor da frente» pinta os pés e já não a frente", async () => {
    base.responder = (f) => (f === "cat_ler_config_3d" ? { data: comLigacoes, error: null } : { data: null, error: null });
    const c = await abrir({ modelo: "modulo_base", attrs: MODULO });
    await waitFor(() => expect(zonasDe(c).zonas.pes?.atributo).toBe("Cor da frente"));
    expect(zonasDe(c).zonas.corpo?.atributo).toBe("Cor do corpo");
  });
  it("mudar a ligação no painel muda o 3D logo (sem gravar) e só então «Guardar aspeto 3D» grava, uma vez, com os eixos do produto", async () => {
    base.responder = (f) => (f === "cat_ler_config_3d" ? { data: comLigacoes, error: null } : f === "cat_definir_config_3d" ? { data: { alvo: "produto", id: PID }, error: null } : { data: null, error: null });
    const c = await abrir({ modelo: "maquina_roupa", attrs: MODULO });
    await waitFor(() => expect(zonasDe(c).zonas.pes?.atributo).toBe("Cor da frente"));
    const grupo = screen.getByRole("group", { name: "Regra 1" });
    fireEvent.change(within(grupo).getByLabelText("Zona"), { target: { value: "tampo" } });
    await waitFor(() => expect(zonasDe(c).zonas.tampo?.atributo).toBe("Cor da frente"));
    expect(chamadasDe("cat_definir_config_3d")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Guardar aspeto 3D" }));
    await waitFor(() => expect(chamadasDe("cat_definir_config_3d")).toHaveLength(1));
    expect(chamadasDe("cat_definir_config_3d")[0].a).toEqual({ p_org: ORG, p_alvo: "produto", p_id: PID, p_eixos: null, p_ligacoes: [{ atributo: A_FRENTE, zona: "tampo", aplicar: true }] });
  });
  it("«Aplicar: não» tira o atributo da zona: sem a ligação, a «Cor da frente» deixa de pintar a frente", async () => {
    const lig = [{ atributo: A_FRENTE, zona: "frente", aplicar: false }];
    base.responder = (f) => (f === "cat_ler_config_3d" ? { data: { ...SEM, proprio: { eixos: null, ligacoes: lig, orfas: 0 }, efectiva: { eixos: null, eixos_origem: "automatico", ligacoes: lig, ligacoes_origem: "produto" } }, error: null } : { data: null, error: null });
    const c = await abrir({ modelo: "movel_lavatorio", attrs: ATTRS });
    await waitFor(() => expect(zonasDe(c).zonas.frente?.atributo).toBe("Cor do corpo"));
  });
});

describe("25/11: a configuração manda para QUALQUER atributo (também o de nome desconhecido) e os nomes conhecidos podem desligar-se", () => {
  const A_COR = "aaaaaaaa-0000-4000-a000-000000000021", A_PUX = "aaaaaaaa-0000-4000-a000-000000000022";
  const hex = (id: string, nome: string, codigo: string, h: string): AtributoDef => ({ id, codigo, nome, tipo: "lista", temHex: true, ordem: 2, opcoes: [{ id: `${id}-1`, valor: nome, nome, hex: h, ordem: 1 }] });
  const DEFS2: AtributoDef[] = [DEFS[0], hex(A_COR, "Cor", "cor", "#ffffff"), hex(A_PUX, "Puxador", "puxador", "#111111")];
  const ATTRS2: AtributoProduto[] = [ATTRS[0], { atributoId: A_COR, opcaoId: `${A_COR}-1`, valor: "Cor" }, { atributoId: A_PUX, opcaoId: `${A_PUX}-1`, valor: "Puxador" }];
  const com = (lig: { atributo: string; zona: string; aplicar: boolean }[]) => ({ ...SEM, proprio: { eixos: null, ligacoes: lig, orfas: 0 }, efectiva: { eixos: null, eixos_origem: "automatico", ligacoes: lig, ligacoes_origem: "produto" } });
  const abrir2 = async () => {
    render(<Modelo3DFicha produto={{ id: PID, n: "Coluna AXIS", modelo3d: "movel_lavatorio" }} real={REAL()} anunciar={vi.fn()} nome="Coluna AXIS" sub={null} no={null} arvore={[]} attrs={ATTRS2} defs={DEFS2} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver em 3D" }));
    const c = await screen.findByTestId("canvas3d");
    await waitFor(() => expect(chamadasDe("cat_ler_config_3d")).toHaveLength(1));
    return c;
  };
  it("sem configuração o Puxador (nome desconhecido) não pinta: a cor única é a da «Cor»; o painel mostra-o desligado por omissão", async () => {
    const c = await abrir2();
    await waitFor(() => expect(c.getAttribute("data-cor")).toBe("#ffffff"));
    expect(screen.getByText("Puxador", { selector: "strong" }).closest("li")?.textContent).toContain("desligado por omissão");
    expect(screen.getByText("Cor", { selector: "strong" }).closest("li")?.textContent).toContain("aplicado por omissão");
  });
  it("com o Puxador ligado a «Tudo», pinta tudo: a cor única passa a ser a dele", async () => {
    base.responder = (f) => (f === "cat_ler_config_3d" ? { data: com([{ atributo: A_PUX, zona: "tudo", aplicar: true }]), error: null } : { data: null, error: null });
    const c = await abrir2();
    await waitFor(() => expect(c.getAttribute("data-cor")).toBe("#111111"));
  });
  it("com o Puxador ligado só ao tampo, as zonas diferem e o Puxador pinta o tampo", async () => {
    base.responder = (f) => (f === "cat_ler_config_3d" ? { data: com([{ atributo: A_PUX, zona: "tampo", aplicar: true }]), error: null } : { data: null, error: null });
    const c = await abrir2();
    await waitFor(() => expect(JSON.parse(c.getAttribute("data-zonas") || "{}").zonas?.tampo?.cor).toBe("#111111"));
    expect(JSON.parse(c.getAttribute("data-zonas")!).zonas.corpo.cor).toBe("#ffffff");
  });
  it("a «Cor» desligada («Tudo», aplicar não): o nome conhecido deixa de pintar (nem zonas nem cor única)", async () => {
    base.responder = (f) => (f === "cat_ler_config_3d" ? { data: com([{ atributo: A_COR, zona: "tudo", aplicar: false }]), error: null } : { data: null, error: null });
    const c = await abrir2();
    // fica a cor do próprio modelo (nem a «Cor» branca nem o Puxador, que não é «o único atributo de cor» só por a «Cor» estar desligada)
    await waitFor(() => expect(c.getAttribute("data-cor")).not.toBe("#ffffff"));
    expect(c.getAttribute("data-cor")).not.toBe("#111111");
    expect(c.getAttribute("data-zonas")).toBe("");
  });
});

describe("25/11: uma ligação já gravada a um atributo de lista que não pinta aparece com o nome dele", () => {
  const A_COR = "aaaaaaaa-0000-4000-a000-000000000041", A_MARCA = "aaaaaaaa-0000-4000-a000-000000000042", A_FANTASMA = "aaaaaaaa-0000-4000-a000-0000000000ff";
  const DEFS3: AtributoDef[] = [
    DEFS[0],
    { id: A_COR, codigo: "cor", nome: "Cor", tipo: "lista", temHex: true, ordem: 2, opcoes: [{ id: `${A_COR}-1`, valor: "Branco", nome: "Branco", hex: "#ffffff", ordem: 1 }] },
    { id: A_MARCA, codigo: "marca", nome: "Marca", tipo: "lista", temHex: false, ordem: 3, opcoes: [{ id: `${A_MARCA}-1`, valor: "Roca", nome: "Roca", hex: null, ordem: 1 }] },
  ];
  const abrir3 = async (lig: { atributo: string; zona: string; aplicar: boolean }[], attrs: AtributoProduto[] = [ATTRS[0]]) => {
    base.responder = (f) => (f === "cat_ler_config_3d" ? { data: { ...SEM, proprio: { eixos: null, ligacoes: lig, orfas: 0 }, efectiva: { eixos: null, eixos_origem: "automatico", ligacoes: lig, ligacoes_origem: "produto" } }, error: null } : { data: null, error: null });
    render(<Modelo3DFicha produto={{ id: PID, n: "Coluna AXIS", modelo3d: "movel_lavatorio" }} real={REAL()} anunciar={vi.fn()} nome="Coluna AXIS" sub={null} no={null} arvore={[]} attrs={attrs} defs={DEFS3} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver em 3D" }));
    await screen.findByTestId("canvas3d");
    await waitFor(() => expect(chamadasDe("cat_ler_config_3d")).toHaveLength(1));
  };
  it("a ligação à «Marca» (lista sem cor, foto nem aspeto) que o produto TEM mostra «Marca» no seletor, e não «Atributo desconhecido»", async () => {
    await abrir3([{ atributo: A_MARCA, zona: "tudo", aplicar: false }], [ATTRS[0], { atributoId: A_MARCA, opcaoId: `${A_MARCA}-1`, valor: "Roca" }]);
    const sel = await screen.findByLabelText("Atributo") as HTMLSelectElement;
    expect(sel.value).toBe(A_MARCA);
    expect(within(sel).getByRole("option", { name: "Marca" })).toBeTruthy();
    expect(within(sel).queryByRole("option", { name: "Atributo desconhecido" })).toBeNull();
  });
  it("26/11: a ligação à «Marca» num produto que já não a tem aparece com o nome e marcada («o produto já não tem este atributo»), para a poder remover", async () => {
    await abrir3([{ atributo: A_MARCA, zona: "tudo", aplicar: false }]);
    const sel = await screen.findByLabelText("Atributo") as HTMLSelectElement;
    expect(sel.value).toBe(A_MARCA);
    expect(within(sel).getByRole("option", { name: "Marca (o produto já não tem este atributo)" })).toBeTruthy();
    expect(within(sel).queryByRole("option", { name: "Atributo desconhecido" })).toBeNull();
  });
  it("uma ligação a um atributo que já nem existe continua «Atributo desconhecido»", async () => {
    await abrir3([{ atributo: A_FANTASMA, zona: "tudo", aplicar: false }]);
    const sel = await screen.findByLabelText("Atributo") as HTMLSelectElement;
    expect(within(sel).getByRole("option", { name: "Atributo desconhecido (o produto já não tem este atributo)" })).toBeTruthy();
  });
});
