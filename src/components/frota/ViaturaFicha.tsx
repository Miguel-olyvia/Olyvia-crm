// A ficha da viatura numa folha lateral (DocumentSheet do Inventário real) com 9 abas: Resumo, Atribuições, Manutenção,
// Custos, Ocorrências, Documentos (vencimentos + ficheiros em documents, entity_type='vehicle'), Stock na carrinha (só
// as que são armazém móvel), Ligações (Agenda, Inventário, Operações) e Histórico (fleet_activity_log da viatura).
// O rodapé tem as ações; sem a permissão real ficam desativadas e dizem porquê.
import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, CalendarPlus, CircleAlert, Fuel, Gauge, Info, KeyRound, Link2, Package, PackageCheck, PackagePlus, Plus, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocInfoGrid, DocSection, DocSheetTabs, DocumentSheetContent, docTabId, docTabPanelId } from "@/components/inventory/DocumentSheet";
import { DocumentsTab } from "@/components/shared/DocumentsTab";
import type { FleetVehicleView } from "@/integrations/supabase/fleetTypes";
import { cn } from "@/lib/utils";
import { PERM, useFrotaCtx, type AbaFicha } from "./contexto";
import { AvisoRegiao, BotaoFrota, Cartao, ListaV, Placa, Prog, RefOps, Selo, SeloEstado, Tabela, Vazio } from "./pecas";
import { AcaoOcorrencia } from "./ecras/OcorrenciasFrota";
import { AcaoAtribuicao } from "./ecras/AtribuicoesFrota";
import { ListaHistorico } from "./ecras/AtividadeFrota";
import { AcaoLigacao } from "./ecras/LigacoesFrota";
import { AcoesPedido } from "./PedidosCarrinha";
import {
  CATEGORIAS, CATEGORIAS_CUSTO, COMBUSTIVEIS, ESTADOS_MANUT, ESTADOS_OCORR, ORIGENS_CUSTO, POSSES, TIPOS_ATRIB, TIPOS_OCORR, VENC, abaixoMin, alertas, atribEm, ativa,
  condutor, condutorEm, consumo, custoKm, custosV, diaDe, eletrica, fData, fEur, fKm, fNum, horaDe, kmPeriodo, manutAbertas, pedidosPendentes, revisao, soma, textoData,
  tomSelo, useReferenciaFrota, vencimentos, DIAS_PERIODO, type ChaveVenc,
} from "./dados";

const ID_BASE = "frota-ficha";
const ALERTA = { ok: "border-success/40 bg-success/10", info: "border-info/40 bg-info/10", warn: "border-warning/50 bg-warning/15", bad: "border-destructive/40 bg-destructive/10", violet: "border-primary/40 bg-primary/10", neu: "border-border bg-muted" } as const;

function Resumo({ v }: { v: FleetVehicleView }) {
  const { F } = useFrotaCtx();
  const fornecedores = useReferenciaFrota("fornecedores");
  const al = alertas(F, v), r = revisao(v, F.hoje), k = custoKm(F, v.id), c = consumo(F, v.id);
  const seguradora = fornecedores.dados.find((f) => f.id === v.insurer_supplier_id)?.nome;
  return (
    <>
      {al.length ? (
        <div className="space-y-1.5">
          {al.map((x) => (
            <div key={x.txt} className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-sm", ALERTA[x.tom])}>
              {x.tom === "bad" ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-warning" aria-hidden="true" />}
              <span>{x.txt}</span>
            </div>
          ))}
        </div>
      ) : null}
      {v.status_reason && v.status !== "active" ? <div className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-sm", ALERTA.neu)}><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{v.status_reason}</span></div> : null}
      <Cartao>
        <DocInfoGrid className="my-0" items={[
          { label: "Marca e modelo", value: `${v.make} ${v.model}` }, { label: "Tipo", value: v.vehicle_type ?? "—" },
          { label: "Categoria", value: v.vehicle_category ? CATEGORIAS[v.vehicle_category] : "Por preencher (IPO a +12 meses)" },
          { label: "1.ª matrícula", value: fData(v.first_registration_on) },
          { label: "Combustível", value: COMBUSTIVEIS[v.fuel_type] }, { label: "Ano", value: v.model_year ? String(v.model_year) : "—" },
          { label: "Posse", value: POSSES[v.ownership] + (v.monthly_rent ? ` · ${fEur(v.monthly_rent)}/mês${v.contract_ends_on ? ` até ${fData(v.contract_ends_on)}` : ""}` : "") },
          { label: "Carta exigida", value: "Categoria " + v.required_licence },
          { label: "Centro de custo", value: v.cost_center_label ?? "—" }, { label: "Seguro", value: [seguradora, v.insurance_policy_no].filter(Boolean).join(" · ") || "—" },
          { label: "Uso pessoal", value: v.personal_use ? "Autorizado (tributação em sede de IRS)" : "Não" }, { label: "Armazém móvel", value: v.warehouse_id ? "Sim (Inventário)" : "Não tem" },
        ]} />
      </Cartao>
      <div className="grid gap-4 md:grid-cols-2">
        <Cartao>
          <DocSection title="Vencimentos">
            <ListaV>{vencimentos(v).map((x) => (
              <div key={x.k}>
                <span className="flex flex-col"><span>{x.tipo}</span><span className="text-xs text-muted-foreground">{x.isento ? "Isento" : fData(x.data)}</span></span>
                {x.isento ? <Selo tom="neu">Isento</Selo> : x.data ? <Selo tom={tomSelo(x.data, F.hoje)}>{textoData(x.data, F.hoje)}</Selo> : <Selo tom="warn">Sem data</Selo>}
              </div>
            ))}</ListaV>
          </DocSection>
        </Cartao>
        <Cartao className="space-y-3">
          <DocSection title="Próxima revisão">
            {r ? <>
              <p><b>{r.nextKm != null ? fKm(r.nextKm) : "—"}</b> ou até <b>{fData(r.nextData)}</b></p>
              <Prog tom={r.tom} pct={r.pct} largo />
              <Selo tom={r.tom}>{r.txt}</Selo>
            </> : <p className="text-sm text-muted-foreground">Sem plano de revisão.</p>}
          </DocSection>
          <DocSection title={`Últimos ${DIAS_PERIODO} dias`}>
            <ListaV>
              <div><span>Km percorridos</span><b className="tabular-nums">{fNum(kmPeriodo(F, v.id))}</b></div>
              <div><span>Custo total</span><b className="tabular-nums">{fEur(soma(custosV(F, v.id), (x) => x.amount))}</b></div>
              <div><span>Custo por km (variável)</span><b className="tabular-nums">{k != null ? fEur(k) : "—"}</b></div>
              {c ? <div><span>Consumo médio</span><b className="tabular-nums">{fNum(c, 1)} {eletrica(v) ? "kWh" : "L"}/100 km</b></div> : null}
            </ListaV>
          </DocSection>
        </Cartao>
      </div>
    </>
  );
}

/** Uma tabela da ficha; com `acoes`, leva no fim a coluna das ações (cabeçalho só para leitores de ecrã, como nos ecrãs). */
const Linhas = ({ cab, vazio, acoes, children }: { cab: string[]; vazio: [string, string] | null; acoes?: boolean; children: ReactNode }) => (
  <Tabela>
    <Table>
      <TableHeader><TableRow>
        {cab.map((h, i) => <TableHead key={h} className={cn(i === cab.length - 1 && /Valor|Km/.test(h) && "text-right")}>{h}</TableHead>)}
        {acoes ? <TableHead><span className="sr-only">Ações</span></TableHead> : null}
      </TableRow></TableHeader>
      <TableBody>{vazio ? <TableRow><TableCell colSpan={cab.length + (acoes ? 1 : 0)}><Vazio titulo={vazio[0]} texto={vazio[1]} /></TableCell></TableRow> : children}</TableBody>
    </Table>
  </Tabela>
);

function AbaStock({ v }: { v: FleetVehicleView }) {
  const { F, stock, dlg, tem } = useFrotaCtx();
  const st = stock(v.id), pend = pedidosPendentes(F, v.id), baixo = abaixoMin(st);
  return (
    <>
      <p className="text-sm text-muted-foreground">A carrinha é um armazém móvel do Inventário: não serve encomendas de clientes e o mínimo dela não entra no stock baixo. A reposição faz-se em dois passos: o pedido (aqui) e a transferência (Inventário › Stocks › Pedidos das carrinhas).</p>
      <Linhas cab={["Ref.", "Artigo", "Na carrinha", "Mínimo", "Estado"]} acoes vazio={st.length ? null : ["Carrinha vazia", "Ainda não há stock neste armazém móvel. Transfere material no Inventário."]}>
        {st.map((s) => (
          <TableRow key={s.id}>
            <TableCell className="font-mono text-xs">{s.ref}</TableCell><TableCell>{s.nome}</TableCell>
            <TableCell className="tabular-nums">{fNum(s.qty)} {s.un}</TableCell><TableCell className="tabular-nums">{s.min ? `${fNum(s.min)} ${s.un}` : "—"}</TableCell>
            <TableCell><div className="flex flex-wrap gap-1">{s.min > 0 && s.qty < s.min ? <Selo tom="warn">{`Repor ${fNum(s.min - s.qty)}`}</Selo> : <Selo tom="ok">OK</Selo>}
              {pend.some((p) => p.product_id === s.product_id) ? <Selo tom="info">Pedido</Selo> : null}</div></TableCell>
            <TableCell className="text-right"><BotaoFrota requer="minimo" aoClicar={() => dlg("minimo", { v: v.id, produto: s.product_id })} aria-label={`Mínimo de ${s.nome}`}>Mínimo</BotaoFrota></TableCell>
          </TableRow>
        ))}
      </Linhas>
      {baixo.length ? <p className="text-sm">{baixo.length} artigo(s) abaixo do mínimo.</p> : null}
      {pend.length ? (
        <DocSection title="Pedidos de reposição pendentes">
          <ListaV>{pend.map((p) => {
            const s = st.find((x) => x.product_id === p.product_id);
            return (
              <div key={p.id}>
                <span>{s ? `${s.ref ? s.ref + " · " : ""}${s.nome}` : "Artigo"} × {fNum(p.quantity)}<span className="block text-xs text-muted-foreground">Pedido a {fData(diaDe(p.requested_at))}{p.last_error ? ` · última tentativa falhou: ${p.last_error}` : ""}</span></span>
                <AcoesPedido pedidos={[p]} />
              </div>
            );
          })}</ListaV>
          {pend.length > 1 ? <div className="flex justify-end"><AcoesPedido pedidos={pend} todos /></div> : null}
        </DocSection>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <BotaoFrota requer="gerirOuSelf" icone={PackagePlus} aoClicar={() => dlg("reposicao", { v: v.id })}>
          Pedir reposição{baixo.length ? ` (${baixo.length})` : ""}
        </BotaoFrota>
        {tem(PERM.verArmazens) ? (
          <Button asChild size="sm" variant="outline" className="gap-1.5"><Link to="/warehouses"><Package className="h-4 w-4" aria-hidden="true" />Ver os armazéns no Inventário</Link></Button>
        ) : null}
        {tem(PERM.inventario) ? (
          <Button asChild size="sm" variant="outline" className="gap-1.5"><Link to="/stocks"><PackageCheck className="h-4 w-4" aria-hidden="true" />Abrir Stocks</Link></Button>
        ) : null}
      </div>
    </>
  );
}

function AbaLigacoes({ v }: { v: FleetVehicleView }) {
  const { F, tem, dlg } = useFrotaCtx();
  const obras = useReferenciaFrota("obras"), ordens = useReferenciaFrota("ordens");
  const ligs = F.ligacoes.filter((l) => l.vehicle_id === v.id);
  const proximas = [
    ...F.atrib.filter((a) => a.vehicle_id === v.id && a.kind === "temporary" && (a.ends_on ?? a.starts_on) >= F.hoje && !a.returned_on)
      .map((a) => ({ d: a.starts_on, t: `Reserva · ${condutor(F, a.driver_id)?.full_name ?? ""}`, s: `${fData(a.starts_on)} a ${fData(a.ends_on)}`, agenda: !!a.schedule_item_id })),
    ...manutAbertas(F, v.id).map((m) => ({ d: m.scheduled_on, t: m.title, s: `${fData(m.scheduled_on)}${m.expected_end_on ? ` a ${fData(m.expected_end_on)}` : ""}`, agenda: !!m.schedule_item_id })),
  ].sort((a, b) => a.d.localeCompare(b.d));
  return (
    <div className="space-y-4">
      <Cartao>
        <DocSection title="Agenda" actions={v.schedule_resource_id && tem(PERM.agenda) ? (
          <Button asChild size="sm" variant="outline" className="gap-1.5"><Link to="/scheduling"><CalendarDays className="h-4 w-4" aria-hidden="true" />Abrir a Agenda</Link></Button>
        ) : null}>
          {proximas.length ? (
            <ListaV>{proximas.map((x, i) => (
              <div key={i}>
                <span className="flex flex-col"><span>{x.t}</span><span className="text-xs text-muted-foreground">{x.s}</span></span>
                {x.agenda ? <Selo tom="ok">Na Agenda (Frota)</Selo> : <Selo tom="neu">Só na Frota</Selo>}
              </div>
            ))}</ListaV>
          ) : <p className="text-sm text-muted-foreground">Nada marcado com esta viatura.</p>}
          <p className="text-xs text-muted-foreground">{v.schedule_resource_id ? "A viatura é recurso da Agenda: reservas e manutenções ficam no quadro Frota." : "A viatura não é recurso da Agenda: as reservas e manutenções ficam só na Frota."}</p>
        </DocSection>
      </Cartao>
      <Cartao>
        <DocSection title="Operações (ordens e obras)" actions={<BotaoFrota requer="gerirOuSelf" icone={Link2} aoClicar={() => dlg("ligar", { v: v.id })}>Ligar a ordem ou obra</BotaoFrota>}>
          {ligs.length ? (
            <ListaV>{ligs.map((l) => {
              const ordem = ordens.dados.find((o) => o.id === l.ops_ordem_id), obra = obras.dados.find((o) => o.id === l.ops_obra_id);
              return (
                <div key={l.id}>
                  <span className="flex flex-col">
                    <span className="flex flex-wrap gap-2">{ordem ? <RefOps tipo="ordem" codigo={ordem.codigo} titulo={ordem.nome} /> : l.ops_ordem_id ? "Ordem" : null}{obra ? <RefOps tipo="obra" codigo={obra.codigo} titulo={obra.nome} /> : null}</span>
                    <span className="text-xs text-muted-foreground">{fData(l.used_on)} · {l.km != null ? fKm(l.km) : "sem km"} · {fEur(l.travel_cost)}</span>
                  </span>
                  <AcaoLigacao l={l} />
                </div>
              );
            })}</ListaV>
          ) : <p className="text-sm text-muted-foreground">Esta viatura ainda não foi ligada a ordens nem obras.</p>}
        </DocSection>
      </Cartao>
      <Cartao>
        <DocInfoGrid className="my-0" items={[
          { label: "Recurso da Agenda", value: v.schedule_resource_id ? "Sim (tipo veículo)" : "Não é recurso da Agenda" },
          { label: "Armazém móvel", value: v.warehouse_id ? "Sim (Inventário › Armazéns)" : "—" },
          { label: "Centro de custo", value: v.cost_center_label ?? "—" },
        ]} />
      </Cartao>
    </div>
  );
}

function Corpo({ v, aba }: { v: FleetVehicleView; aba: AbaFicha }) {
  const { F, dlg, pode } = useFrotaCtx();
  if (aba === "resumo") return <Resumo v={v} />;
  if (aba === "atrib") {
    const l = F.atrib.filter((x) => x.vehicle_id === v.id).sort((x, y) => y.starts_on.localeCompare(x.starts_on));
    return (
      <Linhas cab={["Condutor", "Tipo", "Período", "Km", "Motivo"]} acoes vazio={l.length ? null : ["Sem atribuições", "Esta viatura nunca foi entregue a ninguém."]}>
        {l.map((x) => (
          <TableRow key={x.id}>
            <TableCell>{condutor(F, x.driver_id)?.full_name}</TableCell>
            <TableCell>{x.kind === "temporary" ? <Selo tom="info">{TIPOS_ATRIB.temporary}</Selo> : <Selo tom="violet">{TIPOS_ATRIB.permanent}</Selo>}</TableCell>
            <TableCell className="whitespace-nowrap">{fData(x.starts_on)} → {x.ends_on ? fData(x.ends_on) : "sem fim"}</TableCell>
            <TableCell className="tabular-nums">{x.km_start != null ? fNum(x.km_start) : "—"}{x.km_end != null ? " → " + fNum(x.km_end) : ""}</TableCell>
            <TableCell>{x.reason ?? ""}</TableCell>
            <TableCell className="text-right"><AcaoAtribuicao a={x} /></TableCell>
          </TableRow>
        ))}
      </Linhas>
    );
  }
  if (aba === "manut") {
    const l = F.manut.filter((x) => x.vehicle_id === v.id).sort((x, y) => y.scheduled_on.localeCompare(x.scheduled_on));
    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{v.service_every_km || v.service_every_months
            ? `Regra: revisão a cada ${v.service_every_km ? fKm(v.service_every_km) : "—"} ou ${v.service_every_months ?? "—"} meses. Última aos ${fKm(v.service_last_km)} em ${fData(v.service_last_on)}.`
            : "Sem plano de revisão."}</p>
          {ativa(v) ? <BotaoFrota requer="gerir" icone={CalendarPlus} aoClicar={() => dlg("manut", { v: v.id })}>Agendar manutenção</BotaoFrota> : null}
        </div>
        <Linhas cab={["Data", "Intervenção", "Oficina", "Estado", "Valor"]} acoes vazio={l.length ? null : ["Sem intervenções registadas", "Agenda a próxima revisão em Manutenção."]}>
          {l.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="whitespace-nowrap">{fData(m.done_on ?? m.scheduled_on)}</TableCell><TableCell>{m.title}</TableCell><TableCell>{m.supplier_label ?? "—"}</TableCell>
              <TableCell><Selo tom={ESTADOS_MANUT[m.status][0]}>{ESTADOS_MANUT[m.status][1]}</Selo></TableCell>
              <TableCell className="text-right tabular-nums">{fEur(m.final_cost ?? m.estimated_cost)}</TableCell>
              <TableCell className="text-right">{m.status === "scheduled" || m.status === "in_progress" ? <BotaoFrota requer="gerir" aoClicar={() => dlg("concluir", { m: m.id })} aria-label={`Concluir ${m.title} de ${fData(m.scheduled_on)}`}>Concluir</BotaoFrota> : null}</TableCell>
            </TableRow>
          ))}
        </Linhas>
      </>
    );
  }
  if (aba === "custos") {
    const l = F.custos.filter((x) => x.vehicle_id === v.id).sort((x, y) => y.spent_on.localeCompare(x.spent_on));
    return (
      <>
        {!pode("custos").ok && !l.length ? <p className="text-sm text-muted-foreground">Os custos só se veem com a permissão fleet.costs (o condutor vê os que lhe estão imputados).</p> : null}
        <Linhas cab={["Data", "Tipo", "Origem", "Km", "Valor"]} vazio={l.length ? null : ["Sem custos", "Ainda não há despesas desta viatura."]}>
          {l.map((x) => (
            <TableRow key={x.id}>
              <TableCell className="whitespace-nowrap">{fData(x.spent_on)}</TableCell>
              <TableCell><div className="flex flex-wrap items-center gap-1">{CATEGORIAS_CUSTO[x.category]}{x.needs_review ? <Selo tom="warn">Rever km</Selo> : null}</div>{x.quantity ? <div className="text-xs text-muted-foreground">{fNum(x.quantity, 1)} {x.unit}</div> : null}</TableCell>
              <TableCell>{x.supplier_label ?? ORIGENS_CUSTO[x.source]}</TableCell>
              <TableCell className="tabular-nums">{x.odometer_km ? fNum(x.odometer_km) : "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{fEur(x.amount)}</TableCell>
            </TableRow>
          ))}
        </Linhas>
        <p className="flex justify-between text-sm"><span className="text-muted-foreground">{l.length} lançamento(s)</span><b>Total {fEur(soma(l, (x) => x.amount))}</b></p>
        {ativa(v) ? <div className="flex justify-end"><BotaoFrota requer="gerirOuCustos" icone={Plus} aoClicar={() => dlg("despesa", { v: v.id })}>Registar despesa</BotaoFrota></div> : null}
      </>
    );
  }
  if (aba === "ocorr") {
    const l = F.ocorr.filter((x) => x.vehicle_id === v.id);
    return l.length ? (
      <div className="space-y-2">{l.map((o) => (
        <Cartao key={o.id} className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2"><b>{TIPOS_OCORR[o.kind]} · {fData(diaDe(o.occurred_at))} {horaDe(o.occurred_at)}</b><Selo tom={ESTADOS_OCORR[o.status][0]}>{ESTADOS_OCORR[o.status][1]}</Selo></div>
          <p className="text-sm">{o.description}</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{o.location}{o.driver_id ? " · " + (condutor(F, o.driver_id)?.full_name ?? "") : ""}</p>
            <AcaoOcorrencia o={o} />
          </div>
        </Cartao>
      ))}</div>
    ) : <Vazio titulo="Sem ocorrências" texto="Nenhuma multa, sinistro ou avaria registada." />;
  }
  if (aba === "docs") {
    return (
      <>
        <Cartao>
          <DocSection title="Vencimentos">
            <ListaV>{vencimentos(v).map((x) => (
              <div key={x.k}>
                <span className="flex flex-col"><span>{x.tipo}</span><span className="text-xs text-muted-foreground">{x.isento ? "Isento (elétrico)" : x.data ? "Válido até " + fData(x.data) : "Sem data"}</span></span>
                <span className="flex flex-wrap items-center justify-end gap-2">
                  {x.data ? <Selo tom={tomSelo(x.data, F.hoje)}>{textoData(x.data, F.hoje)}</Selo> : null}
                  {!x.isento && ativa(v) ? <BotaoFrota requer="gerirOuCustos" aoClicar={() => dlg("renovar", { v: v.id, k: x.k as ChaveVenc })} aria-label={`Renovar ${VENC[x.k]} da ${v.plate}`}>Renovar</BotaoFrota> : null}
                </span>
              </div>
            ))}</ListaV>
          </DocSection>
        </Cartao>
        <Cartao>
          <DocSection title="Ficheiros (DUA, apólice, certificado de inspeção, fotos)">
            <DocumentsTab entityId={v.id} entityType="vehicle" organizationId={v.organization_id} readOnly={!pode("gerirOuCustos").ok} />
          </DocSection>
        </Cartao>
      </>
    );
  }
  if (aba === "stock") return <AbaStock v={v} />;
  if (aba === "hist") return <ListaHistorico entradas={F.log.filter((e) => e.vehicle_id === v.id)} semViatura />;
  return <AbaLigacoes v={v} />;
}

export function ViaturaFicha({ vid, aba, mudarAba, aoFechar }: { vid: string; aba: AbaFicha; mudarAba: (a: AbaFicha) => void; aoFechar: () => void }) {
  const { F, dlg } = useFrotaCtx();
  // o elemento que tinha o foco ao abrir a ficha (a linha, o cartão, o resultado da pesquisa…): recebe-o de volta ao fechar
  const [origem] = useState<HTMLElement | null>(() => (typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null));
  const conteudo = useRef<HTMLDivElement>(null);
  const v = F.viaturas.find((x) => x.id === vid);
  if (!v) return null;
  const c = condutorEm(F, v.id), a = atribEm(F, v.id), r = revisao(v, F.hoje), al = alertas(F, v), k = custoKm(F, v.id);
  const abas: { id: AbaFicha; label: string; hidden?: boolean }[] = [
    { id: "resumo", label: "Resumo" }, { id: "atrib", label: "Atribuições" }, { id: "manut", label: "Manutenção" }, { id: "custos", label: "Custos" },
    { id: "ocorr", label: "Ocorrências" }, { id: "docs", label: "Documentos" }, { id: "stock", label: "Stock na carrinha", hidden: !v.warehouse_id }, { id: "lig", label: "Ligações" },
    { id: "hist", label: "Histórico" },
  ];
  const atual: AbaFicha = abas.some((x) => x.id === aba && !x.hidden) ? aba : "resumo";
  const podeAtrib = v.status === "active" && !a;
  return (
    <Sheet open onOpenChange={(o) => { if (!o) aoFechar(); }}>
      <DocumentSheetContent
        ref={conteudo}
        crumbs="Frota › Viaturas"
        title={<span className="flex flex-wrap items-center gap-2"><Placa mat={v.plate} grande /><span>{v.make} {v.model}</span></span>}
        badges={<>
          <SeloEstado v={v} />{v.is_pool ? <Selo tom="violet">Partilhada</Selo> : null}
          {al.length ? <Selo tom={al.some((x) => x.tom === "bad") ? "bad" : "warn"}>{al.length + (al.length > 1 ? " alertas" : " alerta")}</Selo> : null}
        </>}
        onClose={aoFechar}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          const volta = origem && origem !== document.body && origem.isConnected ? origem : document.getElementById("frota-h1");
          volta?.focus();
        }}
        header={<>
          <DocInfoGrid items={[
            { label: "Condutor", value: c ? c.full_name + (a?.kind === "temporary" ? " · reserva" : "") : "—" },
            { label: "Km atuais", value: fKm(v.odometer_km) },
            { label: "Próxima revisão", value: r?.nextKm != null ? fKm(r.nextKm) : "—" },
            { label: "Custo por km", value: k != null ? fEur(k) : "—" },
          ]} />
          <DocSheetTabs label="Ficha da viatura" idBase={ID_BASE} tabs={abas} value={atual} onChange={mudarAba} />
        </>}
        footer={{
          left: <>
            {ativa(v) || v.status === "inactive" || v.status === "sold" ? <BotaoFrota requer="gerir" aoClicar={() => dlg("estado", { v: v.id })}>Mudar estado</BotaoFrota> : null}
            {a ? <BotaoFrota requer="gerir" aoClicar={() => dlg("devolver", { a: a.id })}>Devolver</BotaoFrota> : null}
          </>,
          right: ativa(v) ? <>
            <BotaoFrota requer="gerirOuSelf" icone={Fuel} aoClicar={() => dlg("abastecer", { v: v.id })}>{eletrica(v) ? "Registar carregamento" : "Registar abastecimento"}</BotaoFrota>
            <BotaoFrota requer="gerirOuSelf" icone={TriangleAlert} aoClicar={() => dlg("ocorrencia", { v: v.id })}>Ocorrência</BotaoFrota>
            {/* os km registam-se sempre (também numa viatura livre); com a viatura livre, a ação principal é Atribuir */}
            <BotaoFrota variant={podeAtrib ? "outline" : "default"} requer="gerirOuSelf" icone={Gauge} aoClicar={() => dlg("km", { v: v.id })}>Registar km</BotaoFrota>
            {podeAtrib ? <BotaoFrota variant="default" requer="gerir" icone={KeyRound} aoClicar={() => dlg("atribuir", { v: v.id })}>Atribuir</BotaoFrota> : null}
          </> : null,
        }}
      >
        <AvisoRegiao testId="aviso-ficha" />
        <div role="tabpanel" id={docTabPanelId(ID_BASE, atual)} aria-labelledby={docTabId(ID_BASE, atual)} className="space-y-4">
          <Corpo v={v} aba={atual} />
        </div>
      </DocumentSheetContent>
    </Sheet>
  );
}
