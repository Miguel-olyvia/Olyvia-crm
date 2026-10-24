// As Ligações: as deslocações ligadas a ordens e obras das Operações (fleet_ops_links), com o custo lançado na ordem ou
// pendente ("Lançar custo": rpc_fleet_post_travel_cost), e os atalhos para os módulos com que a Frota fala.
import { Link } from "react-router-dom";
import { ArrowUpRight, CalendarDays, ClipboardList, FileText, Link2, Package, Store, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FleetOpsLink } from "@/integrations/supabase/fleetTypes";
import { FilterPills, KpiGrid, KpiTile } from "../inventarioUi";
import { PERM, useFrotaCtx } from "../contexto";
import { BotaoFrota, Cabecalho, Cartao, Placa, RefOps, Seccao, Selo, Tabela, Vazio, useVista } from "../pecas";
import { condutor, custoKmMedio, fData, fEur, fKm, rpcFrota, soma, useReferenciaFrota, viatura, KM_FIXO } from "../dados";

/** O estado do custo de uma deslocação e, se estiver pendente, o "Lançar custo" (com confirmação). */
export function AcaoLigacao({ l }: { l: FleetOpsLink }) {
  const { F, agir, confirmar } = useFrotaCtx();
  if (l.ops_custo_id) return <Selo tom="ok">Custo lançado</Selo>;
  if (!l.ops_ordem_id) return <Selo tom="neu">Só obra: sem custo</Selo>;
  if (!((l.travel_cost ?? 0) > 0)) return <Selo tom="neu">Sem km</Selo>;
  return (
    <BotaoFrota requer="gerirOuCustos" aoClicar={() => confirmar({
      titulo: "Lançar o custo da deslocação na ordem", ok: "Lançar custo",
      texto: `${fEur(l.travel_cost)} (${fKm(l.km)} × ${fEur(l.cost_per_km)}/km) da ${viatura(F, l.vehicle_id)?.plate ?? "viatura"} entram nos custos da ordem, em Operações. Precisa de poder lançar custos em Operações e de a ordem estar aberta.`,
      aoConfirmar: () => void agir("lancarCusto", () => rpcFrota("rpc_fleet_post_travel_cost", { p_link_id: l.id }), { ok: `Deslocação de ${fEur(l.travel_cost)} lançada na ordem.` }),
    })} aria-label={`Lançar custo de ${fEur(l.travel_cost)}`}>Lançar custo</BotaoFrota>
  );
}

interface Atalho { titulo: string; icone: LucideIcon; texto: string; rotulo: string; para: string; permissao: string; externo?: boolean }
const ATALHOS: Atalho[] = [
  { titulo: "Agenda", icone: CalendarDays, texto: "Reservas e manutenções das viaturas que são recurso da Agenda ficam no quadro “Frota”.", rotulo: "Abrir a Agenda", para: "/scheduling", permissao: PERM.agenda },
  { titulo: "Inventário", icone: Package, texto: "As carrinhas são armazéns móveis. Os pedidos de reposição transferem-se em Stocks › Pedidos das carrinhas.", rotulo: "Abrir Stocks", para: "/stocks", permissao: PERM.inventario },
  { titulo: "Operações", icone: ClipboardList, texto: "Cada deslocação ligada a uma ordem lança o custo (km × custo por km real) nos custos da ordem.", rotulo: "Abrir Operações", para: "/operacao/ordens", permissao: PERM.operacoes, externo: true },
  { titulo: "Fornecedores", icone: Store, texto: "Oficinas, seguradoras, gasolineiras e locadoras são fornecedores do Inventário.", rotulo: "Abrir Fornecedores", para: "/suppliers", permissao: "suppliers.view" },
  { titulo: "Notificações", icone: FileText, texto: "O job diário avisa de vencimentos, revisões, multas por identificar e cartas a caducar (no Hoje da Frota).", rotulo: "Abrir Notificações", para: "/notifications", permissao: PERM.ver },
];

export function LigacoesFrota() {
  const { F, dlg, tem } = useFrotaCtx();
  const obras = useReferenciaFrota("obras"), ordens = useReferenciaFrota("ordens");
  const [vista, setVista] = useVista();
  const pendente = (l: FleetOpsLink) => !l.ops_custo_id && !!l.ops_ordem_id && (l.travel_cost ?? 0) > 0;
  const l = F.ligacoes.filter((x) => vista !== "pend" || pendente(x));
  const km = custoKmMedio(F);
  return (
    <div className="space-y-6">
      <Cabecalho titulo="Ligações" texto="Que viatura foi a cada ordem ou obra, os km e o custo da deslocação nas Operações; e os atalhos para os módulos ligados."
        acoes={<BotaoFrota variant="default" requer="gerirOuSelf" icone={Link2} aoClicar={() => dlg("ligar")}>Ligar a ordem ou obra</BotaoFrota>} />
      <KpiGrid>
        <KpiTile label="Deslocações" value={F.ligacoes.length} hint="ligadas a ordens e obras" />
        <KpiTile label="Custo por lançar" value={fEur(soma(F.ligacoes.filter(pendente), (x) => x.travel_cost))} hint={`${F.ligacoes.filter(pendente).length} deslocação(ões)`} tone={F.ligacoes.some(pendente) ? "warn" : undefined}
          onClick={() => setVista("pend")} active={vista === "pend"} actionLabel="Mostrar só as pendentes" />
        <KpiTile label="Custo por km da frota" value={fEur(km ?? KM_FIXO)} hint={km != null ? "real, custos variáveis" : "sem dados: valor por omissão"} />
      </KpiGrid>
      <Seccao titulo="Deslocações" acoes={<FilterPills ariaLabel="Vistas" value={vista} onChange={setVista} options={[{ value: "todas", label: "Todas" }, { value: "pend", label: "Custo por lançar", count: F.ligacoes.filter(pendente).length }]} />}>
        {l.length ? (
          <Tabela>
            <Table>
              <caption className="sr-only">Deslocações</caption>
              <TableHeader><TableRow>
                <TableHead>Dia</TableHead><TableHead>Viatura</TableHead><TableHead>Ordem / obra</TableHead><TableHead>Condutor</TableHead>
                <TableHead className="text-right">Km</TableHead><TableHead className="text-right">Custo</TableHead><TableHead><span className="sr-only">Estado do custo</span></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {l.map((x) => {
                  const ordem = ordens.dados.find((o) => o.id === x.ops_ordem_id), obra = obras.dados.find((o) => o.id === x.ops_obra_id);
                  return (
                    <TableRow key={x.id}>
                      <TableCell className="whitespace-nowrap">{fData(x.used_on)}</TableCell>
                      <TableCell><Placa mat={viatura(F, x.vehicle_id)?.plate ?? ""} /></TableCell>
                      <TableCell><div className="flex flex-col gap-0.5">{ordem ? <RefOps tipo="ordem" codigo={ordem.codigo} titulo={ordem.nome} /> : x.ops_ordem_id ? <span>Ordem</span> : null}{obra ? <RefOps tipo="obra" codigo={obra.codigo} titulo={obra.nome} /> : x.ops_obra_id ? <span>Obra</span> : null}</div></TableCell>
                      <TableCell>{x.driver_id ? condutor(F, x.driver_id)?.full_name : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{x.km != null ? fKm(x.km) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fEur(x.travel_cost)}<div className="text-xs text-muted-foreground">{x.cost_per_km != null ? `${fEur(x.cost_per_km)}/km` : ""}</div></TableCell>
                      <TableCell className="text-right"><AcaoLigacao l={x} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Tabela>
        ) : <Vazio titulo={F.ligacoes.length ? "Nada nesta vista" : "Sem deslocações"} texto={F.ligacoes.length ? "Não há custos por lançar." : "Liga uma viatura a uma ordem ou obra das Operações com “Ligar a ordem ou obra”."} />}
      </Seccao>
      <Seccao titulo="Módulos ligados">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ATALHOS.map((a) => (
            <Cartao key={a.titulo} className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2 font-semibold"><a.icone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{a.titulo}</h3>
              <p className="text-sm text-muted-foreground">{a.texto}</p>
              {tem(a.permissao) ? (
                <Button asChild size="sm" variant="outline" className="gap-1.5 self-start">
                  {a.externo ? <a href={a.para}>{a.rotulo}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></a> : <Link to={a.para}>{a.rotulo}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}
                </Button>
              ) : null}
            </Cartao>
          ))}
        </div>
      </Seccao>
    </div>
  );
}
