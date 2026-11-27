// O termo de entrega ou devolução na aba Custo: a ação «Termo» na linha do equipamento (só ativo, só com gestão e `hr.pessoas.documentos.emitir`)
// e o diálogo (momento, modelo do tipo recibo sem retribuição, resultado «documento criado, a aguardar assinatura» com a ligação ao RH).
// NÃO há envio por SMS. Hooks simulados: nada vai à base.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { contaUmaVez } from "@/components/rh-exemplo/lib/comoConta";
import type { AtivoDoEquipamento, EquipamentoPessoa } from "@/components/rh-exemplo/lib/equipamentos";

const m = vi.hoisted(() => ({
  permissoes: [] as string[],
  emitir: vi.fn(),
  aEmitir: false,
  modelos: [] as Array<Record<string, unknown>>,
  modelosEstado: { isLoading: false, error: null as unknown },
}));

vi.mock("@/contexts/PermissionsContext", () => ({ usePermissionsOpcional: () => ({ hasPermission: (p: string) => m.permissoes.includes(p) }) }));
vi.mock("@/components/rh-exemplo/hooks/useEquipamentosCusto", () => ({
  useEquipamentosCustoAcoes: () => ({ atribuir: vi.fn(), devolver: vi.fn(), alterarConta: vi.fn(), corrigir: vi.fn() }),
}));
vi.mock("@/hooks/ativos/useTermoAtivo", () => ({ useTermoAtivo: () => ({ emitir: m.emitir, aEmitir: m.aEmitir }) }));
vi.mock("@/components/rh-exemplo/hooks/useModelosDocumentosRH", () => ({
  useModelosDocumentosRH: () => ({ modelos: m.modelos, ...m.modelosEstado }),
}));
vi.mock("./EquipamentoSheet", () => ({ EquipamentoSheet: () => null, PERMISSAO_EDITAR_ATIVOS: "ativos.edit" }));
vi.mock("./CorrigirEquipamentoDialog", () => ({ CorrigirEquipamentoDialog: () => null }));
vi.mock("./CorrigirDatasDialog", () => ({ CorrigirDatasDialog: () => null }));
vi.mock("./EditarContaDialog", () => ({ EditarContaDialog: () => null }));
vi.mock("./DevolverDialog", () => ({ DevolverDialog: () => null }));

import { CustoEquipamentos } from "./CustoEquipamentos";

const PORTATIL: AtivoDoEquipamento = {
  forma: "comprado", codigo: "NIKE-IT-LAP-26-0001", nome: "Portátil 14", tipo: "portatil", estado: "ativo", valorCompra: 1200, valorResidual: 0,
  dataCompra: "2026-01-05", vidaMeses: 36, vidaOrigem: "pagamento", desativadoEm: null,
};
const linha = (p: Partial<EquipamentoPessoa> & Pick<EquipamentoPessoa, "id">): EquipamentoPessoa => ({
  pessoaId: "p1", tipo: "portatil", descricao: "Portátil 14", valor: 1200, entrega: "2026-01-10", conta: contaUmaVez(), estado: "atribuido",
  devolucao: null, estadoDevolucao: null, autor: "", ativoId: "at-1", ativo: PORTATIL, contaDesde: "2026-01-10", ...p,
});
const ATRIBUIDO = linha({ id: "e-atribuido" });
const DEVOLVIDO = linha({ id: "e-devolvido", descricao: "Telemóvel 2", estado: "devolvido", devolucao: "2026-03-01", estadoDevolucao: "bom" });
const FARDA = linha({ id: "e-farda", tipo: "fardamento", descricao: "Colete", ativoId: null, ativo: null });

const MODELO_ENTREGA = { id: "mod-1", nome: "Termo de entrega", tipo: "recibo", activo: true, corpo_html: "<p>{{ativo_nome}} {{pessoa_nome_completo}}</p>" };
const MODELO_DEVOLUCAO = { id: "mod-2", nome: "Termo de devolução", tipo: "recibo", activo: true, corpo_html: "<p>{{ativo_devolucao_data}}</p>" };
const COM_RETRIBUICAO = { id: "mod-3", nome: "Recibo com salário", tipo: "recibo", activo: true, corpo_html: "<p>{{retribuicao_valor_base}}</p>" };
const INATIVO = { id: "mod-4", nome: "Antigo", tipo: "recibo", activo: false, corpo_html: "<p>x</p>" };
const CONTRATO = { id: "mod-5", nome: "Contrato", tipo: "contrato", activo: true, corpo_html: "<p>x</p>" };

const lista = (equipamentos: EquipamentoPessoa[], podeGerir = true) =>
  render(
    <LanguageProvider><MemoryRouter>
      <CustoEquipamentos pessoaId="p1" pessoaNome="Ana" mes="2026-10" autor="RH" equipamentos={equipamentos} podeGerir={podeGerir} />
    </MemoryRouter></LanguageProvider>,
  );
const botaoTermo = (descricao: string) => screen.queryByRole("button", { name: `Emitir o termo de ${descricao}` });

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  m.permissoes = ["hr.pessoas.documentos.emitir"];
  m.emitir.mockReset().mockResolvedValue({ ok: true, termo: { documentoId: "d1", pessoaId: "p1", titulo: "Termo de entrega · NIKE-IT-LAP-26-0001", estado: "a_aguardar_assinatura" } });
  m.aEmitir = false;
  m.modelos = [MODELO_ENTREGA, MODELO_DEVOLUCAO, COM_RETRIBUICAO, INATIVO, CONTRATO];
  m.modelosEstado = { isLoading: false, error: null };
});
afterEach(cleanup);

describe("a ação «Termo» na linha do equipamento", () => {
  it("aparece só num equipamento que é um ativo, a quem gere e tem `hr.pessoas.documentos.emitir`", () => {
    lista([ATRIBUIDO, FARDA]);
    expect(botaoTermo("Portátil 14")).toBeTruthy();
    expect(botaoTermo("Colete")).toBeNull();
  });

  it("não aparece sem a permissão de emitir documentos, nem a quem só lê a lista", () => {
    m.permissoes = [];
    lista([ATRIBUIDO]);
    expect(botaoTermo("Portátil 14")).toBeNull();
    cleanup();
    m.permissoes = ["hr.pessoas.documentos.emitir"];
    lista([ATRIBUIDO], false);
    expect(botaoTermo("Portátil 14")).toBeNull();
  });
});

describe("o diálogo do termo", () => {
  const abrir = (e: EquipamentoPessoa = ATRIBUIDO) => {
    lista([e]);
    fireEvent.click(botaoTermo(e.descricao) as HTMLElement);
    return screen.getByRole("dialog", { name: "Termo de entrega ou devolução" });
  };

  it("oferece só os modelos ativos do tipo recibo sem variáveis de retribuição", () => {
    const janela = abrir();
    const nomes = within(within(janela).getByLabelText("Modelo")).getAllByRole("option").map((o) => o.textContent);
    expect(nomes).toEqual(["Escolha um modelo", "Termo de entrega", "Termo de devolução"]);
  });

  it("o momento é «Entrega» por omissão e a devolução só se oferece numa linha já devolvida", () => {
    const janela = abrir();
    const momento = within(janela).getByLabelText("Momento") as HTMLSelectElement;
    expect(momento.value).toBe("entrega");
    expect((within(momento).getByRole("option", { name: "Devolução" }) as HTMLOptionElement).disabled).toBe(true);
    expect(within(janela).getByText("O termo de devolução só se emite depois de registar a devolução.")).toBeTruthy();
    cleanup();
    const janela2 = abrir(DEVOLVIDO);
    expect((within(within(janela2).getByLabelText("Momento")).getByRole("option", { name: "Devolução" }) as HTMLOptionElement).disabled).toBe(false);
  });

  it("emitir sem modelo escolhido não chama a base", () => {
    const janela = abrir();
    expect((within(janela).getByRole("button", { name: "Emitir termo" }) as HTMLButtonElement).disabled).toBe(true);
    expect(m.emitir).not.toHaveBeenCalled();
  });

  it("emite com o id da linha (pessoas_equipamentos), o momento e o modelo, e diz «a aguardar assinatura» com a ligação ao documento no RH", async () => {
    const janela = abrir();
    fireEvent.change(within(janela).getByLabelText("Modelo"), { target: { value: "mod-1" } });
    fireEvent.click(within(janela).getByRole("button", { name: "Emitir termo" }));
    await waitFor(() => expect(m.emitir).toHaveBeenCalledWith("e-atribuido", "entrega", "mod-1"));
    const estado = await within(janela).findByRole("status");
    expect(estado).toHaveTextContent("Documento criado, a aguardar assinatura.");
    expect(estado).toHaveTextContent("Termo de entrega · NIKE-IT-LAP-26-0001");
    expect(within(janela).getByRole("link", { name: "Ver o documento no RH" }).getAttribute("href")).toBe("/rh-exemplo/pessoas/p1?tab=documentos");
    // Sem envio nenhum: não há botão de enviar nem de SMS.
    expect(within(janela).queryByRole("button", { name: /enviar|sms/i })).toBeNull();
  });

  it("o termo de devolução usa o momento «devolucao»", async () => {
    const janela = abrir(DEVOLVIDO);
    fireEvent.change(within(janela).getByLabelText("Momento"), { target: { value: "devolucao" } });
    fireEvent.change(within(janela).getByLabelText("Modelo"), { target: { value: "mod-2" } });
    fireEvent.click(within(janela).getByRole("button", { name: "Emitir termo" }));
    await waitFor(() => expect(m.emitir).toHaveBeenCalledWith("e-devolvido", "devolucao", "mod-2"));
  });

  it("um erro da base (traduzido) fica à vista e a janela não fecha", async () => {
    m.emitir.mockResolvedValue({ ok: false, mensagem: "Escolha um modelo ativo do tipo recibo desta organização, sem variáveis de retribuição." });
    const janela = abrir();
    fireEvent.change(within(janela).getByLabelText("Modelo"), { target: { value: "mod-1" } });
    fireEvent.click(within(janela).getByRole("button", { name: "Emitir termo" }));
    expect(await within(janela).findByRole("alert")).toHaveTextContent("Escolha um modelo ativo do tipo recibo");
    expect(screen.getByRole("dialog", { name: "Termo de entrega ou devolução" })).toBeTruthy();
  });

  it("sem modelos válidos explica como os criar; a leitura dos modelos falhar também se diz", () => {
    m.modelos = [CONTRATO, COM_RETRIBUICAO];
    const janela = abrir();
    expect(within(janela).getByText(/Não há modelos ativos do tipo recibo/)).toBeTruthy();
    cleanup();
    m.modelosEstado = { isLoading: false, error: new Error("x") };
    const janela2 = abrir();
    expect(within(janela2).getByRole("alert")).toHaveTextContent("Não foi possível ler os modelos de documentos.");
  });
});
