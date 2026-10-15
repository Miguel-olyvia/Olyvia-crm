// Os diálogos da Frota (app real) em shadcn Dialog. Gravar valida no navegador o que já se sabe (campos em falta, km que
// descem, carta que não serve: as mesmas frases das RPCs, para avisar antes de gravar), com erro no campo e foco no
// primeiro inválido, e depois chama a RPC rpc_fleet_* certa. A RPC é que decide: se recusar, a mensagem dela aparece no
// diálogo e nada muda. As listas são <select> nativos (NativeSelect): nada de Popover/Command dentro do Dialog.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, TriangleAlert, UserRoundSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PERM, useFrotaCtx, type CtxFrota, type DadosDlg, type LigacaoAviso, type Requisito, type ResultadoFrota, type TipoDlg } from "./contexto";
import { Placa, SeloEstado } from "./pecas";
import { DialogoImportar } from "./DialogoImportar";
import { DialogoRever } from "./DialogoRever";
import { Alerta, Campo, Nota } from "./campos";
import {
  CATEGORIAS, CATEGORIAS_CUSTO, CATEGORIAS_DESPESA, COMBUSTIVEIS, ESTADOS, POSSES, TIPOS_MANUT, TIPOS_OCORR, VENC, addDias, atribEm, ativa, cartaProblema, condutor,
  anexarDocumentoViatura, desfazerDocumentoViatura, diaDe, eletrica, fData, fEur, fKm, linkCalendario, numero, opcoesDe, problemaFicheiro, proximaIpo, quemConduzia,
  rpcFrota, stockDe, tabela, useReferenciaFrota, viatura, type DocumentoAnexado, type Frota, type ReferenciasFrota,
} from "./dados";
import type {
  FleetAssignmentKind, FleetComplianceKind, FleetExpenseCategory, FleetFuelType, FleetIncidentKind, FleetMaintenanceKind, FleetOwnership, FleetVehicleStatus,
} from "@/integrations/supabase/fleetTypes";

export type Vals = Record<string, string>;
export type Erros = Record<string, string>;

/**
 * O que a gravação precisa do ecrã: o retrato, como agir, a organização, os valores com que o formulário abriu
 * (`inicial`, para mandar só o que mudou) e o ficheiro escolhido (nos diálogos com `anexo`).
 */
interface Gravar { F: Frota; agir: CtxFrota["agir"]; org: string; refs: Partial<ReferenciasFrota>; inicial: Vals; ficheiro: File | null }

interface Def {
  titulo: string; ok: string; largo?: boolean;
  requer: Requisito;
  /** As listas de outros módulos de que o formulário precisa. */
  refs?: (keyof ReferenciasFrota)[];
  ini: (F: Frota, d: DadosDlg) => Vals;
  /** Valores que não estão no retrato e se leem ao abrir (juntam-se a `ini` e aos valores iniciais). */
  carregar?: (d: DadosDlg) => Promise<Vals>;
  /** O diálogo tem um campo de ficheiro opcional ("ficheiro"). */
  anexo?: boolean;
  validar: (F: Frota, x: Vals) => Erros;
  gravar: (g: Gravar, x: Vals) => Promise<ResultadoFrota<unknown>>;
}

const MATRICULA = /^([A-Z]{2}-[0-9]{2}-[A-Z]{2}|[0-9]{2}-[A-Z]{2}-[0-9]{2}|[0-9]{2}-[0-9]{2}-[A-Z]{2}|[A-Z]{2}-[0-9]{2}-[0-9]{2})$/;
const nulo = (s: string | undefined): string | null => (s && s.trim() ? s.trim() : null);
const inteiro = (s: string | undefined): number | null => { const v = numero(s); return v == null ? null : Math.trunc(v); };
const nomeFornecedor = (g: Gravar, id: string | undefined): string | null => (id ? g.refs.fornecedores?.find((f) => f.id === id)?.nome ?? null : null);
/** "c:<id>" (centro de custo) ou "o:<id>" (obra): a imputação de uma despesa. */
const imputacao = (s: string | undefined): { centro: string | null; obra: string | null } =>
  s?.startsWith("c:") ? { centro: s.slice(2), obra: null } : s?.startsWith("o:") ? { centro: null, obra: s.slice(2) } : { centro: null, obra: null };

/** Erros comuns: data no futuro, km abaixo da última leitura. */
function kmMin(F: Frota, vid: string | undefined, km: string | undefined, campo = "km"): Erros {
  const v = viatura(F, vid), k = inteiro(km);
  if (k == null) return { [campo]: "Indica os km." };
  if (v && k < v.odometer_km) return { [campo]: `Não pode ser menos do que ${fKm(v.odometer_km)}.` };
  return {};
}
const naoFuturo = (F: Frota, d: string | undefined, campo = "data"): Erros =>
  !d ? { [campo]: "Indica a data." } : d > F.hoje ? { [campo]: "Não pode ser no futuro." } : {};

/** O formulário "Editar viatura" nas chaves de p_data do rpc_fleet_update_vehicle (vazio → null; própria → sem renda nem locadora). */
function dadosFicha(x: Vals): Record<string, unknown> {
  const propria = x.posse === "owned";
  const d: Record<string, unknown> = {
    make: (x.marca ?? "").trim(), model: (x.modelo ?? "").trim(), vehicle_type: nulo(x.tipo), vehicle_category: nulo(x.categoria), first_registration_on: nulo(x.primeira),
    fuel_type: x.comb, ownership: x.posse, lessor_supplier_id: propria ? null : nulo(x.locadora), monthly_rent: propria ? null : numero(x.renda),
    model_year: inteiro(x.ano), required_licence: x.carta || "B", cost_center_id: nulo(x.centro), personal_use: !!x.usoPessoal, is_pool: !!x.pool,
    service_every_km: inteiro(x.revKm), service_every_months: inteiro(x.revMeses),
  };
  // o VIN e as notas só vão se foram lidos da BD (senão um campo vazio apagava o que lá está)
  if (x.extra) { d.vin = nulo(x.vin)?.toUpperCase() ?? null; d.notes = nulo(x.notas); }
  return d;
}
/** Só as chaves que mudaram em relação ao que o formulário mostrou ao abrir (a RPC deixa como está o que não vier). */
function alteracoes(x: Vals, inicial: Vals): Record<string, unknown> {
  const a = dadosFicha(x), b = dadosFicha(inicial);
  return Object.fromEntries(Object.entries(a).filter(([k, val]) => JSON.stringify(val) !== JSON.stringify(b[k])));
}
/** Os valores com que o formulário abriu, guardados nele próprio (chave "inicial"), para saber o que mudou. */
const editarIni = (x: Vals): Vals => (x.inicial ? (JSON.parse(x.inicial) as Vals) : x);

const DEFS: Record<Exclude<TipoDlg, "importar" | "rever">, Def> = {
  atribuir: {
    titulo: "Atribuir viatura", ok: "Atribuir", requer: "gerir", refs: ["obras", "ordens"],
    ini: (F, d) => {
      const v = viatura(F, d.v);
      return { vid: d.v ?? "", pid: d.p ?? "", tipo: d.ini ? "temporary" : "permanent", ini: d.ini ?? F.hoje, fim: d.ini ?? "", km: v ? String(v.odometer_km) : "", motivo: "", obra: "", ordem: "" };
    },
    validar: (F, x) => {
      const e: Erros = {};
      const v = viatura(F, x.vid), p = condutor(F, x.pid);
      if (!v) e.vid = "Escolhe a viatura.";
      else if (v.status !== "active") e.vid = `A ${v.plate} não está ativa.`;
      if (!p) e.pid = "Escolhe o condutor.";
      if (!x.ini) e.ini = "Indica o início.";
      if (x.tipo === "temporary" && !x.fim) e.fim = "Indica até quando.";
      if (x.fim && x.ini && x.fim < x.ini) e.fim = "O fim não pode ser antes do início.";
      if (v && p && !e.pid) { const c = cartaProblema(p, v, x.ini || F.hoje) ?? (x.fim ? cartaProblema(p, v, x.fim) : null); if (c) e.pid = c; }
      const km = inteiro(x.km);
      if (v && km != null && x.ini <= F.hoje && km < v.odometer_km) e.km = `Não pode ser menos do que a última leitura (${fKm(v.odometer_km)}).`;
      return e;
    },
    gravar: (g, x) => {
      const v = viatura(g.F, x.vid)!, p = condutor(g.F, x.pid)!;
      const kind = x.tipo as FleetAssignmentKind;
      return g.agir("atribuir", () => rpcFrota("rpc_fleet_assign", {
        p_vehicle_id: x.vid, p_driver_id: x.pid, p_kind: kind, p_starts_on: x.ini, p_ends_on: nulo(x.fim), p_km: inteiro(x.km),
        p_reason: nulo(x.motivo), p_ops_obra_id: nulo(x.obra), p_ops_ordem_id: nulo(x.ordem),
      }), {
        ok: `${v.plate} atribuída a ${p.full_name}.` + (kind === "temporary"
          ? (v.schedule_resource_id ? " A reserva ficou na Agenda (quadro Frota)." : " A viatura não é recurso da Agenda: a reserva fica só na Frota.")
          : ""),
        link: { rotulo: "Ver no calendário", para: linkCalendario(x.ini) },
      });
    },
  },
  devolver: {
    titulo: "Devolver viatura", ok: "Registar devolução", requer: "gerir",
    ini: (F, d) => { const a = F.atrib.find((z) => z.id === d.a); return { a: d.a ?? "", km: String(viatura(F, a?.vehicle_id)?.odometer_km ?? ""), data: F.hoje, danos: "", descDanos: "" }; },
    validar: (F, x) => {
      const a = F.atrib.find((z) => z.id === x.a);
      if (!a) return { a: "Atribuição desconhecida." };
      const e: Erros = { ...kmMin(F, a.vehicle_id, x.km), ...naoFuturo(F, x.data) };
      if (!e.data && x.data < a.starts_on) e.data = "A data é anterior à entrega.";
      if (x.danos && (x.descDanos ?? "").trim().length < 3) e.descDanos = "Descreve os danos.";
      return e;
    },
    gravar: (g, x) => {
      const a = g.F.atrib.find((z) => z.id === x.a)!, v = viatura(g.F, a.vehicle_id)!;
      const danos = x.danos ? (x.descDanos ?? "").trim() : null;
      return g.agir("devolver", () => rpcFrota("rpc_fleet_return", { p_assignment_id: x.a, p_km: inteiro(x.km)!, p_returned_on: x.data, p_damage_notes: danos }), {
        ok: (r) => `${v.plate} devolvida com ${fKm(inteiro(x.km))}.` + (r?.incident_id ? " Os danos abriram uma ocorrência de sinistro." : ""),
        link: (r) => (r?.incident_id ? { rotulo: "Ver nas Ocorrências", para: "/frota/ocorrencias" } : { rotulo: "Ver o histórico das atribuições", para: "/frota/atribuicoes?vista=hist" }),
      });
    },
  },
  km: {
    titulo: "Registar km", ok: "Registar", requer: "gerirOuSelf",
    ini: (F, d) => ({ vid: d.v ?? "", km: "", data: F.hoje, salto: "" }),
    validar: (F, x) => {
      const v = viatura(F, x.vid), k = inteiro(x.km);
      if (!v) return { vid: "Escolhe a viatura." };
      if (k == null) return { km: "Indica os km." };
      if (k < v.odometer_km) return { km: `Os km não podem descer. Última leitura: ${fKm(v.odometer_km)}.` };
      if (k - v.odometer_km > 5000 && !x.salto) return { salto: `São mais ${fKm(k - v.odometer_km)} do que a última leitura. Confirma o valor.` };
      return naoFuturo(F, x.data);
    },
    gravar: (g, x) => {
      const v = viatura(g.F, x.vid)!;
      return g.agir("km", () => rpcFrota("rpc_fleet_record_odometer", { p_vehicle_id: x.vid, p_km: inteiro(x.km)!, p_read_on: x.data, p_confirm_jump: !!x.salto }), {
        ok: `Km da ${v.plate} registados: ${fKm(inteiro(x.km))}.`, link: { rotulo: "Ver nas Viaturas", para: "/frota/viaturas" },
      });
    },
  },
  abastecer: {
    titulo: "Registar abastecimento", ok: "Registar", requer: "gerirOuSelf", refs: ["fornecedores"],
    ini: (F, d) => ({ vid: d.v ?? "", data: F.hoje, qtd: "", valor: "", km: String(viatura(F, d.v)?.odometer_km ?? ""), fornecedor: "", posto: "" }),
    validar: (F, x) => {
      const e: Erros = {};
      if (!viatura(F, x.vid)) e.vid = "Escolhe a viatura.";
      if (!((numero(x.qtd) ?? 0) > 0)) e.qtd = "Indica a quantidade.";
      if (!((numero(x.valor) ?? 0) > 0)) e.valor = "Indica o valor.";
      return { ...e, ...(e.vid ? {} : kmMin(F, x.vid, x.km)), ...naoFuturo(F, x.data) };
    },
    gravar: (g, x) => {
      const v = viatura(g.F, x.vid)!;
      return g.agir("abastecer", () => rpcFrota("rpc_fleet_record_fuel", {
        p_vehicle_id: x.vid, p_quantity: numero(x.qtd)!, p_amount: numero(x.valor)!, p_km: inteiro(x.km)!,
        p_supplier_id: nulo(x.fornecedor), p_supplier_label: nulo(x.posto) ?? nomeFornecedor(g, x.fornecedor), p_spent_on: x.data,
      }), { ok: `${eletrica(v) ? "Carregamento" : "Abastecimento"} de ${fEur(numero(x.valor))} registado na ${v.plate}.`, link: { rotulo: "Ver nos custos", para: "/frota/custos" } });
    },
  },
  despesa: {
    titulo: "Registar despesa", ok: "Registar", requer: "gerirOuCustos", refs: ["fornecedores", "centros", "obras"],
    ini: (F, d) => ({ vid: d.v ?? "", categoria: "tolls", data: F.hoje, valor: "", fornecedor: "", fornecedorTexto: "", imputar: "", nota: "" }),
    validar: (F, x) => {
      const e: Erros = {};
      if (!viatura(F, x.vid)) e.vid = "Escolhe a viatura.";
      if (!((numero(x.valor) ?? 0) > 0)) e.valor = "Indica o valor.";
      if (!x.fornecedor && !(x.fornecedorTexto ?? "").trim()) e.fornecedor = "Escolhe o fornecedor.";
      return { ...e, ...naoFuturo(F, x.data) };
    },
    gravar: (g, x) => {
      const v = viatura(g.F, x.vid)!, imp = imputacao(x.imputar);
      const centro = imp.centro ? g.refs.centros?.find((c) => c.id === imp.centro) : undefined;
      return g.agir("despesa", () => rpcFrota("rpc_fleet_record_expense", {
        p_vehicle_id: x.vid, p_category: x.categoria as FleetExpenseCategory, p_spent_on: x.data, p_amount: numero(x.valor)!,
        p_supplier_id: nulo(x.fornecedor), p_supplier_label: nulo(x.fornecedorTexto) ?? nomeFornecedor(g, x.fornecedor),
        p_cost_center_id: imp.centro, p_cost_center_label: centro ? centro.nome : null, p_ops_obra_id: imp.obra, p_notes: nulo(x.nota),
      }), { ok: `Despesa de ${fEur(numero(x.valor))} registada na ${v.plate}.`, link: { rotulo: "Ver nos custos", para: "/frota/custos" } });
    },
  },
  manut: {
    titulo: "Agendar manutenção", ok: "Agendar", requer: "gerir", refs: ["fornecedores"],
    ini: (F, d) => ({ vid: d.v ?? "", tipo: "service", titulo: TIPOS_MANUT.service, data: d.ini ?? addDias(F.hoje, 7), fim: "", oficina: "", oficinaTexto: "", valor: "", nota: "", ocorrencia: d.o ?? "" }),
    validar: (F, x) => {
      const e: Erros = {};
      const v = viatura(F, x.vid);
      if (!v) e.vid = "Escolhe a viatura.";
      else if (!ativa(v)) e.vid = `A ${v.plate} não está ativa.`;
      if (!(x.titulo ?? "").trim()) e.titulo = "Indica a intervenção.";
      if (!x.data || x.data < F.hoje) e.data = "Escolhe uma data a partir de hoje.";
      if (x.fim && x.data && x.fim < x.data) e.fim = "A data prevista de fim não pode ser antes do início.";
      return e;
    },
    gravar: (g, x) => {
      const v = viatura(g.F, x.vid)!;
      return g.agir("manut", () => rpcFrota("rpc_fleet_schedule_maintenance", {
        p_vehicle_id: x.vid, p_kind: x.tipo as FleetMaintenanceKind, p_title: x.titulo.trim(), p_scheduled_on: x.data, p_expected_end_on: nulo(x.fim),
        p_supplier_id: nulo(x.oficina), p_supplier_label: nulo(x.oficinaTexto) ?? nomeFornecedor(g, x.oficina), p_estimated_cost: numero(x.valor),
        p_notes: nulo(x.nota), p_incident_id: nulo(x.ocorrencia),
      }), {
        ok: `${x.titulo.trim()} da ${v.plate} agendada para ${fData(x.data)}.` + (v.schedule_resource_id ? " Ficou na Agenda (quadro Frota)." : ""),
        link: { rotulo: "Ver no calendário", para: linkCalendario(x.data) },
      });
    },
  },
  concluir: {
    titulo: "Concluir intervenção", ok: "Concluir", requer: "gerir",
    ini: (F, d) => { const m = F.manut.find((z) => z.id === d.m); return { m: d.m ?? "", km: String(viatura(F, m?.vehicle_id)?.odometer_km ?? ""), valor: m?.estimated_cost != null ? String(m.estimated_cost) : "", data: F.hoje }; },
    validar: (F, x) => {
      const m = F.manut.find((z) => z.id === x.m);
      if (!m) return { m: "Intervenção desconhecida." };
      const e: Erros = { ...kmMin(F, m.vehicle_id, x.km), ...naoFuturo(F, x.data) };
      const val = numero(x.valor);
      if (val == null || val < 0) e.valor = "Indica o valor (0 se não teve custo).";
      return e;
    },
    gravar: (g, x) => {
      const m = g.F.manut.find((z) => z.id === x.m)!, v = viatura(g.F, m.vehicle_id)!;
      return g.agir("concluir", () => rpcFrota("rpc_fleet_complete_maintenance", { p_event_id: x.m, p_km: inteiro(x.km)!, p_final_cost: numero(x.valor)!, p_done_on: x.data }), {
        ok: (r) => `${m.title} concluída.` + (r?.back_to_active ? ` ${v.plate} volta a estar ativa.` : "") + (r?.inspection_until ? ` Próxima IPO até ${fData(r.inspection_until)}.` : ""),
        link: { rotulo: "Ver na Manutenção", para: "/frota/manutencao" },
      });
    },
  },
  estado: {
    titulo: "Mudar estado da viatura", ok: "Mudar estado", requer: "gerir",
    ini: (F, d) => ({ vid: d.v ?? "", estado: viatura(F, d.v)?.status === "active" ? "workshop" : "active", motivo: "" }),
    validar: (F, x) => {
      const v = viatura(F, x.vid);
      if (!v) return { vid: "Viatura desconhecida." };
      if (x.estado === v.status) return { estado: "Escolhe um estado diferente." };
      if ((x.motivo ?? "").trim().length < 3) return { motivo: "Escreve o motivo (pelo menos 3 letras)." };
      if ((x.estado === "inactive" || x.estado === "sold") && stockDe(F, v).some((s) => s.qty !== 0))
        return { estado: `A carrinha da ${v.plate} ainda tem stock: transfere-o primeiro para outro armazém (Inventário › Transferências) e depois muda o estado.` };
      return {};
    },
    gravar: (g, x) => {
      const v = viatura(g.F, x.vid)!;
      return g.agir("estado", () => rpcFrota("rpc_fleet_set_status", { p_vehicle_id: x.vid, p_status: x.estado as FleetVehicleStatus, p_reason: x.motivo.trim() }), {
        ok: `${v.plate} passou a "${ESTADOS[x.estado as FleetVehicleStatus][1]}".`, link: { rotulo: "Ver nas Viaturas", para: "/frota/viaturas" },
      });
    },
  },
  ocorrencia: {
    titulo: "Registar ocorrência", ok: "Registar", requer: "gerirOuSelf",
    ini: (F, d) => ({ vid: d.v ?? "", tipo: "breakdown", quando: "", local: "", valor: "", desc: "", notificada: F.hoje }),
    validar: (F, x) => {
      const e: Erros = {};
      if (!viatura(F, x.vid)) e.vid = "Escolhe a viatura.";
      if (!x.quando) e.quando = "Indica quando.";
      else if (x.quando.slice(0, 10) > F.hoje) e.quando = "Não pode ser no futuro.";
      if (!(x.local ?? "").trim()) e.local = "Indica o local.";
      if ((x.desc ?? "").trim().length < 3) e.desc = "Descreve o que aconteceu.";
      return e;
    },
    gravar: (g, x) => {
      const v = viatura(g.F, x.vid)!, kind = x.tipo as FleetIncidentKind;
      return g.agir("ocorrencia", () => rpcFrota("rpc_fleet_report_incident", {
        p_vehicle_id: x.vid, p_kind: kind, p_occurred_at: new Date(x.quando).toISOString(), p_location: x.local.trim(), p_description: x.desc.trim(),
        p_amount: numero(x.valor), p_notified_on: kind === "fine" ? nulo(x.notificada) : null,
      }), {
        ok: `${TIPOS_OCORR[kind]} registada na ${v.plate}.` + (kind === "fine" ? " Identifica o condutor em 15 dias úteis." : ""),
        link: { rotulo: "Ver nas Ocorrências", para: "/frota/ocorrencias" },
      });
    },
  },
  identificar: {
    titulo: "Identificar condutor", ok: "Identificar e notificar", requer: "gerir",
    ini: (F, d) => { const o = F.ocorr.find((z) => z.id === d.o); return { o: d.o ?? "", pid: o ? quemConduzia(F, o.vehicle_id, o.occurred_at)?.id ?? "" : "" }; },
    validar: (F, x) => (!F.ocorr.some((z) => z.id === x.o) ? { o: "Ocorrência desconhecida." } : !condutor(F, x.pid) ? { pid: "Escolhe o condutor." } : {}),
    gravar: (g, x) => {
      const p = condutor(g.F, x.pid)!;
      return g.agir("identificar", () => rpcFrota("rpc_fleet_identify_driver", { p_incident_id: x.o, p_driver_id: x.pid }), {
        ok: `Condutor identificado: ${p.full_name}.` + (p.user_id ? " Notificação enviada." : " Sem conta no CRM: avisa-o por outra via."),
        link: { rotulo: "Ver nas Ocorrências", para: "/frota/ocorrencias" },
      });
    },
  },
  renovar: {
    titulo: "Renovar documento", ok: "Guardar", requer: "gerirOuCustos", refs: ["fornecedores"], anexo: true,
    ini: (F, d) => {
      const v = viatura(F, d.v), k = (d.k ?? "insurance") as FleetComplianceKind;
      const sug = k === "inspection" && v ? proximaIpo(v.vehicle_category, v.first_registration_on, F.hoje) : "";
      return { vid: d.v ?? "", k, data: sug, valor: "", referencia: "", fornecedor: "" };
    },
    validar: (F, x) => (!viatura(F, x.vid) ? { vid: "Viatura desconhecida." } : !x.data || x.data <= F.hoje ? { data: "A nova validade tem de ser depois de hoje." } : {}),
    gravar: (g, x) => {
      const v = viatura(g.F, x.vid)!, k = x.k as FleetComplianceKind, ficheiro = g.ficheiro;
      return g.agir("renovar", async () => {
        // o comprovativo entra primeiro (documents, entity_type='vehicle') e a renovação fica ligada a ele (p_document_id);
        // se a renovação for recusada, o anexo é desfeito para não ficar um ficheiro solto
        let doc: DocumentoAnexado | null = null;
        if (ficheiro) doc = await anexarDocumentoViatura({ org: g.org, vid: x.vid, ficheiro, nota: `Comprovativo: ${VENC[k]} até ${fData(x.data)}` });
        try {
          return await rpcFrota("rpc_fleet_renew_compliance", {
            p_vehicle_id: x.vid, p_kind: k, p_valid_until: x.data, p_amount: numero(x.valor), p_supplier_id: nulo(x.fornecedor), p_reference: nulo(x.referencia), p_document_id: doc?.id ?? null,
          });
        } catch (e) {
          if (doc) await desfazerDocumentoViatura(doc);
          throw e;
        }
      }, {
        ok: `${VENC[k]} da ${v.plate} renovado até ${fData(x.data)}.` + (ficheiro ? " O comprovativo ficou na ficha › Documentos." : ""),
        link: { rotulo: "Ver nos Documentos", para: "/frota/documentos" },
      });
    },
  },
  editar: {
    titulo: "Editar viatura", ok: "Guardar alterações", largo: true, requer: "gerir", refs: ["fornecedores", "centros"],
    ini: (F, d) => {
      const v = viatura(F, d.v);
      const t = (n: number | null | undefined): string => (n == null ? "" : String(n));
      return {
        vid: d.v ?? "", marca: v?.make ?? "", modelo: v?.model ?? "", tipo: v?.vehicle_type ?? "", categoria: v?.vehicle_category ?? "", primeira: v?.first_registration_on ?? "",
        comb: v?.fuel_type ?? "diesel", posse: v?.ownership ?? "owned", renda: t(v?.monthly_rent), locadora: v?.lessor_supplier_id ?? "", ano: t(v?.model_year),
        carta: v?.required_licence ?? "B", centro: v?.cost_center_id ?? "", revKm: t(v?.service_every_km), revMeses: t(v?.service_every_months),
        usoPessoal: v?.personal_use ? "on" : "", pool: v?.is_pool ? "on" : "", vin: "", notas: "", extra: "",
      };
    },
    // o VIN e as notas não estão na vista fleet_v_vehicles: leem-se da tabela ao abrir (sem eles, os campos não aparecem)
    carregar: async (d) => {
      const { data, error } = await tabela("fleet_vehicles").select("vin, notes").eq("id", d.v ?? "").maybeSingle();
      if (error) throw error;
      return { vin: data?.vin ?? "", notas: data?.notes ?? "", extra: "on" };
    },
    validar: (F, x) => {
      const e: Erros = {};
      if (!viatura(F, x.vid)) return { o: "Viatura desconhecida." };
      if (!(x.marca ?? "").trim()) e.marca = "Indica a marca.";
      if (!(x.modelo ?? "").trim()) e.modelo = "Indica o modelo.";
      if (x.primeira && x.primeira > F.hoje) e.primeira = "A data da 1.ª matrícula não pode ser no futuro.";
      const ano = inteiro(x.ano), anoMax = Number(F.hoje.slice(0, 4)) + 1;
      if ((x.ano ?? "").trim() && (ano == null || ano < 1950 || ano > anoMax)) e.ano = `Indica um ano entre 1950 e ${anoMax}.`;
      if (x.posse !== "owned" && (x.renda ?? "").trim() && !((numero(x.renda) ?? -1) >= 0)) e.renda = "A renda não pode ser negativa.";
      const km = inteiro(x.revKm), meses = inteiro(x.revMeses);
      if ((x.revKm ?? "").trim() && !(km != null && km > 0)) e.revKm = "Indica os km (maior do que 0).";
      if ((x.revMeses ?? "").trim() && !(meses != null && meses > 0)) e.revMeses = "Indica os meses (maior do que 0).";
      if (!e.revKm && !e.revMeses && km == null && meses == null) e.revKm = "A revisão precisa dos km ou dos meses (pelo menos um).";
      if ((x.vin ?? "").trim() && !/^[A-Z0-9]{1,17}$/i.test(x.vin.trim())) e.vin = "O VIN tem até 17 letras e algarismos, sem espaços.";
      if (!Object.keys(e).length && !Object.keys(alteracoes(x, editarIni(x))).length) e.nada = "Não alteraste nada.";
      return e;
    },
    gravar: (g, x) => {
      const v = viatura(g.F, x.vid)!;
      const dados = alteracoes(x, g.inicial);
      if ("cost_center_id" in dados) dados.cost_center_label = g.refs.centros?.find((c) => c.id === dados.cost_center_id)?.nome ?? null;
      return g.agir("editar", () => rpcFrota("rpc_fleet_update_vehicle", { p_vehicle_id: x.vid, p_data: dados }), { ok: `Ficha da ${v.plate} gravada.` });
    },
  },
  nova: {
    titulo: "Nova viatura", ok: "Criar viatura", largo: true, requer: "gerir", refs: ["fornecedores", "centros"],
    ini: () => ({
      mat: "", marca: "", modelo: "", tipo: "Furgão", categoria: "light_goods", primeira: "", comb: "diesel", posse: "owned", renda: "", fimContrato: "", locadora: "",
      ano: "", km: "", carta: "B", centro: "", seguro: "", apolice: "", seguradora: "", ipo: "", iuc: "", revKm: "30000", revMeses: "12",
      armazem: "", agenda: "on", usoPessoal: "", pool: "",
    }),
    validar: (F, x) => {
      const e: Erros = {};
      const mat = (x.mat ?? "").trim().toUpperCase().replace(/\s/g, "");
      if (!MATRICULA.test(mat)) e.mat = "Usa o formato português, por exemplo AA-00-AA.";
      else if (F.viaturas.some((v) => v.plate === mat)) e.mat = "Já existe uma viatura com esta matrícula.";
      if (!(x.marca ?? "").trim()) e.marca = "Indica a marca.";
      if (!(x.modelo ?? "").trim()) e.modelo = "Indica o modelo.";
      const km = inteiro(x.km);
      if (km == null || km < 0) e.km = "Indica os km.";
      if (!x.seguro) e.seguro = "Sem seguro válido não pode circular.";
      if (x.primeira && x.primeira > F.hoje) e.primeira = "A data da 1.ª matrícula não pode ser no futuro.";
      return e;
    },
    gravar: (g, x) => {
      const mat = x.mat.trim().toUpperCase().replace(/\s/g, "");
      const centro = g.refs.centros?.find((c) => c.id === x.centro);
      const dados: Record<string, unknown> = {
        plate: mat, make: x.marca.trim(), model: x.modelo.trim(), vehicle_type: nulo(x.tipo), vehicle_category: nulo(x.categoria), first_registration_on: nulo(x.primeira),
        fuel_type: x.comb as FleetFuelType, ownership: x.posse as FleetOwnership, monthly_rent: numero(x.renda), contract_ends_on: nulo(x.fimContrato),
        lessor_supplier_id: nulo(x.locadora), model_year: inteiro(x.ano), odometer_km: inteiro(x.km), required_licence: x.carta || "B",
        cost_center_id: nulo(x.centro), cost_center_label: centro?.nome ?? null, insurance_until: nulo(x.seguro), insurance_policy_no: nulo(x.apolice),
        insurer_supplier_id: nulo(x.seguradora), inspection_until: nulo(x.ipo), road_tax_until: nulo(x.iuc),
        service_every_km: inteiro(x.revKm), service_every_months: inteiro(x.revMeses),
        create_warehouse: !!x.armazem, create_schedule_resource: !!x.agenda, personal_use: !!x.usoPessoal, is_pool: !!x.pool,
      };
      return g.agir("nova", () => rpcFrota("rpc_fleet_create_vehicle", { p_organization_id: g.org, p_data: dados }), {
        ok: (r) => [`Viatura ${mat} criada.`,
          r?.warehouse_id ? "Armazém móvel criado no Inventário." : "",
          r?.schedule_resource_id ? "Recurso criado na Agenda." : "",
          r?.default_warehouse_set ? "O armazém por omissão do Inventário ficou fixado no armazém que já existia." : ""].filter(Boolean).join(" "),
        link: { rotulo: "Ver nas Viaturas", para: "/frota/viaturas" },
      });
    },
  },
  condutor: {
    titulo: "Condutor", ok: "Guardar", requer: "gerir", refs: ["utilizadores"],
    ini: (F, d) => {
      const p = condutor(F, d.p);
      return {
        pid: p?.id ?? "", nome: p?.full_name ?? "", funcao: p?.job_title ?? "", equipa: p?.team ?? "", carta: p?.licence_number ?? "",
        cats: (p?.licence_categories ?? ["B"]).join(", "), validade: p?.licence_expires_on ?? "", user: p?.user_id ?? "", notas: p?.notes ?? "", ativo: p && !p.is_active ? "" : "on",
      };
    },
    validar: (_F, x) => (!(x.nome ?? "").trim() ? { nome: "Indica o nome do condutor." } : {}),
    gravar: (g, x) => {
      const cats = (x.cats ?? "").split(/[,;\s]+/).map((c) => c.trim().toUpperCase()).filter(Boolean);
      return g.agir("condutor", () => rpcFrota("rpc_fleet_upsert_driver", {
        p_organization_id: g.org, p_driver_id: nulo(x.pid),
        p_data: {
          full_name: x.nome.trim(), job_title: x.funcao ?? "", team: x.equipa ?? "", licence_number: x.carta ?? "", licence_categories: cats,
          licence_expires_on: x.validade ?? "", user_id: x.user ?? "", notes: x.notas ?? "", is_active: !!x.ativo,
        },
      }), { ok: `Condutor ${x.nome.trim()} ${x.pid ? "alterado" : "criado"}.`, link: { rotulo: "Ver nos Condutores", para: "/frota/condutores" } });
    },
  },
  ligar: {
    titulo: "Ligar a uma ordem ou obra", ok: "Ligar", requer: "gerirOuSelf", refs: ["ordens", "obras"],
    ini: (F, d) => ({ vid: d.v ?? "", ordem: "", obra: "", data: F.hoje, km: "", pid: (d.v && atribEm(F, d.v)?.driver_id) || "", nota: "" }),
    validar: (F, x) => {
      const e: Erros = {};
      if (!viatura(F, x.vid)) e.vid = "Escolhe a viatura.";
      if (!x.ordem && !x.obra) e.ordem = "Indica a ordem ou a obra.";
      const km = inteiro(x.km);
      if (km != null && km < 0) e.km = "Os km não podem ser negativos.";
      return e;
    },
    gravar: (g, x) => {
      const v = viatura(g.F, x.vid)!;
      return g.agir("ligar", () => rpcFrota("rpc_fleet_link_order", {
        p_vehicle_id: x.vid, p_ops_ordem_id: nulo(x.ordem), p_ops_obra_id: nulo(x.obra), p_used_on: x.data || g.F.hoje,
        p_driver_id: nulo(x.pid), p_km: inteiro(x.km), p_notes: nulo(x.nota),
      }), {
        ok: (r) => r?.ops_custo_id
          ? `${v.plate} ligada. Deslocação de ${fEur(r.travel_cost)} lançada na ordem.`
          : `${v.plate} ligada. Custo da deslocação por lançar${r?.travel_cost ? ` (${fEur(r.travel_cost)})` : ""}: ${r?.cost_not_posted_reason ?? "sem motivo indicado."}`,
        link: { rotulo: "Ver nas Ligações", para: "/frota/ligacoes" },
      });
    },
  },
  reposicao: {
    titulo: "Pedir reposição da carrinha", ok: "Pedir reposição", requer: "gerirOuSelf", refs: ["armazens"],
    ini: (_F, d) => ({ vid: d.v ?? "", origem: "" }),
    validar: (F, x) => (!viatura(F, x.vid)?.warehouse_id ? { vid: "Esta viatura não é um armazém móvel." } : !x.origem ? { origem: "Escolhe o armazém de onde sai o material." } : {}),
    gravar: (g, x) => {
      const v = viatura(g.F, x.vid)!;
      return g.agir("pedirReposicao", () => rpcFrota("rpc_fleet_request_restock", { p_vehicle_id: x.vid, p_from_warehouse_id: x.origem }), {
        ok: (r) => `Pedido de reposição da carrinha ${v.plate}: ${r?.request_ids?.length ?? 0} artigo(s). Fica à espera de quem trata do Inventário (Stocks › Pedidos das carrinhas).`,
      });
    },
  },
  minimo: {
    titulo: "Mínimo na carrinha", ok: "Guardar", requer: "minimo",
    ini: (F, d) => { const s = stockDe(F, viatura(F, d.v)).find((z) => z.product_id === d.produto); return { vid: d.v ?? "", produto: d.produto ?? "", minimo: s ? String(s.min) : "" }; },
    validar: (_F, x) => (!x.produto ? { produto: "Escolhe o artigo." } : (inteiro(x.minimo) ?? -1) < 0 ? { minimo: "Indica o mínimo." } : {}),
    gravar: (g, x) => {
      const v = viatura(g.F, x.vid)!, s = stockDe(g.F, v).find((z) => z.product_id === x.produto);
      return g.agir("minimo", () => rpcFrota("rpc_fleet_set_van_minimum", { p_vehicle_id: x.vid, p_product_id: x.produto, p_minimum: inteiro(x.minimo)! }), {
        ok: `Mínimo de ${s?.nome ?? "artigo"} na carrinha ${v.plate}: ${inteiro(x.minimo)}.`,
      });
    },
  },
};

/** As chaves de erro que não são campos do formulário (vão para o aviso do diálogo). */
const GERAIS = ["a", "m", "o", "nada"];

export function DialogoFrota({ tipo, dados, aoFechar, aoCriar }: { tipo: TipoDlg; dados: DadosDlg; aoFechar: () => void; aoCriar?: (vid: string) => void }) {
  if (tipo === "importar") return <DialogoImportar aoFechar={aoFechar} />;
  if (tipo === "rever") return <DialogoRever imp={dados.imp} vid={dados.v} aoFechar={aoFechar} />;
  return <DialogoForm tipo={tipo} dados={dados} aoFechar={aoFechar} aoCriar={aoCriar} />;
}

type TipoForm = Exclude<TipoDlg, "importar" | "rever">;

function DialogoForm({ tipo, dados, aoFechar, aoCriar }: { tipo: TipoForm; dados: DadosDlg; aoFechar: () => void; aoCriar?: (vid: string) => void }) {
  const { F, agir, pode, dados: estado } = useFrotaCtx();
  const def = DEFS[tipo];
  const precisa = new Set(def.refs ?? []);
  const fornecedores = useReferenciaFrota("fornecedores", precisa.has("fornecedores"));
  const centros = useReferenciaFrota("centros", precisa.has("centros"));
  const obras = useReferenciaFrota("obras", precisa.has("obras"));
  const ordens = useReferenciaFrota("ordens", precisa.has("ordens"));
  const armazens = useReferenciaFrota("armazens", precisa.has("armazens"));
  const utilizadores = useReferenciaFrota("utilizadores", precisa.has("utilizadores"));
  const refs: Partial<ReferenciasFrota> = {
    fornecedores: fornecedores.dados, centros: centros.dados, obras: obras.dados, ordens: ordens.dados, armazens: armazens.dados, utilizadores: utilizadores.dados,
  };
  const [x, setX] = useState<Vals>(() => { const v = def.ini(F, dados); return { ...v, inicial: JSON.stringify(v) }; });
  const [ficheiro, setFicheiro] = useState<File | null>(null);
  const [e, setE] = useState<Erros>({});
  const [erroGeral, setErroGeral] = useState("");
  const [focar, setFocar] = useState(0);
  const [aGravar, setAGravar] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const perm = pode(def.requer);
  useEffect(() => {
    if (focar) caixa.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
  }, [focar]);
  // os valores que não estão no retrato (por exemplo o VIN e as notas da viatura) leem-se ao abrir
  useEffect(() => {
    if (!def.carregar) return;
    let vivo = true;
    def.carregar(dados).then((extra) => {
      if (!vivo) return;
      setX((o) => {
        const ini = { ...(JSON.parse(o.inicial ?? "{}") as Vals), ...extra };
        return { ...o, ...extra, inicial: JSON.stringify(ini) };
      });
    }).catch(() => { /* sem estes campos o formulário continua a servir: só não os mostra */ });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const muda = (k: string) => (v: string): void => {
    setX((o) => {
      const n = { ...o, [k]: v };
      // ao escolher a viatura, os km passam a ser os dela (atribuir, abastecer)
      if (k === "vid" && (tipo === "atribuir" || tipo === "abastecer")) { const w = viatura(F, v); if (w) n.km = String(w.odometer_km); }
      // o título da manutenção acompanha o tipo enquanto não for escrito à mão
      if (tipo === "manut" && k === "tipo" && Object.values(TIPOS_MANUT).includes(o.titulo)) n.titulo = TIPOS_MANUT[v as FleetMaintenanceKind];
      return n;
    });
    setErroGeral("");
  };
  const escolherFicheiro = (f: File | null): void => {
    setFicheiro(f);
    setE((o) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== "ficheiro")));
    setErroGeral("");
  };
  const submeter = async (): Promise<void> => {
    if (aGravar) return;
    if (!perm.ok) { setErroGeral(perm.porque); return; }
    const erros = def.validar(F, x);
    if (def.anexo && ficheiro) { const p = problemaFicheiro(ficheiro); if (p) erros.ficheiro = p; }
    setE(erros);
    // nenhuma recusa fica em silêncio: além do erro no campo, o resumo junto aos botões diz o que falta
    const chaves = Object.keys(erros);
    const geral = chaves.find((k) => GERAIS.includes(k));
    if (geral) setErroGeral(erros[geral]);
    else if (chaves.length) setErroGeral(`Não foi gravado: ${erros[chaves[0]]}`);
    if (chaves.length) { setFocar((n) => n + 1); return; }
    setAGravar(true);
    const r = await def.gravar({ F, agir, org: estado.org ?? "", refs, inicial: editarIni(x), ficheiro: def.anexo ? ficheiro : null }, x);
    setAGravar(false);
    if (!r.ok) { setErroGeral(r.erro); return; }
    aoFechar();
    if (tipo === "nova") { const id = (r.valor as { vehicle_id?: string } | undefined)?.vehicle_id; if (id) aoCriar?.(id); }
  };
  return (
    <Dialog open onOpenChange={(a) => { if (!a) aoFechar(); }}>
      <DialogContent className={cn("max-h-[90vh] overflow-y-auto", def.largo ? "sm:max-w-3xl" : "sm:max-w-xl")}>
        <form noValidate onSubmit={(ev) => { ev.preventDefault(); void submeter(); }} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{tipo === "condutor" ? (x.pid ? "Editar condutor" : "Novo condutor") : def.titulo}</DialogTitle>
            <DialogDescription>Grava na base de dados da organização. A Frota volta a verificar tudo antes de gravar.</DialogDescription>
          </DialogHeader>
          <div ref={caixa} className="space-y-3">
            <Corpo tipo={tipo} x={x} e={e} muda={muda} refs={refs} ficheiro={{ valor: ficheiro, mudar: escolherFicheiro }} />
            {erroGeral ? <div role="alert"><Alerta tom="bad" icone={CircleAlert}>{erroGeral}</Alerta></div> : null}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={aoFechar}>Cancelar</Button>
            <Button type="submit" aria-disabled={!perm.ok || aGravar || undefined} disabled={aGravar} title={perm.ok ? undefined : perm.porque}>{aGravar ? "A gravar…" : def.ok}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Corpo({ tipo, x, e, muda, refs, ficheiro }: {
  tipo: TipoForm; x: Vals; e: Erros; muda: (k: string) => (v: string) => void; refs: Partial<ReferenciasFrota>;
  ficheiro: { valor: File | null; mudar: (f: File | null) => void };
}) {
  const { F, tem } = useFrotaCtx();
  const optsAtivas = () => F.viaturas.filter(ativa).map((v) => ({ value: v.id, label: `${v.plate} · ${v.make} ${v.model}` }));
  const optsDisponiveis = () => F.viaturas.filter((v) => v.status === "active").map((v) => ({ value: v.id, label: `${v.plate} · ${v.make} ${v.model}` }));
  const optsFornecedores = (refs.fornecedores ?? []).map((f) => ({ value: f.id, label: f.nome }));
  const texto = (k: string, rotulo: string, o: { tipo?: string; ajuda?: string; largo?: boolean; attrs?: React.InputHTMLAttributes<HTMLInputElement> } = {}) => (
    <Campo rotulo={rotulo} erro={e[k]} ajuda={o.ajuda} largo={o.largo}>
      {(p) => <Input {...p} type={o.tipo ?? "text"} value={x[k] ?? ""} onChange={(ev) => muda(k)(ev.target.value)} {...o.attrs} />}
    </Campo>
  );
  const num = (k: string, rotulo: string, ajuda?: string, step?: string) => texto(k, rotulo, { tipo: "number", ajuda, attrs: { min: 0, step, inputMode: step ? "decimal" : "numeric" } });
  const data = (k: string, rotulo: string, ajuda?: string, tipoInput = "date") => texto(k, rotulo, { tipo: tipoInput, ajuda });
  const sel = (k: string, rotulo: string, ops: { value: string; label: string }[], o: { ajuda?: string; largo?: boolean; placeholder?: string } = {}) => (
    <Campo rotulo={rotulo} erro={e[k]} ajuda={o.ajuda} largo={o.largo}>
      {(p) => <NativeSelect {...p} value={x[k] ?? ""} onValueChange={muda(k)} options={o.placeholder !== undefined ? [{ value: "", label: o.placeholder }, ...ops] : ops} />}
    </Campo>
  );
  const area = (k: string, rotulo: string, ajuda?: string, placeholder?: string) => (
    <Campo rotulo={rotulo} erro={e[k]} ajuda={ajuda} largo>
      {(p) => <Textarea {...p} placeholder={placeholder} value={x[k] ?? ""} onChange={(ev) => muda(k)(ev.target.value)} />}
    </Campo>
  );
  const marcar = (k: string, rotulo: string, o: { desativado?: boolean; ajuda?: string } = {}) => {
    const id = `frota-chk-${k}`;
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Checkbox id={id} checked={!!x[k]} disabled={o.desativado} aria-invalid={e[k] ? true : undefined} onCheckedChange={(c) => muda(k)(c === true ? "on" : "")} />
          <Label htmlFor={id} className={cn("font-normal", o.desativado && "text-muted-foreground")}>{rotulo}</Label>
        </div>
        {o.ajuda ? <p className="pl-6 text-xs text-muted-foreground">{o.ajuda}</p> : null}
        {e[k] ? <p role="alert" className="pl-6 text-sm font-medium text-destructive">{e[k]}</p> : null}
      </div>
    );
  };
  const grelha = (children: ReactNode) => <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
  const v = viatura(F, x.vid);
  const optsOps = (l: { id: string; codigo: string; nome: string; estado: string }[]) => l.map((o) => ({ value: o.id, label: `${o.codigo} · ${o.nome}${o.estado ? ` (${o.estado})` : ""}` }));

  switch (tipo) {
    case "atribuir": {
      const p = condutor(F, x.pid), aviso = v && p ? cartaProblema(p, v, x.ini || F.hoje) : null;
      const condutores = F.condutores.filter((q) => q.is_active);
      return (
        <>
          {grelha(<>
            {sel("vid", "Viatura", optsDisponiveis(), { placeholder: "Escolher viatura" })}
            {sel("pid", "Condutor", condutores.map((q) => ({ value: q.id, label: `${q.full_name} · ${q.licence_categories.length ? "carta " + q.licence_categories.join("+") : "sem carta"}` })),
              { placeholder: condutores.length ? "Escolher condutor" : "Ainda não há condutores", ajuda: "Condutores da Frota (com ou sem conta no CRM)" })}
            {sel("tipo", "Tipo", [{ value: "permanent", label: "Permanente (viatura de serviço)" }, { value: "temporary", label: "Pontual (obra, ordem, reserva)" }])}
            {num("km", "Km na entrega", v ? `Última leitura: ${fKm(v.odometer_km)}` : undefined)}
            {data("ini", "Início")}
            {data("fim", "Fim", "Obrigatório nas pontuais")}
            {texto("motivo", "Motivo", { largo: true })}
            {sel("obra", "Obra (Operações)", optsOps(refs.obras ?? []), { placeholder: "Sem obra" })}
            {sel("ordem", "Ordem (Operações)", optsOps(refs.ordens ?? []), { placeholder: "Sem ordem" })}
          </>)}
          {aviso ? <Alerta tom="bad" icone={CircleAlert}>{aviso}</Alerta>
            : p && v ? <Alerta tom="ok" icone={CircleCheck}>Carta de {p.full_name} válida para a categoria {v.required_licence}{p.licence_expires_on ? ` até ${fData(p.licence_expires_on)}` : ""}.</Alerta> : null}
          <Nota>{v && !v.schedule_resource_id ? "Esta viatura não é recurso da Agenda: a reserva fica só na Frota." : "As reservas pontuais ficam também na Agenda (quadro Frota), para a viatura não ser marcada noutro serviço. A Agenda recusa feriados."}</Nota>
        </>
      );
    }
    case "devolver": {
      const a = F.atrib.find((z) => z.id === x.a), w = a ? viatura(F, a.vehicle_id) : undefined;
      if (!a || !w) return <p>Atribuição desconhecida.</p>;
      return (
        <>
          <p className="flex flex-wrap items-center gap-1.5 text-sm"><Placa mat={w.plate} /> entregue a <b>{condutor(F, a.driver_id)?.full_name}</b> desde {fData(a.starts_on)}.</p>
          {grelha(<>{num("km", "Km na devolução", `Última leitura: ${fKm(w.odometer_km)}`)}{data("data", "Data")}</>)}
          {marcar("danos", "Tem danos novos (abre uma ocorrência de sinistro)")}
          {x.danos ? area("descDanos", "Danos", undefined, "Ex.: risco na porta lateral direita") : null}
        </>
      );
    }
    case "km":
      if (!v) return <p>Viatura desconhecida.</p>;
      return (
        <>
          <p className="flex flex-wrap items-center gap-1.5 text-sm"><Placa mat={v.plate} /> · última leitura <b>{fKm(v.odometer_km)}</b></p>
          {grelha(<>{num("km", "Km no conta-quilómetros")}{data("data", "Data")}</>)}
          {(inteiro(x.km) ?? 0) - v.odometer_km > 5000 || e.salto ? marcar("salto", "Confirmo os km (mais de 5000 km desde a última leitura)") : null}
        </>
      );
    case "abastecer":
      return grelha(<>
        {sel("vid", "Viatura", optsAtivas(), { placeholder: "Escolher viatura" })}
        {data("data", "Data")}
        {num("qtd", eletrica(v) ? "Energia (kWh)" : "Litros", undefined, "0.01")}
        {num("valor", "Valor com IVA (€)", undefined, "0.01")}
        {num("km", "Km no momento", v ? `Última leitura: ${fKm(v.odometer_km)}` : undefined)}
        {sel("fornecedor", "Gasolineira (fornecedor)", optsFornecedores, { placeholder: "Sem fornecedor", ajuda: "Fornecedores do Inventário" })}
        {texto("posto", "Posto", { largo: true, attrs: { placeholder: "Ex.: Galp Loures" } })}
      </>);
    case "despesa": {
      const imput = [
        ...(refs.centros ?? []).map((c) => ({ value: `c:${c.id}`, label: `Centro de custo · ${c.nome}` })),
        ...(refs.obras ?? []).map((o) => ({ value: `o:${o.id}`, label: `Obra ${o.codigo} · ${o.nome}` })),
      ];
      return grelha(<>
        {sel("vid", "Viatura", optsAtivas(), { placeholder: "Escolher viatura" })}
        {sel("categoria", "Tipo", opcoesDe(CATEGORIAS_CUSTO, CATEGORIAS_DESPESA))}
        {data("data", "Data")}
        {num("valor", "Valor com IVA (€)", undefined, "0.01")}
        {sel("fornecedor", "Fornecedor", optsFornecedores, { placeholder: "Escolher fornecedor", ajuda: "Fornecedores do Inventário" })}
        {texto("fornecedorTexto", "Ou escreve o fornecedor", { attrs: { placeholder: "Ex.: Via Verde" } })}
        {sel("imputar", "Centro de custo ou obra", imput, { placeholder: "O da viatura", largo: true })}
        {area("nota", "Nota")}
      </>);
    }
    case "manut":
      return (
        <>
          {grelha(<>
            {sel("vid", "Viatura", optsAtivas(), { placeholder: "Escolher viatura" })}
            {sel("tipo", "Tipo", opcoesDe(TIPOS_MANUT))}
            {texto("titulo", "Intervenção", { largo: true })}
            {data("data", "Data")}
            {data("fim", "Fim previsto", "Opcional (vários dias na oficina)")}
            {sel("oficina", "Oficina (fornecedor)", optsFornecedores, { placeholder: "Sem fornecedor", ajuda: "Fornecedores do Inventário" })}
            {texto("oficinaTexto", "Ou escreve a oficina")}
            {num("valor", "Valor estimado (€)", undefined, "0.01")}
          </>)}
          <Nota>A viatura fica bloqueada nesses dias: aparece no calendário das Atribuições, na ficha, no Hoje e, se for recurso da Agenda, na Agenda (quadro Frota). A Agenda recusa feriados.</Nota>
        </>
      );
    case "concluir": {
      const m = F.manut.find((z) => z.id === x.m), w = m ? viatura(F, m.vehicle_id) : undefined;
      if (!m || !w) return <p>Intervenção desconhecida.</p>;
      return (
        <>
          <p className="flex flex-wrap items-center gap-1.5 text-sm"><Placa mat={w.plate} /> · {m.title}{m.supplier_label ? ` · ${m.supplier_label}` : ""}</p>
          {grelha(<>{num("km", "Km à saída")}{num("valor", "Valor final (€)", undefined, "0.01")}{data("data", "Data")}</>)}
          <p className="text-sm text-muted-foreground">O valor entra nos custos da viatura. {m.kind === "service" ? "A contagem da próxima revisão recomeça daqui." : m.kind === "inspection" ? "A validade da IPO passa para o próximo prazo legal." : ""}{w.status === "workshop" ? " A viatura volta a ficar ativa." : ""}</p>
        </>
      );
    }
    case "estado": {
      if (!v) return <p>Viatura desconhecida.</p>;
      const a = atribEm(F, v.id);
      return (
        <>
          <p className="flex flex-wrap items-center gap-1.5 text-sm"><Placa mat={v.plate} /> · agora <SeloEstado v={v} /></p>
          {grelha(<>
            {sel("estado", "Novo estado", (Object.keys(ESTADOS) as FleetVehicleStatus[]).map((k) => ({ value: k, label: ESTADOS[k][1] })))}
            {area("motivo", "Motivo", "Fica no histórico da viatura.", "Ex.: avaria no motor, entregue na oficina")}
          </>)}
          {a && x.estado !== "active" ? <Alerta tom="warn" icone={TriangleAlert}>A atribuição a {condutor(F, a.driver_id)?.full_name} termina hoje.</Alerta> : null}
          {x.estado === "inactive" || x.estado === "sold" ? <Alerta tom="warn" icone={TriangleAlert}>As reservas futuras são canceladas e a viatura sai da Agenda; o armazém móvel fica inativo (só com a carrinha a zero).</Alerta> : null}
        </>
      );
    }
    case "ocorrencia": {
      const sug = x.vid && x.quando ? condutor(F, atribEm(F, x.vid, x.quando.slice(0, 10))?.driver_id) : undefined;
      return (
        <>
          {grelha(<>
            {sel("vid", "Viatura", optsAtivas(), { placeholder: "Escolher viatura" })}
            {sel("tipo", "Tipo", opcoesDe(TIPOS_OCORR))}
            {data("quando", "Data e hora", undefined, "datetime-local")}
            {texto("local", "Local")}
            {num("valor", "Valor (€)", "Multas e franquias", "0.01")}
            {x.tipo === "fine" ? data("notificada", "Notificada em", "O prazo de 15 dias úteis conta daqui") : null}
            {area("desc", "O que aconteceu")}
          </>)}
          {sug ? <Alerta tom="info" icone={UserRoundSearch}>Nessa data a viatura estava com <b>{sug.full_name}</b>.</Alerta> : null}
        </>
      );
    }
    case "identificar": {
      const o = F.ocorr.find((z) => z.id === x.o), w = o ? viatura(F, o.vehicle_id) : undefined;
      if (!o || !w) return <p>Ocorrência desconhecida.</p>;
      const s = quemConduzia(F, o.vehicle_id, o.occurred_at);
      return (
        <>
          <dl className="grid gap-3 rounded-lg border bg-card p-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs font-semibold uppercase text-muted-foreground">Viatura</dt><dd><Placa mat={w.plate} /></dd></div>
            <div><dt className="text-xs font-semibold uppercase text-muted-foreground">Quando</dt><dd>{fData(diaDe(o.occurred_at))}</dd></div>
            <div><dt className="text-xs font-semibold uppercase text-muted-foreground">Infração</dt><dd>{o.description}</dd></div>
            <div><dt className="text-xs font-semibold uppercase text-muted-foreground">Prazo</dt><dd>{fData(o.identify_by)}</dd></div>
          </dl>
          {s ? <Alerta tom="info" icone={UserRoundSearch}>Segundo as atribuições, a viatura estava com <b>{s.full_name}</b>.</Alerta>
            : <Alerta tom="warn" icone={TriangleAlert}>Não há atribuição nessa data. Escolhe o condutor à mão.</Alerta>}
          {grelha(sel("pid", "Condutor", F.condutores.map((p) => ({ value: p.id, label: p.full_name + (p.user_id ? "" : " (sem conta)") })), { placeholder: "Escolher condutor" }))}
          <p className="text-sm text-muted-foreground">Quem tem conta no CRM recebe uma notificação com os dados da multa.</p>
        </>
      );
    }
    case "renovar": {
      if (!v) return <p>Viatura desconhecida.</p>;
      const k = x.k as FleetComplianceKind;
      const atual = k === "insurance" ? v.insurance_until : k === "inspection" ? v.inspection_until : k === "road_tax" ? v.road_tax_until : k === "lease_contract" ? v.contract_ends_on : null;
      return (
        <>
          <p className="flex flex-wrap items-center gap-1.5 text-sm"><Placa mat={v.plate} /> · {VENC[k]} {atual ? `válido até ${fData(atual)}` : "sem validade registada"}</p>
          {grelha(<>
            {data("data", "Nova validade", k === "inspection" ? "Sugestão: o próximo prazo legal (categoria e 1.ª matrícula)" : undefined)}
            {num("valor", "Valor pago (€)", "Opcional. Entra nos custos.", "0.01")}
            {texto("referencia", k === "insurance" ? "Apólice" : "Referência")}
            {sel("fornecedor", k === "insurance" ? "Seguradora" : "Entidade (fornecedor)", optsFornecedores, { placeholder: "A de antes" })}
            <Campo rotulo="Comprovativo (PDF ou foto)" erro={e.ficheiro} ajuda="Opcional. Fica na ficha da viatura › Documentos, ligado a esta renovação. Até 20 MB." largo>
              {(p) => <Input {...p} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,application/pdf,image/*" onChange={(ev) => ficheiro.mudar(ev.target.files?.[0] ?? null)} />}
            </Campo>
          </>)}
          {ficheiro.valor ? <Nota>Vai ser anexado: {ficheiro.valor.name}</Nota> : null}
        </>
      );
    }
    case "editar": {
      if (!v) return <p>Viatura desconhecida.</p>;
      const a = atribEm(F, v.id), p = a ? condutor(F, a.driver_id) : undefined;
      const carta = p && x.carta !== v.required_licence ? cartaProblema(p, { ...v, required_licence: x.carta }, F.hoje) : null;
      return (
        <>
          <p className="flex flex-wrap items-center gap-1.5 text-sm"><Placa mat={v.plate} /> · <SeloEstado v={v} /></p>
          {grelha(<>
            {texto("marca", "Marca")}
            {texto("modelo", "Modelo")}
            {sel("tipo", "Tipo", [...new Set(["Furgão compacto", "Furgão", "Furgão grande", "Ligeiro de passageiros", "Pesado de mercadorias", "Outro", ...(x.tipo ? [x.tipo] : [])])].map((t) => ({ value: t, label: t })), { placeholder: "Sem tipo" })}
            {sel("categoria", "Categoria (para a IPO)", opcoesDe(CATEGORIAS), { placeholder: "Por preencher (IPO a +12 meses)" })}
            {data("primeira", "Data da 1.ª matrícula", "Com a categoria, calcula a IPO pela regra legal")}
            {sel("comb", "Combustível", opcoesDe(COMBUSTIVEIS))}
            {sel("posse", "Posse", opcoesDe(POSSES))}
            {x.posse !== "owned" ? <>{num("renda", "Renda mensal (€)", undefined, "0.01")}{sel("locadora", "Locadora", optsFornecedores, { placeholder: "Sem locadora" })}</> : null}
            {num("ano", "Ano")}
            {sel("carta", "Carta exigida", [...new Set(["B", "C1", "C", "D", "BE", "CE", x.carta].filter(Boolean))].map((c) => ({ value: c, label: `Categoria ${c}` })))}
            {sel("centro", "Centro de custo", (refs.centros ?? []).map((c) => ({ value: c.id, label: c.nome })), { placeholder: "Sem centro de custo" })}
            {num("revKm", "Revisão a cada (km)")}
            {num("revMeses", "Ou a cada (meses)")}
            {x.extra ? <>{texto("vin", "VIN (n.º de quadro)", { attrs: { autoComplete: "off", maxLength: 17 } })}{area("notas", "Notas")}</> : null}
          </>)}
          <div className="space-y-2">
            {marcar("usoPessoal", "Uso pessoal autorizado")}
            {marcar("pool", "Partilhada (livre para reservas)")}
          </div>
          {carta ? <Alerta tom="warn" icone={TriangleAlert}>Com a categoria {x.carta}: {carta} A atribuição atual mantém-se; revê-a nas Atribuições.</Alerta> : null}
          <Nota>A matrícula não se altera aqui (a ficha não a aceita). Os vencimentos (seguro, IPO, IUC) mudam em Documentos › Renovar; a validade da IPO já registada não é recalculada.</Nota>
        </>
      );
    }
    case "nova": {
      const podeArmazem = tem(PERM.criarArmazem);
      return (
        <>
          {grelha(<>
            {texto("mat", "Matrícula", { attrs: { placeholder: "AA-00-AA", autoComplete: "off" } })}
            {texto("marca", "Marca")}
            {texto("modelo", "Modelo")}
            {sel("tipo", "Tipo", ["Furgão compacto", "Furgão", "Furgão grande", "Ligeiro de passageiros", "Pesado de mercadorias", "Outro"].map((t) => ({ value: t, label: t })))}
            {sel("categoria", "Categoria (para a IPO)", opcoesDe(CATEGORIAS))}
            {data("primeira", "Data da 1.ª matrícula", "Com a categoria, calcula a IPO pela regra legal")}
            {sel("comb", "Combustível", opcoesDe(COMBUSTIVEIS))}
            {sel("posse", "Posse", opcoesDe(POSSES))}
            {x.posse !== "owned" ? <>{num("renda", "Renda mensal (€)", undefined, "0.01")}{data("fimContrato", "Fim do contrato")}{sel("locadora", "Locadora", optsFornecedores, { placeholder: "Escolher" })}</> : null}
            {num("ano", "Ano")}
            {num("km", "Km atuais")}
            {sel("carta", "Carta exigida", ["B", "C1", "C", "D", "BE", "CE"].map((c) => ({ value: c, label: `Categoria ${c}` })))}
            {sel("centro", "Centro de custo", (refs.centros ?? []).map((c) => ({ value: c.id, label: c.nome })), { placeholder: "Sem centro de custo" })}
            {data("seguro", "Seguro válido até")}
            {texto("apolice", "Apólice")}
            {sel("seguradora", "Seguradora", optsFornecedores, { placeholder: "Escolher" })}
            {data("ipo", "Inspeção (IPO) até", "Vazio: calculada pela regra legal")}
            {x.comb !== "electric" ? data("iuc", "IUC até") : null}
            {num("revKm", "Revisão a cada (km)")}
            {num("revMeses", "Ou a cada (meses)")}
          </>)}
          <div className="space-y-2">
            {marcar("armazem", "É um armazém móvel (stock na carrinha)", {
              desativado: !podeArmazem,
              ajuda: podeArmazem ? "Cria o armazém no Inventário. Não serve encomendas de clientes; o mínimo da carrinha não entra no stock baixo." : "Criar o armazém exige a permissão warehouses.create.",
            })}
            {marcar("agenda", "É um recurso da Agenda (para reservas e conflitos)")}
            {marcar("usoPessoal", "Uso pessoal autorizado")}
            {marcar("pool", "Partilhada (livre para reservas)")}
          </div>
        </>
      );
    }
    case "condutor": {
      const us = (refs.utilizadores ?? []).filter((u) => u.id === x.user || !F.condutores.some((c) => c.user_id === u.id && c.id !== x.pid));
      return (
        <>
          {grelha(<>
            {texto("nome", "Nome", { largo: true })}
            {texto("funcao", "Função")}
            {texto("equipa", "Equipa")}
            {texto("carta", "N.º da carta")}
            {texto("cats", "Categorias", { ajuda: "Separadas por vírgulas, por exemplo B, C" })}
            {data("validade", "Carta válida até")}
            {sel("user", "Conta no CRM", us.map((u) => ({ value: u.id, label: u.nome })), { placeholder: "Sem conta (gerido pela Frota)", ajuda: "Com conta, o condutor vê a sua viatura e recebe os avisos" })}
            {area("notas", "Notas")}
          </>)}
          {x.pid ? marcar("ativo", "Ativo") : null}
          <Nota>A carta fica na Frota até o RH chegar; depois passa a vir da ficha da pessoa.</Nota>
        </>
      );
    }
    case "ligar":
      return (
        <>
          {grelha(<>
            {sel("vid", "Viatura", optsAtivas(), { placeholder: "Escolher viatura" })}
            {data("data", "Dia da deslocação")}
            {sel("ordem", "Ordem (Operações)", optsOps(refs.ordens ?? []), { placeholder: "Sem ordem", largo: true })}
            {sel("obra", "Obra (Operações)", optsOps(refs.obras ?? []), { placeholder: "Sem obra", largo: true })}
            {num("km", "Km da deslocação")}
            {sel("pid", "Condutor", F.condutores.map((p) => ({ value: p.id, label: p.full_name })), { placeholder: "Sem condutor" })}
            {area("nota", "Nota")}
          </>)}
          <Nota>Com ordem e km, o custo (km × custo por km real da viatura) é lançado na ordem se puderes lançar custos em Operações e a ordem estiver aberta; senão fica pendente para um gestor. Ligações só à obra não geram custo.</Nota>
        </>
      );
    case "reposicao": {
      const origens = (refs.armazens ?? []).filter((w) => w.is_active && !w.is_vehicle);
      return (
        <>
          {v ? <p className="flex flex-wrap items-center gap-1.5 text-sm"><Placa mat={v.plate} /> · {stockDe(F, v).filter((s) => s.min > 0 && s.qty < s.min).length} artigo(s) abaixo do mínimo</p> : null}
          {grelha(sel("origem", "Armazém de origem", origens.map((w) => ({ value: w.id, label: w.name })), { placeholder: "Escolher armazém", largo: true }))}
          <Nota>Passo 1 de 2: fica um pedido por artigo em falta (até ao mínimo). Quem trata do Inventário faz a transferência em Stocks › Pedidos das carrinhas.</Nota>
        </>
      );
    }
    case "minimo": {
      const st = stockDe(F, v);
      return (
        <>
          {grelha(<>
            {sel("produto", "Artigo", st.map((s) => ({ value: s.product_id, label: `${s.ref ? s.ref + " · " : ""}${s.nome}` })), { placeholder: "Escolher artigo" })}
            {num("minimo", "Mínimo na carrinha")}
          </>)}
          <Nota>O mínimo da carrinha não é o ponto de encomenda: a carrinha não entra no stock baixo do Inventário.</Nota>
        </>
      );
    }
  }
}

export type { LigacaoAviso };
