// As Viaturas (pgViaturas do protótipo): KPI que filtram, vistas com a contagem (no URL), pesquisa, combustível e posse,
// e a lista (tabela) ou os cartões. Cada viatura abre a ficha.
import { useState } from "react";
import { LayoutGrid, List, Plus, Search, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterPills, KpiGrid, KpiTile } from "@/components/frota-exemplo/inventarioUi";
import { cn } from "@/lib/utils";
import { useFrotaCtx } from "../contexto";
import { BotaoFrota, Cabecalho, LinhaClicavel, Placa, Prog, Selo, SeloEstado, Tabela, VRef, Vazio, useVista } from "../pecas";
import {
  abaixoMin, alertas, atribEm, ativa, condutor, custoKm, custoTotal, fData, fEur, fKm, fNum, kmPeriodo, proxVenc, revisao, soma, textoData, tomData,
  type Frota, type LinhaCarrinha, type Viatura,
} from "../dados";

export interface FiltrosViaturas { q: string; comb: string; posse: string }

/** A lista filtrada (filtraViaturas do protótipo) para a vista `vista`. */
export function filtrarViaturas(F: Frota, stock: (vid: string) => LinhaCarrinha[], vista: string, fx: FiltrosViaturas): Viatura[] {
  const q = fx.q.toLowerCase().replace(/-/g, "");
  return F.viaturas.filter((v) => {
    if (vista === "ativas" && v.estado !== "ativa") return false;
    if (vista === "livres" && !(v.estado === "ativa" && !atribEm(F, v.id))) return false;
    if (vista === "oficina" && v.estado !== "oficina") return false;
    if (vista === "alertas" && !alertas(F, v, stock(v.id)).length) return false;
    if (vista === "stock" && !abaixoMin(stock(v.id)).length) return false;
    if (vista === "inativas" && ativa(v)) return false;
    if (vista !== "inativas" && vista !== "todas" && !ativa(v)) return false;
    if (fx.comb && v.comb !== fx.comb) return false;
    if (fx.posse && v.posse !== fx.posse) return false;
    if (q && !(v.mat + v.marca + v.modelo + (condutor(F, v.id)?.nome ?? "")).toLowerCase().replace(/-/g, "").includes(q)) return false;
    return true;
  });
}

const VISTAS: [string, string][] = [["todas", "Todas"], ["ativas", "Ativas"], ["livres", "Livres hoje"], ["oficina", "Em oficina"], ["alertas", "Com alertas"], ["stock", "Stock baixo"], ["inativas", "Vendidas e inativas"]];

export function ViaturasFrota() {
  const { F, stock, abrir, dlg } = useFrotaCtx();
  const [vista, setVista] = useVista();
  const [fx, setFx] = useState<FiltrosViaturas>({ q: "", comb: "", posse: "" });
  const [modo, setModo] = useState<"lista" | "cartoes">("lista");
  const at = F.viaturas.filter(ativa), lista = filtrarViaturas(F, stock, vista, fx);
  const kmTot = soma(at, (v) => kmPeriodo(F, v.id));
  const paradas = at.filter((v) => v.estado !== "ativa");
  const nAlertas = (v: Viatura) => alertas(F, v, stock(v.id));

  const linha = (v: Viatura) => {
    const r = revisao(v), pv = proxVenc(v), al = nAlertas(v), c = condutor(F, v.id), k = custoKm(F, v.id);
    return (
      <LinhaClicavel key={v.id} aoAbrir={() => abrir(v.id)} rotulo={`Abrir a ${v.mat}`} className={cn(!ativa(v) && "opacity-60")}>
        <TableCell><VRef v={v} /></TableCell>
        <TableCell><div className="flex flex-wrap gap-1"><SeloEstado v={v} />{v.pool ? <Selo tom="violet">Partilhada</Selo> : null}</div></TableCell>
        <TableCell>{c ? <div className="flex flex-col"><span>{c.nome}</span><span className="text-xs text-muted-foreground">{c.equipa}</span></div> : <span className="text-muted-foreground">{v.pool && ativa(v) ? "Livre para reserva" : "—"}</span>}</TableCell>
        <TableCell className="text-right tabular-nums">{fKm(v.km)}</TableCell>
        <TableCell>{pv && ativa(v) ? <div className="flex flex-col items-start gap-1"><span>{pv.tipo} · {fData(pv.data)}</span><Selo tom={tomData(pv.data)}>{textoData(pv.data)}</Selo></div> : "—"}</TableCell>
        <TableCell>{ativa(v) ? <div className="flex flex-col gap-1"><Prog tom={r.tom} pct={r.pct} /><span className={cn("text-xs", r.tom === "ok" && "text-muted-foreground")}>{r.txt}</span></div> : "—"}</TableCell>
        <TableCell className="text-right tabular-nums">{k != null ? fEur(k) : "—"}</TableCell>
        <TableCell>{al.length ? <Selo tom={al.some((a) => a.tom === "bad") ? "bad" : "warn"}>{al.length + (al.length > 1 ? " alertas" : " alerta")}</Selo> : ativa(v) ? <Selo tom="ok">Em dia</Selo> : null}</TableCell>
      </LinhaClicavel>
    );
  };
  const cartao = (v: Viatura) => {
    const c = condutor(F, v.id), r = revisao(v), al = nAlertas(v), k = custoKm(F, v.id);
    return (
      <button key={v.id} type="button" onClick={() => abrir(v.id)} aria-label={`Abrir a ${v.mat}`}
        className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <div className="flex items-center justify-between gap-2"><Placa mat={v.mat} grande /><SeloEstado v={v} /></div>
        <div><b>{v.marca} {v.modelo}</b><div className="text-sm text-muted-foreground">{v.tipo} · {v.comb} · {v.posse}</div></div>
        <div className="flex items-center gap-1.5 text-sm"><UserRound className="h-3.5 w-3.5" aria-hidden="true" />{c ? c.nome : <span className="text-muted-foreground">{v.pool ? "Livre para reserva" : "Sem condutor"}</span>}</div>
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div><b className="block tabular-nums">{fNum(v.km / 1000, 1)}k</b><span className="text-xs text-muted-foreground">km</span></div>
          <div><b className="block tabular-nums">{k != null ? fEur(k) : "—"}</b><span className="text-xs text-muted-foreground">custo/km</span></div>
          <div><b className="block tabular-nums">{al.length}</b><span className="text-xs text-muted-foreground">alertas</span></div>
        </div>
        {ativa(v) ? <div className="flex items-center gap-2"><Prog tom={r.tom} pct={r.pct} /><span className="text-xs text-muted-foreground">Revisão · {r.txt.toLowerCase()}</span></div> : <span className="text-xs text-muted-foreground">{v.motivo || ""}</span>}
      </button>
    );
  };
  return (
    <div className="space-y-6">
      <Cabecalho titulo="Viaturas" texto="Todas as viaturas da organização, com estado, condutor, vencimentos e custo por km de 1 set a 14 out."
        acoes={<>
          <BotaoFrota icone={modo === "lista" ? LayoutGrid : List} aoClicar={() => setModo(modo === "lista" ? "cartoes" : "lista")}>{modo === "lista" ? "Ver cartões" : "Ver lista"}</BotaoFrota>
          <BotaoFrota variant="default" escrita icone={Plus} aoClicar={() => dlg("nova")}>Nova viatura</BotaoFrota>
        </>} />
      <KpiGrid>
        <KpiTile label="Ativas" value={at.filter((v) => v.estado === "ativa").length} hint={`de ${at.length} na frota`} onClick={() => setVista("ativas")} active={vista === "ativas"} actionLabel="Filtrar as ativas" />
        <KpiTile label="Em oficina ou paradas" value={paradas.length} hint={paradas.map((v) => v.mat).join(", ") || "Nenhuma"} tone="warn" onClick={() => setVista("oficina")} active={vista === "oficina"} actionLabel="Filtrar as que estão em oficina" />
        <KpiTile label="Com alertas" value={at.filter((v) => nAlertas(v).length).length} hint="vencimentos, revisões, stock" tone="bad" onClick={() => setVista("alertas")} active={vista === "alertas"} actionLabel="Filtrar as que têm alertas" />
        <KpiTile label="Custo por km" value={kmTot > 0 ? fEur(soma(at, (v) => custoTotal(F, v.id)) / kmTot) : "—"} hint="média da frota no período" />
      </KpiGrid>
      <div className="space-y-3 rounded-lg border bg-card p-3 shadow-sm">
        <FilterPills ariaLabel="Vistas" value={vista} onChange={setVista}
          options={VISTAS.map(([value, label]) => ({ value, label, count: filtrarViaturas(F, stock, value, fx).length }))} />
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input type="search" aria-label="Procurar matrícula, modelo ou condutor" placeholder="Matrícula, modelo ou condutor" className="pl-9"
              value={fx.q} onChange={(e) => setFx({ ...fx, q: e.target.value })} />
          </div>
          <div className="w-52"><NativeSelect aria-label="Combustível" value={fx.comb} onValueChange={(comb) => setFx({ ...fx, comb })}
            options={[{ value: "", label: "Todos os combustíveis" }, ...["Gasóleo", "Gasolina", "Híbrido", "Elétrico"].map((x) => ({ value: x, label: x }))]} /></div>
          <div className="w-52"><NativeSelect aria-label="Posse" value={fx.posse} onValueChange={(posse) => setFx({ ...fx, posse })}
            options={[{ value: "", label: "Própria, renting e leasing" }, ...["Própria", "Renting", "Leasing"].map((x) => ({ value: x, label: x }))]} /></div>
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
    </div>
  );
}
