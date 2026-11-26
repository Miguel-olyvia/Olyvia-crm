// 26/11: o painel «Aspeto 3D»: UM só sítio para ligar e escolher o que pinta cada zona (cor e superfície), com o «Porquê», as regras do produto e um só «Guardar». Testes de integração pela ficha do
// produto (Modelo3DFicha), com o Visualizador3D simulado (jsdom não tem WebGL): o que o 3D recebe está nos `data-*`. Cada teste é um comportamento que o dono vê:
// a Tonalidade aparece onde se escolhe, uma regra «Todas as zonas» diz o que faz às outras, o conflito entre atributos diz quem ganha (o mesmo que o 3D pinta) e resolve-se ali mesmo.
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
    descricao: string; zonaRealcada?: string | readonly string[] | null; aoClicarZona?: (z: string | null) => void; aoPassarZona?: (z: string | null) => void;
    modelos: Record<string, { mockup3d: { zonas?: unknown } }>; espaco: { pecas: { produtoId: string }[] };
  }) => {
    const m = p.modelos[p.espaco.pecas[0].produtoId];
    const realce = Array.isArray(p.zonaRealcada) ? p.zonaRealcada.join(",") : (p.zonaRealcada as string | null | undefined) ?? "";
    return (
      <div data-testid="canvas3d" role="img" aria-label={p.descricao} data-zonas={m.mockup3d.zonas ? JSON.stringify(m.mockup3d.zonas) : ""} data-realce={realce}>
        <button type="button" data-testid="clicar-frente" onClick={() => p.aoClicarZona?.("frente")} />
        <button type="button" data-testid="clicar-corpo" onClick={() => p.aoClicarZona?.("corpo")} />
        <button type="button" data-testid="clicar-fora" onClick={() => p.aoClicarZona?.(null)} />
      </div>
    );
  },
}));

import { Modelo3DFicha } from "./Modelo3DFicha";
import type { FichaProdutoReal } from "./fichaProdutoDados";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33", PID = "11111111-2222-4333-8444-555555555555";
const A_MED = "aaaaaaaa-0000-4000-a000-000000000002", A_FRENTE = "aaaaaaaa-0000-4000-a000-000000000011", A_CORPO = "aaaaaaaa-0000-4000-a000-000000000012";
const A_TONAL = "aaaaaaaa-0000-4000-a000-000000000017", A_BRILHO = "aaaaaaaa-0000-4000-a000-000000000016";
const cor = (id: string, nome: string, codigo: string, hex: string): AtributoDef => ({ id, codigo, nome, tipo: "lista", temHex: true, ordem: 2, opcoes: [{ id: `${id}-1`, valor: nome, nome: `${nome} escolhida`, hex, ordem: 1 }] });
const superficie = (id: string, nome: string, s: "mate" | "polida"): AtributoDef => ({ id, codigo: nome.toLowerCase(), nome, tipo: "lista", temHex: false, temAspeto: true, ordem: 3, opcoes: [{ id: `${id}-1`, valor: nome, nome: `${nome} escolhida`, hex: null, ordem: 1, superficie: s }] });
const MEDIDA: AtributoDef = { id: A_MED, codigo: "medida", nome: "Medida", tipo: "medida", temHex: false, ordem: 1, opcoes: [] };
// a ordem das definições decide entre atributos: corpo, frente, Tonalidade, Brilho
const DEFS: AtributoDef[] = [MEDIDA, cor(A_CORPO, "Cor do corpo", "cor_corpo", "#111111"), cor(A_FRENTE, "Cor da frente", "cor_frente", "#eeeeee"), superficie(A_TONAL, "Tonalidade", "mate"), superficie(A_BRILHO, "Brilho", "polida")];
const MED: AtributoProduto = { atributoId: A_MED, medida: { tipo: "3D", largura: 40, comprimento: 160, espessura: 25, unidade: "cm" } };
const doProduto = (...ids: string[]): AtributoProduto[] => [MED, ...ids.map((id) => ({ atributoId: id, opcaoId: `${id}-1`, valor: id }))];
const COR_E_TONAL = doProduto(A_CORPO, A_FRENTE, A_TONAL);
const SEM = { proprio: null, subcategoria: null, categoria: null, efectiva: { eixos: null, eixos_origem: "automatico", ligacoes: null, ligacoes_origem: "automatico" } };
type Regra = { atributo: string; zona: string; aplicar: boolean };
const comLigacoes = (lig: Regra[]) => ({ ...SEM, proprio: { eixos: null, ligacoes: lig, orfas: 0 }, efectiva: { eixos: null, eixos_origem: "automatico", ligacoes: lig, ligacoes_origem: "produto" } });
const REAL = (p: Partial<FichaProdutoReal> = {}): FichaProdutoReal => ({ org: ORG, podeEditar: true, podeMudarPrecos: false, recarregar: vi.fn(async () => undefined), ...p });
const chamadasDe = (f: string) => base.chamadas.filter((c) => c.f === f);

/** A base com as regras guardadas dadas; «gravar» passa a devolver o que se gravou (como a base real). */
const baseCom = (guardadas: Regra[] | null, falhaAoGravar?: string) => {
  let atual = guardadas;
  base.responder = (f, a) => {
    if (f === "cat_ler_config_3d") return { data: atual ? comLigacoes(atual) : SEM, error: null };
    if (f === "cat_definir_config_3d") {
      if (falhaAoGravar) return { data: null, error: { code: "CT001", message: falhaAoGravar } };
      atual = a.p_ligacoes as Regra[] | null;
      return { data: { alvo: "produto", id: PID }, error: null };
    }
    return { data: null, error: null };
  };
};
beforeEach(() => { base.chamadas = []; baseCom(null); });
afterEach(cleanup);

const abrir = async (o: { real?: FichaProdutoReal; attrs?: AtributoProduto[] } = {}) => {
  render(<Modelo3DFicha produto={{ id: PID, n: "Móvel", modelo3d: "movel_lavatorio" }} real={o.real ?? REAL()} anunciar={vi.fn()} nome="Móvel" sub={null} no={null} arvore={[]} attrs={o.attrs ?? COR_E_TONAL} defs={DEFS} />);
  fireEvent.click(screen.getByRole("button", { name: "Ver em 3D" }));
  const c = await screen.findByTestId("canvas3d");
  await waitFor(() => expect(chamadasDe("cat_ler_config_3d")).toHaveLength(1));
  await screen.findByRole("heading", { name: "Aspeto 3D" });
  return c;
};
type ZonaVisual = { atributo: string; acabamento?: string; material?: { roughness: number } };
const zonasDe = (c: HTMLElement) => (JSON.parse(c.getAttribute("data-zonas") || "{}") as { zonas: Record<string, ZonaVisual> }).zonas ?? {};
const painel = () => screen.getByRole("region", { name: /^Zona: / });
const clicar = (zona: string) => fireEvent.click(screen.getByTestId(`clicar-${zona}`));
const camada = (nome: "Cor desta zona" | "Superfície desta zona") => within(painel()).getByRole("group", { name: nome });
const marcado = (g: HTMLElement) => within(g).getAllByRole("radio").filter((r) => (r as HTMLInputElement).checked).map((r) => (r.closest("label")?.textContent ?? "").replace(/\s+/g, " ").trim());
const regras = () => screen.getAllByRole("group", { name: /^Regra \d+$/ });
const guardar = () => screen.getByRole("button", { name: "Guardar aspeto 3D" });

describe("1. a Tonalidade aparece onde se escolhe (e não em «Cor desta zona»)", () => {
  it("com «Tonalidade → Todas as zonas» guardada, a zona Corpo mostra a Tonalidade escolhida na Superfície e diz de onde vem", async () => {
    baseCom([{ atributo: A_TONAL, zona: "tudo", aplicar: true }]);
    await abrir();
    clicar("corpo");
    expect(marcado(camada("Superfície desta zona"))).toEqual([expect.stringContaining("Tonalidade")]);
    expect(within(painel()).getByText("Porquê: vem da regra «Tonalidade → Todas as zonas».")).toBeTruthy();
    // a Tonalidade não dá cor: não está na camada «Cor»
    expect(within(camada("Cor desta zona")).queryByText("Tonalidade", { selector: "strong" })).toBeNull();
    expect(within(camada("Superfície desta zona")).getByText(/A superfície muda o brilho e o tom por cima da cor/)).toBeTruthy();
  });
  it("sem regras, a Superfície está em «Automático» e o Porquê diz que a Tonalidade dá a superfície a todas as zonas", async () => {
    await abrir();
    clicar("frente");
    expect(marcado(camada("Superfície desta zona"))).toEqual(["Automático"]);
    expect(within(painel()).getByText("Porquê: automático: «Tonalidade» dá a superfície a todas as zonas.")).toBeTruthy();
  });
  it("um produto sem atributos de superfície não mostra o bloco «Superfície»", async () => {
    await abrir({ attrs: doProduto(A_CORPO, A_FRENTE) });
    clicar("frente");
    expect(within(painel()).queryByRole("group", { name: "Superfície desta zona" })).toBeNull();
    expect(within(painel()).getByRole("group", { name: "Cor desta zona" })).toBeTruthy();
  });
  // verificação ao vivo (26/11): acrescentar «Tonalidade → Todas as zonas» tirava a «Cor desta zona» de «Automático» e o «Pinta-a hoje» passava de «por omissão» a «por ligação»
  it("uma regra de superfície («Tonalidade → Todas as zonas») não mexe na camada Cor: continua «Automático», «por omissão» e sem aviso", async () => {
    await abrir();
    clicar("corpo");
    const antesCor = marcado(camada("Cor desta zona"));
    const antesHoje = within(painel()).getByText(/^Pinta-a hoje:/).textContent;
    const antesPorque = within(painel()).getByText(/^Porquê: automático: o atributo/).textContent;
    expect(antesCor).toEqual([expect.stringContaining("Automático")]);
    expect(antesHoje).toContain("por omissão");
    // acrescenta a regra pelo próprio painel (a mesma via do dono), escolhendo a Tonalidade
    fireEvent.click(screen.getByRole("button", { name: "Acrescentar regra" }));
    const nova = regras()[0];
    fireEvent.change(within(nova).getByLabelText("Atributo"), { target: { value: A_TONAL } });
    fireEvent.change(within(nova).getByLabelText(/^Zona/), { target: { value: "tudo" } });
    expect(marcado(camada("Cor desta zona"))).toEqual(antesCor);
    expect(within(camada("Cor desta zona")).queryByText(/já não tem/)).toBeNull();
    expect(within(painel()).getByText(/^Pinta-a hoje:/).textContent).toContain("por omissão");
    expect(within(painel()).getByText(/^Pinta-a hoje:/).textContent).not.toContain("por ligação");
    expect(within(painel()).getByText(/^Porquê: automático: o atributo/).textContent).toBe(antesPorque);
    // a superfície, essa, passou a vir da regra
    expect(marcado(camada("Superfície desta zona"))).toEqual([expect.stringContaining("Tonalidade")]);
  });
});

// revisão independente (26/11): a regra «Tonalidade → Todas as zonas» herdada da categoria, num produto SEM valor em Tonalidade (o atributo fica `fora`): continua a ser uma regra de superfície
describe("1b. uma regra de superfície a um atributo que o produto não tem escolhido não mexe na camada Cor", () => {
  const SEM_TONAL = () => doProduto(A_CORPO, A_FRENTE);
  it("a Cor desta zona continua «Automático», sem o aviso «já não tem», e o «Pinta-a hoje» continua «por omissão»", async () => {
    baseCom([{ atributo: A_TONAL, zona: "tudo", aplicar: true }]);
    await abrir({ attrs: SEM_TONAL() });
    clicar("corpo");
    expect(marcado(camada("Cor desta zona"))).toEqual([expect.stringContaining("Automático")]);
    expect(within(camada("Cor desta zona")).queryByText(/já não tem/)).toBeNull();
    expect(within(painel()).getByText(/^Pinta-a hoje:/).textContent).toContain("por omissão");
    expect(within(painel()).getByText(/^Pinta-a hoje:/).textContent).not.toContain("por ligação");
  });
  it("escolher uma cor nessa zona não exclui a regra de superfície dela (nem a grava como «não pinta»)", async () => {
    baseCom([{ atributo: A_TONAL, zona: "tudo", aplicar: true }]);
    await abrir({ attrs: SEM_TONAL() });
    clicar("corpo");
    fireEvent.click(within(camada("Cor desta zona")).getByRole("radio", { name: /Cor da frente/ }));
    fireEvent.click(guardar());
    await waitFor(() => expect(chamadasDe("cat_definir_config_3d")).toHaveLength(1));
    const a = chamadasDe("cat_definir_config_3d")[0].a as { p_ligacoes: Regra[] };
    expect(a.p_ligacoes).toEqual(expect.arrayContaining([{ atributo: A_TONAL, zona: "tudo", aplicar: true }]));
    expect(a.p_ligacoes.filter((l) => l.atributo === A_TONAL && l.zona === "corpo")).toEqual([]);
  });
});

describe("2. uma regra «Todas as zonas» diz o que faz às outras, e a excepção cria-se ali mesmo", () => {
  it("«Só esta zona é diferente» cria a excepção só nessa zona; as outras continuam a vir da regra «Todas as zonas»", async () => {
    baseCom([{ atributo: A_TONAL, zona: "tudo", aplicar: true }]);
    const c = await abrir();
    clicar("frente");
    fireEvent.click(within(painel()).getByRole("button", { name: "Só esta zona é diferente" }));
    // a excepção está nas regras (Tonalidade · Frente · Não pinta) e a zona di-lo
    expect(within(painel()).getByText(/Excepção: nesta zona «Tonalidade» não pinta \(a regra «Todas as zonas» manda nas outras\)\./)).toBeTruthy();
    const excecao = regras().find((g) => (within(g).getByLabelText(/^Zona/) as HTMLSelectElement).value === "frente")!;
    expect((within(excecao).getByLabelText("Atributo") as HTMLSelectElement).value).toBe(A_TONAL);
    expect(within(excecao).getByRole("switch", { name: "Pinta" }).getAttribute("aria-checked")).toBe("false");
    await waitFor(() => expect(zonasDe(c).frente?.acabamento).toBeUndefined());
    expect(chamadasDe("cat_definir_config_3d")).toHaveLength(0);
    // o corpo continua a vir da regra
    clicar("corpo");
    expect(within(painel()).getByText("Porquê: vem da regra «Tonalidade → Todas as zonas».")).toBeTruthy();
    expect(zonasDe(c).corpo?.acabamento).toBe("Tonalidade");
  });
  it("a regra «Todas as zonas» mostra «sem efeito aqui: Frente» (texto com ícone) quando há excepção na frente", async () => {
    baseCom([{ atributo: A_TONAL, zona: "tudo", aplicar: true }, { atributo: A_TONAL, zona: "frente", aplicar: false }]);
    await abrir();
    const cabeca = regras().find((g) => (within(g).getByLabelText(/^Zona/) as HTMLSelectElement).value === "tudo")!;
    expect(within(cabeca).getByText("sem efeito aqui: Frente")).toBeTruthy();
    const excecao = regras().find((g) => (within(g).getByLabelText(/^Zona/) as HTMLSelectElement).value === "frente")!;
    expect(within(excecao).queryByText(/sem efeito aqui/)).toBeNull();
  });
  it("uma cor em «Todas as zonas» diz «vem da regra» na cor da zona (a Tonalidade não se mistura)", async () => {
    baseCom([{ atributo: A_CORPO, zona: "tudo", aplicar: true }]);
    await abrir();
    clicar("frente");
    expect(within(painel()).getByText("Porquê: vem da regra «Cor do corpo → Todas as zonas».")).toBeTruthy();
  });
});

describe("3. escolher a superfície de uma zona", () => {
  it("escolher «Brilho» na Superfície da Frente muda o 3D logo (sem gravar) e as Regras mostram a excepção da Tonalidade na frente", async () => {
    baseCom([{ atributo: A_TONAL, zona: "tudo", aplicar: true }]);
    const c = await abrir({ attrs: doProduto(A_CORPO, A_FRENTE, A_TONAL, A_BRILHO) });
    clicar("frente");
    fireEvent.click(within(camada("Superfície desta zona")).getByRole("radio", { name: /Brilho/ }));
    await waitFor(() => expect(zonasDe(c).frente?.acabamento).toBe("Brilho"));
    expect(zonasDe(c).frente?.material?.roughness).toBeLessThan(0.3); // polida
    expect(chamadasDe("cat_definir_config_3d")).toHaveLength(0);
    const excecao = regras().find((g) => (within(g).getByLabelText("Atributo") as HTMLSelectElement).value === A_TONAL && (within(g).getByLabelText(/^Zona/) as HTMLSelectElement).value === "frente");
    expect(excecao).toBeTruthy();
    expect(within(excecao!).getByRole("switch", { name: "Pinta" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Frente: superfície Brilho")).toBeTruthy();
  });
  it("«Sem cor» não muda a superfície mostrada nem o seu «Porquê»", async () => {
    baseCom([{ atributo: A_TONAL, zona: "tudo", aplicar: true }]);
    const c = await abrir();
    clicar("frente");
    const antes = marcado(camada("Superfície desta zona"));
    fireEvent.click(within(camada("Cor desta zona")).getByRole("radio", { name: /Sem cor/ }));
    await waitFor(() => expect(zonasDe(c).frente?.atributo).not.toBe("Cor da frente"));
    expect(marcado(camada("Superfície desta zona"))).toEqual(antes);
    expect(within(painel()).getByText("Porquê: vem da regra «Tonalidade → Todas as zonas».")).toBeTruthy();
    expect(zonasDe(c).frente?.acabamento).toBe("Tonalidade");
  });
  it("«Sem superfície» tira a superfície dos atributos nessa zona e não toca nas outras zonas", async () => {
    baseCom([{ atributo: A_TONAL, zona: "tudo", aplicar: true }]);
    const c = await abrir();
    clicar("frente");
    fireEvent.click(within(camada("Superfície desta zona")).getByRole("radio", { name: /Sem superfície/ }));
    await waitFor(() => expect(zonasDe(c).frente?.acabamento).toBeUndefined());
    expect(zonasDe(c).corpo?.acabamento).toBe("Tonalidade");
  });
});

describe("4. conflito entre atributos: o painel diz quem ganha (o mesmo que o 3D) e resolve-se ali mesmo", () => {
  const CONFLITO: Regra[] = [{ atributo: A_CORPO, zona: "tudo", aplicar: true }, { atributo: A_FRENTE, zona: "frente", aplicar: true }];
  it("cor A em «Todas as zonas» e cor B só na frente, sem excepção: aviso com o vencedor que o 3D pinta; «Dar prioridade» faz o 3D pintar B e o aviso desaparece", async () => {
    baseCom(CONFLITO);
    const c = await abrir();
    clicar("frente");
    expect(zonasDe(c).frente?.atributo).toBe("Cor do corpo"); // o que o 3D pinta (vem primeiro nas definições)
    const aviso = within(painel()).getByText(/duas regras pintam esta zona: «Cor do corpo» \(todas as zonas\) e «Cor da frente» \(só esta zona\)\. Hoje ganha «Cor do corpo»/);
    expect(aviso).toBeTruthy();
    fireEvent.click(within(painel()).getByRole("button", { name: "Dar prioridade a Cor da frente nesta zona" }));
    await waitFor(() => expect(zonasDe(c).frente?.atributo).toBe("Cor da frente"));
    expect(within(painel()).queryByText(/duas regras pintam esta zona/)).toBeNull();
    expect(within(painel()).getByText("Porquê: ligação directa: «Cor da frente» está ligado a esta zona.")).toBeTruthy();
    // o corpo continua com a cor do corpo
    expect(zonasDe(c).corpo?.atributo).toBe("Cor do corpo");
  });
  it("o aviso leva ícone e texto (não só cor)", async () => {
    baseCom(CONFLITO);
    await abrir();
    clicar("frente");
    const aviso = within(painel()).getByText(/duas regras pintam esta zona/).closest("p")!;
    expect(aviso.querySelector("svg")).toBeTruthy();
    expect(aviso.parentElement?.className).toContain("amber");
  });
});

describe("5. um só «Guardar», «Descartar» e o estado", () => {
  it("o estado passa de «Guardado» a «Por guardar: N alterações»; um só «Guardar aspeto 3D» grava uma vez, anuncia «Regras guardadas.» e volta a «Guardado»", async () => {
    baseCom([{ atributo: A_TONAL, zona: "tudo", aplicar: true }]);
    await abrir();
    expect(screen.getByText("Guardado")).toBeTruthy();
    expect(guardar().getAttribute("aria-disabled")).toBe("true");
    clicar("frente");
    fireEvent.click(within(painel()).getByRole("button", { name: "Só esta zona é diferente" }));
    expect(screen.getByText("Por guardar: 1 alteração")).toBeTruthy();
    expect(guardar().getAttribute("aria-disabled")).toBe("false");
    fireEvent.click(guardar());
    await waitFor(() => expect(chamadasDe("cat_definir_config_3d")).toHaveLength(1));
    const a = chamadasDe("cat_definir_config_3d")[0].a as { p_ligacoes: Regra[] };
    expect(a.p_ligacoes).toEqual(expect.arrayContaining([{ atributo: A_TONAL, zona: "frente", aplicar: false }]));
    const viva = await screen.findByText("Regras guardadas.");
    expect(viva.getAttribute("aria-live")).toBe("polite");
    await waitFor(() => expect(screen.getByText("Guardado")).toBeTruthy());
    expect(chamadasDe("cat_definir_config_3d")).toHaveLength(1);
  });
  it("«Descartar» repõe o guardado e o 3D volta ao de antes", async () => {
    baseCom([{ atributo: A_TONAL, zona: "tudo", aplicar: true }]);
    const c = await abrir({ attrs: doProduto(A_CORPO, A_FRENTE, A_TONAL, A_BRILHO) });
    const antes = zonasDe(c).frente?.acabamento;
    clicar("frente");
    fireEvent.click(within(camada("Superfície desta zona")).getByRole("radio", { name: /Brilho/ }));
    await waitFor(() => expect(zonasDe(c).frente?.acabamento).toBe("Brilho"));
    const descartar = screen.getByRole("button", { name: "Descartar" });
    expect(descartar.getAttribute("aria-disabled")).toBe("false");
    fireEvent.click(descartar);
    await waitFor(() => expect(zonasDe(c).frente?.acabamento).toBe(antes));
    expect(screen.getByText("Guardado")).toBeTruthy();
    expect(descartar.getAttribute("aria-disabled")).toBe("true");
    expect(chamadasDe("cat_definir_config_3d")).toHaveLength(0);
  });
  it("erro ao gravar: aparece um alerta, o rascunho e o 3D mantêm-se e o estado continua «Por guardar»", async () => {
    baseCom([{ atributo: A_TONAL, zona: "tudo", aplicar: true }], "Sem permissão para gravar a configuração 3D.");
    const c = await abrir();
    clicar("frente");
    fireEvent.click(within(painel()).getByRole("button", { name: "Só esta zona é diferente" }));
    await waitFor(() => expect(zonasDe(c).frente?.acabamento).toBeUndefined());
    fireEvent.click(guardar());
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain("Sem permissão para gravar a configuração 3D.");
    expect(alerta.textContent).toContain("As alterações continuam aqui; tenta outra vez.");
    expect(screen.getByText("Por guardar: 1 alteração")).toBeTruthy();
    expect(zonasDe(c).frente?.acabamento).toBeUndefined();
  });
  it("regra repetida: o erro aparece junto da regra (alerta) e «Guardar» fica desactivado a apontar para ele", async () => {
    baseCom([{ atributo: A_TONAL, zona: "tudo", aplicar: true }, { atributo: A_TONAL, zona: "frente", aplicar: true }]);
    await abrir();
    const segunda = regras().find((g) => (within(g).getByLabelText(/^Zona/) as HTMLSelectElement).value === "frente")!;
    fireEvent.change(within(segunda).getByLabelText(/^Zona/), { target: { value: "tudo" } });
    const aviso = screen.getByText(/repetida/i);
    expect(aviso.getAttribute("role")).toBe("alert");
    expect(guardar().getAttribute("aria-disabled")).toBe("true");
    expect(guardar().getAttribute("aria-describedby")).toBe(aviso.id);
    fireEvent.click(guardar());
    expect(chamadasDe("cat_definir_config_3d")).toHaveLength(0);
  });
  it("«Descartar» anuncia numa região viva que as alterações foram descartadas", async () => {
    baseCom([{ atributo: A_TONAL, zona: "tudo", aplicar: true }]);
    await abrir();
    clicar("frente");
    fireEvent.click(within(painel()).getByRole("button", { name: "Só esta zona é diferente" }));
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    const viva = await screen.findByText("Alterações descartadas.");
    expect(viva.getAttribute("aria-live")).toBe("polite");
  });
  it("com alterações por guardar, «Voltar a herdar as regras» fica desactivado e di-lo (para não apagar o rascunho sem aviso); depois de descartar volta a actuar", async () => {
    baseCom([{ atributo: A_TONAL, zona: "tudo", aplicar: true }]);
    await abrir();
    clicar("frente");
    fireEvent.click(within(painel()).getByRole("button", { name: "Só esta zona é diferente" }));
    const herdar = screen.getByRole("button", { name: "Voltar a herdar as regras" });
    expect(herdar.getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById(herdar.getAttribute("aria-describedby")!)?.textContent).toMatch(/guarde ou descarte/i);
    fireEvent.click(herdar);
    expect(chamadasDe("cat_definir_config_3d")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(screen.getByRole("button", { name: "Voltar a herdar as regras" }).getAttribute("aria-disabled")).toBe("false");
  });
  it("sem zona escolhida o texto manda escolher na lista de zonas (não «em baixo»)", async () => {
    await abrir();
    expect(screen.getByText(/escolhe uma zona na lista de zonas/i)).toBeTruthy();
    expect(screen.queryByText(/em baixo/i)).toBeNull();
  });
  it("«Voltar a herdar as regras» só actua quando o produto tem regras próprias", async () => {
    baseCom([{ atributo: A_TONAL, zona: "tudo", aplicar: true }]);
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Voltar a herdar as regras" }));
    await waitFor(() => expect(chamadasDe("cat_definir_config_3d")).toHaveLength(1));
    expect(chamadasDe("cat_definir_config_3d")[0].a).toMatchObject({ p_eixos: null, p_ligacoes: null });
    expect(await screen.findByText("As regras voltaram a ser herdadas.")).toBeTruthy();
  });
});

describe("6. sem permissão de editar", () => {
  it("sem products.edit: nenhum botão de editar nem de gravar, e o «Porquê» continua visível", async () => {
    baseCom([{ atributo: A_TONAL, zona: "tudo", aplicar: true }]);
    await abrir({ real: REAL({ podeEditar: false }) });
    clicar("frente");
    expect(within(painel()).queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("button", { name: /Guardar aspeto 3D|Descartar|Voltar a herdar as regras|Acrescentar regra|Só esta zona é diferente/ })).toBeNull();
    expect(within(painel()).getByText("Porquê: vem da regra «Tonalidade → Todas as zonas».")).toBeTruthy();
    expect(within(painel()).getByText(/permissão de editar produtos/i)).toBeTruthy();
  });
});

describe("7. teclado e foco", () => {
  it("escolher a zona clicando no 3D leva o foco ao título dela; os rádios da cor e da superfície são grupos nativos (as setas mudam a escolha)", async () => {
    await abrir();
    clicar("frente");
    expect(document.activeElement).toBe(within(painel()).getByRole("heading", { name: "Zona: Frente" }));
    for (const nome of ["Cor desta zona", "Superfície desta zona"] as const) {
      const nomes = new Set(within(camada(nome)).getAllByRole("radio").map((r) => (r as HTMLInputElement).name));
      expect(nomes.size).toBe(1);
    }
  });
  it("o botão «Só esta zona é diferente» desaparece depois de usado e o foco vai para o título da zona (não cai no corpo da página)", async () => {
    baseCom([{ atributo: A_TONAL, zona: "tudo", aplicar: true }]);
    await abrir();
    clicar("frente");
    const botao = within(painel()).getByRole("button", { name: "Só esta zona é diferente" });
    botao.focus();
    fireEvent.click(botao);
    expect(within(painel()).queryByRole("button", { name: "Só esta zona é diferente" })).toBeNull();
    expect(document.activeElement).toBe(within(painel()).getByRole("heading", { name: "Zona: Frente" }));
  });
  it("«Dar prioridade a …» também leva o foco ao título da zona quando o aviso de conflito desaparece", async () => {
    baseCom([{ atributo: A_CORPO, zona: "tudo", aplicar: true }, { atributo: A_FRENTE, zona: "frente", aplicar: true }]);
    await abrir();
    clicar("frente");
    const botao = within(painel()).getByRole("button", { name: "Dar prioridade a Cor da frente nesta zona" });
    botao.focus();
    fireEvent.click(botao);
    expect(within(painel()).queryByRole("button", { name: /Dar prioridade/ })).toBeNull();
    expect(document.activeElement).toBe(within(painel()).getByRole("heading", { name: "Zona: Frente" }));
  });
  it("Escape devolve o foco ao botão da zona de onde veio", async () => {
    await abrir();
    const botao = within(screen.getByRole("heading", { name: "Zonas" }).closest("section")!).getByRole("button", { name: /^Frente/ });
    botao.focus();
    fireEvent.click(botao);
    fireEvent.keyDown(within(painel()).getAllByRole("radio")[0], { key: "Escape" });
    expect(screen.queryByRole("region", { name: /^Zona: / })).toBeNull();
    expect(document.activeElement).toBe(botao);
  });
});

describe("8. o 3D acompanha a regra apontada", () => {
  it("focar uma regra realça no 3D só as zonas que ela pinta de facto (não a frente, onde está sem efeito)", async () => {
    baseCom([{ atributo: A_TONAL, zona: "tudo", aplicar: true }, { atributo: A_TONAL, zona: "frente", aplicar: false }]);
    const c = await abrir();
    const cabeca = regras().find((g) => (within(g).getByLabelText(/^Zona/) as HTMLSelectElement).value === "tudo")!;
    const campo = within(cabeca).getByLabelText("Atributo");
    fireEvent.focus(campo);
    const zonas = c.getAttribute("data-realce")!.split(",");
    expect(zonas).toContain("corpo");
    expect(zonas).not.toContain("frente");
    fireEvent.mouseLeave(cabeca);
    expect(c.getAttribute("data-realce")).toContain("corpo"); // o foco ainda está dentro da regra
    fireEvent.blur(campo);
    expect(c.getAttribute("data-realce")).toBe("");
  });
});

describe("8b. o realce acompanha a edição da regra apontada", () => {
  it("desligar «Pinta» na regra focada tira logo o realce (não fica a realçar o que a regra já não pinta)", async () => {
    baseCom([{ atributo: A_TONAL, zona: "tudo", aplicar: true }]);
    const c = await abrir();
    const regra = regras()[0];
    fireEvent.focus(within(regra).getByLabelText("Atributo"));
    expect(c.getAttribute("data-realce")).not.toBe("");
    fireEvent.click(within(regra).getByRole("switch", { name: "Pinta" }));
    expect(c.getAttribute("data-realce")).toBe("");
  });
});

describe("9. REGRESSÃO: sem tocar em nada, as zonas e o aspeto são os de sempre", () => {
  it("abrir e fechar uma zona não muda o que o 3D recebe, e sem clicar não há painel de zona", async () => {
    const c = await abrir();
    expect(screen.queryByRole("region", { name: /^Zona: / })).toBeNull();
    const antes = c.getAttribute("data-zonas");
    expect(zonasDe(c).frente?.atributo).toBe("Cor da frente");
    expect(zonasDe(c).corpo?.atributo).toBe("Cor do corpo");
    expect(zonasDe(c).frente?.acabamento).toBe("Tonalidade");
    clicar("frente");
    clicar("corpo");
    clicar("fora");
    expect(c.getAttribute("data-zonas")).toBe(antes);
    expect(c.getAttribute("data-realce")).toBe("");
    expect(chamadasDe("cat_definir_config_3d")).toHaveLength(0);
  });
});

describe("10. telemóvel (375 px): as escolhas passam a seletores e os alvos têm 44 px", () => {
  const largura = window.innerWidth;
  afterEach(() => { Object.defineProperty(window, "innerWidth", { configurable: true, value: largura }); });
  it("com o ecrã estreito, «Cor desta zona» e «Superfície desta zona» são seletores de 44 px e escolher um muda o 3D", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    baseCom([{ atributo: A_TONAL, zona: "tudo", aplicar: true }]);
    const c = await abrir({ attrs: doProduto(A_CORPO, A_FRENTE, A_TONAL, A_BRILHO) });
    clicar("frente");
    expect(within(painel()).queryByRole("radio")).toBeNull();
    const superf = within(painel()).getByLabelText("Superfície desta zona") as HTMLSelectElement;
    expect(superf.className).toContain("min-h-11");
    expect(within(painel()).getByLabelText("Cor desta zona").className).toContain("min-h-11");
    fireEvent.change(superf, { target: { value: `atributo:${A_BRILHO}` } });
    await waitFor(() => expect(zonasDe(c).frente?.acabamento).toBe("Brilho"));
  });
  it("no ecrã largo continuam os rádios, todos com alvos de 44 px", async () => {
    await abrir();
    clicar("frente");
    for (const r of within(painel()).getAllByRole("radio")) expect(r.closest("label")?.className).toContain("min-h-11");
  });
});

// verificação ao vivo (26/11): no telemóvel o painel «Aspeto 3D» fica muito abaixo (depois de Zonas e Medidas): escolher uma zona leva-o à vista
describe("11. no ecrã estreito, escolher uma zona leva o painel à vista", () => {
  const original = window.matchMedia, scroll = Element.prototype.scrollIntoView, largura = window.innerWidth;
  const comEcra = (o: { largo: boolean; reduzir?: boolean }) => {
    window.matchMedia = ((q: string) => ({
      matches: q.includes("min-width: 1024px") ? o.largo : q.includes("prefers-reduced-motion") ? !!o.reduzir : false, media: q, onchange: null,
      addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  };
  afterEach(() => { window.matchMedia = original; Element.prototype.scrollIntoView = scroll; Object.defineProperty(window, "innerWidth", { configurable: true, value: largura }); });
  const botaoDaZona = (z: string) => document.querySelector<HTMLElement>(`[data-zona-botao="${z}"]`)!;
  it("com o painel por baixo do 3D, tocar numa zona do painel «Zonas» leva o título da zona à vista, com movimento suave", async () => {
    comEcra({ largo: false });
    const rolar = vi.fn(); Element.prototype.scrollIntoView = rolar;
    await abrir();
    fireEvent.click(botaoDaZona("corpo"));
    await screen.findByRole("heading", { name: "Zona: Corpo" });
    expect(rolar).toHaveBeenCalledTimes(1);
    expect(rolar).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(rolar.mock.instances[0]).toBe(painel());
  });
  it("com «reduzir movimento» o salto é imediato", async () => {
    comEcra({ largo: false, reduzir: true });
    const rolar = vi.fn(); Element.prototype.scrollIntoView = rolar;
    await abrir();
    fireEvent.click(botaoDaZona("corpo"));
    await screen.findByRole("heading", { name: "Zona: Corpo" });
    expect(rolar).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });
  it("com o painel ao lado do 3D (ecrã largo) não há salto nenhum", async () => {
    comEcra({ largo: true });
    const rolar = vi.fn(); Element.prototype.scrollIntoView = rolar;
    await abrir();
    fireEvent.click(botaoDaZona("corpo"));
    await screen.findByRole("heading", { name: "Zona: Corpo" });
    expect(rolar).not.toHaveBeenCalled();
  });
  it("clicar no 3D no ecrã estreito: o foco vai ao título e o salto é um só, o suave", async () => {
    comEcra({ largo: false });
    const rolar = vi.fn(); Element.prototype.scrollIntoView = rolar;
    await abrir();
    clicar("frente");
    expect(document.activeElement).toBe(within(painel()).getByRole("heading", { name: "Zona: Frente" }));
    expect(rolar).toHaveBeenCalledTimes(1);
  });
  it("sem scrollIntoView (ambiente antigo) não rebenta", async () => {
    comEcra({ largo: false });
    Element.prototype.scrollIntoView = undefined as unknown as typeof Element.prototype.scrollIntoView;
    await abrir();
    expect(() => clicar("frente")).not.toThrow();
  });
  it("no telemóvel a opção automática da cor cabe no seletor: «Automático», sem o texto comprido (o «Porquê» já explica)", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    await abrir();
    clicar("frente");
    const sel = within(painel()).getByLabelText("Cor desta zona") as HTMLSelectElement;
    expect(within(sel).getByRole("option", { name: "Automático" })).toBeTruthy();
    expect(within(sel).queryByRole("option", { name: /pelo nome do atributo/ })).toBeNull();
  });
});

describe("12. o rodapé fixo é compacto: uma linha com Descartar e Guardar", () => {
  it("«Voltar a herdar as regras» (acção rara) sai do rodapé fixo e fica na secção das regras, que rola com a página", async () => {
    baseCom([{ atributo: A_TONAL, zona: "tudo", aplicar: true }]);
    await abrir();
    const rodape = guardar().closest<HTMLElement>(".sticky")!;
    expect(rodape).toBeTruthy();
    expect(within(rodape).getByRole("button", { name: "Descartar" })).toBeTruthy();
    expect(within(rodape).queryByRole("button", { name: "Voltar a herdar as regras" })).toBeNull();
    expect(screen.getByRole("button", { name: "Voltar a herdar as regras" }).closest(".sticky")).toBeNull();
    expect(within(rodape).getAllByRole("button")).toHaveLength(2);
  });
  it("«Sem alterações para guardar.» já não ocupa uma linha à vista (o cabeçalho diz «Guardado»); continua a ser a descrição do botão para o leitor de ecrã", async () => {
    await abrir();
    const razao = screen.getByText("Sem alterações para guardar.");
    expect(razao.className).toContain("sr-only");
    expect(razao.id).toBe(guardar().getAttribute("aria-describedby"));
    expect(screen.getByText("Guardado")).toBeTruthy();
  });
});
