/**
 * Separador Documentos de /rh-exemplo: o menu «Mais acoes» (anular e ocultar, cada um so com a sua permissao e no estado certo),
 * os anulados esbatidos com o motivo, o aviso de documento sem ficheiro, e a lista de ocultados com «Repor».
 * O hook e simulado: aqui testa-se o que o ecra mostra e chama, nao a base.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (chave: string, params?: Record<string, string | number>) => (params ? `${chave} ${JSON.stringify(params)}` : chave),
    language: "pt",
  }),
}));

const { toastError, toastSuccess } = vi.hoisted(() => ({ toastError: vi.fn(), toastSuccess: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: toastError, success: toastSuccess } }));

vi.mock("@/components/rh-exemplo/InserirDocumentoDialog", () => ({ InserirDocumentoDialog: () => null }));
vi.mock("@/components/rh-exemplo/AnexarFicheiroDialog", () => ({ AnexarFicheiroDialog: () => null }));

// O dialogo do motivo e o real; so se registam as props com que e chamado (para ver o que mostra durante a animacao de saida).
const motivoProps = vi.hoisted(() => ({ chamadas: [] as Array<Record<string, unknown>> }));
vi.mock("@/components/rh-exemplo/DocumentoMotivoDialog", async () => {
  const real = await vi.importActual<typeof import("@/components/rh-exemplo/DocumentoMotivoDialog")>(
    "@/components/rh-exemplo/DocumentoMotivoDialog",
  );
  return {
    DocumentoMotivoDialog: (props: Parameters<typeof real.DocumentoMotivoDialog>[0]) => {
      motivoProps.chamadas.push({ ...props });
      return real.DocumentoMotivoDialog(props);
    },
  };
});

const hook = vi.hoisted(() => ({ usar: vi.fn() }));
vi.mock("@/components/rh-exemplo/hooks/usePessoaDocumentos", () => ({ usePessoaDocumentos: hook.usar }));

import { PessoaDocumentosTab, type PermissoesDocumentosFicha } from "@/components/rh-exemplo/PessoaDocumentosTab";

function documento(sobre: Record<string, unknown> = {}) {
  return {
    id: "d1", pessoa_id: "p1", organization_id: "o", vinculo_id: null, modelo_id: "m1", tipo: "contrato", titulo: "Contrato A",
    estado: "a_aguardar_assinatura", ficheiro_caminho: null, ficheiro_hash_sha256: null, ficheiro_anexado_em: null,
    emitido_em: "2026-10-01T10:00:00Z", emitido_por: "u", assinado_em: null, assinatura_origem: null,
    anulado_em: null, anulado_motivo: null, ...sobre,
  };
}

const PERMISSOES: PermissoesDocumentosFicha = {
  view: true, viewOwn: false, edit: true, emitir: false, anular: true, conteudoView: false, modelosView: false, ocultar: true, repor: true,
};

const OCULTADO = {
  documento_id: "x1", tipo: "contrato", titulo: "Contrato antigo", estado: "assinado", emitido_em: null, assinado_em: null,
  entregue_em: null, anulado_em: null, tem_ficheiro: true, ocultado_em: "2026-11-01T10:00:00Z", ocultado_por: "u9",
  ocultado_por_nome: "Ana Rita", ocultado_motivo: "Arquivo antigo",
};

let anular: ReturnType<typeof vi.fn>;
let ocultar: ReturnType<typeof vi.fn>;
let repor: ReturnType<typeof vi.fn>;
let listarOcultados: ReturnType<typeof vi.fn>;

function preparar(documentos: unknown[], ocultados: unknown[] = [], loading = false) {
  anular = vi.fn().mockResolvedValue(null);
  ocultar = vi.fn().mockResolvedValue(null);
  repor = vi.fn().mockResolvedValue(null);
  listarOcultados = vi.fn().mockResolvedValue({ documentos: ocultados, erro: null });
  hook.usar.mockReturnValue({
    documentos, modelos: [], loading, saving: false, recusado: false, recarregar: vi.fn(),
    emitir: vi.fn(), criarPorUpload: vi.fn(), registarAssinaturaExterna: vi.fn(), verConteudo: vi.fn(), assinar: vi.fn(),
    anexarFicheiro: vi.fn(), obterUrlFicheiro: vi.fn(), anular, ocultar, repor, listarOcultados,
  });
}

function montar(permissoes: Partial<PermissoesDocumentosFicha> = {}) {
  return render(
    <PessoaDocumentosTab pessoaId="p1" organizationId="o" souAPessoa={false} permissoes={{ ...PERMISSOES, ...permissoes }} />,
  );
}

const gatilho = () => screen.queryByRole("button", { name: /hr\.documentos\.maisAccoesDe/ });
function abrirMenu() {
  const g = gatilho();
  expect(g).toBeTruthy();
  fireEvent.keyDown(g as HTMLElement, { key: "Enter" });
}

beforeEach(() => {
  vi.clearAllMocks();
  motivoProps.chamadas.length = 0;
});

describe("Carregamento", () => {
  it("na primeira leitura (sem dados ainda) mostra so o loader", () => {
    preparar([], [], true);
    montar();
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByText("hr.documentos.titulo")).toBeNull();
  });

  it("numa releitura (depois de anular ou ocultar) a tabela e o cartao ficam visiveis, sem loader", () => {
    preparar([documento()]);
    const { rerender } = montar();
    expect(screen.getByText("Contrato A")).toBeTruthy();
    preparar([documento()], [], true);
    rerender(<PessoaDocumentosTab pessoaId="p1" organizationId="o" souAPessoa={false} permissoes={PERMISSOES} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Contrato A")).toBeTruthy();
    expect(screen.getByRole("button", { name: /hr\.documentos\.ocultados/ })).toBeTruthy();
    expect(gatilho()).toBeTruthy();
  });

  it("uma lista que ficou vazia depois da primeira leitura tambem nao volta ao loader nas releituras", () => {
    preparar([]);
    const { rerender } = montar();
    expect(screen.getByText("hr.documentos.semDocumentos")).toBeTruthy();
    preparar([], [], true);
    rerender(<PessoaDocumentosTab pessoaId="p1" organizationId="o" souAPessoa={false} permissoes={PERMISSOES} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("hr.documentos.semDocumentos")).toBeTruthy();
  });
});

describe("Mais acoes: quem ve o que", () => {
  it("sem permissao de anular nem de ocultar nao ha menu", () => {
    preparar([documento()]);
    montar({ anular: false, ocultar: false });
    expect(gatilho()).toBeNull();
  });

  it.each([["rascunho"], ["a_aguardar_assinatura"]])("%s: so «Anular documento», mesmo com a permissao de ocultar", async (estado) => {
    preparar([documento({ estado })]);
    montar();
    abrirMenu();
    expect(await screen.findByRole("menuitem", { name: "hr.documentos.anularDocumento" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "hr.documentos.ocultarDocumento" })).toBeNull();
  });

  it.each([["assinado"], ["entregue"], ["anulado"]])("%s: so «Ocultar documento», mesmo com a permissao de anular", async (estado) => {
    preparar([documento({ estado, ficheiro_caminho: "x.pdf", anulado_em: "2026-10-05T10:00:00Z", anulado_motivo: "Engano" })]);
    montar();
    abrirMenu();
    expect(await screen.findByRole("menuitem", { name: "hr.documentos.ocultarDocumento" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "hr.documentos.anularDocumento" })).toBeNull();
  });

  it("sem a permissao de ocultar, um assinado nao tem menu; sem a de anular, um por assinar tambem nao", () => {
    preparar([documento({ id: "a", estado: "assinado", ficheiro_caminho: "x.pdf" }), documento({ id: "b" })]);
    montar({ ocultar: false, anular: false });
    expect(gatilho()).toBeNull();
  });

  it("a permissao de ocultar e opcional (quem nao a passa nao ve o menu num assinado)", () => {
    preparar([documento({ estado: "assinado", ficheiro_caminho: "x.pdf" })]);
    montar({ ocultar: undefined });
    expect(gatilho()).toBeNull();
  });
});

describe("Anular", () => {
  async function abrirAnular() {
    abrirMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "hr.documentos.anularDocumento" }));
    return await screen.findByRole("alertdialog");
  }

  it("pede o motivo, avisa que o colaborador o pode consultar, e chama anular com o motivo", async () => {
    preparar([documento()]);
    montar();
    const dialogo = await abrirAnular();
    expect(within(dialogo).getByText("hr.documentos.motivo.apoioAnular")).toBeTruthy();
    const confirmar = within(dialogo).getByRole("button", { name: "hr.documentos.anular.confirmar" }) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);
    fireEvent.change(within(dialogo).getByLabelText("hr.documentos.motivo.rotulo"), { target: { value: "Emitido por engano" } });
    fireEvent.click(confirmar);
    await waitFor(() => expect(anular).toHaveBeenCalledWith("d1", "Emitido por engano"));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("hr.documentos.anular.sucesso"));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("um erro da base fica no dialogo (anunciado) e nao ha mensagem de sucesso", async () => {
    preparar([documento()]);
    anular.mockResolvedValue("O documento já não está num estado que permita esta ação.");
    montar();
    const dialogo = await abrirAnular();
    fireEvent.change(within(dialogo).getByLabelText("hr.documentos.motivo.rotulo"), { target: { value: "Emitido por engano" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "hr.documentos.anular.confirmar" }));
    expect((await within(dialogo).findByRole("alert")).textContent).toContain("já não está num estado");
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    // Fecha o dialogo: desmontar um Radix aberto deixa o corpo da pagina bloqueado para o teste seguinte.
    fireEvent.click(within(dialogo).getByRole("button", { name: "common.cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("cancelar devolve o foco ao botao «Mais acoes» do documento", async () => {
    preparar([documento()]);
    montar();
    const dialogo = await abrirAnular();
    fireEvent.click(within(dialogo).getByRole("button", { name: "common.cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(gatilho()));
    expect(anular).not.toHaveBeenCalled();
  });
});

describe("Ocultar", () => {
  it("pede o motivo (sem o aviso do colaborador) e chama ocultar", async () => {
    preparar([documento({ estado: "assinado", ficheiro_caminho: "x.pdf" })]);
    montar();
    abrirMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "hr.documentos.ocultarDocumento" }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).queryByText("hr.documentos.motivo.apoioAnular")).toBeNull();
    fireEvent.change(within(dialogo).getByLabelText("hr.documentos.motivo.rotulo"), { target: { value: "Arquivo antigo" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "hr.documentos.ocultar.confirmar" }));
    await waitFor(() => expect(ocultar).toHaveBeenCalledWith("d1", "Arquivo antigo"));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("hr.documentos.ocultar.sucesso"));
  });

  it("ao fechar, o dialogo (ainda a animar a saida) mantem o titulo, a descricao e o botao de ocultar, nao os de anular", async () => {
    preparar([documento({ estado: "assinado", ficheiro_caminho: "x.pdf" })]);
    montar({ repor: false });
    abrirMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "hr.documentos.ocultarDocumento" }));
    const dialogo = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "common.cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    const fechado = motivoProps.chamadas.filter((p) => p.aberto === false).at(-1);
    expect(fechado).toBeTruthy();
    expect(fechado?.titulo).toBe("hr.documentos.ocultar.titulo");
    expect(String(fechado?.descricao)).toContain("hr.documentos.ocultar.descricao");
    expect(String(fechado?.descricao)).toContain("Contrato A");
    expect(fechado?.rotuloConfirmar).toBe("hr.documentos.ocultar.confirmar");
    expect(fechado?.apoioColaborador).toBe(false);
  });
});

describe("Estado de cada documento", () => {
  it("o anulado aparece esbatido com «Anulado a {data}: {motivo}»", () => {
    preparar([documento({ estado: "anulado", anulado_em: "2026-10-05T10:00:00Z", anulado_motivo: "Emitido por engano" })]);
    montar({ anular: false, ocultar: false });
    const nota = screen.getByText(/hr\.documentos\.anuladoEm/);
    expect(nota.textContent).toContain("Emitido por engano");
    expect(nota.textContent).toContain(new Date("2026-10-05T10:00:00Z").toLocaleDateString());
    expect(screen.getByText("Contrato A").closest("td")?.className).toContain("opacity-");
  });

  it("um documento que nao esta anulado nao mostra a nota de anulacao", () => {
    preparar([documento()]);
    montar();
    expect(screen.queryByText(/hr\.documentos\.anuladoEm/)).toBeNull();
  });

  it("o estado «entregue» mostra o seu texto", () => {
    preparar([documento({ estado: "entregue", ficheiro_caminho: "x.pdf" })]);
    montar();
    expect(screen.getByText("hr.estadoDocumentoRH.entregue")).toBeTruthy();
  });

  it("avisa nos por assinar sem ficheiro nem modelo, e so nesses", () => {
    preparar([
      documento({ id: "a", titulo: "Sem nada", modelo_id: null }),
      documento({ id: "b", titulo: "Com modelo" }),
      documento({ id: "c", titulo: "Com ficheiro", modelo_id: null, ficheiro_caminho: "x.pdf" }),
      documento({ id: "d", titulo: "Assinado", modelo_id: null, estado: "assinado", ficheiro_caminho: "y.pdf" }),
    ]);
    montar();
    expect(screen.getAllByText("hr.documentos.semFicheiroAviso")).toHaveLength(1);
    const linha = screen.getByText("Sem nada").closest("tr") as HTMLElement;
    expect(within(linha).getByText("hr.documentos.semFicheiroAviso")).toBeTruthy();
  });
});

describe("Documentos ocultados", () => {
  it("sem a permissao de repor nao ha botao nem se pergunta pela lista", () => {
    preparar([documento()], [OCULTADO]);
    montar({ repor: false });
    expect(screen.queryByRole("button", { name: /hr\.documentos\.ocultados/ })).toBeNull();
    expect(listarOcultados).not.toHaveBeenCalled();
  });

  it("o botao mostra quantos ha", async () => {
    preparar([documento()], [OCULTADO]);
    montar();
    expect(await screen.findByRole("button", { name: /hr\.documentos\.ocultados.*"n":"1"/ })).toBeTruthy();
  });

  it("a lista mostra o descritivo e o motivo, nunca o texto, e repor pede o motivo e chama repor", async () => {
    preparar([documento()], [OCULTADO]);
    montar();
    fireEvent.click(await screen.findByRole("button", { name: /hr\.documentos\.ocultados.*"n":"1"/ }));
    const lista = await screen.findByRole("dialog");
    expect(await within(lista).findByText("Contrato antigo")).toBeTruthy();
    expect(within(lista).getByText(/Arquivo antigo/).textContent).toContain("Ana Rita");
    fireEvent.click(within(lista).getByRole("button", { name: /hr\.documentos\.repor/ }));
    const motivo = await screen.findByRole("alertdialog");
    expect(within(motivo).queryByText("hr.documentos.motivo.apoioAnular")).toBeNull();
    fireEvent.change(within(motivo).getByLabelText("hr.documentos.motivo.rotulo"), { target: { value: "Foi ocultado sem querer" } });
    fireEvent.click(within(motivo).getByRole("button", { name: "hr.documentos.repor.confirmar" }));
    await waitFor(() => expect(repor).toHaveBeenCalledWith("x1", "Foi ocultado sem querer"));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("hr.documentos.repor.sucesso"));
    // A lista e a contagem voltam a ser pedidas depois de repor.
    await waitFor(() => expect(listarOcultados.mock.calls.length).toBeGreaterThanOrEqual(3));
  });

  it("uma lista vazia diz que nao ha ocultados", async () => {
    preparar([documento()], []);
    montar();
    fireEvent.click(await screen.findByRole("button", { name: /hr\.documentos\.ocultados.*"n":"0"/ }));
    expect(await screen.findByText("hr.documentos.ocultadosVazio")).toBeTruthy();
  });

  it("um erro ao listar aparece anunciado", async () => {
    preparar([documento()]);
    listarOcultados.mockResolvedValue({ documentos: [], erro: "Não tem permissão." });
    montar();
    fireEvent.click(await screen.findByRole("button", { name: /hr\.documentos\.ocultados/ }));
    expect((await screen.findByRole("alert")).textContent).toBe("Não tem permissão.");
  });
});
