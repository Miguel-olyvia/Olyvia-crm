// Arranque das duas alterações da frente D: o banco de horas na aba Horário da ficha (só com horário «banco de horas»)
// e as horas extra pendentes na fila de trabalho do mapa de assiduidade (mesmas ações do store da frente C).
import { beforeEach, describe, expect, it, vi } from "vitest";
// As justificacoes do dia vivem na base: aqui a base e simulada (sem CompanyProvider e sem chamadas).
vi.mock("@/components/rh-exemplo/hooks/useJustificacoesDoDia", async () => (await import("@/test/justificacoesDoDiaFalso")).wrapperFalso());
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { lerEstado, repor } from "@/components/rh-exemplo/dados/loja";
import { reporGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { reporFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { BancoHorasDaFicha } from "@/components/rh-exemplo/fluxosC/BancoHorasDaFicha";
import { HorasExtraNaFila } from "@/components/rh-exemplo/fluxosC/HorasExtraNaFila";
import { decidirHoraExtraNaLoja, definirRegrasPagamentoHE, lerFluxosC, reporFluxosC } from "@/components/rh-exemplo/fluxosC/lojaFluxosC";
import { calcularSalario } from "@/components/rh-exemplo/fluxosC/salarioRegras";
import { entradaSalarioDaFicha } from "@/components/rh-exemplo/fluxosC/salarioContexto";
import { hojeIso } from "@/components/rh-exemplo/lib/assiduidade";
import { ContratoGrupoTempoTrabalho } from "@/components/rh-exemplo/contrato/ContratoGrupoTempoTrabalho";
import { ConfiguracaoHorasExtra } from "@/components/rh-exemplo/fluxosC/ConfiguracaoHorasExtra";
import { HorasExtraDaPessoa } from "@/components/rh-exemplo/fluxosC/HorasExtraDaPessoa";
import { limiteAnualMin } from "@/components/rh-exemplo/fluxosC/limitePessoa";
import { menuSections } from "@/components/sidebar/menuConfig";
import { PessoaHorarioTab } from "@/components/rh-exemplo/PessoaHorarioTab";
import { rhExemploFluxosDTranslations } from "@/translations/rhExemploFluxosD";
import RhAssiduidadeOrganizacao from "./RhAssiduidadeOrganizacao";

// Os limites e coeficientes vêm da base: aqui os wrappers são simulados (sem Supabase). O que se vê da base fica
// testado em fluxosC/horasExtraReal.test.tsx.
vi.mock("@/components/rh-exemplo/hooks/usePessoa", () => ({
  usePessoa: () => ({ vinculos: [], loading: false, error: null }),
}));
vi.mock("@/components/rh-exemplo/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: () => true, hasAnyPermission: () => true, permissions: [], loading: false }),
}));
vi.mock("@/components/rh-exemplo/hooks/useCodigosProcessamento", () => ({
  useCodigosProcessamento: () => ({ codigos: [], isLoading: false, isSaving: false, error: null, criar: vi.fn(), actualizar: vi.fn(), definirActivo: vi.fn() }),
}));

const noRouter = (elemento: JSX.Element) =>
  render(
    <LanguageProvider>
      <MemoryRouter>{elemento}</MemoryRouter>
    </LanguageProvider>,
  );

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  repor();
  reporGestao();
  reporFluxosB();
  reporFluxosC();
});

describe("traduções da frente D", () => {
  it("en e pt têm exatamente as mesmas chaves", () => {
    const { en, pt } = rhExemploFluxosDTranslations;
    expect(Object.keys(en).sort()).toEqual(Object.keys(pt).sort());
  });
});

describe("banco de horas na ficha", () => {
  it("aparece para quem tem horário de banco de horas, com ajustes para o RH", () => {
    noRouter(<BancoHorasDaFicha pessoaId="p-rui" podeAjustar />);
    expect(screen.getByRole("heading", { name: /Banco de horas/i })).toBeInTheDocument();
    expect(screen.getByText("Folga gozada por banco de horas")).toBeInTheDocument();
    expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(2);
  });

  it("não aparece para quem tem outro tipo de horário", () => {
    noRouter(<BancoHorasDaFicha pessoaId="p-sofia" podeAjustar />);
    expect(screen.queryByTestId("rhd-banco-ficha")).not.toBeInTheDocument();
  });

  it("está montado na aba Horário da ficha da pessoa com banco de horas", () => {
    const ficha = lerEstado().fichas["p-rui"];
    noRouter(
      <PessoaHorarioTab
        pessoaId="p-rui"
        planeado={ficha.horarioPlaneado}
        realizado={ficha.horarioRealizado}
        locais={[]}
        locaisALoad={false}
        podeVerPlaneado
        podeEditarPlaneado
        podeVerRealizado
        saving={false}
        onGuardarPlaneado={async () => null}
      />,
    );
    expect(screen.getByTestId("rhd-banco-ficha")).toBeInTheDocument();
  });
});

describe("horas extra na fila de trabalho", () => {
  const pendentes = () => lerFluxosC().horasExtra.filter((h) => h.estado === "pendente");

  it("lista só as pendentes, com chip de texto, tempo a mais e os dois botões", () => {
    noRouter(<HorasExtraNaFila />);
    const linhas = screen.getAllByTestId(/^rhd-fila-he-/);
    expect(linhas).toHaveLength(pendentes().length);
    expect(screen.getAllByText("Hora extra pendente")).toHaveLength(pendentes().length);
    expect(within(linhas[0]).getByText(/a mais/)).toBeInTheDocument();
    expect(within(linhas[0]).getByRole("button", { name: /^Confirmar hora extra:/ })).toBeInTheDocument();
    expect(within(linhas[0]).getByRole("button", { name: /^Rejeitar hora extra:/ })).toBeInTheDocument();
  });

  it("confirmar usa a ação do store e a linha sai da fila", () => {
    noRouter(<HorasExtraNaFila />);
    const antes = pendentes().length;
    const linha = screen.getAllByTestId(/^rhd-fila-he-/)[0];
    const id = (linha.getAttribute("data-testid") ?? "").replace("rhd-fila-he-", "");
    fireEvent.click(within(linha).getByRole("button", { name: /^Confirmar hora extra:/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmar" }));
    expect(lerFluxosC().horasExtra.find((h) => h.id === id)?.estado).toBe("confirmada");
    expect(pendentes()).toHaveLength(antes - 1);
    expect(screen.queryByTestId(`rhd-fila-he-${id}`)).not.toBeInTheDocument();
  });

  it("rejeitar exige motivo de 3 caracteres", () => {
    noRouter(<HorasExtraNaFila />);
    const antes = pendentes().length;
    fireEvent.click(screen.getAllByRole("button", { name: /^Rejeitar hora extra:/ })[0]);
    const dialogo = screen.getByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: "ab" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Rejeitar" }));
    expect(pendentes()).toHaveLength(antes);
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: "abc" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Rejeitar" }));
    expect(pendentes()).toHaveLength(antes - 1);
  });

  it("o separador da fila mostra o contador e abre com as horas extra", async () => {
    noRouter(<RhAssiduidadeOrganizacao />);
    const contador = await screen.findByTestId("rhd-contador-fila");
    expect(Number(contador.textContent)).toBeGreaterThanOrEqual(pendentes().length);
    const separador = contador.closest("[role=tab]") as HTMLElement;
    fireEvent.mouseDown(separador);
    fireEvent.click(separador);
    expect(await screen.findByTestId("rhd-fila-horas-extra")).toBeInTheDocument();
  });
});

describe("horas extra: limites, configuração e histórico", () => {
  it("«Horas extra» já não é entrada nem caminho do menu de RH", () => {
    const grupo = menuSections.find((s) => s.id === "rh-exemplo");
    expect(grupo?.items?.some((i) => i.to === "/rh-exemplo/horas-extra")).toBe(false);
    expect(grupo?.paths).not.toContain("/rh-exemplo/horas-extra");
  });

  it("o limite anual da pessoa é o «Horas anuais máximas» do Contrato; sem ele vale o da organização", () => {
    const ficha = lerEstado().fichas["p-sofia"];
    expect(limiteAnualMin(ficha, 9000)).toBe(9000);
    const comLimite = { ...ficha, vinculos: ficha.vinculos.map((v) => ({ ...v, horas_anuais_maximas: 100 })) };
    expect(limiteAnualMin(comLimite, 9000)).toBe(6000);
  });

  it("o interruptor está no grupo «Tempo de trabalho» do Contrato e os máximos só ficam ativos com ele ligado", () => {
    const rascunho = { horas_anuais_maximas: "", horas_semanais_maximas: "", regime: "tempo_inteiro", tipo_trabalho: "", horas_periodo: "40", horas_frequencia: "semanal", politica_feriados: "nao_laboral", isencao_horario: false, dias_uteis: [1] } as unknown as Parameters<typeof ContratoGrupoTempoTrabalho>[0]["rascunho"];
    noRouter(<ContratoGrupoTempoTrabalho rascunho={rascunho} definir={() => {}} podeEditar criandoContrato={false} pessoaId="p-marta" erroDe={() => null} />);
    const interruptor = screen.getByRole("switch", { name: "Pode fazer horas extra" });
    expect(interruptor).toHaveAttribute("aria-checked", "false");
    expect(screen.getByLabelText(/Horas anuais máximas/i)).toBeDisabled();
    fireEvent.click(interruptor);
    expect(screen.getByLabelText(/Horas anuais máximas/i)).toBeEnabled();
  });

  it("o alerta configura-se em Processamento salarial > Configuração (os coeficientes são da base, ver horasExtraReal.test)", () => {
    noRouter(<ConfiguracaoHorasExtra />);
    fireEvent.change(screen.getByLabelText(/Alerta a/), { target: { value: "70" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Guardar" })[0]);
    expect(lerFluxosC().limites.alertaPct).toBe(70);
  });

  it("o cálculo do mês usa só as confirmadas e os coeficientes configurados", () => {
    const total = () => {
      const ficha = lerEstado().fichas["p-sofia"];
      const [ano, mes] = hojeIso().split("-").map(Number);
      return calcularSalario(entradaSalarioDaFicha(ficha, lerFluxosC(), ano, mes)).totalBruto ?? 0;
    };
    const base = total();
    decidirHoraExtraNaLoja("he-sofia-2026-10-06", "confirmar", "");
    const comUma = total();
    expect(comUma).toBeGreaterThan(base);
    definirRegrasPagamentoHE({ ...lerFluxosC().regras, primeiraHoraPct: 300 });
    expect(total()).toBeGreaterThan(comUma);
  });

  it("o histórico da pessoa mostra pendentes, confirmadas, rejeitadas e acima do limite", () => {
    noRouter(<HorasExtraDaPessoa pessoaId="p-sofia" />);
    for (const estado of ["Pendente", "Confirmada", "Rejeitada", "Acima do limite"]) {
      expect(screen.getAllByText(estado).length).toBeGreaterThan(0);
    }
  });
});
