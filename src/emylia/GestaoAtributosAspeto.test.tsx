// 25/11: «Tem aspeto» na gestão dos atributos: o interruptor por atributo de lista, «É metal» e «Superfície por omissão» em cada opção, e a ordem das gravações (primeiro a opção, depois o aspeto,
// só se mudou). As funções cat_* do aspeto (migration A) estão por aplicar: a base é simulada e confere-se o contrato. Sem o campo `tem_aspeto` na leitura (migration por aplicar) nada disto aparece.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  responder: (() => ({ data: null, error: null })) as (f: string, a: Record<string, unknown>) => { data: unknown; error: unknown },
}));
vi.mock("@/integrations/supabase/client", () => {
  const cadeia = () => {
    const c: Record<string, unknown> = {};
    for (const k of ["select", "eq", "is", "order", "limit"]) c[k] = () => c;
    c.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
    return c;
  };
  return { supabase: { rpc: vi.fn(async (f: string, a: Record<string, unknown>) => { base.chamadas.push({ f, a }); return base.responder(f, a); }), from: vi.fn(() => cadeia()) } };
});

import { GestaoAtributos } from "./GestaoAtributos";
import { reporCustos } from "./v2/custosStore";
import { reporCatalogo } from "./v2/catalogoStore";
import type { FichaProdutoReal } from "./fichaProdutoDados";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const A_MED = "aaaaaaaa-0000-4000-a000-000000000002", A_COR = "aaaaaaaa-0000-4000-a000-000000000001", A_BRI = "aaaaaaaa-0000-4000-a000-000000000003";
const O_PRETO = "bbbbbbbb-0000-4000-a000-000000000001", O_BRANCO = "bbbbbbbb-0000-4000-a000-000000000002", O_FOSCO = "bbbbbbbb-0000-4000-a000-000000000004", O_NOVA = "bbbbbbbb-0000-4000-a000-000000000009";

/** Cor com aspeto ligado (Preto: metal acetinado; Branco: nada), Brilho sem aspeto, Medida. `comCampo: false` imita a base sem a migration (nenhuma chave `tem_aspeto`). */
const lido = (comCampo = true) => {
  const t = (v: boolean) => (comCampo ? { tem_aspeto: v } : {});
  return {
    atributos: [
      { id: A_MED, codigo: "medida", nome: "Medida", tipo: "medida", tem_hex: false, ordem: 1, ativo: true, usados: 4, ...t(false), opcoes: [] },
      { id: A_COR, codigo: "cor", nome: "Cor", tipo: "lista", tem_hex: true, ordem: 2, ativo: true, usados: 3, ...t(true), opcoes: [
        { id: O_PRETO, valor: "Preto", nome: "Preto", hex: "#000000", ordem: 1, ativo: true, usados: 2, ...(comCampo ? { metal: true, superficie: "acetinada" } : {}) },
        { id: O_BRANCO, valor: "Branco", nome: "Branco", hex: "#FFFFFF", ordem: 2, ativo: true, usados: 0, ...(comCampo ? { metal: false, superficie: null } : {}) },
      ] },
      { id: A_BRI, codigo: "brilho", nome: "Brilho", tipo: "lista", tem_hex: false, ordem: 3, ativo: true, usados: 0, ...t(false), opcoes: [
        { id: O_FOSCO, valor: "Fosco", nome: "Fosco", hex: null, ordem: 1, ativo: true, usados: 0 },
      ] },
    ],
  };
};
const REAL = (p: Partial<FichaProdutoReal> = {}): FichaProdutoReal => ({ org: ORG, podeEditar: true, podeMudarPrecos: false, recarregar: vi.fn(async () => undefined), ...p });
const chamadasDe = (f: string) => base.chamadas.filter((c) => c.f === f);
const ordem = () => base.chamadas.map((c) => c.f).filter((f) => f !== "cat_ler_atributos_gestao");
let comCampo = true;

beforeEach(() => {
  base.chamadas = []; comCampo = true;
  base.responder = (f) => (f === "cat_ler_atributos_gestao" ? { data: lido(comCampo), error: null }
    : f === "cat_guardar_opcao" ? { data: { opcao: { id: O_NOVA, valor: "Cinza", nome: "Cinza", hex: "#888888", ordem: 9 } }, error: null }
    : f === "cat_aspeto_opcao" ? { data: { opcao: { id: O_BRANCO, metal: true, superficie: "polida" }, anterior: { metal: false, superficie: null } }, error: null }
    : f === "cat_definir_aspeto_atributo" ? { data: { atributo: { id: A_BRI, tem_aspeto: true } }, error: null }
    : { data: { ok: true }, error: null });
});
afterEach(() => { cleanup(); reporCustos(); reporCatalogo(); window.history.replaceState(null, "", "/"); });

const sec = (n: string) => screen.getByRole("region", { name: n });
const abrirTodos = () => { for (const b of screen.getAllByRole("button")) if (b.hasAttribute("aria-controls") && b.getAttribute("aria-expanded") === "false") fireEvent.click(b); };
const abrir = async (r: FichaProdutoReal = REAL()) => {
  render(<GestaoAtributos real={r} voltar={vi.fn()} anunciar={vi.fn()} />);
  await screen.findByRole("region", { name: "Cor" });
  abrirTodos();
};
const li = (raiz: HTMLElement, nome: string) => within(raiz).getAllByRole("listitem").find((x) => (x.textContent ?? "").startsWith(nome))!;
const editar = (nome: string) => fireEvent.click(screen.getByRole("button", { name: `Editar ${nome}` }));

describe("o interruptor «Tem aspeto» de um atributo", () => {
  it("aparece nos atributos de lista (não na Medida), com o estado que a base devolve", async () => {
    await abrir();
    expect(within(sec("Cor")).getByRole("checkbox", { name: /Tem aspeto/ })).toBeChecked();
    expect(within(sec("Brilho")).getByRole("checkbox", { name: /Tem aspeto/ })).not.toBeChecked();
    expect(within(sec("Medida")).queryByRole("checkbox", { name: /Tem aspeto/ })).toBeNull();
  });
  it("ligar chama cat_definir_aspeto_atributo(p_org, p_atributo, true), relê a lista e anuncia", async () => {
    const anunciar = vi.fn();
    render(<GestaoAtributos real={REAL()} voltar={vi.fn()} anunciar={anunciar} />);
    await screen.findByRole("region", { name: "Cor" });
    abrirTodos();
    fireEvent.click(within(sec("Brilho")).getByRole("checkbox", { name: /Tem aspeto/ }));
    await waitFor(() => expect(chamadasDe("cat_definir_aspeto_atributo")).toHaveLength(1));
    expect(chamadasDe("cat_definir_aspeto_atributo")[0].a).toEqual({ p_org: ORG, p_atributo: A_BRI, p_tem_aspeto: true });
    await waitFor(() => expect(anunciar).toHaveBeenCalledWith(expect.stringMatching(/Brilho.*aspeto ligado/)));
    expect(chamadasDe("cat_ler_atributos_gestao").length).toBeGreaterThan(1);
  });
  it("desligar vai com false", async () => {
    await abrir();
    fireEvent.click(within(sec("Cor")).getByRole("checkbox", { name: /Tem aspeto/ }));
    await waitFor(() => expect(chamadasDe("cat_definir_aspeto_atributo")[0]?.a).toEqual({ p_org: ORG, p_atributo: A_COR, p_tem_aspeto: false }));
  });
  it("a recusa da base mostra-se no atributo, em português", async () => {
    base.responder = (f) => (f === "cat_ler_atributos_gestao" ? { data: lido(), error: null } : { data: null, error: { code: "CT002", message: "Uma medida não tem aspeto." } });
    await abrir();
    fireEvent.click(within(sec("Brilho")).getByRole("checkbox", { name: /Tem aspeto/ }));
    expect(await screen.findByText("Uma medida não tem aspeto.")).toBeInTheDocument();
  });
  it("sem products.edit não há interruptor", async () => {
    await abrir(REAL({ podeEditar: false }));
    expect(screen.queryByRole("checkbox", { name: /Tem aspeto/ })).toBeNull();
  });
  it("base sem a migration (nenhuma chave tem_aspeto): nada do aspeto aparece, o ecrã é o de hoje", async () => {
    comCampo = false;
    await abrir();
    expect(screen.queryByRole("checkbox", { name: /Tem aspeto/ })).toBeNull();
    editar("Preto");
    expect(screen.queryByRole("checkbox", { name: /É metal/ })).toBeNull();
    expect(screen.queryByText(/Metal ·/)).toBeNull();
  });
});

describe("a lista de opções diz o aspeto", () => {
  it("«Metal · Acetinada» ao lado do nome, só em atributos com aspeto e só se a opção tem alguma coisa", async () => {
    await abrir();
    expect(li(sec("Cor"), "Preto")).toHaveTextContent("Metal · Acetinada");
    expect(li(sec("Cor"), "Branco")).not.toHaveTextContent(/Metal|Polida|Acetinada|Mate/);
    expect(li(sec("Brilho"), "Fosco")).not.toHaveTextContent(/Metal|Mate/);
  });
});

describe("editar o aspeto de uma opção", () => {
  it("os campos só existem num atributo com «Tem aspeto» e vêm com o que a opção tem", async () => {
    await abrir();
    editar("Preto");
    expect(screen.getByRole("checkbox", { name: /É metal/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Acetinada" })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    editar("Fosco");
    expect(screen.queryByRole("checkbox", { name: /É metal/ })).toBeNull();
  });
  it("só o aspeto mudou: grava só cat_aspeto_opcao (não chama cat_editar_opcao) e não pede confirmação", async () => {
    await abrir();
    editar("Preto");
    fireEvent.click(screen.getByRole("radio", { name: "Polida" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar opção" }));
    await waitFor(() => expect(chamadasDe("cat_aspeto_opcao")).toHaveLength(1));
    expect(chamadasDe("cat_aspeto_opcao")[0].a).toEqual({ p_org: ORG, p_opcao: O_PRETO, p_metal: true, p_superficie: "polida" });
    expect(chamadasDe("cat_editar_opcao")).toHaveLength(0);
    expect(screen.queryByRole("group", { name: /^Mudar / })).toBeNull();
  });
  it("«Nenhuma» limpa a superfície (vai '' à base) e desligar «É metal» vai com false", async () => {
    await abrir();
    editar("Preto");
    fireEvent.click(screen.getByRole("radio", { name: "Nenhuma" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /É metal/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar opção" }));
    await waitFor(() => expect(chamadasDe("cat_aspeto_opcao")).toHaveLength(1));
    expect(chamadasDe("cat_aspeto_opcao")[0].a).toMatchObject({ p_metal: false, p_superficie: "" });
  });
  it("nome e aspeto mudaram: primeiro a opção (cat_editar_opcao), depois o aspeto", async () => {
    await abrir();
    editar("Branco");
    fireEvent.change(screen.getByLabelText("Nome da opção"), { target: { value: "Branco gelo" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /É metal/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar opção" }));
    await waitFor(() => expect(chamadasDe("cat_aspeto_opcao")).toHaveLength(1));
    expect(ordem()).toEqual(["cat_editar_opcao", "cat_aspeto_opcao"]);
  });
  it("nada mudou: o botão fica desligado, e diz porquê (nome, cor ou aspeto)", async () => {
    await abrir();
    editar("Preto");
    expect(screen.getByRole("button", { name: "Guardar opção" })).toBeDisabled();
    expect(screen.getByText(/Altere o nome, a cor ou o aspeto/)).toBeInTheDocument();
  });
  it("a falha da segunda gravação diz que a opção ficou guardada sem o aspeto", async () => {
    base.responder = (f) => (f === "cat_ler_atributos_gestao" ? { data: lido(), error: null }
      : f === "cat_aspeto_opcao" ? { data: null, error: { code: "CT002", message: "Ligue primeiro «Tem aspeto» no atributo «Cor»." } } : { data: { ok: true }, error: null });
    await abrir();
    editar("Branco");
    fireEvent.change(screen.getByLabelText("Nome da opção"), { target: { value: "Branco gelo" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /É metal/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar opção" }));
    expect(await screen.findByText(/Opção guardada sem o aspeto: Ligue primeiro/)).toBeInTheDocument();
  });
});

describe("criar uma opção com aspeto", () => {
  it("cria a opção (cat_guardar_opcao) e depois grava o aspeto na opção nova", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Nova opção em Cor" }));
    fireEvent.change(screen.getByLabelText("Nome da opção"), { target: { value: "Cinza" } });
    fireEvent.change(screen.getByLabelText(/Cor em hexadecimal/), { target: { value: "#888888" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /É metal/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Mate" }));
    fireEvent.click(screen.getByRole("button", { name: "Criar opção" }));
    await waitFor(() => expect(chamadasDe("cat_aspeto_opcao")).toHaveLength(1));
    expect(ordem()).toEqual(["cat_guardar_opcao", "cat_aspeto_opcao"]);
    expect(chamadasDe("cat_aspeto_opcao")[0].a).toEqual({ p_org: ORG, p_opcao: O_NOVA, p_metal: true, p_superficie: "mate" });
  });
  it("sem aspeto escolhido, a opção nova não chama cat_aspeto_opcao", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Nova opção em Cor" }));
    fireEvent.change(screen.getByLabelText("Nome da opção"), { target: { value: "Cinza" } });
    fireEvent.change(screen.getByLabelText(/Cor em hexadecimal/), { target: { value: "#888888" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar opção" }));
    await waitFor(() => expect(chamadasDe("cat_guardar_opcao")).toHaveLength(1));
    expect(chamadasDe("cat_aspeto_opcao")).toHaveLength(0);
  });
});

describe("criar um atributo com «Tem aspeto»", () => {
  it("a caixa só aparece em atributos de lista, e liga o interruptor depois de o atributo existir", async () => {
    let criado = false;
    base.responder = (f) => {
      if (f === "cat_guardar_atributo") { criado = true; return { data: { ok: true }, error: null }; }
      if (f === "cat_ler_atributos_gestao") {
        const l = lido();
        return { data: { atributos: criado ? [...l.atributos, { id: "aaaaaaaa-0000-4000-a000-0000000000ff", codigo: "acabamento", nome: "Acabamento", tipo: "lista", tem_hex: false, tem_aspeto: false, ordem: 9, ativo: true, usados: 0, opcoes: [] }] : l.atributos }, error: null };
      }
      return { data: { ok: true }, error: null };
    };
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: /Novo atributo/ }));
    fireEvent.change(screen.getByLabelText("Nome do atributo"), { target: { value: "Acabamento" } });
    fireEvent.click(within(screen.getByRole("group", { name: "Novo atributo" })).getByRole("checkbox", { name: /Tem aspeto/ }));
    fireEvent.click(screen.getByRole("button", { name: "Criar atributo" }));
    await waitFor(() => expect(chamadasDe("cat_definir_aspeto_atributo")).toHaveLength(1));
    expect(chamadasDe("cat_definir_aspeto_atributo")[0].a).toEqual({ p_org: ORG, p_atributo: "aaaaaaaa-0000-4000-a000-0000000000ff", p_tem_aspeto: true });
    expect(ordem().slice(0, 2)).toEqual(["cat_guardar_atributo", "cat_definir_aspeto_atributo"]);
  });
});
