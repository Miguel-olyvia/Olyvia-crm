/**
 * `SeccaoRegrasSalariais` e `CartaoDireitosSalariais`: a base sem as RPCs (linha calma), a regra em vigor e o historico (com as
 * substituidas em texto), a validacao (um so alerta com ligacoes para os campos, foco no resumo), a confirmacao antes de gravar
 * (data por extenso e resumo do que muda), as faixas (anuncio, foco), e o cartao: texto sem `retribuicao.edit`, dois cliques
 * seguidos sem perder um direito.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (chave: string) => chave, language: "pt" }),
}));
const toastErro = vi.fn();
const toastSucesso = vi.fn();
vi.mock("@/lib/toast", () => ({ toast: { success: (m: string) => toastSucesso(m), error: (m: string) => toastErro(m) } }));

let estadoMock: "ok" | "indisponivel" | "recusado" | "erro" = "ok";
let versoesMock: Array<{ valido_ate: string | null; substituida_em: string | null; id: string }> = [];
const guardarMock = vi.fn(async (..._args: unknown[]) => ({ erro: null as string | null }));
vi.mock("@/hooks/useRegrasSalariais", () => ({
  useRegrasSalariais: () => {
    const validas = versoesMock.filter((v) => !v.substituida_em);
    return {
      versoes: versoesMock,
      emVigor: validas.find((v) => v.valido_ate === null) ?? null,
      maisRecente: validas[0] ?? null,
      estado: estadoMock,
      isLoading: false,
      isSaving: false,
      guardar: guardarMock,
      recarregar: vi.fn(),
    };
  },
}));

// O cartao de direitos: um "servidor" em memoria, para provar que cada gravacao parte do que a base confirmou.
let direitosEstado: "ok" | "indisponivel" = "ok";
let direitosNaBase = { iht: true, km: false, ajudas: false };
let aGravar = false;
let libertar: (() => void) | null = null;
const guardarDireitosMock = vi.fn(async (novos: { iht: boolean; km: boolean; ajudas: boolean }) => {
  aGravar = true;
  await new Promise<void>((resolve) => {
    libertar = resolve;
  });
  direitosNaBase = novos;
  aGravar = false;
  return { erro: null as string | null };
});
vi.mock("@/hooks/usePessoaDireitosSalariais", () => ({
  usePessoaDireitosSalariais: () => ({
    direitos: direitosNaBase,
    estado: direitosEstado,
    isLoading: false,
    isSaving: aGravar,
    guardar: guardarDireitosMock,
    recarregar: vi.fn(),
  }),
}));

import { SeccaoRegrasSalariais } from "@/components/hr/processamento/SeccaoRegrasSalariais";
import { CartaoDireitosSalariais } from "@/components/hr/ficha/CartaoDireitosSalariais";

const regra = {
  id: "r1",
  valido_de: "2026-01-01",
  valido_ate: null,
  subsidio_limite_min: 300,
  subsidio_valor_hora: 0.76,
  subsidio_valor_dia: 6.15,
  he_pct_dia_util: 50,
  he_pct_feriado: 75,
  he_pct_descanso: 100,
  he_limite_anual_min: 6000,
  iht_pct: 25,
  km_valor: 0.4,
  ajudas_custo_dia: 65.89,
  criada_em: "x",
  criada_por_nome: "Ana",
  substituida_em: null,
  noturnas: [],
};

const GRAVAR = "hr.regrasSalariais.guardar";

beforeEach(() => {
  estadoMock = "ok";
  versoesMock = [];
  direitosEstado = "ok";
  direitosNaBase = { iht: true, km: false, ajudas: false };
  aGravar = false;
  libertar = null;
  guardarMock.mockClear();
  guardarDireitosMock.mockClear();
  toastErro.mockClear();
  toastSucesso.mockClear();
});

describe("SeccaoRegrasSalariais", () => {
  it("com a base ainda sem as RPCs diz-o numa linha calma, sem formulario nem alerta", () => {
    estadoMock = "indisponivel";
    render(<SeccaoRegrasSalariais podeGerir />);
    expect(screen.getByTestId("regras-salariais-indisponivel")).toHaveTextContent("hr.regrasSalariais.indisponivel");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: GRAVAR })).toBeNull();
  });

  it("mostra a em vigor e o historico: as datas em <time> e a substituida dita em texto", () => {
    versoesMock = [
      regra,
      { ...regra, id: "r1b", valido_de: "2026-01-01", substituida_em: "2026-02-01T00:00:00Z" },
      { ...regra, id: "r0", valido_de: "2025-01-01", valido_ate: "2025-12-31" },
    ];
    render(<SeccaoRegrasSalariais podeGerir={false} />);
    const historico = screen.getByTestId("regras-salariais-historico");
    expect(historico.querySelectorAll("li")).toHaveLength(3);
    expect(historico.querySelectorAll("time")).toHaveLength(4);
    expect(historico.querySelector("time")?.getAttribute("dateTime")).toBe("2026-01-01");
    expect(historico).toHaveTextContent("hr.regrasSalariais.emVigor");
    expect(historico).toHaveTextContent("hr.regrasSalariais.corrigida");
    expect(historico).toHaveTextContent("hr.regrasSalariais.substituida");
    expect(screen.queryByRole("button", { name: GRAVAR })).toBeNull();
    expect(screen.getByText("hr.regrasSalariais.semPermissaoGerir")).toBeInTheDocument();
  });

  it("um campo invalido nao grava: um so alerta (resumo) com ligacao ao campo, foco no resumo, erro por aria-describedby", async () => {
    versoesMock = [regra];
    render(<SeccaoRegrasSalariais podeGerir />);
    const iht = screen.getByLabelText("hr.regrasSalariais.campoIht");
    fireEvent.change(iht, { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: GRAVAR }));
    expect(guardarMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    const resumo = screen.getByTestId("regras-salariais-resumo-erros");
    await waitFor(() => expect(resumo).toHaveFocus());
    expect(iht).toHaveAttribute("aria-invalid", "true");
    expect(iht.getAttribute("aria-describedby")).toContain("regras-ihtPct-erro");
    const ligacao = within(resumo).getByRole("link");
    expect(ligacao).toHaveAttribute("href", "#regras-ihtPct");
    fireEvent.click(ligacao);
    expect(iht).toHaveFocus();
  });

  it("as faixas anunciam o que se adiciona e remove, o foco nao se perde, e as sobrepostas sao recusadas", () => {
    versoesMock = [regra];
    render(<SeccaoRegrasSalariais podeGerir />);
    const anuncio = screen.getByTestId("regras-salariais-anuncio");
    const adicionar = screen.getByRole("button", { name: "hr.regrasSalariais.faixaAdicionar" });
    fireEvent.click(adicionar);
    expect(anuncio).toHaveTextContent("hr.regrasSalariais.faixaAdicionada");
    fireEvent.click(adicionar);
    const [i1, i2] = screen.getAllByLabelText("hr.regrasSalariais.faixaInicioN");
    const [f1, f2] = screen.getAllByLabelText("hr.regrasSalariais.faixaFimN");
    const [v1, v2] = screen.getAllByLabelText("hr.regrasSalariais.faixaValorPctN");
    // Os campos de hora dizem o formato por aria-describedby.
    expect(i1.getAttribute("aria-describedby")).toContain("regras-faixas-ajuda");
    fireEvent.change(i1, { target: { value: "22:00" } });
    fireEvent.change(f1, { target: { value: "06:00" } });
    fireEvent.change(v1, { target: { value: "25" } });
    fireEvent.change(i2, { target: { value: "05:00" } });
    fireEvent.change(f2, { target: { value: "07:00" } });
    fireEvent.change(v2, { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: GRAVAR }));
    expect(guardarMock).not.toHaveBeenCalled();
    expect(screen.getAllByText("hr.regrasSalariais.erro.faixasSobrepostas").length).toBeGreaterThan(0);

    const remover = screen.getAllByRole("button", { name: "hr.regrasSalariais.faixaRemoverN" });
    fireEvent.click(remover[0]);
    expect(screen.getAllByLabelText("hr.regrasSalariais.faixaInicioN")).toHaveLength(1);
    expect(anuncio).toHaveTextContent("hr.regrasSalariais.faixaRemovida");
    // O foco vai para o «Remover» da faixa que ficou.
    expect(screen.getByRole("button", { name: "hr.regrasSalariais.faixaRemoverN" })).toHaveFocus();
  });

  it("gravar pede confirmacao com a data por extenso e o que muda; so depois de confirmar grava", async () => {
    versoesMock = [regra];
    render(<SeccaoRegrasSalariais podeGerir />);
    fireEvent.change(screen.getByLabelText("hr.regrasSalariais.campoKm"), { target: { value: "0,45" } });
    fireEvent.click(screen.getByRole("button", { name: "hr.regrasSalariais.faixaAdicionar" }));
    fireEvent.change(screen.getByLabelText("hr.regrasSalariais.faixaInicioN"), { target: { value: "21:00" } });
    fireEvent.change(screen.getByLabelText("hr.regrasSalariais.faixaFimN"), { target: { value: "24:00" } });
    fireEvent.change(screen.getByLabelText("hr.regrasSalariais.faixaValorPctN"), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText("hr.regrasSalariais.campoValidoDe"), { target: { value: "2027-03-01" } });
    fireEvent.click(screen.getByRole("button", { name: GRAVAR }));

    const dialogo = await screen.findByRole("alertdialog");
    expect(guardarMock).not.toHaveBeenCalled();
    expect(dialogo).toHaveTextContent("hr.regrasSalariais.confirmar.valeAPartir");
    expect(dialogo).toHaveTextContent("hr.regrasSalariais.confirmar.naoAlteraFechados");
    // Duas mudancas: o km e as faixas (a regra tinha 0,40 e nenhuma faixa).
    expect(within(dialogo).getAllByRole("listitem")).toHaveLength(2);
    // O foco abre no Cancelar.
    await waitFor(() => expect(within(dialogo).getByRole("button", { name: "common.cancel" })).toHaveFocus());

    fireEvent.click(within(dialogo).getByRole("button", { name: "hr.regrasSalariais.confirmar.gravar" }));
    await waitFor(() => expect(guardarMock).toHaveBeenCalledTimes(1));
    const [validoDe, payload] = guardarMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(validoDe).toBe("2027-03-01");
    expect(payload).toMatchObject({
      subsidio_limite_min: 300,
      km_valor: 0.45,
      he_limite_anual_min: 6000,
      noturnas: [{ hora_inicio: "21:00", hora_fim: "24:00", percentagem: 25 }],
    });
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith("hr.regrasSalariais.guardarSucesso"));
  });

  it("cancelar a confirmacao nao grava nada", async () => {
    versoesMock = [regra];
    render(<SeccaoRegrasSalariais podeGerir />);
    fireEvent.click(screen.getByRole("button", { name: GRAVAR }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo).toHaveTextContent("hr.regrasSalariais.confirmar.semMudancas");
    fireEvent.click(within(dialogo).getByRole("button", { name: "common.cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(guardarMock).not.toHaveBeenCalled();
  });

  it("um erro da base aparece traduzido e nao apaga o formulario", async () => {
    versoesMock = [regra];
    guardarMock.mockResolvedValueOnce({ erro: "hr.regrasSalariais.erro.retroactiva" });
    render(<SeccaoRegrasSalariais podeGerir />);
    fireEvent.click(screen.getByRole("button", { name: GRAVAR }));
    const dialogo = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "hr.regrasSalariais.confirmar.gravar" }));
    await waitFor(() => expect(toastErro).toHaveBeenCalledWith("hr.regrasSalariais.erro.retroactiva"));
    expect(screen.getByLabelText("hr.regrasSalariais.campoIht")).toHaveValue("25");
  });
});

describe("CartaoDireitosSalariais", () => {
  it("quem nao pode alterar ve uma lista de definicao em texto, sem interruptores", () => {
    const { container } = render(<CartaoDireitosSalariais pessoaId="p1" organizationId="org" podeAlterar={false} />);
    expect(screen.getByTestId("direito-texto-iht")).toHaveTextContent("hr.direitosSalariais.tem");
    expect(screen.getByTestId("direito-texto-km")).toHaveTextContent("hr.direitosSalariais.naoTem");
    expect(container.querySelectorAll("dt")).toHaveLength(3);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByRole("group")).toHaveAccessibleDescription("hr.direitosSalariais.subtitulo");
  });

  it("o estado de cada interruptor diz-se por aria-describedby, sem aria-hidden", () => {
    render(<CartaoDireitosSalariais pessoaId="p1" organizationId="org" podeAlterar />);
    const km = screen.getByRole("switch", { name: "hr.direitosSalariais.km" });
    expect(km).toHaveAccessibleDescription("hr.direitosSalariais.naoTem");
    expect(screen.getByRole("switch", { name: "hr.direitosSalariais.iht" })).toHaveAccessibleDescription("hr.direitosSalariais.tem");
  });

  it("dois cliques seguidos: o segundo e ignorado enquanto grava, e a gravacao seguinte parte do que a base confirmou", async () => {
    const { rerender } = render(<CartaoDireitosSalariais pessoaId="p1" organizationId="org" podeAlterar />);
    fireEvent.click(screen.getByRole("switch", { name: "hr.direitosSalariais.km" }));
    await waitFor(() => expect(guardarDireitosMock).toHaveBeenCalledWith({ iht: true, km: true, ajudas: false }));
    rerender(<CartaoDireitosSalariais pessoaId="p1" organizationId="org" podeAlterar />);
    // A gravar: o segundo clique nao faz nada.
    fireEvent.click(screen.getByRole("switch", { name: "hr.direitosSalariais.ajudas" }));
    expect(guardarDireitosMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      libertar?.();
    });
    await waitFor(() => expect(toastSucesso).toHaveBeenCalledWith("hr.direitosSalariais.guardarSucesso"));
    rerender(<CartaoDireitosSalariais pessoaId="p1" organizationId="org" podeAlterar />);
    fireEvent.click(screen.getByRole("switch", { name: "hr.direitosSalariais.ajudas" }));
    // Parte da leitura confirmada (km ja ligado): nenhum direito se perde.
    await waitFor(() => expect(guardarDireitosMock).toHaveBeenLastCalledWith({ iht: true, km: true, ajudas: true }));
    await act(async () => {
      libertar?.();
    });
  });

  it("com a base sem as RPCs diz-o numa linha calma", () => {
    direitosEstado = "indisponivel";
    render(<CartaoDireitosSalariais pessoaId="p1" organizationId="org" podeAlterar />);
    expect(screen.getByTestId("direitos-salariais-indisponivel")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });
});
