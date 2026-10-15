// As Viaturas: KPI que filtram, vistas com a contagem (no URL), pesquisa, combustível e posse, e a lista (tabela) ou os
// cartões. Cada viatura abre a ficha. Sem viaturas, o estado vazio leva à "Nova viatura".
import { useState } from "react";
import { LayoutGrid, List, Plus, Search, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FleetVehicleView } from "@/integrations/supabase/fleetTypes";
import { FilterPills, KpiGrid, KpiTile } from "../inventarioUi";
import { cn } from "@/lib/utils";
import { useFrotaCtx } from "../contexto";
import { BotaoFrota, Cabecalho, LinhaClicavel, Placa, Prog, Selo, SeloEstado, Tabela, VRef, Vazio, useVista } from "../pecas";
import {
  COMBUSTIVEIS, DIAS_PERIODO, POSSES, abaixoMin, alertas, atribEm, ativa, condutorEm, custoKm, custoKmMedio, fData, fEur, fKm, fNum, opcoesDe, proxVenc, revisao, stockDe,
  textoData, tomData, type Frota,
} from "../dados";

export interface FiltrosViaturas { q: string; comb: string; posse: string }

/** A lista filtrada para a vista `vista`. */
export function filtrarViaturas(F: Frota, vista: string, fx: FiltrosViaturas): FleetVehicleView[] {
  const q = fx.q.toLowerCase().replace(/-/g, "");
  return F.viaturas.filter((v) => {
    if (vista === "ativas" && v.status !== "active") return false;
    if (vista === "livres" && !(v.status === "active" && !atribEm(F, v.id))) return false;
    if (vista === "oficina" && v.status !== "workshop" && v.status !== "stopped") return false;
    if (vista === "alertas" && !alertas(F, v).length) return false;
    if (vista === "stock" && !abaixoMin(stockDe(F, v)).length) return false;
    if (vista === "inativas" && ativa(v)) return false;
    if (vista !== "inativas" && vista !== "todas" && !ativa(v)) return false;
    if (fx.comb && v.fuel_type !== fx.comb) return false;
    if (fx.posse && v.ownership !== fx.posse) return false;
    if (q && !(v.plate + v.make + v.model + (condutorEm(F, v.id)?.full_name ?? "")).toLowerCase().replace(/-/g, "").includes(q)) return false;
    return true;
  });
}

const VISTAS: [string, string][] = [["todas", "Todas"], ["ativas", "Ativas"], ["livres", "Livres hoje"], ["oficina", "Em oficina ou paradas"], ["alertas", "Com alertas"], ["stock", "Stock baixo"], ["inativas", "Vendidas e inativas"]];

export function ViaturasFrota() {
  const { F, abrir, dlg } = useFrotaCtx();
  const [vista, setVista] = useVista();
  const [fx, setFx] = useState<FiltrosViaturas>({ q: "", comb: "", posse: "" });
  const [modo, setModo] = useState<"lista" | "cartoes">("lista");
  const at = F.viaturas.filter(ativa), lista = filtrarViaturas(F, vista, fx);
  const paradas = at.filter((v) => v.status !== "active");
  const kmMedio = custoKmMedio(F);

  const linha = (v: FleetVehicleView) => {
    const r = revisao(v, F.hoje), pv = proxVenc(v), al = alertas(F, v), c = condutorEm(F, v.id), k = custoKm(F, v.id);
    return (
      <LinhaClicavel key={v.id} aoAbrir={() => abrir(v.id)} rotulo={`Abrir a ${v.plate}`} className={cn(!ativa(v) && "opacity-60")}>
        <TableCell><VRef v={v} /></TableCell>
        <TableCell><div className="flex flex-wrap gap-1"><SeloEstado v={v} />{v.is_pool ? <Selo tom="violet">Partilhada</Selo> : null}{v.warehouse_id ? <Selo tom="neu">Carrinha</Selo> : null}</div></TableCell>
        <TableCell>{c ? <div className="flex flex-col"><span>{c.full_name}</span><span className="text-xs text-muted-foreground">{c.team ?? ""}</span></div> : <span className="text-muted-foreground">{v.is_pool && ativa(v) ? "Livre para reserva" : "—"}</span>}</TableCell>
        <TableCell className="text-right tabular-nums">{fKm(v.odometer_km)}</TableCell>
        <TableCell>{pv && ativa(v) ? <div className="flex flex-col items-start gap-1"><span>{pv.tipo} · {fData(pv.data)}</span><Selo tom={tomData(pv.data, F.hoje)}>{textoData(pv.data, F.hoje)}</Selo></div> : "—"}</TableCell>
        <TableCell>{ativa(v) && r ? <div className="flex flex-col gap-1"><Prog tom={r.tom} pct={r.pct} /><span className={cn("text-xs", r.tom === "ok" && "text-muted-foreground")}>{r.txt}</span></div> : "—"}</TableCell>
        <TableCell className="text-right tabular-nums">{k != null ? fEur(k) : "—"}</TableCell>
        <TableCell>{al.length ? <Selo tom={al.some((a) => a.tom === "bad") ? "bad" : "warn"}>{al.length + (al.length > 1 ? " alertas" : " alerta")}</Selo> : ativa(v) ? <Selo tom="ok">Em dia</Selo> : null}</TableCell>
      </LinhaClicavel>
    );
  };
  const cartao = (v: FleetVehicleView) => {
    const c = condutorEm(F, v.id), r = revisao(v, F.hoje), al = alertas(F, v), k = custoKm(F, v.id);
    return (
      <button key={v.id} type="button" onClick={() => abrir(v.id)} aria-label={`Abrir a ${v.plate}`}
        className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <div className="flex items-center justify-between gap-2"><Placa mat={v.plate} grande /><SeloEstado v={v} /></div>
        <div><b>{v.make} {v.model}</b><div className="text-sm text-muted-foreground">{v.vehicle_type ?? "—"} · {COMBUSTIVEIS[v.fuel_type]} · {POSSES[v.ownership]}</div></div>
        <div className="flex items-center gap-1.5 text-sm"><UserRound className="h-3.5 w-3.5" aria-hidden="true" />{c ? c.full_name : <span className="text-muted-foreground">{v.is_pool ? "Livre para reserva" : "Sem condutor"}</span>}</div>
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div><b className="block tabular-nums">{fNum(v.odometer_km / 1000, 1)}k</b><span className="text-xs text-muted-foreground">km</span></div>
          <div><b className="block tabular-nums">{k != null ? fEur(k) : "—"}</b><span className="text-xs text-muted-foreground">custo/km</span></div>
          <div><b className="block tabular-nums">{al.length}</b><span className="text-xs text-muted-foreground">alertas</span></div>
        </div>
        {ativa(v) && r ? <div className="flex items-center gap-2"><Prog tom={r.tom} pct={r.pct} /><span className="text-xs text-muted-foreground">Revisão · {r.txt.toLowerCase()}</span></div> : <span className="text-xs text-muted-foreground">{v.status_reason ?? ""}</span>}
      </button>
    );
  };
  return (
    <div className="space-y-6">
      <Cabecalho titulo="Viaturas" texto={`Todas as viaturas da organização, com estado, condutor, vencimentos e custo por km dos últimos ${DIAS_PERIODO} dias.`}
        acoes={<>
          {F.viaturas.length ? <BotaoFrota icone={modo === "lista" ? LayoutGrid : List} aoClicar={() => setModo(modo === "lista" ? "cartoes" : "lista")}>{modo === "lista" ? "Ver cartões" : "Ver lista"}</BotaoFrota> : null}
          <BotaoFrota variant="default" requer="gerir" icone={Plus} aoClicar={() => dlg("nova")}>Nova viatura</BotaoFrota>
        </>} />
      {!F.viaturas.length ? <Vazio titulo="Ainda não há viaturas" texto="Cria a primeira viatura com “Nova viatura”." /> : <>
        <KpiGrid>
          <KpiTile label="Ativas" value={at.filter((v) => v.status === "active").length} hint={`de ${at.length} na frota`} onClick={() => setVista("ativas")} active={vista === "ativas"} actionLabel="Filtrar as ativas" />
          <KpiTile label="Em oficina ou paradas" value={paradas.length} hint={paradas.map((v) => v.plate).join(", ") || "Nenhuma"} tone="warn" onClick={() => setVista("oficina")} active={vista === "oficina"} actionLabel="Filtrar as que estão em oficina" />
          <KpiTile label="Com alertas" value={at.filter((v) => alertas(F, v).length).length} hint="vencimentos, revisões, stock" tone="bad" onClick={() => setVista("alertas")} active={vista === "alertas"} actionLabel="Filtrar as que têm alertas" />
          <KpiTile label="Custo por km" value={kmMedio != null ? fEur(kmMedio) : "—"} hint="média da frota (custos variáveis)" />
        </KpiGrid>
        <div className="space-y-3 rounded-lg border bg-card p-3 shadow-sm">
          <FilterPills ariaLabel="Vistas" value={vista} onChange={setVista}
            options={VISTAS.map(([value, label]) => ({ value, label, count: filtrarViaturas(F, value, fx).length }))} />
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input type="search" aria-label="Procurar matrícula, modelo ou condutor" placeholder="Matrícula, modelo ou condutor" className="pl-9"
                value={fx.q} onChange={(e) => setFx({ ...fx, q: e.target.value })} />
            </div>
            <div className="w-52"><NativeSelect aria-label="Combustível" value={fx.comb} onValueChange={(comb) => setFx({ ...fx, comb })}
              options={[{ value: "", label: "Todos os combustíveis" }, ...opcoesDe(COMBUSTIVEIS)]} /></div>
            <div className="w-52"><NativeSelect aria-label="Posse" value={fx.posse} onValueChange={(posse) => setFx({ ...fx, posse })}
              options={[{ value: "", label: "Todas as posses" }, ...opcoesDe(POSSES)]} /></div>
          </div>
        </div>
        {!lista.length ? <Vazio titulo="Nenhuma viatura com estes filtros" texto="Limpa a pesquisa ou escolhe outra vista." />
          : modo === "lista" ? (
            <Tabela>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Viatura</TableHead><TableHead>Estado</TableHead><TableHead>Condutor</TableHead><TableHead className="text-right">Km</TableHead>
                  <TableHead>Próximo vencimento</TableHead><TableHead>Revisão</TableHead><TableHead className="text-right">Custo/km</TableHead><TableHead>Alertas</TableHead>
                </TableRow></TableHeader>
                <TableBody>{lista.map(linha)}</TableBody>
              </Table>
            </Tabela>
          ) : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{lista.map(cartao)}</div>}
        <p className="flex justify-between text-sm text-muted-foreground"><span>{lista.length} viatura(s)</span><span>Clica numa viatura para abrir a ficha.</span></p>
      </>}
    </div>
  );
}
