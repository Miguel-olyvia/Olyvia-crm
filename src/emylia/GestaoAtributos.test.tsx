// 13/11: o ecrã de gestão dos atributos do Catálogo (Medida, Cor, Tonalidade…): listar, criar, renomear, opções (nome, cor, ativar/desativar,
// ordem). As funções cat_* de 20270117600000 ainda não estão na base: aqui a base é simulada e confere-se o contrato (nomes e argumentos).
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
  return {
    supabase: {
      rpc: vi.fn(async (f: string, a: Record<string, unknown>) => { base.chamadas.push({ f, a }); return base.responder(f, a); }),
      from: vi.fn(() => cadeia()),
    },
  };
});

import { acoes, seed } from "./motor";
import { CatalogoV1 } from "./CatalogoV1";
import { GestaoAtributos } from "./GestaoAtributos";
import { reporCustos } from "./v2/custosStore";
import { reporCatalogo } from "./v2/catalogoStore";
import type { FichaProdutoReal } from "./fichaProdutoDados";

const ORG = "b6ffce4f-f630-4933-833a-008649757a33";
const A_MED = "aaaaaaaa-0000-4000-a000-000000000002", A_COR = "aaaaaaaa-0000-4000-a000-000000000001", A_BRI = "aaaaaaaa-0000-4000-a000-000000000003";
const O_PRETO = "bbbbbbbb-0000-4000-a000-000000000001", O_BRANCO = "bbbbbbbb-0000-4000-a000-000000000002", O_CINZA = "bbbbbbbb-0000-4000-a000-000000000003";
const O_FOSCO = "bbbbbbbb-0000-4000-a000-000000000004";

const lido = () => ({
  atributos: [
    { id: A_MED, codigo: "medida", nome: "Medida", tipo: "medida", tem_hex: false, ordem: 1, ativo: true, usados: 4, opcoes: [] },
    { id: A_COR, codigo: "cor", nome: "Cor", tipo: "lista", tem_hex: true, ordem: 2, ativo: true, usados: 3, opcoes: [
      { id: O_PRETO, valor: "Preto", nome: "Preto", hex: "#000000", ordem: 1, ativo: true, usados: 2 },
      { id: O_BRANCO, valor: "Branco", nome: "Branco", hex: null, ordem: 2, ativo: true, usados: 0 },
      { id: O_CINZA, valor: "Cinza", nome: "Cinza", hex: "#888888", ordem: 3, ativo: false, usados: 1 },
    ] },
    { id: A_BRI, codigo: "brilho", nome: "Brilho", tipo: "lista", tem_hex: false, ordem: 3, ativo: true, usados: 0, opcoes: [
      { id: O_FOSCO, valor: "Fosco", nome: "Fosco", hex: null, ordem: 1, ativo: true, usados: 0 },
    ] },
  ],
});

const erro = (code: string, message: string, details?: string) => ({ data: null, error: { code, message, details } });
const REAL = (p: Partial<FichaProdutoReal> = {}): FichaProdutoReal => ({ org: ORG, podeEditar: true, podeMudarPrecos: false, recarregar: vi.fn(async () => undefined), ...p });
const chamadasDe = (f: string) => base.chamadas.filter((c) => c.f === f);

beforeEach(() => {
  base.chamadas = [];
  base.responder = (f) => (f === "cat_ler_atributos_gestao" ? { data: lido(), error: null }
    : f === "cat_guardar_opcao" ? { data: { opcao: { id: O_FOSCO, valor: "x", nome: "x", hex: null, ordem: 9 } }, error: null } : { data: { ok: true }, error: null });
});
afterEach(() => { cleanup(); reporCustos(); reporCatalogo(); window.history.replaceState(null, "", "/"); });

const abrir = async (r: FichaProdutoReal = REAL()) => {
  render(<GestaoAtributos real={r} voltar={vi.fn()} anunciar={vi.fn()} />);
  await screen.findByRole("region", { name: "Cor" });
};
const sec = (n: string) => screen.getByRole("region", { name: n });
const li = (raiz: HTMLElement, nome: string) => within(raiz).getAllByRole("listitem").find((x) => (x.textContent ?? "").startsWith(nome))!;
const confirmacao = () => screen.getByRole("group", { name: /^Mudar / });

describe("GestaoAtributos: ler", () => {
  it("lê com a organização e lista os atributos, as opções com cor e hex escrito, e quantos produtos as usam", async () => {
    await abrir();
    expect(chamadasDe("cat_ler_atributos_gestao")[0].a).toEqual({ p_org: ORG });
    const cor = sec("Cor");
    expect(within(cor).getByText("Usado em 3 produtos")).toBeInTheDocument();
    const preto = li(cor, "Preto");
    expect(within(preto).getByText("#000000")).toBeInTheDocument();
    expect(within(preto).getByText("2 produtos")).toBeInTheDocument();
    expect(preto.querySelector("[data-hex='#000000']")).not.toBeNull();
    const branco = li(cor, "Branco");
    expect(within(branco).getByText("sem hex")).toBeInTheDocument();
    expect(within(branco).getByText("0 produtos")).toBeInTheDocument();
    expect(li(cor, "Cinza")).toHaveTextContent("desativada");
    // Brilho não tem cor: sem amostra nem «sem hex»
    expect(within(sec("Brilho")).queryByText("sem hex")).toBeNull();
  });

  it("a Medida só informa: sem lista de opções, sem hex, sem botões de opção", async () => {
    await abrir();
    const med = sec("Medida");
    expect(within(med).getByText(/2D ou 3D/)).toBeInTheDocument();
    expect(within(med).queryByRole("list")).toBeNull();
    expect(within(med).queryByRole("button", { name: /Nova opção/ })).toBeNull();
  });

  it("sem products.edit só se lê: nada de criar, editar, ordenar nem desativar", async () => {
    await abrir(REAL({ podeEditar: false }));
    expect(screen.getByText(/Só de leitura/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Novo atributo/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Nova opção/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Editar|Desativar|Reativar|Subir|Descer|Renomear/ })).toBeNull();
    expect(li(sec("Cor"), "Preto")).toBeInTheDocument();
  });

  it("função ainda não existe na base: diz «Ainda não disponível nesta base» e não parte", async () => {
    base.responder = () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.cat_ler_atributos_gestao" } });
    render(<GestaoAtributos real={REAL()} voltar={vi.fn()} anunciar={vi.fn()} />);
    expect(await screen.findByText("Ainda não disponível nesta base")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Novo atributo/ })).toBeNull();
  });

  it("usados null (perfil reduzido): não escreve contagens", async () => {
    base.responder = () => ({ data: { atributos: [{ ...lido().atributos[2], usados: null, opcoes: [{ ...lido().atributos[2].opcoes[0], usados: null }] }] }, error: null });
    render(<GestaoAtributos real={REAL()} voltar={vi.fn()} anunciar={vi.fn()} />);
    await screen.findByRole("region", { name: "Brilho" });
    expect(screen.queryByText(/produtos?$/)).toBeNull();
  });
});

describe("GestaoAtributos: atributos", () => {
  it("cria um atributo de lista com cor: cat_guardar_atributo e relê", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Novo atributo" }));
    fireEvent.change(screen.getByLabelText("Nome do atributo"), { target: { value: "Acabamento" } });
    expect(screen.getByRole("radio", { name: "Lista" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("checkbox", { name: /Tem cor/ }));
    fireEvent.click(screen.getByRole("button", { name: "Criar atributo" }));
    await waitFor(() => expect(chamadasDe("cat_guardar_atributo")).toHaveLength(1));
    expect(chamadasDe("cat_guardar_atributo")[0].a).toEqual({ p_org: ORG, p_atributo: null, p_nome: "Acabamento", p_tipo: "lista", p_tem_hex: true });
    await waitFor(() => expect(chamadasDe("cat_ler_atributos_gestao")).toHaveLength(2));
  });

  it("Medida não tem cor: a opção some e vai tem_hex falso", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Novo atributo" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Tem cor/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Medida" }));
    expect(screen.queryByRole("checkbox", { name: /Tem cor/ })).toBeNull();
    fireEvent.change(screen.getByLabelText("Nome do atributo"), { target: { value: "Espessura" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar atributo" }));
    await waitFor(() => expect(chamadasDe("cat_guardar_atributo")).toHaveLength(1));
    expect(chamadasDe("cat_guardar_atributo")[0].a).toMatchObject({ p_tipo: "medida", p_tem_hex: false });
  });

  it("sem nome não deixa criar", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Novo atributo" }));
    expect(screen.getByRole("button", { name: "Criar atributo" })).toBeDisabled();
  });

  it("renomeia: só o nome (tipo e cor ficam null)", async () => {
    await abrir();
    fireEvent.click(within(sec("Cor")).getByRole("button", { name: "Renomear o atributo Cor" }));
    fireEvent.change(screen.getByLabelText("Nome do atributo"), { target: { value: "Cor base" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nome" }));
    expect(chamadasDe("cat_guardar_atributo")).toHaveLength(0);
    expect(confirmacao()).toHaveTextContent("3 produtos");
    fireEvent.click(within(confirmacao()).getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(chamadasDe("cat_guardar_atributo")).toHaveLength(1));
    expect(chamadasDe("cat_guardar_atributo")[0].a).toEqual({ p_org: ORG, p_atributo: A_COR, p_nome: "Cor base", p_tipo: null, p_tem_hex: null });
  });

  it("nome repetido (CT004): mostra a mensagem da base e mantém o formulário", async () => {
    base.responder = (f) => (f === "cat_guardar_atributo" ? erro("CT004", "Já existe um atributo com este nome.", A_COR) : { data: lido(), error: null });
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Novo atributo" }));
    fireEvent.change(screen.getByLabelText("Nome do atributo"), { target: { value: "cor" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar atributo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Já existe um atributo com este nome.");
    expect(screen.getByLabelText("Nome do atributo")).toHaveValue("cor");
  });
});

describe("GestaoAtributos: opções", () => {
  it("cria opção na Cor: hex obrigatório, vai normalizado", async () => {
    await abrir();
    fireEvent.click(within(sec("Cor")).getByRole("button", { name: "Nova opção em Cor" }));
    fireEvent.change(screen.getByLabelText("Nome da opção"), { target: { value: "Azul" } });
    const criar = screen.getByRole("button", { name: "Criar opção" });
    expect(criar).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Cor em hexadecimal/), { target: { value: "#1a2b3c" } });
    expect(criar).toBeEnabled();
    fireEvent.click(criar);
    await waitFor(() => expect(chamadasDe("cat_guardar_opcao")).toHaveLength(1));
    expect(chamadasDe("cat_guardar_opcao")[0].a).toEqual({ p_org: ORG, p_atributo: A_COR, p_valor: "Azul", p_hex: "#1A2B3C" });
  });

  it("cria opção num atributo sem cor: sem campo de hex, p_hex null", async () => {
    await abrir();
    fireEvent.click(within(sec("Brilho")).getByRole("button", { name: "Nova opção em Brilho" }));
    expect(screen.queryByLabelText(/Cor em hexadecimal/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Nome da opção"), { target: { value: "Mate" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar opção" }));
    await waitFor(() => expect(chamadasDe("cat_guardar_opcao")).toHaveLength(1));
    expect(chamadasDe("cat_guardar_opcao")[0].a).toEqual({ p_org: ORG, p_atributo: A_BRI, p_valor: "Mate", p_hex: null });
  });

  it("renomear uma opção usada pede confirmação no ecrã com o número de produtos; só grava ao confirmar", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Editar Preto" }));
    fireEvent.change(screen.getByLabelText("Nome da opção"), { target: { value: "Preto intenso" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar opção" }));
    const aviso = confirmacao();
    expect(aviso).toHaveTextContent("2 produtos");
    expect(chamadasDe("cat_editar_opcao")).toHaveLength(0);
    fireEvent.click(within(aviso).getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(chamadasDe("cat_editar_opcao")).toHaveLength(1));
    expect(chamadasDe("cat_editar_opcao")[0].a).toEqual({ p_org: ORG, p_opcao: O_PRETO, p_nome: "Preto intenso", p_hex: null, p_ativo: null });
  });

  it("cancelar a confirmação não grava", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Editar Preto" }));
    fireEvent.change(screen.getByLabelText("Nome da opção"), { target: { value: "Negro" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar opção" }));
    fireEvent.click(within(confirmacao()).getByRole("button", { name: "Voltar" }));
    expect(screen.queryByRole("group", { name: /^Mudar / })).toBeNull();
    expect(chamadasDe("cat_editar_opcao")).toHaveLength(0);
  });

  it("mudar o hex de uma opção usada também pede confirmação; vai só o hex", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Editar Preto" }));
    fireEvent.change(screen.getByLabelText(/Cor em hexadecimal/), { target: { value: "111111" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar opção" }));
    fireEvent.click(within(confirmacao()).getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(chamadasDe("cat_editar_opcao")).toHaveLength(1));
    expect(chamadasDe("cat_editar_opcao")[0].a).toEqual({ p_org: ORG, p_opcao: O_PRETO, p_nome: null, p_hex: "#111111", p_ativo: null });
  });

  it("opção sem produtos grava logo, sem confirmação; hex inválido não deixa guardar", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Editar Branco" }));
    fireEvent.change(screen.getByLabelText(/Cor em hexadecimal/), { target: { value: "zzz" } });
    expect(screen.getByRole("button", { name: "Guardar opção" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Cor em hexadecimal/), { target: { value: "#FFFFFF" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar opção" }));
    expect(screen.queryByRole("group", { name: /^Mudar / })).toBeNull();
    await waitFor(() => expect(chamadasDe("cat_editar_opcao")).toHaveLength(1));
    expect(chamadasDe("cat_editar_opcao")[0].a).toEqual({ p_org: ORG, p_opcao: O_BRANCO, p_nome: null, p_hex: "#FFFFFF", p_ativo: null });
  });

  it("desativar e reativar: só p_ativo, sem confirmação", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Desativar Preto" }));
    await waitFor(() => expect(chamadasDe("cat_editar_opcao")).toHaveLength(1));
    expect(chamadasDe("cat_editar_opcao")[0].a).toEqual({ p_org: ORG, p_opcao: O_PRETO, p_nome: null, p_hex: null, p_ativo: false });
    await waitFor(() => expect(screen.getByRole("button", { name: "Reativar Cinza" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Reativar Cinza" }));
    await waitFor(() => expect(chamadasDe("cat_editar_opcao")).toHaveLength(2));
    expect(chamadasDe("cat_editar_opcao")[1].a).toEqual({ p_org: ORG, p_opcao: O_CINZA, p_nome: null, p_hex: null, p_ativo: true });
  });

  it("ordenar: «Descer» troca com a seguinte e manda TODAS as opções; extremos desligados", async () => {
    await abrir();
    expect(screen.getByRole("button", { name: "Subir Preto" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Descer Cinza" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Descer Preto" }));
    await waitFor(() => expect(chamadasDe("cat_reordenar_opcoes")).toHaveLength(1));
    expect(chamadasDe("cat_reordenar_opcoes")[0].a).toEqual({ p_org: ORG, p_atributo: A_COR, p_ids: [O_BRANCO, O_PRETO, O_CINZA] });
  });

  it("erro de validação (CT002) mostra a mensagem em português e relê, para o ecrã não mentir", async () => {
    base.responder = (f) => (f === "cat_editar_opcao" ? erro("CT002", "O código da cor tem de ser # e seis algarismos hexadecimais.") : { data: lido(), error: null });
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Desativar Branco" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("O código da cor tem de ser # e seis algarismos hexadecimais.");
    await waitFor(() => expect(chamadasDe("cat_ler_atributos_gestao")).toHaveLength(2));
  });

  it("falha de rede ao reler depois de gravar: avisa que o ecrã pode estar desatualizado e deixa tentar de novo", async () => {
    let leituras = 0;
    base.responder = (f) => {
      if (f !== "cat_ler_atributos_gestao") return { data: { ok: true }, error: null };
      leituras += 1;
      return leituras === 1 ? { data: lido(), error: null } : { data: null, error: { message: "Failed to fetch" } };
    };
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Desativar Branco" }));
    expect(await screen.findByText(/pode estar desatualizada/)).toBeInTheDocument();
    leituras = 0;
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(screen.queryByText(/pode estar desatualizada/)).toBeNull());
  });

  it("depois de gravar, o Catálogo relê os atributos (real.recarregar)", async () => {
    const r = REAL();
    await abrir(r);
    fireEvent.click(screen.getByRole("button", { name: "Desativar Branco" }));
    await waitFor(() => expect(r.recarregar).toHaveBeenCalled());
  });
});

describe("Catálogo: entrada «Atributos»", () => {
  const pagina = (r?: FichaProdutoReal) => {
    const S = seed();
    const run = (fn: () => void) => fn();
    render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} real={r} />);
  };
  it("na página real há um acesso «Atributos» que abre o ecrã e volta ao Catálogo", async () => {
    pagina(REAL());
    fireEvent.click(screen.getByRole("button", { name: "Atributos" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Atributos" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao Catálogo" }));
    expect(screen.getByRole("heading", { level: 1, name: "Catálogo e custos" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Atributos" })).toHaveFocus());
  });
  it("sem a página real (protótipo) não há acesso", () => {
    pagina(undefined);
    expect(screen.queryByRole("button", { name: "Atributos" })).toBeNull();
  });
});

describe("GestaoAtributos: revisão", () => {
  it("sem permissão para ler (CT001): estado próprio, sem «Tentar de novo» nem «Só de leitura»", async () => {
    base.responder = () => erro("CT001", "Sem permissão.");
    render(<GestaoAtributos real={REAL({ podeEditar: false })} voltar={vi.fn()} anunciar={vi.fn()} />);
    expect(await screen.findByText(/Não tem permissão para ver os atributos/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).toBeNull();
    expect(screen.queryByText(/Só de leitura/)).toBeNull();
    expect(chamadasDe("cat_ler_atributos_gestao")).toHaveLength(1);
  });

  it("depois de desativar, o foco fica no botão da opção", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Desativar Preto" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Desativar Preto" })).toHaveFocus());
  });

  it("depois de guardar uma edição, o foco volta ao botão Editar", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Editar Branco" }));
    fireEvent.change(screen.getByLabelText("Nome da opção"), { target: { value: "Branco gelo" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar opção" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Editar Branco" })).toHaveFocus());
  });

  it("«Voltar» da confirmação devolve o foco ao botão Guardar opção", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Editar Preto" }));
    fireEvent.change(screen.getByLabelText("Nome da opção"), { target: { value: "Negro" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar opção" }));
    fireEvent.click(within(confirmacao()).getByRole("button", { name: "Voltar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar opção" })).toHaveFocus());
  });

  it("explica porque o Guardar está desligado: cor obrigatória e nada mudou", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Editar Preto" }));
    expect(screen.getByText("Altere o nome ou a cor para guardar.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Cor em hexadecimal/), { target: { value: "" } });
    expect(screen.getByText("A cor é obrigatória.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar opção" })).toBeDisabled();
  });

  it("o erro de uma ação aparece no atributo onde foi feita, e só aí", async () => {
    base.responder = (f) => (f === "cat_editar_opcao" ? erro("CT002", "Não foi possível.") : { data: lido(), error: null });
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Desativar Branco" }));
    expect(await within(sec("Cor")).findByRole("alert")).toHaveTextContent("Não foi possível.");
    expect(within(sec("Brilho")).queryByRole("alert")).toBeNull();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("avisa o Catálogo (recarregar) também quando a gravação falha", async () => {
    base.responder = (f) => (f === "cat_editar_opcao" ? erro("CT002", "Falhou.") : { data: lido(), error: null });
    const r = REAL({ recarregar: vi.fn(async () => { throw new Error("rede"); }) });
    await abrir(r);
    fireEvent.click(screen.getByRole("button", { name: "Desativar Branco" }));
    await waitFor(() => expect(r.recarregar).toHaveBeenCalled());
    expect(await screen.findByRole("alert")).toHaveTextContent("Falhou.");
  });

  it("renomear um atributo sem produtos grava logo", async () => {
    await abrir();
    fireEvent.click(within(sec("Brilho")).getByRole("button", { name: "Renomear o atributo Brilho" }));
    fireEvent.change(screen.getByLabelText("Nome do atributo"), { target: { value: "Brilho final" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nome" }));
    await waitFor(() => expect(chamadasDe("cat_guardar_atributo")).toHaveLength(1));
    expect(screen.queryByRole("group", { name: /^Mudar / })).toBeNull();
  });

  it("se a organização mudar, relê com a nova e não mostra a lista da antiga", async () => {
    const { rerender } = render(<GestaoAtributos real={REAL()} voltar={vi.fn()} anunciar={vi.fn()} />);
    await screen.findByRole("region", { name: "Cor" });
    const OUTRA = "11111111-1111-4111-8111-111111111111";
    base.responder = () => ({ data: { atributos: [] }, error: null });
    rerender(<GestaoAtributos real={REAL({ org: OUTRA })} voltar={vi.fn()} anunciar={vi.fn()} />);
    await waitFor(() => expect(chamadasDe("cat_ler_atributos_gestao").at(-1)!.a).toEqual({ p_org: OUTRA }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Cor" })).toBeNull());
  });
});
