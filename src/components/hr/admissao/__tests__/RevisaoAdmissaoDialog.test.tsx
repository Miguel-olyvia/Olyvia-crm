/**
 * `RevisaoAdmissaoDialog`: a revisao do RH, SO DE CONSULTA na V3a (P4). Textos portugueses reais (`tReal`).
 *
 * O que fecha:
 *  - mostra o estado do processo (dois selos), os dados submetidos com as diferencas contra a ficha (em texto, nao so
 *    por cor), os documentos, a ultima devolucao, o que falta e o historico (do mais recente para o mais antigo);
 *  - NISS e IBAN: so «Preenchido»/«Não preenchido» por omissao; «Revelar» chama a segunda leitura SO a pedido, SO com
 *    `hr.onboarding.sensitive`; o valor desaparece ao ocultar, ao fechar, ao mudar de processo e ao fim de um minuto, e
 *    nunca vai para toast, armazenamento ou consola;
 *  - Aprovar, Devolver e Rejeitar existem mas estao `aria-disabled` com a razao («Disponível na próxima fase.») e nao
 *    fazem nada ao clicar (sao da V3b);
 *  - acessibilidade: titulo e descricao, foco devolvido, alvos de 44 px, `role="alert"` nos erros, sem codigos crus.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { tPt } from "./tReal";

vi.mock("@/hooks/useTranslation", async () => {
  const { tPt: t } = await import("./tReal");
  return { useTranslation: () => ({ language: "pt", t }) };
});

let permissoes: Set<string>;
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: (p: string) => permissoes.has(p), loading: false }),
}));

const toast = { error: vi.fn(), success: vi.fn(), warning: vi.fn() };
vi.mock("@/lib/toast", () => ({ toast }));

const revelar = vi.fn();
const recarregar = vi.fn();
let estadoHook: Record<string, unknown>;
const idsPedidos: Array<string | null> = [];
vi.mock("@/hooks/useRevisaoAdmissao", () => ({
  useRevisaoAdmissao: (id: string | null) => {
    idsPedidos.push(id);
    return estadoHook;
  },
}));

import { RevisaoAdmissaoDialog } from "@/components/hr/admissao/RevisaoAdmissaoDialog";

const NISS = "12345678901";
const IBAN = "PT50000201231234567890154";

const REVISAO = {
  estado: "submetida",
  estadoPortal: "ativo",
  validUntil: "2026-12-20T10:00:00Z",
  campos: [
    { chave: "data_nascimento", visivel: true, submetido: "1990-05-02", ficha: null, difere: true },
    { chave: "telefone_pessoal", visivel: true, submetido: "912345678", ficha: "912345678", difere: false },
    { chave: "localidade", visivel: true, submetido: "Porto", ficha: "Lisboa", difere: true },
    { chave: "genero", visivel: true, submetido: null, ficha: null, difere: false },
  ],
  niss: { preenchido: true },
  iban: { preenchido: true },
  anexos: [{ id: "a1", tipo: "cartao_cidadao", criadoEm: "2026-12-14T09:00:00Z", visivel: true }],
  devolucao: null,
  pendencias: [{ codigo: "cargo", origem: "rh", posicao: "rh" }],
  eventos: [
    { acao: "criado", atorTipo: "rh", estadoAnterior: null, estadoPosterior: "convidada", criadoEm: "2026-12-10T08:00:00Z" },
    { acao: "submetido", atorTipo: "pessoa", estadoAnterior: "em_preenchimento", estadoPosterior: "submetida", criadoEm: "2026-12-14T09:00:00Z" },
    { acao: "xpto_novo", atorTipo: "sistema", estadoAnterior: null, estadoPosterior: null, criadoEm: "2026-12-12T09:00:00Z" },
  ],
};

const ITEM = {
  conviteId: "c1",
  pessoaId: "p1",
  nome: "Ana Silva",
  cargo: "Operadora",
  estado: "submetida",
  estadoPortal: "ativo",
  validUntil: "2026-12-20T10:00:00Z",
  submetidoEm: "2026-12-14T09:00:00Z",
  devolvidaEm: null,
  atualizadoEm: null,
} as const;

function definirHook(sobre: Record<string, unknown> = {}) {
  estadoHook = { carregando: false, erro: null, revisao: REVISAO, revelar, recarregar, ...sobre };
}

const aoFechar = vi.fn();
const montar = (item: typeof ITEM | null = ITEM) => render(<RevisaoAdmissaoDialog item={item} aoFechar={aoFechar} />);
const dialogo = () => screen.getByRole("dialog", { name: "Rever a admissão de Ana Silva" });
const linhaDe = (rotulo: string) => within(dialogo()).getByText(rotulo).closest("li") as HTMLElement;

beforeEach(() => {
  permissoes = new Set(["hr.onboarding.approve", "hr.onboarding.sensitive"]);
  revelar.mockReset();
  recarregar.mockReset();
  aoFechar.mockReset();
  toast.error.mockReset();
  toast.success.mockReset();
  idsPedidos.length = 0;
  definirHook();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("o que mostra", () => {
  it("titulo, descricao (so consulta) e o estado do processo com os dois selos", () => {
    montar();
    expect(dialogo()).toHaveAccessibleDescription(/Consulta do que a pessoa submeteu/);
    expect(within(dialogo()).getByText("Admissão")).toBeInTheDocument();
    expect(within(dialogo()).getByText("Submetida")).toBeInTheDocument();
    expect(within(dialogo()).getByText("Ativo")).toBeInTheDocument();
  });

  it("os dados submetidos aparecem com o rotulo real do campo; um campo vazio di-lo", () => {
    montar();
    const nascimento = linhaDe("Data de nascimento");
    expect(nascimento).toHaveTextContent("1990-05-02");
    expect(linhaDe("Género")).toHaveTextContent("Não preenchido");
  });

  it("uma diferenca contra a ficha diz-se em texto e mostra o valor da ficha; o que e igual nao leva aviso", () => {
    montar();
    const localidade = linhaDe("Localidade");
    expect(localidade).toHaveTextContent("Porto");
    expect(localidade).toHaveTextContent("Difere da ficha");
    expect(localidade).toHaveTextContent("Na ficha: Lisboa");
    expect(linhaDe("Data de nascimento")).toHaveTextContent("Na ficha: vazio");
    expect(linhaDe("Telefone pessoal")).not.toHaveTextContent("Difere da ficha");
    expect(linhaDe("Telefone pessoal")).not.toHaveTextContent("Na ficha");
  });

  it("um campo desconhecido do servidor cai num rotulo generico, nunca numa chave de traducao", () => {
    definirHook({ revisao: { ...REVISAO, campos: [{ chave: "campo_novo_xyz", visivel: true, submetido: "a", ficha: null, difere: true }] } });
    montar();
    expect(within(dialogo()).queryByText(/hr\.pendencias/)).not.toBeInTheDocument();
    expect(within(dialogo()).getByText("Campo por identificar")).toBeInTheDocument();
  });

  it("documentos, o que falta e a ultima devolucao", () => {
    definirHook({
      revisao: {
        ...REVISAO,
        devolucao: { campos: { nif: "Confirme o NIF", conta_titular: null }, documentos: ["comprovativo_iban"], observacao: "Obrigado" },
      },
    });
    montar();
    expect(within(dialogo()).getByText(/Cartão de cidadão/)).toBeInTheDocument();
    expect(within(dialogo()).getByText(/Abrir os ficheiros fica disponível na próxima fase/)).toBeInTheDocument();
    expect(within(dialogo()).getByText("Cargo")).toBeInTheDocument();
    expect(within(dialogo()).getByText(/Confirme o NIF/)).toBeInTheDocument();
    expect(within(dialogo()).getByText(/Comprovativo de IBAN/)).toBeInTheDocument();
    expect(within(dialogo()).getByText(/Obrigado/)).toBeInTheDocument();
  });

  it("um campo sem permissao do dominio mostra «Sem permissão para ver este campo» e nunca um valor", () => {
    definirHook({ revisao: { ...REVISAO, campos: [{ chave: "conta_titular", visivel: false, submetido: null, ficha: null, difere: false }] } });
    montar();
    const linha = linhaDe("Titular da conta");
    expect(linha).toHaveTextContent("Sem permissão para ver este campo.");
    expect(linha).not.toHaveTextContent("Não preenchido");
    expect(linha).not.toHaveTextContent("Difere da ficha");
  });

  it("um documento sem permissao (sem id) di-lo, e nao inventa o ficheiro", () => {
    definirHook({ revisao: { ...REVISAO, anexos: [{ id: null, tipo: "comprovativo_iban", criadoEm: "2026-12-14T09:01:00Z", visivel: false }] } });
    montar();
    expect(within(dialogo()).getByText(/Comprovativo de IBAN.*sem permissão para o ver/)).toBeInTheDocument();
  });

  it("o comentario de devolucao de um campo sem permissao (null) di-lo em vez de ficar em branco", () => {
    definirHook({ revisao: { ...REVISAO, devolucao: { campos: { conta_titular: null }, documentos: [], observacao: null } } });
    montar();
    expect(within(dialogo()).getByText(/Titular da conta:/).closest("li")).toHaveTextContent("Sem permissão para ver este campo.");
  });

  it("o estado e a validade vem do resumo da revisao (cancelada, sem campos), mesmo que o item do pipeline diga outra coisa", () => {
    definirHook({
      revisao: { ...REVISAO, estado: "cancelada", estadoPortal: "revogado", validUntil: null, campos: [], anexos: [], pendencias: [] },
    });
    montar();
    expect(within(dialogo()).getByText("Cancelada")).toBeInTheDocument();
    expect(within(dialogo()).getByText("Revogado")).toBeInTheDocument();
    expect(within(dialogo()).queryByText("Submetida")).not.toBeInTheDocument();
  });

  it("o historico vai do mais recente para o mais antigo, com as transicoes; uma acao desconhecida tem texto generico", () => {
    montar();
    const historico = within(dialogo()).getByRole("list", { name: "Histórico" });
    const linhas = within(historico).getAllByRole("listitem");
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toHaveTextContent("Submissão");
    expect(linhas[0]).toHaveTextContent("A pessoa");
    expect(linhas[0]).toHaveTextContent("Em preenchimento");
    expect(linhas[0]).toHaveTextContent("Submetida");
    expect(linhas[1]).toHaveTextContent("Evento do processo");
    expect(linhas[1]).toHaveTextContent("Sistema");
    expect(linhas[2]).toHaveTextContent("Convite criado");
    expect(linhas[2]).toHaveTextContent("RH");
  });

  it("a carregar e sem dados: diz-o em vez de mostrar listas vazias", () => {
    definirHook({ carregando: true, revisao: null });
    montar();
    expect(within(dialogo()).getByText("A carregar a revisão…")).toBeInTheDocument();
    expect(within(dialogo()).queryByText("Dados submetidos")).not.toBeInTheDocument();
  });

  it("sem dados submetidos diz-o", () => {
    definirHook({ revisao: { ...REVISAO, campos: [] } });
    montar();
    expect(within(dialogo()).getByText("A pessoa ainda não submeteu nenhum dado.")).toBeInTheDocument();
  });

  it.each([
    ["nao_encontrado", tPt("hr.convite.erro.naoEncontrado")],
    ["limite_excedido", tPt("hr.convite.erro.limiteExcedido")],
    [null, tPt("rhAdm.erro.revisaoGenerico")],
  ])("erro %s: texto em portugues em role=alert, sem o codigo; «Tentar novamente» recarrega", (codigo, texto) => {
    definirHook({ revisao: null, erro: { codigo } });
    montar();
    const alerta = within(dialogo()).getByRole("alert");
    expect(alerta).toHaveTextContent(texto);
    if (codigo) expect(alerta).not.toHaveTextContent(codigo);
    fireEvent.click(within(dialogo()).getByRole("button", { name: "Tentar novamente" }));
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it("sem item nao pede nada a base e nao mostra nada", () => {
    montar(null);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(idsPedidos[idsPedidos.length - 1]).toBeNull();
  });

  it("pede a revisao do processo certo", () => {
    montar();
    expect(idsPedidos[idsPedidos.length - 1]).toBe("c1");
  });
});

describe("NISS e IBAN: so a pedido", () => {
  it("por omissao so diz «Preenchido» (ou «Não preenchido») e NAO chama a segunda leitura", () => {
    definirHook({ revisao: { ...REVISAO, iban: { preenchido: false } } });
    montar();
    expect(linhaDe("NISS")).toHaveTextContent("Preenchido");
    expect(linhaDe("IBAN")).toHaveTextContent("Não preenchido");
    expect(revelar).not.toHaveBeenCalled();
    expect(dialogo().textContent).not.toContain(NISS);
  });

  it("so oferece «Revelar» onde ha valor", () => {
    definirHook({ revisao: { ...REVISAO, iban: { preenchido: false } } });
    montar();
    expect(screen.getByRole("button", { name: "Revelar NISS" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revelar IBAN" })).not.toBeInTheDocument();
  });

  it("«Revelar» chama a leitura sensivel desse campo e mostra o valor numa regiao anunciada", async () => {
    revelar.mockResolvedValue({ ok: true, valor: NISS });
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Revelar NISS" }));
    await waitFor(() => expect(linhaDe("NISS")).toHaveTextContent(NISS));
    expect(revelar).toHaveBeenCalledTimes(1);
    expect(revelar).toHaveBeenCalledWith("niss");
    expect(within(linhaDe("NISS")).getByRole("status")).toHaveTextContent("NISS mostrado");
    expect(dialogo().textContent).not.toContain(IBAN);
  });

  it("«Ocultar» tira o valor do ecra", async () => {
    revelar.mockResolvedValue({ ok: true, valor: NISS });
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Revelar NISS" }));
    await waitFor(() => expect(linhaDe("NISS")).toHaveTextContent(NISS));
    fireEvent.click(screen.getByRole("button", { name: "Ocultar NISS" }));
    expect(dialogo().textContent).not.toContain(NISS);
    expect(screen.getByRole("button", { name: "Revelar NISS" })).toBeInTheDocument();
  });

  it("o valor volta a esconder-se ao fim de um minuto", async () => {
    vi.useFakeTimers();
    revelar.mockResolvedValue({ ok: true, valor: IBAN });
    montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Revelar IBAN" }));
    });
    expect(dialogo().textContent).toContain(IBAN);
    await act(async () => {
      vi.advanceTimersByTime(59_000);
    });
    expect(dialogo().textContent).toContain(IBAN);
    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });
    expect(dialogo().textContent).not.toContain(IBAN);
  });

  it("fechar a janela apaga o valor: ao voltar a abrir esta escondido e nada foi guardado", async () => {
    revelar.mockResolvedValue({ ok: true, valor: NISS });
    const { rerender } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Revelar NISS" }));
    await waitFor(() => expect(linhaDe("NISS")).toHaveTextContent(NISS));
    rerender(<RevisaoAdmissaoDialog item={null} aoFechar={aoFechar} />);
    expect(document.body.textContent).not.toContain(NISS);
    rerender(<RevisaoAdmissaoDialog item={ITEM} aoFechar={aoFechar} />);
    expect(dialogo().textContent).not.toContain(NISS);
    expect(revelar).toHaveBeenCalledTimes(1);
  });

  it("mudar de processo com a janela aberta tambem apaga o valor", async () => {
    revelar.mockResolvedValue({ ok: true, valor: NISS });
    const { rerender } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Revelar NISS" }));
    await waitFor(() => expect(linhaDe("NISS")).toHaveTextContent(NISS));
    rerender(<RevisaoAdmissaoDialog item={{ ...ITEM, conviteId: "c2", nome: "Rui Costa" }} aoFechar={aoFechar} />);
    expect(document.body.textContent).not.toContain(NISS);
  });

  it("o valor nunca vai para toast, armazenamento do browser nem consola", async () => {
    const espioes = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    revelar.mockResolvedValue({ ok: true, valor: NISS });
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Revelar NISS" }));
    await waitFor(() => expect(linhaDe("NISS")).toHaveTextContent(NISS));
    for (const t of [toast.error, toast.success, toast.warning]) expect(JSON.stringify(t.mock.calls)).not.toContain(NISS);
    for (const e of espioes) expect(JSON.stringify(e.mock.calls)).not.toContain(NISS);
    expect(JSON.stringify(setItem.mock.calls)).not.toContain(NISS);
    expect(window.location.href).not.toContain(NISS);
    espioes.forEach((e) => e.mockRestore());
    setItem.mockRestore();
  });

  it("sem hr.onboarding.sensitive o botao fica aria-disabled, com a razao, e clicar nao chama a base", () => {
    permissoes = new Set(["hr.onboarding.approve"]);
    montar();
    const botao = screen.getByRole("button", { name: "Revelar NISS" });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(botao).not.toBeDisabled();
    const razao = document.getElementById(botao.getAttribute("aria-describedby") ?? "");
    expect(razao).toHaveTextContent("exige a permissão de ver dados sensíveis de admissões");
    fireEvent.click(botao);
    expect(revelar).not.toHaveBeenCalled();
  });

  it.each([
    [{ ok: false, codigo: "limite_excedido" }, tPt("hr.convite.erro.limiteExcedido")],
    [{ ok: false, codigo: "nao_encontrado" }, tPt("hr.convite.erro.naoEncontrado")],
    [{ ok: false, codigo: null }, tPt("rhAdm.erro.revelarGenerico")],
  ])("falha %j: texto em portugues em role=alert e o valor nao aparece", async (resposta, texto) => {
    revelar.mockResolvedValue(resposta);
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Revelar NISS" }));
    const alerta = await within(dialogo()).findByRole("alert");
    expect(alerta).toHaveTextContent(texto);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("enquanto obtem, o botao fica aria-disabled e um segundo clique nao repete o pedido", async () => {
    let resolver!: (v: unknown) => void;
    revelar.mockImplementation(() => new Promise((r) => { resolver = r; }));
    montar();
    const botao = screen.getByRole("button", { name: "Revelar NISS" });
    fireEvent.click(botao);
    fireEvent.click(botao);
    expect(revelar).toHaveBeenCalledTimes(1);
    expect(botao).toHaveAttribute("aria-disabled", "true");
    await act(async () => {
      resolver({ ok: true, valor: NISS });
    });
    expect(linhaDe("NISS")).toHaveTextContent(NISS);
  });
});

describe("as decisoes da V3b: desenhadas e desativadas", () => {
  const NOMES = ["Aprovar", "Devolver com comentários", "Rejeitar"];

  it.each(NOMES)("«%s» existe, esta aria-disabled (continua focavel) e di-lo com a razao", (nome) => {
    montar();
    const botao = within(dialogo()).getByRole("button", { name: nome });
    expect(botao).toHaveAttribute("aria-disabled", "true");
    expect(botao).not.toBeDisabled();
    expect(botao.className).toContain("min-h-11");
    const razao = document.getElementById(botao.getAttribute("aria-describedby") ?? "");
    expect(razao).toHaveTextContent("Disponível na próxima fase.");
  });

  it.each(NOMES)("clicar em «%s» nao faz nada (nem chama a base, nem fecha, nem avisa)", (nome) => {
    montar();
    fireEvent.click(within(dialogo()).getByRole("button", { name: nome }));
    expect(revelar).not.toHaveBeenCalled();
    expect(aoFechar).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(dialogo()).toBeInTheDocument();
  });

  it("estao agrupados e a explicacao diz o que chega na proxima fase", () => {
    montar();
    const grupo = within(dialogo()).getByRole("group", { name: "Decisão do RH" });
    expect(within(grupo).getAllByRole("button")).toHaveLength(3);
    expect(within(grupo).getByText(/chegam na próxima fase/)).toBeInTheDocument();
  });

  it("nao ha campo de mensagem nem de comentarios editavel: e so consulta", () => {
    montar();
    expect(within(dialogo()).queryByRole("textbox")).not.toBeInTheDocument();
  });
});

describe("foco e fecho", () => {
  it("«Fechar» chama aoFechar e tem alvo de 44 px", () => {
    montar();
    const fechar = within(dialogo()).getAllByRole("button", { name: "Fechar" })[0];
    expect(fechar.className).toContain("min-h-11");
    fireEvent.click(fechar);
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it("Escape fecha", () => {
    montar();
    fireEvent.keyDown(dialogo(), { key: "Escape" });
    expect(aoFechar).toHaveBeenCalled();
  });
});
