// Todas as ações da Frota, feitas pela UI (React Testing Library) com o Supabase falso (testes/bdFalsa): para cada uma,
// a RPC rpc_fleet_* certa com os argumentos certos, as consultas invalidadas (o mapa INVALIDA + as de outros módulos)
// e, nas que mudam o que se vê, o efeito nos ecrãs ligados: Hoje, ficha (abas e Histórico), listas, calendário,
// Atividade e as pílulas do menu (useContadoresFrota). Regra: uma ação só está pronta quando funciona e aparece em
// todos os ecrãs ligados. No fim, confirma-se que nenhuma ação do mapa ficou sem teste.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { chavesInvalidadas, contadores, montar, novoQc } from "./testes/montar";
import { HOJE, ORG, bd, dia, frotaDeTeste, manutBase, pedidoBase, viaturaBase } from "./testes/bdFalsa";
import { INVALIDA, chavesExternas, frotaKeys, type AcaoFrota } from "./dados";
import { PedidosCarrinhasPainel } from "./PedidosCarrinha";

const estado = vi.hoisted(() => ({ perms: new Set<string>() }));
const TODAS = ["fleet.view", "fleet.manage", "fleet.costs", "inventory.edit", "inventory.view", "warehouses.view", "warehouses.create", "operations.view", "scheduling.view"];
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => estado.perms.has(p),
    hasAnyPermission: (l: string[]) => l.some((p) => estado.perms.has(p)),
    permissions: [...estado.perms],
    loading: false,
  }),
}));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-teste" }, isLoading: false }) }));
vi.mock("@/integrations/supabase/client", async () => (await import("./testes/bdFalsa")).clienteFalso);
vi.mock("@/lib/cachedAuth", () => ({ getCachedAuthUser: async () => ({ data: { user: { id: "auth-1" } } }) }));

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

let invalidar: ReturnType<typeof montar>["invalidar"];
const ir = async (caminho: string): Promise<void> => {
  cleanup();
  invalidar = montar(caminho).invalidar;
  await waitFor(() => expect(screen.queryByText("A carregar a Frota…")).toBeNull());
};
const aviso = () => screen.getByTestId("aviso-frota");
async function ficha(mat: string, aba?: string): Promise<HTMLElement> {
  await ir("/frota/viaturas");
  fireEvent.click(await screen.findByRole("row", { name: `Abrir a ${mat}` }));
  const f = await screen.findByRole("dialog");
  if (aba) fireEvent.click(within(f).getByRole("tab", { name: aba }));
  return f;
}
async function dialogo(nome: string): Promise<HTMLElement> { return screen.findByRole("dialog", { name: nome }); }
/** Escolhe valores num diálogo (rótulo → valor) e carrega no botão. */
async function preencher(dlg: HTMLElement, campos: Record<string, string>, botao?: string): Promise<void> {
  for (const [rotulo, valor] of Object.entries(campos)) fireEvent.change(within(dlg).getByLabelText(rotulo), { target: { value: valor } });
  if (botao) fireEvent.click(within(dlg).getByRole("button", { name: botao }));
}
/** Espera pela opção de uma lista que vem de outro módulo (fornecedores, obras, ordens, armazéns, utilizadores). */
const opcao = (dlg: HTMLElement, nome: RegExp | string) => within(dlg).findByRole("option", { name: nome });
const fechou = (nome: string) => waitFor(() => expect(screen.queryByRole("dialog", { name: nome })).toBeNull());

const testadas = new Set<AcaoFrota>();
/** A RPC foi chamada com estes argumentos e a ação invalidou as tabelas do mapa e as chaves externas. */
async function confirmar(acao: AcaoFrota, rpc: string, args: unknown): Promise<void> {
  await waitFor(() => expect(bd.rpc).toHaveBeenCalledWith(rpc, args));
  await waitFor(() => {
    const feitas = chavesInvalidadas(invalidar);
    const esperadas = [...INVALIDA[acao].map((t) => frotaKeys.tabela(ORG, t)), ...chavesExternas(acao, ORG)].map((k) => JSON.stringify(k));
    expect(feitas).toEqual(expect.arrayContaining(esperadas));
  });
  testadas.add(acao);
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("language", "pt");
  estado.perms = new Set(TODAS);
  frotaDeTeste();
  bd.respostas = {};
  bd.falhar.clear();
  bd.rpc.mockClear();
  bd.updates = [];
  bd.inserts = [];
  bd.deletes = [];
  bd.storage.upload.mockClear();
  bd.storage.remove.mockClear();
  bd.invoke.mockClear();
});
afterEach(() => cleanup());

describe("Viaturas: nova, estado, km, abastecimento", () => {
  it("nova viatura: RPC com os dados e o armazém móvel, aparece nas Viaturas, abre a ficha e o contador do menu sobe", async () => {
    bd.respostas.rpc_fleet_create_vehicle = () => {
      bd.tabelas.fleet_v_vehicles.push(viaturaBase({ id: "v3", plate: "BX-55-RT", make: "Ford", model: "Transit", warehouse_id: "wh-v3", odometer_km: 1000 }));
      return { data: { vehicle_id: "v3", warehouse_id: "wh-v3", schedule_resource_id: "res-3", default_warehouse_set: true } };
    };
    await ir("/frota/viaturas");
    expect(contadores().viaturas).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "Nova viatura" }));
    const dlg = await dialogo("Nova viatura");
    await preencher(dlg, { "Matrícula": "bx-55-rt", Marca: "Ford", Modelo: "Transit", "Km atuais": "1000", "Seguro válido até": dia(300) });
    fireEvent.click(within(dlg).getByLabelText("É um armazém móvel (stock na carrinha)"));
    fireEvent.click(within(dlg).getByRole("button", { name: "Criar viatura" }));
    await confirmar("nova", "rpc_fleet_create_vehicle", {
      p_organization_id: ORG,
      p_data: expect.objectContaining({
        plate: "BX-55-RT", make: "Ford", model: "Transit", odometer_km: 1000, insurance_until: dia(300), fuel_type: "diesel", ownership: "owned",
        vehicle_category: "light_goods", required_licence: "B", create_warehouse: true, create_schedule_resource: true, service_every_km: 30000, service_every_months: 12,
      }),
    });
    await fechou("Nova viatura");
    expect(aviso()).toHaveTextContent("Viatura BX-55-RT criada. Armazém móvel criado no Inventário. Recurso criado na Agenda. O armazém por omissão do Inventário ficou fixado");
    // a ficha da viatura nova abre e a lista e o contador já a têm
    const f = await screen.findByRole("dialog");
    expect(within(f).getByRole("heading", { name: /BX-55-RT/ })).toBeInTheDocument();
    await waitFor(() => expect(contadores().viaturas).toBe(3));
  });

  it("sem warehouses.create não se cria o armazém móvel", async () => {
    estado.perms.delete("warehouses.create");
    await ir("/frota/viaturas");
    fireEvent.click(screen.getByRole("button", { name: "Nova viatura" }));
    const dlg = await dialogo("Nova viatura");
    expect(within(dlg).getByLabelText("É um armazém móvel (stock na carrinha)")).toBeDisabled();
    expect(within(dlg).getByText(/exige a permissão warehouses\.create/)).toBeInTheDocument();
  });

  it("mudar estado: rpc_fleet_set_status com o motivo", async () => {
    const f = await ficha("AA-12-BC");
    fireEvent.click(within(f).getByRole("button", { name: "Mudar estado" }));
    const dlg = await dialogo("Mudar estado da viatura");
    await preencher(dlg, { "Novo estado": "workshop", Motivo: "Avaria no motor" }, "Mudar estado");
    await confirmar("estado", "rpc_fleet_set_status", { p_vehicle_id: "v1", p_status: "workshop", p_reason: "Avaria no motor" });
    expect(aviso()).toHaveTextContent('AA-12-BC passou a "Em oficina".');
  });

  it("vender com stock na carrinha é recusado antes de chamar a RPC", async () => {
    const f = await ficha("AA-12-BC");
    fireEvent.click(within(f).getByRole("button", { name: "Mudar estado" }));
    const dlg = await dialogo("Mudar estado da viatura");
    await preencher(dlg, { "Novo estado": "sold", Motivo: "Vendida ao stand" }, "Mudar estado");
    expect((await within(dlg).findAllByText(/ainda tem stock: transfere-o primeiro/)).length).toBeGreaterThan(0);
    expect(bd.rpc).not.toHaveBeenCalled();
  });

  it("registar km: o salto de mais de 5000 km pede confirmação e vai com p_confirm_jump", async () => {
    const f = await ficha("AA-12-BC");
    fireEvent.click(within(f).getByRole("button", { name: "Registar km" }));
    const dlg = await dialogo("Registar km");
    await preencher(dlg, { "Km no conta-quilómetros": "155000" }, "Registar");
    expect((await within(dlg).findAllByText(/Confirma o valor\./)).length).toBeGreaterThan(0);
    expect(bd.rpc).not.toHaveBeenCalled();
    fireEvent.click(within(dlg).getByLabelText(/Confirmo os km/));
    fireEvent.click(within(dlg).getByRole("button", { name: "Registar" }));
    await confirmar("km", "rpc_fleet_record_odometer", { p_vehicle_id: "v1", p_km: 155000, p_read_on: HOJE, p_confirm_jump: true });
    expect(aviso()).toHaveTextContent(/Km da AA-12-BC registados: 155.000 km\./);
  });

  it("abastecimento: rpc_fleet_record_fuel com a gasolineira e o posto", async () => {
    const f = await ficha("AA-12-BC");
    fireEvent.click(within(f).getByRole("button", { name: "Registar abastecimento" }));
    const dlg = await dialogo("Registar abastecimento");
    await opcao(dlg, "Galp");
    await preencher(dlg, { Litros: "50", "Valor com IVA (€)": "80.5", "Km no momento": "148600", "Gasolineira (fornecedor)": "f2", Posto: "Galp Loures" }, "Registar");
    await confirmar("abastecer", "rpc_fleet_record_fuel", {
      p_vehicle_id: "v1", p_quantity: 50, p_amount: 80.5, p_km: 148600, p_supplier_id: "f2", p_supplier_label: "Galp Loures", p_spent_on: HOJE,
    });
    expect(aviso()).toHaveTextContent("Abastecimento de 80,50 € registado na AA-12-BC.");
  });
});

describe("Atribuições: atribuir, devolver, cancelar reserva", () => {
  it("atribuir (pontual, com obra e ordem): rpc_fleet_assign; sem recurso da Agenda a reserva fica só na Frota", async () => {
    await ir("/frota/atribuicoes");
    fireEvent.click(screen.getByRole("button", { name: "Nova atribuição" }));
    const dlg = await dialogo("Atribuir viatura");
    await opcao(dlg, /OB-77/);
    await opcao(dlg, /OT-501/);
    await preencher(dlg, {
      Viatura: "v2", Condutor: "d1", Tipo: "temporary", "Início": dia(2), Fim: dia(3), Motivo: "Obra Odivelas", "Obra (Operações)": "obra-1", "Ordem (Operações)": "ord-1",
    }, "Atribuir");
    await confirmar("atribuir", "rpc_fleet_assign", {
      p_vehicle_id: "v2", p_driver_id: "d1", p_kind: "temporary", p_starts_on: dia(2), p_ends_on: dia(3), p_km: 61200, p_reason: "Obra Odivelas",
      p_ops_obra_id: "obra-1", p_ops_ordem_id: "ord-1",
    });
    expect(aviso()).toHaveTextContent("45-XZ-78 atribuída a Sofia Martins. A viatura não é recurso da Agenda: a reserva fica só na Frota.");
    expect(within(aviso()).getByRole("link", { name: "Ver no calendário" })).toBeInTheDocument();
  });

  it("devolver com danos: rpc_fleet_return abre a ocorrência", async () => {
    bd.respostas.rpc_fleet_return = () => ({ data: { assignment_id: "a1", incident_id: "o9" } });
    const f = await ficha("AA-12-BC");
    fireEvent.click(within(f).getByRole("button", { name: "Devolver" }));
    const dlg = await dialogo("Devolver viatura");
    await preencher(dlg, { "Km na devolução": "148500" });
    fireEvent.click(within(dlg).getByLabelText(/Tem danos novos/));
    await preencher(dlg, { Danos: "Risco na porta" }, "Registar devolução");
    await confirmar("devolver", "rpc_fleet_return", { p_assignment_id: "a1", p_km: 148500, p_returned_on: HOJE, p_damage_notes: "Risco na porta" });
    expect(aviso()).toHaveTextContent(/AA-12-BC devolvida com 148.500 km\. Os danos abriram uma ocorrência de sinistro\./);
  });

  it("cancelar uma reserva futura: rpc_fleet_cancel_reservation", async () => {
    await ir("/frota/atribuicoes?vista=res");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancelar reserva" }));
    await confirmar("cancelarReserva", "rpc_fleet_cancel_reservation", { p_assignment_id: "a2" });
    expect(aviso()).toHaveTextContent("Reserva cancelada. A viatura ficou livre na Agenda.");
  });
});

describe("Manutenção (bug: 'agendei uma manutenção e não aparece no calendário')", () => {
  it("agendar: rpc_fleet_schedule_maintenance; aparece na Manutenção, no Hoje, no calendário da semana certa e na Atividade", async () => {
    bd.respostas.rpc_fleet_schedule_maintenance = () => {
      bd.tabelas.fleet_maintenance_events.push(manutBase({ id: "m2", kind: "repair", title: "Travões", scheduled_on: dia(8), supplier_id: "f1", estimated_cost: 250 }));
      bd.tabelas.fleet_activity_log.unshift({ id: "h9", vehicle_id: "v1", action: "Manutenção agendada", summary: `Travões da AA-12-BC agendada.`, detail: null, entity_type: null, entity_id: null, actor_id: "u-1", actor_name: "Ana Teste", created_at: `${HOJE}T10:00:00Z` });
      return { data: "m2" };
    };
    await ir("/frota/manutencao");
    fireEvent.click(screen.getByRole("button", { name: "Agendar manutenção" }));
    const dlg = await dialogo("Agendar manutenção");
    expect(within(dlg).getByLabelText("Data")).toHaveValue(dia(7));
    await opcao(dlg, "Oficina Central");
    await preencher(dlg, { Viatura: "v1", Tipo: "repair" });
    expect(within(dlg).getByLabelText("Intervenção")).toHaveValue("Reparação");
    await preencher(dlg, { "Intervenção": "Travões", Data: dia(8), "Oficina (fornecedor)": "f1", "Valor estimado (€)": "250" }, "Agendar");
    await confirmar("manut", "rpc_fleet_schedule_maintenance", {
      p_vehicle_id: "v1", p_kind: "repair", p_title: "Travões", p_scheduled_on: dia(8), p_expected_end_on: null, p_supplier_id: "f1",
      p_supplier_label: "Oficina Central", p_estimated_cost: 250, p_notes: null, p_incident_id: null,
    });
    expect(aviso()).toHaveTextContent(`Travões da AA-12-BC agendada para ${dia(8).split("-").reverse().join("/")}. Ficou na Agenda (quadro Frota).`);
    // na lista de intervenções (depois da invalidação, a leitura volta à BD)
    await waitFor(() => expect(screen.getAllByRole("row").some((r) => within(r).queryByText("Travões"))).toBe(true));
    // "Ver no calendário" abre a semana certa, onde a manutenção bloqueia a viatura
    fireEvent.click(within(aviso()).getByRole("link", { name: "Ver no calendário" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/^Atribuições/));
    const linha = await waitFor(() => screen.getAllByRole("row").find((r) => within(r).queryByRole("button", { name: "AA-12-BC" }))!);
    expect(within(linha).getByText("Manutenção · Travões")).toBeInTheDocument();
    // no Hoje e na Atividade
    await ir("/frota/hoje");
    expect(within(screen.getByRole("region", { name: "Próximas manutenções" })).getByText("AA-12-BC · Travões")).toBeInTheDocument();
    await ir("/frota/atividade");
    expect(screen.getByText("Travões da AA-12-BC agendada.")).toBeInTheDocument();
  });

  it("concluir: rpc_fleet_complete_maintenance com km, valor e data", async () => {
    bd.respostas.rpc_fleet_complete_maintenance = () => ({ data: { expense_id: "e9", back_to_active: false, inspection_until: null } });
    await ir("/frota/manutencao");
    fireEvent.click(screen.getByRole("button", { name: "Concluir Revisão anual da AA-12-BC" }));
    const dlg = await dialogo("Concluir intervenção");
    expect(within(dlg).getByLabelText("Valor final (€)")).toHaveValue(300);
    await preencher(dlg, { "Km à saída": "148400" }, "Concluir");
    await confirmar("concluir", "rpc_fleet_complete_maintenance", { p_event_id: "m1", p_km: 148400, p_final_cost: 300, p_done_on: HOJE });
    expect(aviso()).toHaveTextContent("Revisão anual concluída.");
  });
});

describe("Custos: despesa e extrato", () => {
  it("despesa imputada a uma obra: rpc_fleet_record_expense", async () => {
    await ir("/frota/custos");
    fireEvent.click(screen.getByRole("button", { name: "Registar despesa" }));
    const dlg = await dialogo("Registar despesa");
    await opcao(dlg, /Obra OB-77/);
    await preencher(dlg, { Viatura: "v1", Tipo: "tolls", "Valor com IVA (€)": "12.3", "Ou escreve o fornecedor": "Via Verde", "Centro de custo ou obra": "o:obra-1", Nota: "A1" }, "Registar");
    await confirmar("despesa", "rpc_fleet_record_expense", {
      p_vehicle_id: "v1", p_category: "tolls", p_spent_on: HOJE, p_amount: 12.3, p_supplier_id: null, p_supplier_label: "Via Verde",
      p_cost_center_id: null, p_cost_center_label: null, p_ops_obra_id: "obra-1", p_notes: "A1",
    });
    expect(aviso()).toHaveTextContent("Despesa de 12,30 € registada na AA-12-BC.");
  });

  it("sem fornecedor não grava", async () => {
    await ir("/frota/custos");
    fireEvent.click(screen.getByRole("button", { name: "Registar despesa" }));
    const dlg = await dialogo("Registar despesa");
    await preencher(dlg, { Viatura: "v1", "Valor com IVA (€)": "5" }, "Registar");
    expect(await within(dlg).findByText("Não foi gravado: Escolhe o fornecedor.")).toBeInTheDocument();
    expect(bd.rpc).not.toHaveBeenCalled();
  });

  it("importar extrato (CSV): mostra a verificação e chama rpc_fleet_import_statement com o SHA-256 e as linhas", async () => {
    bd.respostas.rpc_fleet_import_statement = () => ({ data: { import_id: "i1", total: 2, imported: 2, flagged: 1, skipped: 0 } });
    await ir("/frota/custos");
    fireEvent.click(screen.getByRole("button", { name: "Importar extrato" }));
    const dlg = await dialogo("Importar extrato do cartão frota");
    const csv = `Data;Matrícula;Posto;Litros;Valor;Km;Unidade;Referência\n${dia(-1).split("-").reverse().join("/")};AA-12-BC;Galp Loures;61,2;99,14;148700;L;T1\n${dia(-1)};45-XZ-78;Repsol;40;66;60000;L;T2\n`;
    const ficheiro = new File([csv], "extrato.csv", { type: "text/csv" });
    fireEvent.change(within(dlg).getByLabelText("Ficheiro do extrato (CSV)"), { target: { files: [ficheiro] } });
    expect(await within(dlg).findByText(/Rever km \(última leitura 61.200\)/)).toBeInTheDocument();
    fireEvent.click(within(dlg).getByRole("button", { name: "Importar 2 linhas" }));
    await confirmar("importar", "rpc_fleet_import_statement", {
      p_organization_id: ORG, p_file_name: "extrato.csv", p_file_sha256: expect.stringMatching(/^[0-9a-f]{64}$/), p_supplier_id: null, p_document_id: null,
      p_rows: [
        { spent_on: dia(-1), plate: "AA-12-BC", station: "Galp Loures", quantity: 61.2, amount: 99.14, km: 148700, unit: "L", external_ref: "T1" },
        { spent_on: dia(-1), plate: "45-XZ-78", station: "Repsol", quantity: 40, amount: 66, km: 60000, unit: "L", external_ref: "T2" },
      ],
    });
    expect(aviso()).toHaveTextContent("2 abastecimento(s) importado(s) de extrato.csv. 1 ficou para rever.");
  });

  it("o mesmo extrato outra vez: a recusa da RPC aparece no diálogo", async () => {
    bd.respostas.rpc_fleet_import_statement = () => ({ error: { message: "O extrato.csv já foi importado: importá-lo outra vez duplicava os custos.", code: "23505" } });
    await ir("/frota/custos");
    fireEvent.click(screen.getByRole("button", { name: "Importar extrato" }));
    const dlg = await dialogo("Importar extrato do cartão frota");
    const ficheiro = new File([`data;matricula;valor\n${dia(-1)};AA-12-BC;10\n`], "extrato.csv", { type: "text/csv" });
    fireEvent.change(within(dlg).getByLabelText("Ficheiro do extrato (CSV)"), { target: { files: [ficheiro] } });
    fireEvent.click(await within(dlg).findByRole("button", { name: "Importar 1 linhas" }));
    expect(await within(dlg).findByText(/já foi importado/)).toBeInTheDocument();
  });
});

describe("Ocorrências: registar, identificar, resolver", () => {
  it("registar multa: rpc_fleet_report_incident com a data de notificação", async () => {
    await ir("/frota/ocorrencias");
    fireEvent.click(screen.getByRole("button", { name: "Registar ocorrência" }));
    const dlg = await dialogo("Registar ocorrência");
    await preencher(dlg, { Viatura: "v1", Tipo: "fine" });
    await preencher(dlg, { "Data e hora": `${dia(-1)}T14:30`, Local: "IC19", "Valor (€)": "60", "O que aconteceu": "Estacionamento" }, "Registar");
    await confirmar("ocorrencia", "rpc_fleet_report_incident", {
      p_vehicle_id: "v1", p_kind: "fine", p_occurred_at: new Date(`${dia(-1)}T14:30`).toISOString(), p_location: "IC19", p_description: "Estacionamento", p_amount: 60, p_notified_on: HOJE,
    });
    expect(aviso()).toHaveTextContent("Multa registada na AA-12-BC. Identifica o condutor em 15 dias úteis.");
  });

  it("identificar o condutor: rpc_fleet_identify_driver, sugere quem tinha a viatura e o contador das multas desce", async () => {
    bd.respostas.rpc_fleet_identify_driver = () => {
      const o = bd.tabelas.fleet_incidents.find((x) => x.id === "o1")!;
      Object.assign(o, { status: "identified", driver_id: "d1" });
      return { data: null };
    };
    await ir("/frota/ocorrencias");
    await waitFor(() => expect(contadores().ocorrencias).toBe(1));
    fireEvent.click(screen.getByRole("button", { name: "Identificar condutor" }));
    const dlg = await dialogo("Identificar condutor");
    expect(within(dlg).getByText(/Segundo as atribuições, a viatura estava com/)).toHaveTextContent("Sofia Martins");
    expect(within(dlg).getByLabelText("Condutor")).toHaveValue("d1");
    fireEvent.click(within(dlg).getByRole("button", { name: "Identificar e notificar" }));
    await confirmar("identificar", "rpc_fleet_identify_driver", { p_incident_id: "o1", p_driver_id: "d1" });
    expect(aviso()).toHaveTextContent("Condutor identificado: Sofia Martins. Notificação enviada.");
    await waitFor(() => expect(contadores().ocorrencias).toBeNull());
  });

  it("marcar resolvida: rpc_fleet_resolve_incident", async () => {
    await ir("/frota/ocorrencias");
    fireEvent.click(screen.getByRole("button", { name: "Marcar resolvida" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Marcar resolvida" }));
    await confirmar("resolver", "rpc_fleet_resolve_incident", { p_incident_id: "o2" });
  });
});

describe("Documentos: renovar", () => {
  it("renovar a IPO: rpc_fleet_renew_compliance (sugere o prazo legal)", async () => {
    await ir("/frota/documentos");
    fireEvent.click(screen.getByRole("button", { name: "Renovar Inspeção (IPO) da 45-XZ-78" }));
    const dlg = await dialogo("Renovar documento");
    expect((within(dlg).getByLabelText("Nova validade") as HTMLInputElement).value).not.toBe("");
    await preencher(dlg, { "Nova validade": dia(365), "Valor pago (€)": "35", "Referência": "IPO-1" }, "Guardar");
    await confirmar("renovar", "rpc_fleet_renew_compliance", {
      p_vehicle_id: "v2", p_kind: "inspection", p_valid_until: dia(365), p_amount: 35, p_supplier_id: null, p_reference: "IPO-1", p_document_id: null,
    });
    expect(aviso()).toHaveTextContent(`Inspeção (IPO) da 45-XZ-78 renovado até ${dia(365).split("-").reverse().join("/")}.`);
  });
});

describe("Carrinha: mínimo e reposição em dois passos", () => {
  it("mínimo de um artigo: rpc_fleet_set_van_minimum", async () => {
    const f = await ficha("AA-12-BC", "Stock na carrinha");
    fireEvent.click(within(f).getByRole("button", { name: "Mínimo de Tubo multicamada 16 mm" }));
    const dlg = await dialogo("Mínimo na carrinha");
    await preencher(dlg, { "Mínimo na carrinha": "12" }, "Guardar");
    await confirmar("minimo", "rpc_fleet_set_van_minimum", { p_vehicle_id: "v1", p_product_id: "p1", p_minimum: 12 });
  });

  it("passo 1, pedir reposição: rpc_fleet_request_restock com o armazém de origem", async () => {
    bd.respostas.rpc_fleet_request_restock = () => ({ data: { request_ids: ["r2"] } });
    const f = await ficha("AA-12-BC", "Stock na carrinha");
    fireEvent.click(within(f).getByRole("button", { name: "Pedir reposição (1)" }));
    const dlg = await dialogo("Pedir reposição da carrinha");
    await opcao(dlg, "Armazém central");
    expect(within(dlg).queryByRole("option", { name: "Carrinha AA-12-BC" })).toBeNull();
    await preencher(dlg, { "Armazém de origem": "wh-central" }, "Pedir reposição");
    await confirmar("pedirReposicao", "rpc_fleet_request_restock", { p_vehicle_id: "v1", p_from_warehouse_id: "wh-central" });
    expect(aviso()).toHaveTextContent("Pedido de reposição da carrinha AA-12-BC: 1 artigo(s).");
  });

  it("passo 2, transferir (inventory.edit): rpc_fleet_fulfil_restock e o Inventário é invalidado", async () => {
    bd.respostas.rpc_fleet_fulfil_restock = () => ({ data: [{ id: "r1", ok: true, document_number: "TR-0001" }] });
    const f = await ficha("AA-12-BC", "Stock na carrinha");
    fireEvent.click(within(f).getByRole("button", { name: "Transferir" }));
    await confirmar("satisfazerReposicao", "rpc_fleet_fulfil_restock", { p_request_ids: ["r1"] });
    expect(within(f).getByTestId("aviso-ficha")).toHaveTextContent("1 pedido(s) transferido(s) para a carrinha (TR-0001).");
  });

  it("sem inventory.edit o Transferir fica bloqueado", async () => {
    estado.perms.delete("inventory.edit");
    const f = await ficha("AA-12-BC", "Stock na carrinha");
    expect(within(f).getByRole("button", { name: "Transferir" })).toHaveAttribute("aria-disabled", "true");
  });

  it("cancelar um pedido: rpc_fleet_cancel_restock, com confirmação", async () => {
    const f = await ficha("AA-12-BC", "Stock na carrinha");
    fireEvent.click(within(f).getByRole("button", { name: "Cancelar" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancelar pedido" }));
    await confirmar("cancelarReposicao", "rpc_fleet_cancel_restock", { p_request_id: "r1" });
  });

  it("o painel do Inventário (Stocks) mostra os pedidos e transfere-os", async () => {
    bd.tabelas.fleet_restock_requests = [{ ...pedidoBase(), fleet_vehicles: { plate: "AA-12-BC" }, products: { name: "Tubo multicamada 16 mm", sku: "TM-16" }, warehouses: { name: "Armazém central" } }];
    bd.respostas.rpc_fleet_fulfil_restock = () => ({ data: [{ id: "r1", ok: false, error: "Stock insuficiente no armazém de origem." }] });
    cleanup();
    const qc = novoQc();
    const espiao = vi.spyOn(qc, "invalidateQueries");
    const aoMudar = vi.fn();
    render(<QueryClientProvider client={qc}><PedidosCarrinhasPainel organizationId={ORG} aoMudar={aoMudar} /></QueryClientProvider>);
    const painel = await screen.findByTestId("pedidos-carrinhas");
    expect(within(painel).getByText("Pedidos das carrinhas (1)")).toBeInTheDocument();
    fireEvent.click(within(painel).getByRole("button", { name: "Transferir Tubo multicamada 16 mm para a AA-12-BC" }));
    await waitFor(() => expect(bd.rpc).toHaveBeenCalledWith("rpc_fleet_fulfil_restock", { p_request_ids: ["r1"] }));
    await waitFor(() => expect(aoMudar).toHaveBeenCalled());
    const chaves = chavesInvalidadas(espiao);
    expect(chaves).toEqual(expect.arrayContaining([JSON.stringify(frotaKeys.tabela(ORG, "pedidos")), JSON.stringify(frotaKeys.tabela(ORG, "stock")), JSON.stringify(["inventory-today", ORG])]));
  });
});

describe("Operações: ligar e lançar custo", () => {
  it("ligar a uma ordem: rpc_fleet_link_order; o custo pendente vem explicado (resultado jsonb)", async () => {
    bd.respostas.rpc_fleet_link_order = () => ({ data: { link_id: "l2", travel_cost: 12, ops_custo_id: null, cost_not_posted_reason: "Sem permissão para lançar custos em Operações: fica pendente para um gestor." } });
    await ir("/frota/ligacoes");
    fireEvent.click(screen.getByRole("button", { name: "Ligar a ordem ou obra" }));
    const dlg = await dialogo("Ligar a uma ordem ou obra");
    await opcao(dlg, /OT-501/);
    await preencher(dlg, { Viatura: "v1", "Ordem (Operações)": "ord-1", "Km da deslocação": "30", Condutor: "d1" }, "Ligar");
    await confirmar("ligar", "rpc_fleet_link_order", {
      p_vehicle_id: "v1", p_ops_ordem_id: "ord-1", p_ops_obra_id: null, p_used_on: HOJE, p_driver_id: "d1", p_km: 30, p_notes: null,
    });
    expect(aviso()).toHaveTextContent("AA-12-BC ligada. Custo da deslocação por lançar (12,00 €): Sem permissão para lançar custos em Operações: fica pendente para um gestor.");
  });

  it("ligar com o custo lançado logo na ordem", async () => {
    bd.respostas.rpc_fleet_link_order = () => ({ data: { link_id: "l3", travel_cost: 12, ops_custo_id: "c1", cost_not_posted_reason: null } });
    await ir("/frota/ligacoes");
    fireEvent.click(screen.getByRole("button", { name: "Ligar a ordem ou obra" }));
    const dlg = await dialogo("Ligar a uma ordem ou obra");
    await opcao(dlg, /OT-501/);
    await preencher(dlg, { Viatura: "v1", "Ordem (Operações)": "ord-1", "Km da deslocação": "30" }, "Ligar");
    await waitFor(() => expect(aviso()).toHaveTextContent("AA-12-BC ligada. Deslocação de 12,00 € lançada na ordem."));
  });

  it("lançar um custo pendente: rpc_fleet_post_travel_cost, com confirmação", async () => {
    await ir("/frota/ligacoes");
    fireEvent.click(await screen.findByRole("button", { name: /Lançar custo de 16,00.€/ }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Lançar custo" }));
    await confirmar("lancarCusto", "rpc_fleet_post_travel_cost", { p_link_id: "l1" });
    expect(aviso()).toHaveTextContent("Deslocação de 16,00 € lançada na ordem.");
  });
});

describe("Condutores", () => {
  it("novo condutor com conta no CRM: rpc_fleet_upsert_driver", async () => {
    await ir("/frota/condutores");
    fireEvent.click(screen.getByRole("button", { name: "Novo condutor" }));
    const dlg = await dialogo("Novo condutor");
    await opcao(dlg, "Rui Alves");
    // quem já é condutor (Sofia Martins, u-1) não aparece na lista de contas
    expect(within(dlg).queryByRole("option", { name: "Sofia Martins" })).toBeNull();
    await preencher(dlg, { Nome: "Rui Alves", Categorias: "B, C", "Carta válida até": dia(500), "Conta no CRM": "u-2" }, "Guardar");
    await confirmar("condutor", "rpc_fleet_upsert_driver", {
      p_organization_id: ORG, p_driver_id: null,
      p_data: { full_name: "Rui Alves", job_title: "", team: "", licence_number: "", licence_categories: ["B", "C"], licence_expires_on: dia(500), user_id: "u-2", notes: "", is_active: true },
    });
    expect(aviso()).toHaveTextContent("Condutor Rui Alves criado.");
  });

  it("editar condutor: o mesmo RPC com o id", async () => {
    await ir("/frota/condutores");
    fireEvent.click(screen.getByRole("button", { name: "Editar Sofia Martins" }));
    const dlg = await dialogo("Editar condutor");
    await preencher(dlg, { Equipa: "Sul" }, "Guardar");
    await waitFor(() => expect(bd.rpc).toHaveBeenCalledWith("rpc_fleet_upsert_driver", expect.objectContaining({ p_driver_id: "d1", p_data: expect.objectContaining({ team: "Sul", full_name: "Sofia Martins" }) })));
  });
});

describe("Editar a ficha da viatura", () => {
  it("editar: rpc_fleet_update_vehicle só com o que mudou (o VIN lido da tabela), a ficha e a lista atualizam", async () => {
    bd.tabelas.fleet_vehicles = [{ id: "v1", vin: "VF1AAA", notes: null }];
    bd.respostas.rpc_fleet_update_vehicle = () => {
      Object.assign(bd.tabelas.fleet_v_vehicles[0], { model: "Master L3", vehicle_category: "light_passenger", service_every_km: 40000, cost_center_id: "cc1" });
      return { data: null };
    };
    const f = await ficha("AA-12-BC");
    fireEvent.click(within(f).getByRole("button", { name: "Editar" }));
    const dlg = await dialogo("Editar viatura");
    // a matrícula não se edita (a RPC não a aceita): não há campo
    expect(within(dlg).queryByLabelText("Matrícula")).toBeNull();
    await waitFor(() => expect(within(dlg).getByLabelText("VIN (n.º de quadro)")).toHaveValue("VF1AAA"));
    await opcao(dlg, "Instalações");
    await preencher(dlg, { Modelo: "Master L3", "Categoria (para a IPO)": "light_passenger", "Revisão a cada (km)": "40000", "VIN (n.º de quadro)": "vf1bbb", "Centro de custo": "cc1" }, "Guardar alterações");
    await confirmar("editar", "rpc_fleet_update_vehicle", {
      p_vehicle_id: "v1",
      p_data: { model: "Master L3", vehicle_category: "light_passenger", service_every_km: 40000, vin: "VF1BBB", cost_center_id: "cc1", cost_center_label: "Instalações" },
    });
    await fechou("Editar viatura");
    expect(aviso()).toHaveTextContent("Ficha da AA-12-BC gravada.");
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("heading", { name: /Master L3/ })).toBeInTheDocument());
  });

  it("validação: sem alterações não grava; ano impossível fica no campo", async () => {
    const f = await ficha("AA-12-BC");
    fireEvent.click(within(f).getByRole("button", { name: "Editar" }));
    const dlg = await dialogo("Editar viatura");
    fireEvent.click(within(dlg).getByRole("button", { name: "Guardar alterações" }));
    expect(await within(dlg).findByText("Não alteraste nada.")).toBeInTheDocument();
    await preencher(dlg, { Ano: "1800" }, "Guardar alterações");
    expect(await within(dlg).findAllByText(/Indica um ano entre 1950 e/)).not.toHaveLength(0);
    expect(bd.rpc).not.toHaveBeenCalledWith("rpc_fleet_update_vehicle", expect.anything());
  });

  it("erro da RPC: a mensagem em português fica no diálogo e nada muda", async () => {
    bd.respostas.rpc_fleet_update_vehicle = () => ({ error: { message: "Sem permissão para gerir a Frota.", code: "42501" } });
    const f = await ficha("AA-12-BC");
    fireEvent.click(within(f).getByRole("button", { name: "Editar" }));
    const dlg = await dialogo("Editar viatura");
    await preencher(dlg, { Marca: "Renault Trucks" }, "Guardar alterações");
    expect(await within(dlg).findByText("Sem permissão para gerir a Frota.")).toBeInTheDocument();
  });

  it("sem fleet.manage o Editar fica bloqueado", async () => {
    estado.perms.delete("fleet.manage");
    const f = await ficha("AA-12-BC");
    expect(within(f).getByRole("button", { name: "Editar" })).toHaveAttribute("aria-disabled", "true");
  });
});

describe("Rever as linhas do extrato", () => {
  const linhaRever = () => ({
    id: "e2", vehicle_id: "v1", spent_on: dia(-3), category: "fuel", quantity: 30, unit: "L", amount: 50, odometer_km: 140000, driver_id: "d1", supplier_id: null,
    supplier_label: "Cartão frota · Galp", cost_center_id: null, cost_center_label: null, ops_obra_id: null, ops_ordem_id: null, source: "statement", import_id: "imp-1",
    needs_review: true, review_reason: "Km abaixo da última leitura (148230)", notes: null,
  });
  const rotulo = () => `Linha de ${dia(-3).split("-").reverse().join("/")} da AA-12-BC`;
  beforeEach(() => {
    bd.tabelas.fleet_expenses.push(linhaRever());
    bd.tabelas.fleet_expense_imports = [{ id: "imp-1", file_name: "extrato.csv", file_sha256: "x", supplier_id: null, rows_total: 2, rows_imported: 2, rows_flagged: 1, rows_skipped: 0, imported_at: `${dia(-1)}T10:00:00Z` }];
  });

  it("aceitar com os km corrigidos: rpc_fleet_review_expense, a linha sai da lista e o contador desce", async () => {
    bd.respostas.rpc_fleet_review_expense = () => {
      Object.assign(bd.tabelas.fleet_expenses.find((e) => e.id === "e2")!, { needs_review: false, review_reason: null, odometer_km: 148500 });
      bd.tabelas.fleet_expense_imports[0].rows_flagged = 0;
      return { data: null };
    };
    await ir("/frota/custos");
    fireEvent.click(await screen.findByRole("button", { name: "Rever as linhas de extrato.csv" }));
    const dlg = await dialogo("Rever linhas do extrato");
    const linha = within(dlg).getByRole("listitem", { name: rotulo() });
    fireEvent.change(within(linha).getByLabelText("Km"), { target: { value: "148500" } });
    fireEvent.click(within(linha).getByRole("button", { name: /^Aceitar a linha/ }));
    await confirmar("rever", "rpc_fleet_review_expense", { p_expense_id: "e2", p_accept: true, p_vehicle_id: "v1", p_km: 148500, p_amount: 50 });
    expect(await within(dlg).findByText("Não há linhas para rever nesta importação.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Rever linhas (1)" })).toBeNull());
  });

  it("rejeitar pede confirmação e chama a RPC com p_accept=false", async () => {
    const f = await ficha("AA-12-BC", "Custos");
    fireEvent.click(within(f).getByRole("button", { name: "Rever linhas" }));
    const dlg = await dialogo("Rever linhas do extrato");
    fireEvent.click(within(dlg).getByRole("button", { name: /^Rejeitar a linha/ }));
    expect(bd.rpc).not.toHaveBeenCalledWith("rpc_fleet_review_expense", expect.anything());
    fireEvent.click(within(dlg).getByRole("button", { name: /^Confirmar rejeição/ }));
    await waitFor(() => expect(bd.rpc).toHaveBeenCalledWith("rpc_fleet_review_expense", { p_expense_id: "e2", p_accept: false, p_vehicle_id: null, p_km: null, p_amount: null }));
  });

  it("valor inválido não grava; RPC em falta na BD diz que ainda não está disponível", async () => {
    bd.respostas.rpc_fleet_review_expense = () => ({ error: { message: "Could not find the function public.rpc_fleet_review_expense", code: "PGRST202" } });
    await ir("/frota/custos");
    fireEvent.click(screen.getByRole("button", { name: "Rever linhas (1)" }));
    const dlg = await dialogo("Rever linhas do extrato");
    fireEvent.change(within(dlg).getByLabelText("Valor (€)"), { target: { value: "0" } });
    fireEvent.click(within(dlg).getByRole("button", { name: /^Aceitar a linha/ }));
    expect(await within(dlg).findByText("Não foi gravado: Indica o valor (maior do que 0).")).toBeInTheDocument();
    expect(bd.rpc).not.toHaveBeenCalledWith("rpc_fleet_review_expense", expect.anything());
    fireEvent.change(within(dlg).getByLabelText("Valor (€)"), { target: { value: "50" } });
    fireEvent.click(within(dlg).getByRole("button", { name: /^Aceitar a linha/ }));
    expect(await within(dlg).findByText("Esta ação da Frota ainda não está disponível na base de dados.")).toBeInTheDocument();
  });
});

describe("Renovar com comprovativo", () => {
  const pdf = () => new File(["%PDF-1.4"], "ipo-2026.pdf", { type: "application/pdf" });
  async function abrirRenovar(): Promise<HTMLElement> {
    await ir("/frota/documentos");
    fireEvent.click(screen.getByRole("button", { name: "Renovar Inspeção (IPO) da 45-XZ-78" }));
    return dialogo("Renovar documento");
  }

  it("anexa o ficheiro (documents, entity_type='vehicle') e liga-o à renovação por p_document_id", async () => {
    const dlg = await abrirRenovar();
    await preencher(dlg, { "Nova validade": dia(365) });
    fireEvent.change(within(dlg).getByLabelText("Comprovativo (PDF ou foto)"), { target: { files: [pdf()] } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Guardar" }));
    await confirmar("renovar", "rpc_fleet_renew_compliance", {
      p_vehicle_id: "v2", p_kind: "inspection", p_valid_until: dia(365), p_amount: null, p_supplier_id: null, p_reference: null, p_document_id: "documents-novo",
    });
    expect(bd.storage.upload).toHaveBeenCalledWith("documents-quarantine", expect.stringMatching(/^org-teste\/vehicle\/v2\/.+\.pdf$/), expect.any(File));
    expect(bd.invoke).toHaveBeenCalledWith("validate-upload", expect.objectContaining({ body: expect.objectContaining({ finalBucket: "documents" }) }));
    expect(bd.inserts).toEqual([expect.objectContaining({
      tabela: "documents",
      valores: expect.objectContaining({ organization_id: ORG, entity_type: "vehicle", entity_id: "v2", file_name: "ipo-2026.pdf", visible_to_client: false }),
    })]);
    // a ficha › Documentos (DocumentsTab, chave ["documents","vehicle",<id>]) volta a ler
    expect(chavesInvalidadas(invalidar)).toContain(JSON.stringify(["documents", "vehicle"]));
    expect(aviso()).toHaveTextContent("O comprovativo ficou na ficha › Documentos.");
  });

  it("ficheiro de tipo não aceite: erro no campo, nada é carregado nem gravado", async () => {
    const dlg = await abrirRenovar();
    await preencher(dlg, { "Nova validade": dia(365) });
    fireEvent.change(within(dlg).getByLabelText("Comprovativo (PDF ou foto)"), { target: { files: [new File(["x"], "virus.exe", { type: "application/x-msdownload" })] } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Guardar" }));
    expect(await within(dlg).findAllByText(/Tipo de ficheiro não permitido/)).not.toHaveLength(0);
    expect(bd.storage.upload).not.toHaveBeenCalled();
    expect(bd.rpc).not.toHaveBeenCalledWith("rpc_fleet_renew_compliance", expect.anything());
  });

  it("renovação recusada pela RPC: o anexo é desfeito (linha e ficheiro)", async () => {
    bd.respostas.rpc_fleet_renew_compliance = () => ({ error: { message: "A nova validade tem de ser depois de hoje.", code: "23514" } });
    const dlg = await abrirRenovar();
    await preencher(dlg, { "Nova validade": dia(365) });
    fireEvent.change(within(dlg).getByLabelText("Comprovativo (PDF ou foto)"), { target: { files: [pdf()] } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Guardar" }));
    expect(await within(dlg).findByText("A nova validade tem de ser depois de hoje.")).toBeInTheDocument();
    expect(bd.deletes).toEqual([{ tabela: "documents", filtro: [["id", "documents-novo"]] }]);
    expect(bd.storage.remove).toHaveBeenCalledWith("documents", [expect.stringMatching(/^org-teste\/vehicle\/v2\//)]);
  });
});

afterAll(() => {
  // todas as ações do mapa INVALIDA têm um teste acima
  expect([...testadas].sort()).toEqual((Object.keys(INVALIDA) as AcaoFrota[]).sort());
});
