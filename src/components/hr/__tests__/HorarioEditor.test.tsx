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
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

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
    morada: null,
    cidade: null,
    codigo_postal: null,
    pais: "PT",
    latitude: null,
    longitude: null,
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
