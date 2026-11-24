// 13/11: o ecrã de gestão dos atributos do Catálogo (Medida, Cor, Tonalidade…): listar, criar, renomear, opções (nome, cor, ativar/desativar,
// ordem). As funções cat_* de 20270117600000 ainda não estão na base: aqui a base é simulada e confere-se o contrato (nomes e argumentos).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const base = vi.hoisted(() => ({
  chamadas: [] as { f: string; a: Record<string, unknown> }[],
  responder: (() => ({ data: null, error: null })) as (f: string, a: Record<string, unknown>) => { data: unknown; error: unknown },
  /** o storage simulado (bucket catalogo-opcoes): o que se enviou e o que se apagou, e se o envio falha */
  envios: [] as { bucket: string; caminho: string; tipo: string | undefined; upsert: boolean | undefined; blob: Blob }[],
  remocoes: [] as string[][],
  falhaEnvio: null as string | null,
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
      storage: {
        from: (bucket: string) => ({
          upload: vi.fn(async (caminho: string, blob: Blob, o?: { contentType?: string; upsert?: boolean }) => {
            if (base.falhaEnvio) return { data: null, error: { message: base.falhaEnvio } };
            base.envios.push({ bucket, caminho, tipo: o?.contentType, upsert: o?.upsert, blob });
            return { data: { path: caminho }, error: null };
          }),
          remove: vi.fn(async (caminhos: string[]) => { base.remocoes.push(caminhos); return { data: [], error: null }; }),
          getPublicUrl: (c: string) => ({ data: { publicUrl: `https://cdn.teste/${bucket}/${c}` } }),
        }),
      },
    },
  };
});

// a conversão (canvas, createImageBitmap) tem testes próprios em fotoOpcao.test.ts: aqui devolve o que cada teste mandar
vi.mock("./fotoOpcao", async (orig) => ({ ...(await orig<typeof import("./fotoOpcao")>()), prepararFotoOpcao: vi.fn() }));

import { acoes, seed } from "./motor";
import { CatalogoV1 } from "./CatalogoV1";
import { GestaoAtributos } from "./GestaoAtributos";
import { prepararFotoOpcao } from "./fotoOpcao";
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
  base.chamadas = []; base.envios = []; base.remocoes = []; base.falhaEnvio = null;
  base.responder = (f) => (f === "cat_ler_atributos_gestao" ? { data: lido(), error: null }
    : f === "cat_guardar_opcao" ? { data: { opcao: { id: O_FOSCO, valor: "x", nome: "x", hex: null, ordem: 9 } }, error: null } : { data: { ok: true }, error: null });
});
afterEach(() => { cleanup(); reporCustos(); reporCatalogo(); window.history.replaceState(null, "", "/"); });

/** Os painéis começam fechados: por omissão estes testes abrem todos, e `{ fechados: true }` deixa-os como nascem. */
const cabecalho = (n: string) => within(sec(n)).getAllByRole("button").find((b) => b.hasAttribute("aria-controls"))!;
const abrirTodos = () => { for (const b of screen.getAllByRole("button")) if (b.hasAttribute("aria-controls") && b.getAttribute("aria-expanded") === "false") fireEvent.click(b); };
const abrir = async (r: FichaProdutoReal = REAL(), o: { fechados?: boolean } = {}) => {
  render(<GestaoAtributos real={r} voltar={vi.fn()} anunciar={vi.fn()} />);
  await screen.findByRole("region", { name: "Cor" });
  if (!o.fechados) abrirTodos();
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
    expect(within(med).getByText(/1D, 2D ou 3D/)).toBeInTheDocument();
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
    abrirTodos();
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
    expect(screen.getByRole("button", { name: "Subir Preto, posição 1 de 3" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Descer Cinza, posição 3 de 3" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Descer Preto, posição 1 de 3" }));
    await waitFor(() => expect(chamadasDe("cat_reordenar_opcoes")).toHaveLength(1));
    expect(chamadasDe("cat_reordenar_opcoes")[0].a).toEqual({ p_org: ORG, p_atributo: A_COR, p_ids: [O_BRANCO, O_PRETO, O_CINZA] });
  });

  it("o anúncio da ordenação diz a posição nova", async () => {
    const anunciar = vi.fn();
    render(<GestaoAtributos real={REAL()} voltar={vi.fn()} anunciar={anunciar} />);
    await screen.findByRole("region", { name: "Cor" });
    abrirTodos();
    fireEvent.click(screen.getByRole("button", { name: "Descer Preto, posição 1 de 3" }));
    await waitFor(() => expect(anunciar).toHaveBeenCalledWith("«Preto» passou para a posição 2 de 3."));
  });

  it("Esc na confirmação volta atrás sem gravar", async () => {
    await abrir();
    fireEvent.click(within(sec("Cor")).getByRole("button", { name: "Renomear o atributo Cor" }));
    fireEvent.change(screen.getByLabelText("Nome do atributo"), { target: { value: "Cor base" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nome" }));
    fireEvent.keyDown(confirmacao(), { key: "Escape" });
    expect(screen.queryByRole("group", { name: /^Mudar / })).toBeNull();
    expect(chamadasDe("cat_guardar_atributo")).toHaveLength(0);
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

describe("Catálogo: entrada «Gestão» (antes «Atributos»; agora com categorias e marcas, ver GestaoCatalogo.test.tsx)", () => {
  const pagina = (r?: FichaProdutoReal) => {
    const S = seed();
    const run = (fn: () => void) => fn();
    render(<CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} real={r} />);
  };
  it("na página real há um acesso «Gestão» que abre o ecrã, com os Atributos num separador, e volta ao Catálogo", async () => {
    pagina(REAL());
    fireEvent.click(screen.getByRole("button", { name: "Gestão" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Gestão do Catálogo" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Atributos" }));
    expect(await screen.findByRole("region", { name: "Cor" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Voltar ao Catálogo" }));
    expect(screen.getByRole("heading", { level: 1, name: "Catálogo e custos" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Gestão" })).toHaveFocus());
  });
  it("sem a página real (protótipo) não há acesso", () => {
    pagina(undefined);
    expect(screen.queryByRole("button", { name: "Gestão" })).toBeNull();
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

describe("GestaoAtributos: painéis recolhíveis e pesquisa", () => {
  it("começa tudo fechado: o cabeçalho diz nome, tipo, uso e nº de opções, e as opções não estão no ecrã", async () => {
    await abrir(REAL(), { fechados: true });
    const b = cabecalho("Cor");
    expect(b).toHaveAttribute("aria-expanded", "false");
    expect(b).toHaveTextContent("Cor");
    expect(b).toHaveTextContent("Lista com cor");
    expect(b).toHaveTextContent("Usado em 3 produtos");
    expect(b).toHaveTextContent("3 opções");
    expect(cabecalho("Brilho")).toHaveTextContent("1 opção");
    expect(screen.queryByText("Preto")).toBeNull();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    // editar o atributo continua à mão sem abrir
    expect(within(sec("Cor")).getByRole("button", { name: "Renomear o atributo Cor" })).toBeInTheDocument();
  });

  it("abrir liga o botão ao painel (aria-controls), o foco fica no botão, e a lista tem altura fixa com scroll teclável", async () => {
    await abrir(REAL(), { fechados: true });
    const b = cabecalho("Cor");
    b.focus();
    fireEvent.click(b);
    expect(b).toHaveAttribute("aria-expanded", "true");
    expect(b).toHaveFocus();
    const lista = screen.getByRole("region", { name: "Opções de Cor" });
    expect(b.getAttribute("aria-controls")).toBeTruthy();
    expect(document.getElementById(b.getAttribute("aria-controls")!)).toContainElement(lista);
    expect(lista.className).toContain("max-h-72");
    expect(lista.className).toContain("overflow-y-auto");
    expect(lista).toHaveAttribute("tabindex", "0");
    expect(li(lista, "Preto")).toBeInTheDocument();
    fireEvent.click(b);
    expect(b).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: "Opções de Cor" })).toBeNull();
  });

  it("pesquisa por escrita: sem acentos nem maiúsculas, também pelo hex, com a contagem num estado", async () => {
    await abrir(REAL(), { fechados: true });
    fireEvent.click(cabecalho("Cor"));
    const campo = screen.getByRole("searchbox", { name: "Pesquisar opção em Cor" });
    const lista = screen.getByRole("region", { name: "Opções de Cor" });
    fireEvent.change(campo, { target: { value: "PRÉ" } });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(1);
    expect(li(lista, "Preto")).toBeInTheDocument();
    await waitFor(() => expect(within(sec("Cor")).getByRole("status")).toHaveTextContent("1 de 3 opções"));
    fireEvent.change(campo, { target: { value: "#888" } });
    expect(li(lista, "Cinza")).toBeInTheDocument();
    expect(within(lista).getAllByRole("listitem")).toHaveLength(1);
    fireEvent.change(campo, { target: { value: "zzz" } });
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    await waitFor(() => expect(within(sec("Cor")).getByRole("status")).toHaveTextContent("Nenhuma opção encontrada"));
    fireEvent.change(campo, { target: { value: "" } });
    expect(within(screen.getByRole("region", { name: "Opções de Cor" })).getAllByRole("listitem")).toHaveLength(3);
    await waitFor(() => expect(within(sec("Cor")).getByRole("status")).toBeEmptyDOMElement());
  });

  it("com pesquisa ativa Subir/Descer ficam aria-disabled com a razão escrita e não gravam; sem pesquisa voltam", async () => {
    await abrir(REAL(), { fechados: true });
    fireEvent.click(cabecalho("Cor"));
    fireEvent.change(screen.getByRole("searchbox", { name: "Pesquisar opção em Cor" }), { target: { value: "branco" } });
    const desc = screen.getByRole("button", { name: "Descer Branco, posição 2 de 3" });
    expect(desc).toHaveAttribute("aria-disabled", "true");
    expect(desc).not.toBeDisabled();
    expect(desc.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.getElementById(desc.getAttribute("aria-describedby")!)).toHaveTextContent("Limpe a pesquisa para reordenar.");
    fireEvent.click(desc);
    expect(chamadasDe("cat_reordenar_opcoes")).toHaveLength(0);
    fireEvent.change(screen.getByRole("searchbox", { name: "Pesquisar opção em Cor" }), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Descer Branco, posição 2 de 3" })).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByText("Limpe a pesquisa para reordenar.")).toBeNull();
  });

  it("a Medida é um painel simples: fechado não mostra a descrição, aberto mostra-a, sem pesquisa", async () => {
    await abrir(REAL(), { fechados: true });
    expect(screen.queryByText(/2D ou 3D/)).toBeNull();
    fireEvent.click(cabecalho("Medida"));
    expect(within(sec("Medida")).getByText(/2D ou 3D/)).toBeInTheDocument();
    expect(within(sec("Medida")).queryByRole("searchbox")).toBeNull();
  });

  it("o painel continua aberto depois de gravar e reler", async () => {
    await abrir(REAL(), { fechados: true });
    fireEvent.click(cabecalho("Cor"));
    fireEvent.click(screen.getByRole("button", { name: "Desativar Preto" }));
    await waitFor(() => expect(chamadasDe("cat_ler_atributos_gestao")).toHaveLength(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "Desativar Preto" })).toHaveFocus());
    expect(cabecalho("Cor")).toHaveAttribute("aria-expanded", "true");
    expect(cabecalho("Brilho")).toHaveAttribute("aria-expanded", "false");
  });

  it("um atributo recém-criado abre-se sozinho", async () => {
    let criado = false;
    base.responder = (f) => {
      if (f === "cat_guardar_atributo") { criado = true; return { data: { ok: true }, error: null }; }
      if (f !== "cat_ler_atributos_gestao") return { data: { ok: true }, error: null };
      const l = lido();
      if (criado) l.atributos.push({ id: "aaaaaaaa-0000-4000-a000-000000000009", codigo: "acab", nome: "Acabamento", tipo: "lista", tem_hex: false, ordem: 4, ativo: true, usados: 0, opcoes: [] });
      return { data: l, error: null };
    };
    await abrir(REAL(), { fechados: true });
    fireEvent.click(screen.getByRole("button", { name: "Novo atributo" }));
    fireEvent.change(screen.getByLabelText("Nome do atributo"), { target: { value: "Acabamento" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar atributo" }));
    await screen.findByRole("region", { name: "Acabamento" });
    expect(cabecalho("Acabamento")).toHaveAttribute("aria-expanded", "true");
    expect(cabecalho("Cor")).toHaveAttribute("aria-expanded", "false");
  });

  /** A base simulada acumula os atributos criados (por esta ação) e os «criados por outro utilizador» (aparecem na releitura seguinte). */
  const baseComCriados = (outros: string[] = []) => {
    const criados: string[] = [];
    const novo = (nome: string, n: number) => ({ id: `aaaaaaaa-0000-4000-a000-0000000001${String(n).padStart(2, "0")}`, codigo: nome.toLowerCase(), nome, tipo: "lista", tem_hex: false, ordem: 10 + n, ativo: true, usados: 0, opcoes: [] });
    base.responder = (f, a) => {
      if (f === "cat_guardar_atributo") { criados.push(a.p_nome as string); return { data: { ok: true }, error: null }; }
      if (f !== "cat_ler_atributos_gestao") return { data: { ok: true }, error: null };
      const l = lido();
      const nomes = criados.length ? [...criados, ...outros] : [];
      nomes.forEach((nm, i) => l.atributos.push(novo(nm, i) as never));
      return { data: l, error: null };
    };
  };
  const criarAtr = async (nome: string) => {
    fireEvent.click(screen.getByRole("button", { name: "Novo atributo" }));
    fireEvent.change(screen.getByLabelText("Nome do atributo"), { target: { value: nome } });
    fireEvent.click(screen.getByRole("button", { name: "Criar atributo" }));
    await screen.findByRole("region", { name: nome });
  };
  const atrasada = () => REAL({ recarregar: vi.fn(() => new Promise<undefined>((ok) => setTimeout(() => ok(undefined), 80))) });

  it("H1: com o recarregar do Catálogo a demorar, abre só o criado por esta ação (não o que outro utilizador criou)", async () => {
    baseComCriados(["Outro utilizador"]);
    await abrir(atrasada(), { fechados: true });
    await criarAtr("Acabamento");
    await waitFor(() => expect(cabecalho("Acabamento")).toHaveAttribute("aria-expanded", "true"));
    expect(cabecalho("Outro utilizador")).toHaveAttribute("aria-expanded", "false");
    expect(cabecalho("Cor")).toHaveAttribute("aria-expanded", "false");
  });

  it("H1: dois atributos criados seguidos abrem-se os dois", async () => {
    baseComCriados();
    await abrir(atrasada(), { fechados: true });
    await criarAtr("Acabamento");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Criar atributo" })).toBeNull());
    await waitFor(() => expect(cabecalho("Acabamento")).toHaveAttribute("aria-expanded", "true"));
    await criarAtr("Veio");
    await waitFor(() => expect(cabecalho("Veio")).toHaveAttribute("aria-expanded", "true"));
    expect(cabecalho("Acabamento")).toHaveAttribute("aria-expanded", "true");
  });

  it("H1: se a releitura falha depois de criar, não rebenta e não abre nada às cegas", async () => {
    let criou = false;
    base.responder = (f) => {
      if (f === "cat_guardar_atributo") { criou = true; return { data: { ok: true }, error: null }; }
      if (f !== "cat_ler_atributos_gestao") return { data: { ok: true }, error: null };
      return criou ? { data: null, error: { message: "Failed to fetch" } } : { data: lido(), error: null };
    };
    await abrir(REAL(), { fechados: true });
    fireEvent.click(screen.getByRole("button", { name: "Novo atributo" }));
    fireEvent.change(screen.getByLabelText("Nome do atributo"), { target: { value: "Acabamento" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar atributo" }));
    expect(await screen.findByText(/pode estar desatualizada/)).toBeInTheDocument();
    expect(cabecalho("Cor")).toHaveAttribute("aria-expanded", "false");
  });

  it("H1: se a organização mudar antes de a releitura chegar, o atributo da outra não abre nada na nova", async () => {
    baseComCriados();
    const r = atrasada();
    const { rerender } = render(<GestaoAtributos real={r} voltar={vi.fn()} anunciar={vi.fn()} />);
    await screen.findByRole("region", { name: "Cor" });
    fireEvent.click(screen.getByRole("button", { name: "Novo atributo" }));
    fireEvent.change(screen.getByLabelText("Nome do atributo"), { target: { value: "Acabamento" } });
    fireEvent.click(screen.getByRole("button", { name: "Criar atributo" }));
    await waitFor(() => expect(chamadasDe("cat_guardar_atributo")).toHaveLength(1));
    rerender(<GestaoAtributos real={REAL({ org: "11111111-1111-4111-8111-111111111111" })} voltar={vi.fn()} anunciar={vi.fn()} />);
    await new Promise((ok) => setTimeout(ok, 200));
    await screen.findByRole("region", { name: "Acabamento" });
    expect(cabecalho("Acabamento")).toHaveAttribute("aria-expanded", "false");
  });

  it("H2: fechar o painel (botão ou «Fechar todos») fecha o formulário e a confirmação das suas opções; ao reabrir não reaparecem nem roubam o foco", async () => {
    await abrir(REAL(), { fechados: true });
    const b = cabecalho("Cor");
    fireEvent.click(b);
    fireEvent.click(screen.getByRole("button", { name: "Editar Preto" }));
    fireEvent.change(screen.getByLabelText("Nome da opção"), { target: { value: "Negro" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar opção" }));
    expect(confirmacao()).toBeInTheDocument();
    b.focus();
    fireEvent.click(b);
    fireEvent.click(b);
    expect(screen.queryByLabelText("Nome da opção")).toBeNull();
    expect(screen.queryByRole("group", { name: /^Mudar / })).toBeNull();
    expect(screen.getByRole("button", { name: "Editar Preto" })).toHaveAttribute("aria-expanded", "false");
    expect(b).toHaveFocus();
    // nova opção, e agora fechando com «Fechar todos»
    fireEvent.click(screen.getByRole("button", { name: "Nova opção em Cor" }));
    expect(screen.getByLabelText("Nome da opção")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abrir todos" }));
    fireEvent.click(screen.getByRole("button", { name: "Fechar todos" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir todos" }));
    expect(screen.queryByLabelText("Nome da opção")).toBeNull();
    expect(screen.getByRole("button", { name: "Nova opção em Cor" })).toHaveAttribute("aria-expanded", "false");
  });

  it("H3: se o painel se fechar enquanto grava, o foco vai para o botão do painel em vez de se perder", async () => {
    await abrir(atrasada(), { fechados: true });
    const b = cabecalho("Cor");
    fireEvent.click(b);
    fireEvent.click(screen.getByRole("button", { name: "Desativar Preto" }));
    fireEvent.click(b);
    await waitFor(() => expect(chamadasDe("cat_editar_opcao")).toHaveLength(1));
    await waitFor(() => expect(b).toHaveFocus());
  });

  it("M1: a pesquisa não desmonta a opção que tem o formulário aberto", async () => {
    await abrir(REAL(), { fechados: true });
    fireEvent.click(cabecalho("Cor"));
    fireEvent.click(screen.getByRole("button", { name: "Editar Preto" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Pesquisar opção em Cor" }), { target: { value: "cinza" } });
    expect(screen.getByLabelText("Nome da opção")).toBeInTheDocument();
    expect(li(screen.getByRole("region", { name: "Opções de Cor" }), "Cinza")).toBeInTheDocument();
    await waitFor(() => expect(within(sec("Cor")).getByRole("status")).toHaveTextContent("1 de 3 opções"));
  });

  it("M2: sem resultados não há região com scroll focável", async () => {
    await abrir(REAL(), { fechados: true });
    fireEvent.click(cabecalho("Cor"));
    fireEvent.change(screen.getByRole("searchbox", { name: "Pesquisar opção em Cor" }), { target: { value: "zzz" } });
    expect(screen.queryByRole("region", { name: "Opções de Cor" })).toBeNull();
  });

  it("M4: o anúncio da contagem espera (~300 ms) mas a lista filtra logo", async () => {
    await abrir(REAL(), { fechados: true });
    fireEvent.click(cabecalho("Cor"));
    fireEvent.change(screen.getByRole("searchbox", { name: "Pesquisar opção em Cor" }), { target: { value: "pre" } });
    expect(screen.getAllByRole("listitem").filter((x) => (x.textContent ?? "").includes("Cinza"))).toHaveLength(0);
    expect(within(sec("Cor")).getByRole("status")).toBeEmptyDOMElement();
    await waitFor(() => expect(within(sec("Cor")).getByRole("status")).toHaveTextContent("1 de 3 opções"));
  });

  it("«Abrir todos» e «Fechar todos»", async () => {
    await abrir(REAL(), { fechados: true });
    screen.getByRole("button", { name: "Abrir todos" }).focus();
    fireEvent.click(screen.getByRole("button", { name: "Abrir todos" }));
    for (const n of ["Medida", "Cor", "Brilho"]) expect(cabecalho(n)).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Fechar todos" }));
    for (const n of ["Medida", "Cor", "Brilho"]) expect(cabecalho(n)).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Abrir todos" })).toHaveFocus();
  });
});

/* ------------------------------------------------------------------ foto na opção */
describe("GestaoAtributos: foto na opção (a migration ainda não está aplicada: contrato com a base)", () => {
  const A_MAD = "aaaaaaaa-0000-4000-a000-0000000000f1", A_NOVO = "aaaaaaaa-0000-4000-a000-0000000000f9";
  const O_CARV = "bbbbbbbb-0000-4000-a000-0000000000c1", O_NOGU = "bbbbbbbb-0000-4000-a000-0000000000c2", O_PINHO = "bbbbbbbb-0000-4000-a000-0000000000c3", O_OUTRA = "bbbbbbbb-0000-4000-a000-0000000000c4";
  const F1 = `${ORG}/11111111-1111-4111-a111-111111111111.webp`, F2 = `${ORG}/22222222-2222-4222-a222-222222222222.webp`, NOVO = "33333333-3333-4333-a333-333333333333";
  /** Madeira: atributo de cor COM foto (Carvalho só foto; Nogueira foto e hex; Pinho nada). Cor: atributo de cor SEM foto (o de sempre). */
  const lidoFoto = (extra: Record<string, unknown>[] = []) => ({
    atributos: [
      { ...lido().atributos[1] },
      { id: A_MAD, codigo: "madeira", nome: "Madeira", tipo: "lista", tem_hex: true, tem_foto: true, ordem: 4, ativo: true, usados: 5, opcoes: [
        { id: O_CARV, valor: "Carvalho", nome: "Carvalho", hex: null, foto: F1, ordem: 1, ativo: true, usados: 2 },
        { id: O_NOGU, valor: "Nogueira", nome: "Nogueira", hex: "#5C4033", foto: F2, ordem: 2, ativo: true, usados: 0 },
        { id: O_PINHO, valor: "Pinho", nome: "Pinho", hex: null, foto: null, ordem: 3, ativo: true, usados: 0 },
      ] },
      ...extra,
    ],
  });
  let atual: () => unknown;
  const ok = (a: Record<string, unknown>) => ({ data: { ok: true, ...a }, error: null });
  beforeEach(() => {
    atual = lidoFoto;
    base.responder = (f) => (f === "cat_ler_atributos_gestao" ? { data: atual(), error: null }
      : f === "cat_foto_opcao" ? ok({ foto: F1, antiga: null, antiga_orfa: false }) : f === "cat_guardar_opcao" ? { data: { opcao: { id: O_OUTRA, valor: "x", nome: "x", hex: null, ordem: 9 } }, error: null } : ok({}));
    vi.mocked(prepararFotoOpcao).mockReset();
    vi.mocked(prepararFotoOpcao).mockResolvedValue({ ok: true, v: { blob: new Blob([new Uint8Array(1234)], { type: "image/webp" }), largura: 1024, altura: 512, bytes: 1234 } });
    vi.spyOn(crypto, "randomUUID").mockReturnValue(NOVO as `${string}-${string}-${string}-${string}-${string}`);
    URL.createObjectURL = vi.fn(() => "blob:previa");
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => { vi.restoreAllMocks(); });

  const ficheiro = () => new File([new Uint8Array(10)], "pinho.jpg", { type: "image/jpeg" });
  const escolher = async (opcao: string, f: File = ficheiro()) => {
    const campo = screen.getByLabelText(`Ficheiro da foto da opção «${opcao}»`) as HTMLInputElement;
    fireEvent.change(campo, { target: { files: [f] } });
  };
  const botaoFoto = (nome: RegExp | string) => screen.getByRole("button", { name: nome });

  it("a foto vence o hex na linha; sem foto vê-se o hex; sem nenhum dos dois, «sem hex»", async () => {
    await abrir();
    const mad = sec("Madeira");
    const carv = li(mad, "Carvalho");
    expect(carv.querySelector("img")?.getAttribute("src")).toBe(`https://cdn.teste/catalogo-opcoes/${F1}`);
    expect(carv.querySelector("img")?.getAttribute("alt")).toBe("");
    expect(within(carv).queryByText("sem hex")).toBeNull();
    const nogu = li(mad, "Nogueira");
    expect(nogu.querySelector("img")).not.toBeNull();
    expect(within(nogu).getByText("#5C4033")).toBeInTheDocument();
    const pinho = li(mad, "Pinho");
    expect(pinho.querySelector("img")).toBeNull();
    expect(within(pinho).getByText("sem hex")).toBeInTheDocument();
  });

  it("leitura tolerante: sem `tem_foto` nem `foto` (base antiga) não há botões de foto e tudo se vê como antes", async () => {
    atual = lido;
    await abrir();
    expect(screen.queryByRole("button", { name: /foto/i })).toBeNull();
    expect(screen.queryByLabelText(/Ficheiro da foto/)).toBeNull();
    expect(li(sec("Cor"), "Preto").querySelector("[data-hex='#000000']")).not.toBeNull();
  });

  it("só os atributos com foto têm os botões: o de cor sem foto e o sem cor não têm", async () => {
    await abrir();
    expect(within(sec("Cor")).queryByRole("button", { name: /foto/i })).toBeNull();
    expect(within(sec("Madeira")).getAllByRole("button", { name: /foto/i }).length).toBeGreaterThan(0);
  });

  it("sem products.edit vêem-se as fotos mas não há botões para as mudar", async () => {
    await abrir(REAL({ podeEditar: false }));
    expect(li(sec("Madeira"), "Carvalho").querySelector("img")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /foto/i })).toBeNull();
  });

  it("os rótulos: «Adicionar foto» na que não tem, «Trocar foto» e «Remover foto» na que tem, com o nome da opção", async () => {
    await abrir();
    expect(botaoFoto("Adicionar foto à opção «Pinho»")).toHaveTextContent("Adicionar foto");
    expect(botaoFoto("Trocar a foto da opção «Carvalho»")).toHaveTextContent("Trocar foto");
    expect(botaoFoto("Remover a foto da opção «Carvalho»")).toHaveTextContent("Remover foto");
    expect(screen.queryByRole("button", { name: "Remover a foto da opção «Pinho»" })).toBeNull();
    expect(screen.getByLabelText("Ficheiro da foto da opção «Pinho»")).toHaveAttribute("type", "file");
  });

  it("adicionar: escolhe-se o ficheiro, aparece a pré-visualização de 96 px e só ao confirmar carrega (webp, sem sobrepor) e liga à opção", async () => {
    const anunciar = vi.fn();
    render(<GestaoAtributos real={REAL()} voltar={vi.fn()} anunciar={anunciar} />);
    await screen.findByRole("region", { name: "Madeira" });
    abrirTodos();
    await escolher("Pinho");
    const previa = await screen.findByRole("group", { name: "Pré-visualização da foto da opção «Pinho»" });
    const img = previa.querySelector("img") as HTMLImageElement;
    expect(img).toHaveAttribute("src", "blob:previa");
    expect(img.style.width).toBe("96px");
    expect(base.envios).toHaveLength(0);
    expect(chamadasDe("cat_foto_opcao")).toHaveLength(0);
    fireEvent.click(within(previa).getByRole("button", { name: "Guardar foto" }));
    await waitFor(() => expect(chamadasDe("cat_foto_opcao")).toHaveLength(1));
    expect(base.envios).toEqual([expect.objectContaining({ bucket: "catalogo-opcoes", caminho: `${ORG}/${NOVO}.webp`, tipo: "image/webp", upsert: false })]);
    expect(chamadasDe("cat_foto_opcao")[0].a).toEqual({ p_org: ORG, p_opcao: O_PINHO, p_foto: `${ORG}/${NOVO}.webp` });
    await waitFor(() => expect(anunciar).toHaveBeenCalledWith("Foto de «Pinho» guardada."));
    await waitFor(() => expect(chamadasDe("cat_ler_atributos_gestao")).toHaveLength(2));
    await waitFor(() => expect(screen.queryByRole("group", { name: /Pré-visualização/ })).toBeNull());
    expect(base.remocoes).toEqual([]);
    expect(botaoFoto("Adicionar foto à opção «Pinho»")).toHaveFocus();
  });

  it("cancelar a pré-visualização não carrega nada e devolve o foco ao botão", async () => {
    await abrir();
    await escolher("Pinho");
    const previa = await screen.findByRole("group", { name: /Pré-visualização/ });
    fireEvent.click(within(previa).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("group", { name: /Pré-visualização/ })).toBeNull();
    expect(base.envios).toHaveLength(0);
    expect(chamadasDe("cat_foto_opcao")).toHaveLength(0);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:previa");
    expect(botaoFoto("Adicionar foto à opção «Pinho»")).toHaveFocus();
  });

  it("uma foto recusada (tipo, tamanho…) mostra a mensagem num aviso e não abre pré-visualização nem carrega", async () => {
    vi.mocked(prepararFotoOpcao).mockResolvedValue({ ok: false, erro: "A foto tem mais de 5 MB." });
    await abrir();
    await escolher("Pinho");
    expect(await screen.findByText("A foto tem mais de 5 MB.")).toBeInTheDocument();
    expect(screen.getByText("A foto tem mais de 5 MB.").closest("[role='alert']")).not.toBeNull();
    expect(screen.queryByRole("group", { name: /Pré-visualização/ })).toBeNull();
    expect(base.envios).toHaveLength(0);
  });

  it("o progresso é anunciado numa região viva (a ler a foto, a guardar)", async () => {
    let acabar: (v: Awaited<ReturnType<typeof prepararFotoOpcao>>) => void = () => undefined;
    vi.mocked(prepararFotoOpcao).mockReturnValue(new Promise((r) => { acabar = r; }));
    await abrir();
    await escolher("Pinho");
    expect(await screen.findByText("A preparar a foto…")).toBeInTheDocument();
    expect(screen.getByText("A preparar a foto…").closest("[aria-live], [role='status']")).not.toBeNull();
    acabar({ ok: true, v: { blob: new Blob([new Uint8Array(10)], { type: "image/webp" }), largura: 10, altura: 10, bytes: 10 } });
    expect(await screen.findByRole("group", { name: /Pré-visualização/ })).toBeInTheDocument();
  });

  it("trocar: se a antiga já não é usada por nenhuma opção (antiga_orfa), apaga-a do storage depois de ligar a nova", async () => {
    base.responder = (f) => (f === "cat_ler_atributos_gestao" ? { data: atual(), error: null } : f === "cat_foto_opcao" ? ok({ foto: `${ORG}/${NOVO}.webp`, antiga: F1, antiga_orfa: true }) : ok({}));
    await abrir();
    await escolher("Carvalho");
    fireEvent.click(within(await screen.findByRole("group", { name: /Pré-visualização/ })).getByRole("button", { name: "Guardar foto" }));
    await waitFor(() => expect(base.remocoes).toEqual([[F1]]));
    expect(chamadasDe("cat_foto_opcao")[0].a).toMatchObject({ p_opcao: O_CARV });
  });

  it("trocar: se outra opção ainda usa a antiga (antiga_orfa falso), NÃO se apaga do storage", async () => {
    base.responder = (f) => (f === "cat_ler_atributos_gestao" ? { data: atual(), error: null } : f === "cat_foto_opcao" ? ok({ foto: `${ORG}/${NOVO}.webp`, antiga: F1, antiga_orfa: false }) : ok({}));
    await abrir();
    await escolher("Carvalho");
    fireEvent.click(within(await screen.findByRole("group", { name: /Pré-visualização/ })).getByRole("button", { name: "Guardar foto" }));
    await waitFor(() => expect(chamadasDe("cat_foto_opcao")).toHaveLength(1));
    await waitFor(() => expect(chamadasDe("cat_ler_atributos_gestao")).toHaveLength(2));
    expect(base.remocoes).toEqual([]);
  });

  it("se a base recusa (cat_foto_opcao falha), apaga o ficheiro NOVO do storage e mostra a mensagem da base tal como vem", async () => {
    base.responder = (f) => (f === "cat_ler_atributos_gestao" ? { data: atual(), error: null } : f === "cat_foto_opcao" ? erro("CT003", "Só as opções de atributos com foto podem ter foto.") : ok({}));
    await abrir();
    await escolher("Pinho");
    fireEvent.click(within(await screen.findByRole("group", { name: /Pré-visualização/ })).getByRole("button", { name: "Guardar foto" }));
    expect(await screen.findByText("Só as opções de atributos com foto podem ter foto.")).toBeInTheDocument();
    expect(base.remocoes).toEqual([[`${ORG}/${NOVO}.webp`]]);
    // a pré-visualização continua, para tentar de novo
    expect(screen.getByRole("group", { name: /Pré-visualização/ })).toBeInTheDocument();
  });

  it("se o carregamento para o storage falha, não chama a base e diz que não foi possível", async () => {
    base.falhaEnvio = "new row violates row-level security policy";
    await abrir();
    await escolher("Pinho");
    fireEvent.click(within(await screen.findByRole("group", { name: /Pré-visualização/ })).getByRole("button", { name: "Guardar foto" }));
    expect(await screen.findByText(/Não foi possível carregar a foto/)).toBeInTheDocument();
    expect(chamadasDe("cat_foto_opcao")).toHaveLength(0);
    expect(base.remocoes).toEqual([]);
  });

  it("remover: limpa a foto da opção (p_foto null) e apaga a antiga do storage só se ficou órfã", async () => {
    base.responder = (f) => (f === "cat_ler_atributos_gestao" ? { data: atual(), error: null } : f === "cat_foto_opcao" ? ok({ foto: null, antiga: F1, antiga_orfa: true }) : ok({}));
    const anunciar = vi.fn();
    render(<GestaoAtributos real={REAL()} voltar={vi.fn()} anunciar={anunciar} />);
    await screen.findByRole("region", { name: "Madeira" });
    abrirTodos();
    fireEvent.click(botaoFoto("Remover a foto da opção «Carvalho»"));
    await waitFor(() => expect(chamadasDe("cat_foto_opcao")).toHaveLength(1));
    expect(chamadasDe("cat_foto_opcao")[0].a).toEqual({ p_org: ORG, p_opcao: O_CARV, p_foto: null });
    await waitFor(() => expect(base.remocoes).toEqual([[F1]]));
    await waitFor(() => expect(anunciar).toHaveBeenCalledWith("Foto de «Carvalho» removida."));
    expect(base.envios).toHaveLength(0);
  });

  it("remover com a antiga ainda usada por outra opção: não apaga o ficheiro", async () => {
    base.responder = (f) => (f === "cat_ler_atributos_gestao" ? { data: atual(), error: null } : f === "cat_foto_opcao" ? ok({ foto: null, antiga: F1, antiga_orfa: false }) : ok({}));
    await abrir();
    fireEvent.click(botaoFoto("Remover a foto da opção «Carvalho»"));
    await waitFor(() => expect(chamadasDe("cat_ler_atributos_gestao")).toHaveLength(2));
    expect(base.remocoes).toEqual([]);
  });

  it("copiar foto de outra opção do mesmo atributo: reutiliza o caminho, sem carregar nada", async () => {
    await abrir();
    const combo = screen.getByRole("combobox", { name: "Copiar foto de outra opção para «Pinho»" });
    // só as opções DO MESMO atributo que têm foto
    expect(within(combo).getAllByRole("option").map((o) => o.textContent)).toEqual(["Copiar foto de outra opção…", "Carvalho", "Nogueira"]);
    fireEvent.change(combo, { target: { value: O_NOGU } });
    await waitFor(() => expect(chamadasDe("cat_foto_opcao")).toHaveLength(1));
    expect(chamadasDe("cat_foto_opcao")[0].a).toEqual({ p_org: ORG, p_opcao: O_PINHO, p_foto: F2 });
    expect(base.envios).toHaveLength(0);
  });

  it("copiar: a própria opção não aparece na lista, e sem nenhuma outra com foto o campo nem existe", async () => {
    await abrir();
    const combo = screen.getByRole("combobox", { name: "Copiar foto de outra opção para «Carvalho»" });
    expect(within(combo).queryByRole("option", { name: "Carvalho" })).toBeNull();
    cleanup();
    atual = () => ({ atributos: lidoFoto().atributos.map((a) => (a.id === A_MAD ? { ...a, opcoes: (a.opcoes as { foto: string | null }[]).map((o) => ({ ...o, foto: null })) } : a)) });
    await abrir();
    expect(screen.queryByRole("combobox", { name: /Copiar foto/ })).toBeNull();
  });

  it("a Cor sem foto continua a exigir o hex ao criar uma opção; no atributo com foto o hex é opcional", async () => {
    await abrir();
    fireEvent.click(within(sec("Cor")).getByRole("button", { name: "Nova opção em Cor" }));
    fireEvent.change(screen.getByLabelText("Nome da opção"), { target: { value: "Verde" } });
    expect(screen.getByRole("button", { name: "Criar opção" })).toBeDisabled();
    expect(screen.getByText("A cor é obrigatória.")).toBeInTheDocument();
    cleanup();
    await abrir();
    fireEvent.click(within(sec("Madeira")).getByRole("button", { name: "Nova opção em Madeira" }));
    fireEvent.change(screen.getByLabelText("Nome da opção"), { target: { value: "Freixo" } });
    expect(screen.queryByText("A cor é obrigatória.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Criar opção" }));
    await waitFor(() => expect(chamadasDe("cat_guardar_opcao")).toHaveLength(1));
    expect(chamadasDe("cat_guardar_opcao")[0].a).toEqual({ p_org: ORG, p_atributo: A_MAD, p_valor: "Freixo", p_hex: null });
  });

  it("no atributo com foto, editar uma opção sem hex deixa gravar só o nome; limpar um hex existente envia '' (limpa a cor)", async () => {
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Editar Pinho" }));
    fireEvent.change(screen.getByLabelText("Nome da opção"), { target: { value: "Pinho bravo" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar opção" }));
    await waitFor(() => expect(chamadasDe("cat_editar_opcao")).toHaveLength(1));
    expect(chamadasDe("cat_editar_opcao")[0].a).toEqual({ p_org: ORG, p_opcao: O_PINHO, p_nome: "Pinho bravo", p_hex: null, p_ativo: null });
    cleanup();
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Editar Nogueira" }));
    fireEvent.change(screen.getByLabelText("Cor em hexadecimal (#RRGGBB)"), { target: { value: "" } });
    expect(screen.queryByText("A cor é obrigatória.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Guardar opção" }));
    await waitFor(() => expect(chamadasDe("cat_editar_opcao")).toHaveLength(2));
    expect(chamadasDe("cat_editar_opcao")[1].a).toEqual({ p_org: ORG, p_opcao: O_NOGU, p_nome: null, p_hex: "", p_ativo: null });
  });

  describe("criar o atributo com «Tem foto»", () => {
    const criar = async (marcarFoto: boolean) => {
      let criado = false;
      base.responder = (f) => (f === "cat_ler_atributos_gestao"
        ? { data: criado ? { atributos: [...lidoFoto().atributos, { id: A_NOVO, codigo: "acabamento", nome: "Acabamento", tipo: "lista", tem_hex: true, tem_foto: false, ordem: 9, ativo: true, usados: 0, opcoes: [] }] } : lidoFoto(), error: null }
        : f === "cat_guardar_atributo" ? (criado = true, ok({})) : ok({}));
      await abrir();
      fireEvent.click(screen.getByRole("button", { name: "Novo atributo" }));
      fireEvent.change(screen.getByLabelText("Nome do atributo"), { target: { value: "Acabamento" } });
      fireEvent.click(screen.getByRole("checkbox", { name: /Tem cor/ }));
      if (marcarFoto) fireEvent.click(screen.getByRole("checkbox", { name: /Tem foto/ }));
      fireEvent.click(screen.getByRole("button", { name: "Criar atributo" }));
    };
    it("«Tem foto» só aparece depois de marcar «Tem cor» (e só em atributos de lista), desligado por omissão", async () => {
      await abrir();
      fireEvent.click(screen.getByRole("button", { name: "Novo atributo" }));
      expect(screen.queryByRole("checkbox", { name: /Tem foto/ })).toBeNull();
      fireEvent.click(screen.getByRole("checkbox", { name: /Tem cor/ }));
      expect(screen.getByRole("checkbox", { name: /Tem foto/ })).not.toBeChecked();
      fireEvent.click(screen.getByRole("radio", { name: "Medida" }));
      expect(screen.queryByRole("checkbox", { name: /Tem foto/ })).toBeNull();
    });
    it("desmarcar «Tem cor» desmarca e esconde «Tem foto» (a foto só existe em atributos de cor)", async () => {
      await abrir();
      fireEvent.click(screen.getByRole("button", { name: "Novo atributo" }));
      fireEvent.click(screen.getByRole("checkbox", { name: /Tem cor/ }));
      fireEvent.click(screen.getByRole("checkbox", { name: /Tem foto/ }));
      fireEvent.click(screen.getByRole("checkbox", { name: /Tem cor/ }));
      expect(screen.queryByRole("checkbox", { name: /Tem foto/ })).toBeNull();
      fireEvent.change(screen.getByLabelText("Nome do atributo"), { target: { value: "X" } });
      fireEvent.click(screen.getByRole("button", { name: "Criar atributo" }));
      await waitFor(() => expect(chamadasDe("cat_guardar_atributo")).toHaveLength(1));
      expect(chamadasDe("cat_definir_foto_atributo")).toHaveLength(0);
    });
    it("ligado: cria o atributo e depois liga o interruptor com o id do atributo criado", async () => {
      await criar(true);
      await waitFor(() => expect(chamadasDe("cat_definir_foto_atributo")).toHaveLength(1));
      expect(chamadasDe("cat_guardar_atributo")[0].a).toEqual({ p_org: ORG, p_atributo: null, p_nome: "Acabamento", p_tipo: "lista", p_tem_hex: true });
      expect(chamadasDe("cat_definir_foto_atributo")[0].a).toEqual({ p_org: ORG, p_atributo: A_NOVO, p_tem_foto: true });
    });
    it("desligado: não chama cat_definir_foto_atributo (os atributos existentes e os novos sem foto não mudam)", async () => {
      await criar(false);
      await waitFor(() => expect(chamadasDe("cat_guardar_atributo")).toHaveLength(1));
      await waitFor(() => expect(chamadasDe("cat_ler_atributos_gestao")).toHaveLength(2));
      expect(chamadasDe("cat_definir_foto_atributo")).toHaveLength(0);
    });
    it("se a base recusa ligar a foto, mostra a mensagem dela e o atributo fica criado", async () => {
      let criado = false;
      base.responder = (f) => (f === "cat_ler_atributos_gestao"
        ? { data: criado ? { atributos: [...lidoFoto().atributos, { id: A_NOVO, codigo: "acabamento", nome: "Acabamento", tipo: "lista", tem_hex: true, ordem: 9, ativo: true, usados: 0, opcoes: [] }] } : lidoFoto(), error: null }
        : f === "cat_guardar_atributo" ? (criado = true, ok({})) : f === "cat_definir_foto_atributo" ? erro("CT003", "Só os atributos de cor podem ter foto.") : ok({}));
      await abrir();
      fireEvent.click(screen.getByRole("button", { name: "Novo atributo" }));
      fireEvent.change(screen.getByLabelText("Nome do atributo"), { target: { value: "Acabamento" } });
      fireEvent.click(screen.getByRole("checkbox", { name: /Tem cor/ }));
      fireEvent.click(screen.getByRole("checkbox", { name: /Tem foto/ }));
      fireEvent.click(screen.getByRole("button", { name: "Criar atributo" }));
      expect(await screen.findByText("Só os atributos de cor podem ter foto.")).toBeInTheDocument();
      expect(screen.getByRole("region", { name: "Acabamento" })).toBeInTheDocument();
    });
  });
});
