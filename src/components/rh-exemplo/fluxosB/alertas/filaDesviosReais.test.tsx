// A fila de fim de dia e as sugestoes de falta ligadas aos desvios REAIS (`hr_assiduidade_desvios`). A lista vem de
// fora (a mesma que o mapa le); as accoes chamam a assiduidade REAL da pessoa, simulada ao nivel do wrapper -- sem
// Supabase e sem as lojas de exemplo. Falhas da base chegam ao ecra.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";

const acoes = vi.hoisted(() => ({
  marcarFalta: vi.fn(),
  corrigirRealizado: vi.fn(),
  corrigirPicagem: vi.fn(),
  anularFaltaPorAusencia: vi.fn(),
  toastErro: vi.fn(),
  toastOk: vi.fn(),
  realizado: [] as unknown[],
  picagens: [] as unknown[],
  faltas: [] as unknown[],
  ausencias: new Map<string, unknown>(),
  loading: false,
  pessoaLida: [] as string[],
}));

vi.mock("@/components/rh-exemplo/hooks/useAssiduidadeDaPessoa", () => ({
  useAssiduidadeDaPessoa: (pessoaId: string | undefined) => {
    if (pessoaId) acoes.pessoaLida.push(pessoaId);
    return {
      picagens: acoes.picagens,
      realizado: acoes.realizado,
      faltas: acoes.faltas,
      planeado: [],
      ausenciaAprovadaPorDia: acoes.ausencias,
      loading: acoes.loading,
      saving: false,
      marcarFalta: acoes.marcarFalta,
      corrigirRealizado: acoes.corrigirRealizado,
      corrigirPicagem: acoes.corrigirPicagem,
      anularFaltaPorAusencia: acoes.anularFaltaPorAusencia,
    };
  },
  comoRealizadoComCorreccao: (l: unknown) => l,
}));
vi.mock("@/lib/toast", () => ({ toast: { error: acoes.toastErro, success: acoes.toastOk } }));

import { FilaAlertasFimDoDia } from "./FilaAlertasFimDoDia";
import { FaltasPainel } from "../faltas/FaltasPainel";
import { chaveDoDesvio } from "@/components/rh-exemplo/lib/alertasFimDia";
import type { Desvio, PermissoesAssiduidade } from "@/components/rh-exemplo/tiposAssiduidade";

const TUDO: PermissoesAssiduidade = {
  view: true, viewOwn: true, equipaView: true, picar: false, picarOutros: false, gerir: true, corrigir: true, faltasView: true,
  faltasEdit: true, justificacaoView: true, justificacaoEdit: true, validarRealizado: true, obrasRegistar: false,
};
const SO_CORRIGIR: PermissoesAssiduidade = { ...TUDO, faltasEdit: false };
const SO_VER: PermissoesAssiduidade = { ...TUDO, gerir: false, corrigir: false, faltasEdit: false };

const NOMES = new Map([["pessoa-a", "Ana Real"], ["pessoa-b", "Bruno Real"]]);

function desvio(extra: Partial<Desvio> = {}): Desvio {
  return {
    organization_id: "org", pessoa_id: "pessoa-a", data: "2026-10-06", tipo: "planeado_sem_realizado", hora_inicio: "09:00:00",
    hora_fim: "13:00:00", minutos: 240, planeado_id: "plan-1", local_id: null, referencia_id: null, detalhe: null, ...extra,
  };
}

const SEM_HORAS = desvio();
const HORAS_SEM_TURNO = desvio({
  pessoa_id: "pessoa-b", data: "2026-10-05", tipo: "realizado_sem_planeado", hora_inicio: "14:00:00", hora_fim: "16:00:00",
  minutos: 120, planeado_id: null, referencia_id: "real-1",
});
const PAR = desvio({
  pessoa_id: "pessoa-b", data: "2026-10-05", tipo: "pendente_par", hora_inicio: "08:30:00", hora_fim: null, minutos: null,
  planeado_id: null, referencia_id: "pic-1",
});
const COBERTA = desvio({
  data: "2026-10-04", tipo: "falta_coberta_por_ausencia", hora_inicio: "09:00:00", hora_fim: "13:00:00", referencia_id: "aus-1",
});

function fila(desvios: Desvio[], permissoes = TUDO, onAlterado = vi.fn()) {
  render(
    <LanguageProvider>
      <FilaAlertasFimDoDia desvios={desvios} nomePorPessoaId={NOMES} locais={[]} permissoes={permissoes} onAlterado={onAlterado} />
    </LanguageProvider>,
  );
  return onAlterado;
}

/** A linha de um desvio: a chave leva o indice dentro do grupo do dia. */
function linhaDe(d: Desvio, indiceNoDia = 0): HTMLElement {
  return screen.getByTestId(`rhb-alerta-${chaveDoDesvio(d, indiceNoDia)}`);
}

beforeAll(() => {
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  for (const f of [acoes.marcarFalta, acoes.corrigirRealizado, acoes.corrigirPicagem, acoes.anularFaltaPorAusencia, acoes.toastErro, acoes.toastOk]) {
    f.mockReset();
  }
  acoes.marcarFalta.mockResolvedValue(null);
  acoes.corrigirRealizado.mockResolvedValue(null);
  acoes.corrigirPicagem.mockResolvedValue(null);
  acoes.anularFaltaPorAusencia.mockResolvedValue(null);
  acoes.realizado = [];
  acoes.picagens = [];
  acoes.faltas = [];
  acoes.ausencias = new Map();
  acoes.loading = false;
  acoes.pessoaLida = [];
});
afterEach(cleanup);

describe("a fila mostra os desvios reais e so esses", () => {
  it("lista cada tipo da base com o nome real da pessoa e nenhuma pessoa de exemplo", () => {
    fila([SEM_HORAS, HORAS_SEM_TURNO, PAR, COBERTA]);
    expect(screen.getAllByText("Turno planeado sem horas").length).toBeGreaterThan(0);
    expect(screen.getByText("Horas sem turno planeado")).toBeInTheDocument();
    expect(screen.getByText("Picagem por emparelhar")).toBeInTheDocument();
    expect(screen.getByText("Falta agora coberta por ausencia aprovada")).toBeInTheDocument();
    expect(screen.getAllByText("Ana Real").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Sofia Rebelo|Rui|Inês/)).not.toBeInTheDocument();
    expect(screen.getByText("4 desvios")).toBeInTheDocument();
  });

  it("sem desvios diz que nao ha nada por tratar, sem inventar linhas", () => {
    fila([]);
    expect(screen.getByText("Nada por tratar nesta janela")).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /Corrigir|Marcar falta|Anular/ })).toEqual([]);
  });

  it("o filtro de minutos esconde o pequeno mas diz que esta a filtrar; a picagem por emparelhar nunca se esconde", () => {
    fila([desvio({ minutos: 3 }), PAR]);
    fireEvent.change(screen.getByLabelText("Tolerancia"), { target: { value: "10" } });
    expect(screen.getByText("1 desvios, ignorando abaixo de 10 minutos")).toBeInTheDocument();
    expect(screen.getByText("Picagem por emparelhar")).toBeInTheDocument();
    expect(screen.queryByText("Turno planeado sem horas")).not.toBeInTheDocument();
  });

  it("filtrado a vazio nao passa por «nada por tratar»", () => {
    fila([desvio({ minutos: 3 })]);
    fireEvent.change(screen.getByLabelText("Tolerancia"), { target: { value: "30" } });
    expect(screen.getByText(/Nada acima de 30 minutos/)).toBeInTheDocument();
    expect(screen.queryByText("Nada por tratar nesta janela")).not.toBeInTheDocument();
  });

  it("nao oferece Pedir justificacao nem Aceitar diferenca, que a base nao tem", () => {
    fila([SEM_HORAS, HORAS_SEM_TURNO, PAR, COBERTA]);
    expect(screen.queryByRole("button", { name: /Pedir justificação|Aceitar diferença/ })).not.toBeInTheDocument();
  });

  it("as accoes seguem o tipo e as permissoes", () => {
    fila([SEM_HORAS, HORAS_SEM_TURNO, PAR, COBERTA], SO_CORRIGIR);
    expect(within(linhaDe(HORAS_SEM_TURNO, 0)).getByRole("button", { name: "Corrigir" })).toBeInTheDocument();
    expect(within(linhaDe(SEM_HORAS)).queryByRole("button")).not.toBeInTheDocument();
    expect(within(linhaDe(COBERTA)).queryByRole("button")).not.toBeInTheDocument();
    cleanup();
    fila([SEM_HORAS, HORAS_SEM_TURNO, PAR, COBERTA], SO_VER);
    expect(screen.queryAllByRole("button")).toEqual([]);
  });

  it("nao le a assiduidade de ninguem enquanto nenhuma accao esta aberta", () => {
    fila([SEM_HORAS, HORAS_SEM_TURNO]);
    expect(acoes.pessoaLida).toEqual([]);
  });
});

describe("Marcar falta a partir de um desvio", () => {
  it("abre o formulario preenchido com o dia e as horas do desvio e grava pela RPC real", async () => {
    const onAlterado = fila([SEM_HORAS]);
    fireEvent.click(within(linhaDe(SEM_HORAS)).getByRole("button", { name: "Marcar falta" }));
    expect((document.getElementById("rhb-mf-data") as HTMLInputElement).value).toBe("2026-10-06");
    expect((document.getElementById("rhb-mf-inicio") as HTMLInputElement).value).toBe("09:00");
    expect((document.getElementById("rhb-mf-fim") as HTMLInputElement).value).toBe("13:00");
    expect(acoes.pessoaLida).toContain("pessoa-a");

    fireEvent.change(document.getElementById("rhb-mf-motivo") as HTMLSelectElement, { target: { value: "assuntos_pessoais" } });
    const formulario = screen.getByRole("region", { name: "Marcar falta" });
    fireEvent.click(within(formulario).getByRole("button", { name: "Marcar falta" }));

    await waitFor(() => expect(acoes.marcarFalta).toHaveBeenCalledTimes(1));
    expect(acoes.marcarFalta).toHaveBeenCalledWith({ data: "2026-10-06", horaInicio: "09:00", horaFim: "13:00", motivoCodigo: "assuntos_pessoais" });
    await waitFor(() => expect(onAlterado).toHaveBeenCalled());
  });

  it("uma recusa da base fica visivel no formulario e nao recarrega a lista", async () => {
    const onAlterado = fila([SEM_HORAS]);
    acoes.marcarFalta.mockResolvedValue("A base recusou a falta.");
    fireEvent.click(within(linhaDe(SEM_HORAS)).getByRole("button", { name: "Marcar falta" }));
    fireEvent.change(document.getElementById("rhb-mf-motivo") as HTMLSelectElement, { target: { value: "assuntos_pessoais" } });
    fireEvent.click(within(screen.getByRole("region", { name: "Marcar falta" })).getByRole("button", { name: "Marcar falta" }));
    expect(await screen.findByText("A base recusou a falta.")).toBeInTheDocument();
    expect(onAlterado).not.toHaveBeenCalled();
  });
});

describe("Corrigir a partir de um desvio", () => {
  const REALIZADO = {
    id: "real-1", pessoa_id: "pessoa-b", data: "2026-10-05", hora_inicio: "14:00:00", hora_fim: "16:00:00", local_id: null, minutos: 120,
    estado: "pendente", corrige_realizado_id: null, deleted_at: null,
  };

  it("horas sem turno: abre as horas certas e corrige pela RPC real, depois relê a fila", async () => {
    acoes.realizado = [REALIZADO];
    const onAlterado = fila([HORAS_SEM_TURNO]);
    fireEvent.click(within(linhaDe(HORAS_SEM_TURNO)).getByRole("button", { name: "Corrigir" }));
    expect(acoes.pessoaLida).toContain("pessoa-b");
    expect((await screen.findByText("Corrigir as horas")).tagName).toBeDefined();
    expect((document.getElementById("rhb-desvio-realizado-inicio") as HTMLInputElement).value).toBe("14:00");
    fireEvent.change(document.getElementById("rhb-desvio-realizado-fim") as HTMLInputElement, { target: { value: "15:30" } });
    fireEvent.change(document.getElementById("rhb-desvio-realizado-motivo") as HTMLTextAreaElement, { target: { value: "Saiu mais cedo" } });
    fireEvent.click(screen.getByRole("button", { name: "Lancar correccao" }));
    await waitFor(() => expect(acoes.corrigirRealizado).toHaveBeenCalledTimes(1));
    expect(acoes.corrigirRealizado).toHaveBeenCalledWith({
      realizadoId: "real-1", horaInicio: "14:00", horaFim: "15:30", localId: null, motivo: "Saiu mais cedo",
    });
    await waitFor(() => expect(onAlterado).toHaveBeenCalled());
  });

  it("sem motivo escrito nao grava", async () => {
    acoes.realizado = [REALIZADO];
    fila([HORAS_SEM_TURNO]);
    fireEvent.click(within(linhaDe(HORAS_SEM_TURNO)).getByRole("button", { name: "Corrigir" }));
    fireEvent.click(await screen.findByRole("button", { name: "Lancar correccao" }));
    expect(acoes.corrigirRealizado).not.toHaveBeenCalled();
    expect(acoes.toastErro).toHaveBeenCalled();
  });

  it("um erro da base chega ao utilizador e nao relê a lista", async () => {
    acoes.realizado = [REALIZADO];
    acoes.corrigirRealizado.mockResolvedValue("A base recusou a correccao.");
    const onAlterado = fila([HORAS_SEM_TURNO]);
    fireEvent.click(within(linhaDe(HORAS_SEM_TURNO)).getByRole("button", { name: "Corrigir" }));
    await screen.findByText("Corrigir as horas");
    fireEvent.change(document.getElementById("rhb-desvio-realizado-motivo") as HTMLTextAreaElement, { target: { value: "Motivo valido" } });
    fireEvent.click(screen.getByRole("button", { name: "Lancar correccao" }));
    await waitFor(() => expect(acoes.toastErro).toHaveBeenCalledWith("A base recusou a correccao."));
    expect(onAlterado).not.toHaveBeenCalled();
  });

  it("picagem por emparelhar: abre a correccao da picagem certa", async () => {
    acoes.picagens = [{
      id: "pic-1", pessoa_id: "pessoa-b", data_local: "2026-10-05", hora_local: "08:30:00", sentido: "entrada", local_id: null,
      estado: "activa", corrige_picagem_id: null, realizado_id: null, origem: "web",
    }];
    fila([PAR]);
    fireEvent.click(within(linhaDe(PAR)).getByRole("button", { name: "Corrigir" }));
    expect(await screen.findByText("Corrigir uma picagem")).toBeInTheDocument();
  });

  it("se o registo ja nao existe diz-o, em vez de abrir um formulario vazio", async () => {
    acoes.realizado = [];
    fila([HORAS_SEM_TURNO]);
    fireEvent.click(within(linhaDe(HORAS_SEM_TURNO)).getByRole("button", { name: "Corrigir" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Já não há nada para corrigir");
    expect(screen.queryByText("Corrigir as horas")).not.toBeInTheDocument();
  });

  it("enquanto o dia da pessoa ainda esta a ser lido mostra que esta a ler", () => {
    acoes.loading = true;
    fila([HORAS_SEM_TURNO]);
    fireEvent.click(within(linhaDe(HORAS_SEM_TURNO)).getByRole("button", { name: "Corrigir" }));
    expect(screen.getByRole("status")).toHaveTextContent("A ler o dia");
  });
});

describe("Anular a falta coberta por ausencia aprovada", () => {
  const FALTA = { id: "falta-9", pessoa_id: "pessoa-a", data: "2026-10-04", hora_inicio: "09:00:00", hora_fim: "13:00:00", estado: "activa", corrige_falta_id: null };

  it("anula a falta certa com a ausencia aprovada do dia", async () => {
    acoes.faltas = [FALTA];
    acoes.ausencias = new Map([["2026-10-04", { id: "aus-dia-1", data: "2026-10-04", estado: "aprovado", fraccao_dia: 1 }]]);
    const onAlterado = fila([COBERTA]);
    fireEvent.click(within(linhaDe(COBERTA)).getByRole("button", { name: /Anular/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Anular a falta" }));
    await waitFor(() => expect(acoes.anularFaltaPorAusencia).toHaveBeenCalledWith("falta-9", "aus-dia-1"));
    await waitFor(() => expect(onAlterado).toHaveBeenCalled());
    expect(acoes.toastOk).toHaveBeenCalled();
  });

  it("um erro da base chega ao utilizador", async () => {
    acoes.faltas = [FALTA];
    acoes.ausencias = new Map([["2026-10-04", { id: "aus-dia-1", data: "2026-10-04", estado: "aprovado", fraccao_dia: 1 }]]);
    acoes.anularFaltaPorAusencia.mockResolvedValue("Sem permissao.");
    const onAlterado = fila([COBERTA]);
    fireEvent.click(within(linhaDe(COBERTA)).getByRole("button", { name: /Anular/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Anular a falta" }));
    await waitFor(() => expect(acoes.toastErro).toHaveBeenCalledWith("Sem permissao."));
    expect(onAlterado).not.toHaveBeenCalled();
  });

  it("sem falta em vigor a anular diz-o e nao chama a RPC", async () => {
    acoes.ausencias = new Map([["2026-10-04", { id: "aus-dia-1", data: "2026-10-04", estado: "aprovado", fraccao_dia: 1 }]]);
    fila([COBERTA]);
    fireEvent.click(within(linhaDe(COBERTA)).getByRole("button", { name: /Anular/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("não foi encontrada");
    expect(acoes.anularFaltaPorAusencia).not.toHaveBeenCalled();
  });
});

describe("as sugestoes de falta vem dos desvios reais", () => {
  const PESSOAS = [{ id: "pessoa-a", nome: "Ana Real" }];
  function painel(desvios: Desvio[], permissoes = TUDO) {
    render(
      <LanguageProvider>
        <FaltasPainel faltas={[]} desvios={desvios} pessoas={PESSOAS} permissoes={permissoes} onAlterado={vi.fn()} />
      </LanguageProvider>,
    );
  }

  it("sugere o turno sem horas e «Marcar esta falta» abre o formulario com esse periodo", () => {
    painel([SEM_HORAS, HORAS_SEM_TURNO, COBERTA]);
    const botoes = screen.getAllByRole("button", { name: "Marcar esta falta" });
    expect(botoes).toHaveLength(1);
    fireEvent.click(botoes[0]);
    expect((document.getElementById("rhb-mf-data") as HTMLInputElement).value).toBe("2026-10-06");
    expect((document.getElementById("rhb-mf-inicio") as HTMLInputElement).value).toBe("09:00");
    expect((document.getElementById("rhb-mf-fim") as HTMLInputElement).value).toBe("13:00");
  });

  it("sem desvios nao ha sugestoes (nada de exemplo)", () => {
    painel([]);
    expect(screen.getByText("Sem sugestões.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Marcar esta falta" })).not.toBeInTheDocument();
  });

  it("sem permissao de faltas a sugestao aparece mas sem botao", () => {
    painel([SEM_HORAS], { ...TUDO, faltasEdit: false });
    expect(screen.queryByRole("button", { name: "Marcar esta falta" })).not.toBeInTheDocument();
    expect(screen.getByText("Ana Real")).toBeInTheDocument();
  });
});
