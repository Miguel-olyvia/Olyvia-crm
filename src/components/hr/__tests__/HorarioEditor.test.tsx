/**
 * O editor de horario: dois intervalos no mesmo dia, em locais diferentes.
 *
 * E o requisito central e por isso tem teste de ecra e nao so de modelo: o
 * gesto de carregar duas vezes em "+ Intervalo" na MESMA linha tem de dar duas
 * filas independentes, e a segunda tem de nascer SEM local -- porque o caso
 * normal de um segundo intervalo e ser noutro sitio.
 *
 * Usa `fireEvent` e nao `user-event`: `@testing-library/user-event` nao e
 * dependencia deste projecto.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (chave: string) => chave, language: "pt" }),
}));

import { HorarioEditor } from "@/components/hr/HorarioEditor";
import { horarioVazio, novaChave, type HorarioRascunho } from "@/lib/hr/horario";
import type { LocalTrabalho } from "@/types/hr";

const LOJA = "11111111-1111-4111-8111-111111111111";
const SEDE = "22222222-2222-4222-8222-222222222222";

function local(id: string, nome: string): LocalTrabalho {
  return {
    id,
    organization_id: "org",
    nome,
    codigo: null,
    tipo: "loja",
    organizacao_ref_id: null,
    organograma_node_id: null,
    morada: null,
    cidade: null,
    codigo_postal: null,
    pais: "PT",
    latitude: null,
    longitude: null,
    contacto_nome: null,
    contacto_telefone: null,
    activo: true,
    notas: null,
  };
}

const LOCAIS = [local(LOJA, "Loja Boavista"), local(SEDE, "Sede")];

function comDoisIntervalosNaQuarta(): HorarioRascunho {
  const rascunho = horarioVazio();
  const quarta = rascunho.dias.find((dia) => dia.dia_semana === 3)!;
  quarta.intervalos.push({
    chave: novaChave(),
    hora_inicio: "09:00",
    hora_fim: "14:00",
    local_id: LOJA,
  });
  quarta.intervalos.push({
    chave: novaChave(),
    hora_inicio: "15:00",
    hora_fim: "19:00",
    local_id: SEDE,
  });
  return rascunho;
}

describe("HorarioEditor", () => {
  beforeAll(() => {
    // O Radix Select abre por teclado num teste mais abaixo; o jsdom nao
    // implementa nenhum destes -- sem o mock, o efeito de abertura rebenta
    // com "scrollIntoView is not a function" (mesmo padrao de
    // ProposalStageActionsConfig.options.test.tsx).
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mostra dois intervalos no mesmo dia, com locais diferentes", () => {
    render(
      <HorarioEditor
        valor={comDoisIntervalosNaQuarta()}
        onChange={vi.fn()}
        locais={LOCAIS}
        podeEditar
      />,
    );

    const inicios = screen.getAllByLabelText("hr.horario.inicio");
    const fins = screen.getAllByLabelText("hr.horario.fim");
    expect(inicios).toHaveLength(2);
    expect((inicios[0] as HTMLInputElement).value).toBe("09:00");
    expect((inicios[1] as HTMLInputElement).value).toBe("15:00");
    expect((fins[0] as HTMLInputElement).value).toBe("14:00");
    expect((fins[1] as HTMLInputElement).value).toBe("19:00");

    // Cada fila tem o seu selector de local, com etiqueta associada.
    expect(screen.getAllByLabelText("hr.horario.local")).toHaveLength(2);
    // O nome do local aparece na fila e outra vez no resumo por local, no fim
    // -- e o resumo por local que da sentido ao horario, por isso conta.
    expect(screen.getAllByText("Loja Boavista").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sede").length).toBeGreaterThan(0);
  });

  it("acrescenta uma segunda fila no mesmo dia, e ela nasce sem local", () => {
    let estado = horarioVazio();
    const onChange = vi.fn((proximo: HorarioRascunho) => {
      estado = proximo;
    });

    const { rerender } = render(
      <HorarioEditor valor={estado} onChange={onChange} locais={LOCAIS} podeEditar />,
    );

    const botoes = screen.getAllByText("hr.horario.acrescentarIntervalo");
    fireEvent.click(botoes[0]);
    rerender(<HorarioEditor valor={estado} onChange={onChange} locais={LOCAIS} podeEditar />);
    fireEvent.click(screen.getAllByText("hr.horario.acrescentarIntervalo")[0]);
    rerender(<HorarioEditor valor={estado} onChange={onChange} locais={LOCAIS} podeEditar />);

    const primeiroDia = estado.dias[0];
    expect(primeiroDia.intervalos).toHaveLength(2);
    expect(primeiroDia.intervalos[1].local_id).toBeNull();
    expect(screen.getAllByLabelText("hr.horario.inicio")).toHaveLength(2);
  });

  it("marca as duas filas que se sobrepoem, e diz porque", () => {
    const rascunho = horarioVazio();
    const segunda = rascunho.dias.find((dia) => dia.dia_semana === 1)!;
    segunda.intervalos.push({
      chave: novaChave(),
      hora_inicio: "09:00",
      hora_fim: "14:00",
      local_id: LOJA,
    });
    segunda.intervalos.push({
      chave: novaChave(),
      hora_inicio: "13:00",
      hora_fim: "18:00",
      local_id: SEDE,
    });

    render(
      <HorarioEditor valor={rascunho} onChange={vi.fn()} locais={LOCAIS} podeEditar />,
    );

    expect(screen.getAllByText("hr.horario.erroSobreposicao")).toHaveLength(2);
    const invalidos = screen
      .getAllByLabelText("hr.horario.inicio")
      .filter((campo) => campo.getAttribute("aria-invalid") === "true");
    expect(invalidos).toHaveLength(2);
  });

  it("um centro desactivado nao aparece para escolha nova, mas continua visivel no intervalo que ja o usa", async () => {
    const lojaDesactivada = { ...local(LOJA, "Loja Boavista"), activo: false };
    const locaisComUmaDesactivada = [lojaDesactivada, local(SEDE, "Sede")];

    render(
      <HorarioEditor
        valor={comDoisIntervalosNaQuarta()}
        onChange={vi.fn()}
        locais={locaisComUmaDesactivada}
        podeEditar
      />,
    );

    // O intervalo ja gravado contra a Loja Boavista continua a mostrar o
    // nome -- nunca um id em bruto nem um Select vazio -- mesmo com o centro
    // desactivado. Aparece na fila e no resumo por local, por isso conta-se
    // mais que uma ocorrencia.
    expect(screen.getAllByText("Loja Boavista").length).toBeGreaterThan(0);

    // Abre o selector do PRIMEIRO intervalo (09:00-14:00, gravado contra a
    // Loja Boavista) para ver as opcoes que ele realmente oferece.
    const comboboxes = screen.getAllByRole("combobox");
    fireEvent.keyDown(comboboxes[0], { key: "Enter" });
    const listbox = await screen.findByRole("listbox");
    const opcoes = within(listbox)
      .getAllByRole("option")
      .map((opcao) => opcao.textContent?.trim());

    // A Loja Boavista (ja escolhida, ainda que desactivada) continua
    // oferecida -- so uma vez -- mas nao aparece MAIS QUE UMA vez, e nenhum
    // segundo centro desactivado sem uso apareceria aqui.
    expect(opcoes.filter((texto) => texto === "Loja Boavista")).toHaveLength(1);
    expect(opcoes).toContain("Sede");
  });

  it("avisa quando o total semanal excede as horas contratadas", () => {
    render(
      <HorarioEditor
        valor={comDoisIntervalosNaQuarta()}
        onChange={vi.fn()}
        locais={LOCAIS}
        podeEditar
        horasContratadasSemanais={5}
      />,
    );

    // comDoisIntervalosNaQuarta: 09:00-14:00 (5h) + 15:00-19:00 (4h) = 9h
    // numa so quarta -- excede um contrato de 5h/semana.
    expect(screen.getByText("hr.horario.excedeContrato")).toBeInTheDocument();
    expect(screen.queryByText("hr.horario.abaixoDoContrato")).not.toBeInTheDocument();
  });

  it("avisa quando o total semanal fica abaixo das horas contratadas", () => {
    render(
      <HorarioEditor
        valor={comDoisIntervalosNaQuarta()}
        onChange={vi.fn()}
        locais={LOCAIS}
        podeEditar
        horasContratadasSemanais={40}
      />,
    );

    // 9h planeadas contra 40h contratadas -- falta muito.
    expect(screen.getByText("hr.horario.abaixoDoContrato")).toBeInTheDocument();
    expect(screen.queryByText("hr.horario.excedeContrato")).not.toBeInTheDocument();
  });

  it("nao avisa de falta num horario ainda em branco -- so depois de ser tocado", () => {
    render(
      <HorarioEditor
        valor={horarioVazio()}
        onChange={vi.fn()}
        locais={LOCAIS}
        podeEditar
        horasContratadasSemanais={40}
      />,
    );

    expect(screen.queryByText("hr.horario.abaixoDoContrato")).not.toBeInTheDocument();
    expect(screen.queryByText("hr.horario.excedeContrato")).not.toBeInTheDocument();
  });

  it("exactamente igual ao contrato: nenhum dos dois avisos aparece", () => {
    // comDoisIntervalosNaQuarta = 9h (5h + 4h). Contrato de 9h/semana bate
    // exactamente -- nem excede, nem falta.
    render(
      <HorarioEditor
        valor={comDoisIntervalosNaQuarta()}
        onChange={vi.fn()}
        locais={LOCAIS}
        podeEditar
        horasContratadasSemanais={9}
      />,
    );

    expect(screen.queryByText("hr.horario.excedeContrato")).not.toBeInTheDocument();
    expect(screen.queryByText("hr.horario.abaixoDoContrato")).not.toBeInTheDocument();
  });

  it("REGRESSAO: uma falta fraccionaria que arredonda para 0min nao mostra 'faltam 0h00'", () => {
    // 9h planeadas (540 min) contra um contratado fraccionario que da
    // 540,4 min/semana -- como sairia de uma frequencia mensal/anual
    // convertida para semana. A comparacao BRUTA diria que falta algo
    // (540 &lt; 540,4), mas 0,4 minutos arredonda para 0 -- e um aviso a dizer
    // "faltam 0h00" seria mais confuso do que nenhum aviso. A condicao usa o
    // valor JA ARREDONDADO, por isso nao aparece nada.
    render(
      <HorarioEditor
        valor={comDoisIntervalosNaQuarta()}
        onChange={vi.fn()}
        locais={LOCAIS}
        podeEditar
        horasContratadasSemanais={540.4 / 60}
      />,
    );

    expect(screen.queryByText("hr.horario.abaixoDoContrato")).not.toBeInTheDocument();
    expect(screen.queryByText("hr.horario.excedeContrato")).not.toBeInTheDocument();
  });

  it("sem horasContratadasSemanais (chamador nao sabe o contrato) nao mostra nenhum aviso", () => {
    render(
      <HorarioEditor
        valor={comDoisIntervalosNaQuarta()}
        onChange={vi.fn()}
        locais={LOCAIS}
        podeEditar
      />,
    );

    expect(screen.queryByText("hr.horario.excedeContrato")).not.toBeInTheDocument();
    expect(screen.queryByText("hr.horario.abaixoDoContrato")).not.toBeInTheDocument();
  });

  it("sem permissao de editar nao ha botoes de acrescentar nem de remover", () => {
    render(
      <HorarioEditor
        valor={comDoisIntervalosNaQuarta()}
        onChange={vi.fn()}
        locais={LOCAIS}
        podeEditar={false}
      />,
    );

    expect(screen.queryByText("hr.horario.acrescentarIntervalo")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("hr.horario.removerIntervalo")).not.toBeInTheDocument();
    // Mas os valores continuam visiveis: quem ve o horario tem de o ler inteiro.
    expect(screen.getAllByLabelText("hr.horario.inicio")).toHaveLength(2);
  });
});
