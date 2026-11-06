// Arranque das duas alterações da frente D: o banco de horas na aba Horário da ficha (só com horário «banco de horas»)
// e as horas extra pendentes na fila de trabalho do mapa de assiduidade (simuladas ao nível do wrapper `horasExtraReal`, como a base).
import { beforeEach, describe, expect, it, vi } from "vitest";
// As justificacoes do dia vivem na base: aqui a base e simulada (sem CompanyProvider e sem chamadas).
vi.mock("@/components/rh-exemplo/hooks/useJustificacoesDoDia", async () => (await import("@/test/justificacoesDoDiaFalso")).wrapperFalso());
vi.mock("@/components/rh-exemplo/hooks/usePrazoJustificacao", async () => (await import("@/test/prazoJustificacaoFalso")).wrapperFalso());
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { lerEstado, repor } from "@/components/rh-exemplo/dados/loja";
import { reporGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { reporFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { BancoHorasDaFicha } from "@/components/rh-exemplo/fluxosC/BancoHorasDaFicha";
import { decidirHoraExtraNaLoja, definirRegrasPagamentoHE, lerFluxosC, reporFluxosC } from "@/components/rh-exemplo/fluxosC/lojaFluxosC";
import { calcularSalario } from "@/components/rh-exemplo/fluxosC/salarioRegras";
import { entradaSalarioDaFicha } from "@/components/rh-exemplo/fluxosC/salarioContexto";
import { hojeIso } from "@/components/rh-exemplo/lib/assiduidade";
import { ContratoGrupoTempoTrabalho } from "@/components/rh-exemplo/contrato/ContratoGrupoTempoTrabalho";
import { ConfiguracaoHorasExtra } from "@/components/rh-exemplo/fluxosC/ConfiguracaoHorasExtra";
import { HorasExtraDaPessoa } from "@/components/rh-exemplo/fluxosC/HorasExtraDaPessoa";
import { menuSections } from "@/components/sidebar/menuConfig";
import { PessoaHorarioTab } from "@/components/rh-exemplo/PessoaHorarioTab";
import { rhExemploFluxosDTranslations } from "@/translations/rhExemploFluxosD";
import RhAssiduidadeOrganizacao from "./RhAssiduidadeOrganizacao";

// As horas extra, os limites e a marca por pessoa vivem na base: aqui simulados (semeados com as horas extra de exemplo).
vi.mock("@/components/rh-exemplo/hooks/horasExtraReal", async () => (await import("@/test/horasExtraFalso")).wrapperFalso());
// A regra salarial em vigor: 7200 min (120 h) de limite anual de horas extra.
vi.mock("@/components/rh-exemplo/hooks/useRegrasSalariais", () => ({
  useRegrasSalariais: () => ({ emVigor: { he_limite_anual_min: 7200 }, estado: "ok", isLoading: false }),
}));
vi.mock("@/components/rh-exemplo/hooks/usePermissoesAssiduidade", async () => (await import("@/test/horasExtraFalso")).permissoesFalsas());
import { baseFalsa, reporBaseFalsa, semearHoras } from "@/test/horasExtraFalso";
// A fila de trabalho junta as horas extra (acima), as justificações e os desvios: simulada, sem react-query nem base.
vi.mock("@/hooks/useFilaDeTrabalho", async () => (await import("@/test/filaDeTrabalhoFalso")).hookFalso());
// O ecrã do mapa (que traz o separador da fila) lê a organização, o mapa do mês, os centros e a ficha de quem vê: simulados e vazios.
vi.mock("@/components/rh-exemplo/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "org-1" }, isLoading: false }) }));
vi.mock("@/components/rh-exemplo/hooks/useAssiduidadeDaOrganizacao", async () => (await import("@/test/mapaAssiduidadeFalso")).organizacaoVaziaFalsa());
vi.mock("@/components/rh-exemplo/hooks/useLocaisTrabalho", () => ({ useLocaisTrabalho: () => ({ locais: [] }) }));
vi.mock("@/components/rh-exemplo/hooks/useMinhaPessoa", () => ({ useMinhaPessoa: () => ({ pessoaId: null }) }));
// Os dialogos de detetar e registar listam as pessoas da base: sem CompanyProvider aqui, a lista vem vazia.
vi.mock("@/components/rh-exemplo/hooks/usePessoas", () => ({ usePessoas: () => ({ pessoas: [] }) }));

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
  reporBaseFalsa();
  semearHoras(lerFluxosC().horasExtra.map((h) => ({ ...h, pessoaNome: lerEstado().fichas[h.pessoaId]?.pessoa.nome_completo ?? h.pessoaId })));
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
  const pendentes = () => baseFalsa.horas.filter((h) => h.estado === "pendente");
  const pessoasComPendentes = () => new Set(pendentes().map((h) => h.pessoaId));

  /** Abre o ecrã do mapa, o separador da fila e o painel da primeira pessoa da lista. */
  const abrirPrimeiraPessoa = async () => {
    noRouter(<RhAssiduidadeOrganizacao />);
    const contador = await screen.findByTestId("rhd-contador-fila");
    const separador = contador.closest("[role=tab]") as HTMLElement;
    fireEvent.mouseDown(separador);
    fireEvent.click(separador);
    const lista = await screen.findByTestId("rhd-fila-pessoas");
    const linha = within(lista).getAllByRole("button", { name: /abrir$/ })[0];
    const pessoaId = linha.getAttribute("data-fila-pessoa") ?? "";
    fireEvent.click(linha);
    const painel = await screen.findByTestId("painel-fila-pessoa");
    return { painel, pessoaId };
  };
  const horasDaPessoa = (pessoaId: string) => pendentes().filter((h) => h.pessoaId === pessoaId);
  const dialogoDeDecisao = () => screen.getAllByRole("dialog").at(-1) as HTMLElement;

  it("a lista mostra só as pessoas com horas extra por decidir, com o que cada uma tem e quando", async () => {
    noRouter(<RhAssiduidadeOrganizacao />);
    const contador = await screen.findByTestId("rhd-contador-fila");
    fireEvent.mouseDown(contador.closest("[role=tab]") as HTMLElement);
    fireEvent.click(contador.closest("[role=tab]") as HTMLElement);
    const lista = await screen.findByTestId("rhd-fila-pessoas");
    const linhas = within(lista).getAllByRole("listitem");
    expect(linhas).toHaveLength(pessoasComPendentes().size);
    // Tudo em texto, não só em cor: o tipo, a contagem, o total e o mais antigo.
    expect(linhas[0]).toHaveTextContent(/hora extra|horas extra/);
    expect(linhas[0]).toHaveTextContent(/pendência/);
    expect(linhas[0]).toHaveTextContent(/mais antigo/);
    // Nada de blocos separados por tipo: a lista de pessoas é a única coisa no separador.
    expect(screen.queryByTestId("rhd-fila-horas-extra")).not.toBeInTheDocument();
  });

  it("ao abrir a pessoa, as horas extra dela vêm numa só lista, com a etiqueta do tipo, o tempo a mais e os dois botões", async () => {
    const { painel, pessoaId } = await abrirPrimeiraPessoa();
    const itens = within(painel).getAllByTestId(/^item-fila-hora-extra-/);
    expect(itens).toHaveLength(horasDaPessoa(pessoaId).length);
    expect(within(itens[0]).getByText("Hora extra")).toBeInTheDocument();
    expect(within(itens[0]).getAllByText(/ a mais$/).length).toBeGreaterThan(0);
    expect(within(itens[0]).getByRole("button", { name: /^Confirmar hora extra:/ })).toBeEnabled();
    expect(within(itens[0]).getByRole("button", { name: /^Rejeitar hora extra:/ })).toBeEnabled();
    expect(within(painel).getByRole("list", { name: /^Pendências de .*, da mais antiga para a mais recente$/ })).toBeInTheDocument();
  });

  it("confirmar usa a ação do store e o item sai da lista da pessoa", async () => {
    const { painel, pessoaId } = await abrirPrimeiraPessoa();
    const antes = pendentes().length;
    const item = within(painel).getAllByTestId(/^item-fila-hora-extra-/)[0];
    const id = (item.getAttribute("data-testid") ?? "").replace("item-fila-hora-extra-", "");
    fireEvent.click(within(item).getByRole("button", { name: /^Confirmar hora extra:/ }));
    fireEvent.click(within(dialogoDeDecisao()).getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(baseFalsa.horas.find((h) => h.id === id)?.estado).toBe("confirmada"));
    expect(pendentes()).toHaveLength(antes - 1);
    await waitFor(() => expect(screen.queryByTestId(`item-fila-hora-extra-${id}`)).not.toBeInTheDocument());
    expect(horasDaPessoa(pessoaId).some((h) => h.id === id)).toBe(false);
  });

  it("rejeitar exige motivo de 3 caracteres", async () => {
    const { painel } = await abrirPrimeiraPessoa();
    const antes = pendentes().length;
    fireEvent.click(within(painel).getAllByRole("button", { name: /^Rejeitar hora extra:/ })[0]);
    const dialogo = dialogoDeDecisao();
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: "ab" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Rejeitar" }));
    expect(await within(dialogo).findByRole("alert")).toBeInTheDocument();
    expect(pendentes()).toHaveLength(antes);
    expect(baseFalsa.decisoes).toHaveLength(0);
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: "abc" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Rejeitar" }));
    await waitFor(() => expect(pendentes()).toHaveLength(antes - 1));
  });

  it("o separador da fila conta pessoas com pendências e abre a lista de pessoas", async () => {
    noRouter(<RhAssiduidadeOrganizacao />);
    const contador = await screen.findByTestId("rhd-contador-fila");
    expect(Number(contador.textContent)).toBe(pessoasComPendentes().size);
    expect(screen.getByTestId("rhd-contador-fila-texto")).toHaveTextContent(/pessoas? com \d+ pendências?/);
    const separador = contador.closest("[role=tab]") as HTMLElement;
    fireEvent.mouseDown(separador);
    fireEvent.click(separador);
    expect(await screen.findByTestId("rhd-fila-pessoas")).toBeInTheDocument();
  });
});

describe("horas extra: limites, configuração e histórico", () => {
  it("«Horas extra» já não é entrada nem caminho do menu de RH", () => {
    const grupo = menuSections.find((s) => s.id === "rh-exemplo");
    expect(grupo?.items?.some((i) => i.to === "/rh-exemplo/horas-extra")).toBe(false);
    expect(grupo?.paths).not.toContain("/rh-exemplo/horas-extra");
  });

  it("o interruptor está no grupo «Tempo de trabalho» do Contrato, grava na base, e os máximos dependem só de quem pode editar", async () => {
    const rascunho = { horas_anuais_maximas: "", horas_semanais_maximas: "", regime: "tempo_inteiro", tipo_trabalho: "", horas_periodo: "40", horas_frequencia: "semanal", politica_feriados: "nao_laboral", isencao_horario: false, dias_uteis: [1] } as unknown as Parameters<typeof ContratoGrupoTempoTrabalho>[0]["rascunho"];
    noRouter(<ContratoGrupoTempoTrabalho rascunho={rascunho} definir={() => {}} podeEditar criandoContrato={false} pessoaId="p-marta" erroDe={() => null} />);
    const interruptor = screen.getByRole("switch", { name: "Pode fazer horas extra" });
    expect(interruptor).toHaveAttribute("aria-checked", "false");
    // O máximo semanal grava-se no contrato: só depende de `podeEditar`, não do interruptor (que se guarda à parte, na base).
    // O limite ANUAL já não é do contrato: vem da regra salarial da organização e aparece só em leitura.
    expect(screen.queryByLabelText(/Horas anuais máximas/i)).not.toBeInTheDocument();
    expect(screen.getByText(/vem da regra salarial da organização/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Máximo de horas semanais/i)).toBeEnabled();
    fireEvent.click(interruptor);
    await waitFor(() => expect(baseFalsa.autorizacoes["p-marta"]).toBe(true));
    expect(screen.getByLabelText(/Máximo de horas semanais/i)).toBeEnabled();
  });

  it("o alerta configura-se em Processamento salarial > Configuração (os coeficientes são da base, ver horasExtraReal.test)", async () => {
    noRouter(<ConfiguracaoHorasExtra />);
    const anoAntes = baseFalsa.limites.anoMin;
    fireEvent.change(screen.getByLabelText(/Alerta a/), { target: { value: "70" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Guardar" })[0]);
    await waitFor(() => expect(baseFalsa.limites.alertaPct).toBe(70));
    // Guardar não mexe no limite anual antigo (já não é editável aqui).
    expect(baseFalsa.limites.anoMin).toBe(anoAntes);
  });

  it("o limite anual é o da regra salarial em vigor: só leitura, sem campo, com ligação às Regras salariais", () => {
    const irParaRegras = vi.fn();
    noRouter(<ConfiguracaoHorasExtra aoIrParaRegrasSalariais={irParaRegras} />);
    expect(screen.getByTestId("he-cfg-limite-anual")).toHaveTextContent("120 h por ano");
    expect(document.getElementById("he-cfg-anoH")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Alterar em Regras salariais" }));
    expect(irParaRegras).toHaveBeenCalledTimes(1);
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
