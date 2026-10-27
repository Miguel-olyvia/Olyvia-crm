// O painel de versoes do horario ligado as linhas REAIS (`pessoas_horario_planeado`) que a ficha entrega, e a gravar
// pelas funcoes da ficha (`savePlaneado` / correccao). Sem base: as linhas entram por props e a gravacao e uma funcao
// simulada. Nada vem dos stores de exemplo.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { HorarioTipoPainel } from "@/components/rh-exemplo/fluxosB/horario/HorarioTipoPainel";
import type { LinhaPlaneadoParaGravar } from "@/components/rh-exemplo/lib/horario";
import type { HorarioPlaneado } from "@/components/rh-exemplo/tipos";
import { rhExemploHorarioRealTranslations } from "@/translations/rhExemploHorarioReal";

function linha(id: string, extra: Partial<HorarioPlaneado> = {}): HorarioPlaneado {
  return {
    id, pessoa_id: "p1", organization_id: "org", vinculo_id: null, local_id: null, dia_semana: 1, data: null,
    hora_inicio: "09:00:00", hora_fim: "17:00:00", nao_trabalha: false, ordem: 1, valido_de: null, valido_ate: null,
    notas: null, corrige_horario_id: null, correccao_motivo: null, corrigido_por_anew_user_id: null,
    corrigido_por_pessoa_id: null, ...extra,
  };
}

const semana = (prefixo: string, extra: Partial<HorarioPlaneado> = {}) =>
  [1, 2, 3, 4, 5].map((d) => linha(`${prefixo}${d}`, { dia_semana: d, ...extra }));

const VIGENTE = semana("v", { valido_de: "2026-10-01" });
const FECHADA = semana("f", { valido_ate: "2026-09-30" });

function abrir(planeado: HorarioPlaneado[], props: Partial<Parameters<typeof HorarioTipoPainel>[0]> = {}) {
  const guardar = vi.fn(async (_linhas: LinhaPlaneadoParaGravar[]): Promise<string | null> => null);
  render(
    <LanguageProvider>
      <HorarioTipoPainel
        planeado={planeado}
        podeEditar
        podeCorrigir
        horasContratadasSemanais={40}
        saving={false}
        onGuardarPlaneado={guardar}
        {...props}
      />
    </LanguageProvider>,
  );
  return guardar;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
  window.localStorage.setItem("language", "pt");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("traducoes do horario real", () => {
  it("en e pt tem exactamente as mesmas chaves", () => {
    const { en, pt } = rhExemploHorarioRealTranslations;
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
  });
});

describe("horario por tipo lido da base", () => {
  it("mostra o tipo e as horas da versao em vigor, sem tolerancia inventada", () => {
    abrir(VIGENTE);
    const vigente = screen.getByTestId("rhb-horario-vigente");
    expect(vigente).toHaveTextContent("Padrão");
    expect(vigente).toHaveTextContent("40 h por semana");
    expect(screen.queryByText(/tolerância/i)).not.toBeInTheDocument();
  });

  it("sem linhas diz que nao ha versao, em vez de mostrar uma de exemplo", () => {
    abrir([]);
    expect(screen.getByText("Esta pessoa ainda não tem versão de horário.")).toBeInTheDocument();
    expect(screen.queryByTestId("rhb-horario-vigente")).not.toBeInTheDocument();
  });

  it("avisa quando as horas planeadas diferem das contratadas", () => {
    abrir(VIGENTE, { horasContratadasSemanais: 35 });
    expect(screen.getByText(/diferente das 35 h contratadas/)).toBeInTheDocument();
  });

  it("dois intervalos no dia aparecem como repartido", () => {
    abrir([linha("a"), linha("b", { ordem: 2, hora_inicio: "18:00:00", hora_fim: "20:00:00" })]);
    expect(screen.getByTestId("rhb-horario-vigente")).toHaveTextContent("Repartido");
  });

  it("lista o historico com a versao fechada e a em vigor", () => {
    abrir([...FECHADA, ...VIGENTE]);
    expect(screen.getAllByText("Em vigor").length).toBeGreaterThan(0);
    expect(screen.getByText("Fechada")).toBeInTheDocument();
  });
});

describe("nova versao", () => {
  it("so oferece os tipos que a base guarda", () => {
    abrir(VIGENTE);
    fireEvent.click(screen.getByRole("button", { name: "Nova versão do horário" }));
    expect(screen.getByRole("radio", { name: /Padrão/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Repartido/ })).toBeInTheDocument();
    for (const nome of [/Isenção/, /Livre/, /Banco de horas/]) expect(screen.queryByRole("radio", { name: nome })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Motivo/)).not.toBeInTheDocument();
  });

  it("guarda pelas linhas da ficha e fecha o formulario", async () => {
    const guardar = abrir(VIGENTE);
    fireEvent.click(screen.getByRole("button", { name: "Nova versão do horário" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar nova versão" }));
    await waitFor(() => expect(guardar).toHaveBeenCalledTimes(1));
    const linhas = guardar.mock.calls[0][0];
    expect(linhas).toHaveLength(5);
    expect(linhas.every((l) => l.data === null && l.dia_semana !== null && !l.nao_trabalha)).toBe(true);
    await waitFor(() => expect(screen.queryByRole("region", { name: "Nova versão do horário" })).not.toBeInTheDocument());
  });

  it("mostra o erro do servidor e nao fecha", async () => {
    abrir(VIGENTE, { onGuardarPlaneado: vi.fn(async () => "Sem permissão para alterar o horário") });
    fireEvent.click(screen.getByRole("button", { name: "Nova versão do horário" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar nova versão" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sem permissão para alterar o horário");
    expect(screen.getByRole("region", { name: "Nova versão do horário" })).toBeInTheDocument();
  });

  it("escolher um horario repartido grava dois intervalos por dia", async () => {
    const guardar = abrir(VIGENTE);
    fireEvent.click(screen.getByRole("button", { name: "Nova versão do horário" }));
    fireEvent.click(screen.getByRole("radio", { name: /Repartido/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar nova versão" }));
    await waitFor(() => expect(guardar).toHaveBeenCalledTimes(1));
    expect(guardar.mock.calls[0][0].filter((l) => l.dia_semana === 2).map((l) => l.ordem)).toEqual([1, 2]);
  });

  it("sem permissao de editar nao oferece criar versoes nem excepcoes", () => {
    abrir(VIGENTE, { podeEditar: false });
    expect(screen.queryByRole("button", { name: "Nova versão do horário" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Exceção de um dia" })).not.toBeInTheDocument();
  });

  it("quando o horario em vigor nao cabe num tipo, avisa em vez de o mostrar errado", () => {
    abrir([linha("a"), linha("b", { ordem: 2, hora_inicio: "18:00:00", hora_fim: "19:00:00" }), linha("c", { ordem: 3, hora_inicio: "20:00:00", hora_fim: "21:00:00" })]);
    fireEvent.click(screen.getByRole("button", { name: "Nova versão do horário" }));
    expect(screen.getByRole("status")).toHaveTextContent("horas diferentes em cada dia");
  });
});

describe("excepcao de um dia", () => {
  it("no passado recusa e nao grava", () => {
    const guardar = abrir(VIGENTE);
    fireEvent.click(screen.getByRole("button", { name: "Exceção de um dia" }));
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-10-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar exceção" }));
    expect(screen.getByRole("alert")).toHaveTextContent("está no passado");
    expect(guardar).not.toHaveBeenCalled();
  });

  it("no futuro grava uma linha com data e mantem o padrao semanal", async () => {
    const guardar = abrir(VIGENTE);
    fireEvent.click(screen.getByRole("button", { name: "Exceção de um dia" }));
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-10-30" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar exceção" }));
    await waitFor(() => expect(guardar).toHaveBeenCalledTimes(1));
    const linhas = guardar.mock.calls[0][0];
    expect(linhas.filter((l) => l.data === "2026-10-30")).toHaveLength(1);
    expect(linhas.filter((l) => l.dia_semana !== null)).toHaveLength(5);
  });

  it("mostra o erro do servidor ao gravar a excepcao", async () => {
    abrir(VIGENTE, { onGuardarPlaneado: vi.fn(async () => "violates check constraint") });
    fireEvent.click(screen.getByRole("button", { name: "Exceção de um dia" }));
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-10-30" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar exceção" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("violates check constraint");
  });

  it("lista as excepcoes por vir e tira-as gravando o resto", async () => {
    const guardar = abrir([...VIGENTE, linha("x", { dia_semana: null, data: "2026-10-30", hora_inicio: "10:00:00", hora_fim: "14:00:00" })]);
    fireEvent.click(screen.getByRole("button", { name: "Exceção de um dia" }));
    expect(screen.getByText("30/10/2026")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tirar exceção" }));
    await waitFor(() => expect(guardar).toHaveBeenCalledTimes(1));
    expect(guardar.mock.calls[0][0].some((l) => l.data !== null)).toBe(false);
    expect(guardar.mock.calls[0][0]).toHaveLength(5);
  });
});

describe("corrigir o passado", () => {
  it("uma versao fechada abre a lista dos seus intervalos e cada um abre a correccao da ficha", () => {
    const aoCorrigir = vi.fn();
    abrir([...FECHADA, ...VIGENTE], { onCorrigirLinha: aoCorrigir });
    const botoes = screen.getAllByRole("button", { name: "Corrigir" });
    expect(botoes).toHaveLength(1);
    fireEvent.click(botoes[0]);
    const lista = screen.getByRole("list", { name: "Corrigir um intervalo desta versão" });
    fireEvent.click(within(lista).getAllByRole("button", { name: "Corrigir" })[0]);
    expect(aoCorrigir).toHaveBeenCalledTimes(1);
    expect(aoCorrigir.mock.calls[0][0].id).toMatch(/^f/);
  });

  it("a versao em vigor nao se corrige, altera-se", () => {
    abrir(VIGENTE, { onCorrigirLinha: vi.fn() });
    expect(screen.queryByRole("button", { name: "Corrigir" })).not.toBeInTheDocument();
  });

  it("sem permissao ou sem a accao da ficha nao ha botao de corrigir", () => {
    abrir([...FECHADA, ...VIGENTE], { podeCorrigir: false, onCorrigirLinha: vi.fn() });
    expect(screen.queryByRole("button", { name: "Corrigir" })).not.toBeInTheDocument();
    cleanup();
    abrir([...FECHADA, ...VIGENTE], { podeCorrigir: true });
    expect(screen.queryByRole("button", { name: "Corrigir" })).not.toBeInTheDocument();
  });

  it("marca a versao que contem uma correccao e mostra o motivo", () => {
    abrir([
      ...FECHADA.slice(1),
      linha("f1c", { dia_semana: 1, valido_ate: "2026-09-30", corrige_horario_id: "f1", correccao_motivo: "Hora errada" }),
      linha("f1", { dia_semana: 1, valido_ate: "2026-09-30" }),
      ...VIGENTE,
    ]);
    expect(screen.getByText("Tem uma correção")).toBeInTheDocument();
    expect(screen.getByText("Motivo da correção: Hora errada")).toBeInTheDocument();
  });
});
