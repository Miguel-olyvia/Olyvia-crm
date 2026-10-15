// As Atribuições (pgAtribuicoes do protótipo): o calendário semanal por viatura (permanentes, reservas pontuais, oficina e
// manutenções marcadas, que bloqueiam a viatura) e as listas Em curso, Reservas e Histórico.
import { useSearchParams } from "react-router-dom";
import { segundaFeira } from "../dados/acoesApp";
import { ChevronLeft, ChevronRight, KeyRound, Plus } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocSheetTabs, docTabId, docTabPanelId } from "@/components/inventory/DocumentSheet";
import { cn } from "@/lib/utils";
import { useFrotaCtx } from "../contexto";
import { BotaoFrota, Cabecalho, Placa, RefObra, Selo, Tabela, Vazio, useVista } from "../pecas";
import { HOJE, addDias, ativa, bloqueios, cancelarReserva, cobre, diaSemana, fData, fDataC, fKm, pessoa, podeReservar, viatura, type Atribuicao } from "../dados";

type Aba = "semana" | "curso" | "res" | "hist";

export { segundaFeira } from "../dados/acoesApp";
const BLOCO = {
  perm: "border-primary/60 bg-primary/10 text-primary dark:text-violet-300",
  pont: "border-info/70 bg-info/15 text-sky-800 dark:text-info",
  ofi: "border-warning/80 bg-warning/20 text-amber-800 dark:text-warning",
} as const;

/** A ação de uma atribuição aberta (a mesma nas listas das Atribuições e na ficha da viatura): em curso → Devolver;
 *  reserva futura → Cancelar (com confirmação). Fechada → nada. */
export function AcaoAtribuicao({ a }: { a: Atribuicao }) {
  const { F, dlg, agir, confirmar } = useFrotaCtx();
  const aberta = !a.devolvida && (!a.fim || a.fim >= HOJE);
  if (!aberta) return null;
  if (a.ini <= HOJE) return <BotaoFrota escrita aoClicar={() => dlg("devolver", { a: a.id })}>Devolver</BotaoFrota>;
  const v = viatura(F, a.vid), p = pessoa(F, a.pid);
  return (
    <BotaoFrota escrita aoClicar={() => confirmar({
      titulo: "Cancelar a reserva", ok: "Cancelar reserva", perigo: true,
      texto: `A reserva da ${v?.mat ?? "viatura"} para ${p?.nome ?? "—"} (${fData(a.ini)} a ${a.fim ? fData(a.fim) : "sem fim"}) sai da Frota e a viatura fica livre nesses dias.`,
      aoConfirmar: () => agir((G) => cancelarReserva(G, a.id), (m) => m),
    })}>Cancelar</BotaoFrota>
  );
}

export function AtribuicoesFrota() {
  const { F, abrir, dlg, podeAgir } = useFrotaCtx();
  const [abaUrl, setAba] = useVista("semana");
  const aba = (["semana", "curso", "res", "hist"].includes(abaUrl) ? abaUrl : "semana") as Aba;
  // a semana do calendário vive no URL (?semana=1 = a próxima), para "Ver no calendário" abrir a semana certa
  const [params, setParams] = useSearchParams();
  const semana = Number(params.get("semana") || 0) || 0;
  const setSemana = (n: number): void => {
    const p = new URLSearchParams(params);
    if (n) p.set("semana", String(n)); else p.delete("semana");
    setParams(p, { replace: true });
  };
  const ini = addDias(segundaFeira(HOJE), semana * 7), dd = Array.from({ length: 7 }, (_, i) => addDias(ini, i));
  const vs = F.viaturas.filter(ativa);
  const curso = F.atrib.filter((a) => cobre(a, HOJE));
  const res = F.atrib.filter((a) => a.ini > HOJE).sort((a, b) => a.ini.localeCompare(b.ini));
  const hist = F.atrib.filter((a) => a.fim && (a.fim < HOJE || a.devolvida)).sort((a, b) => b.fim!.localeCompare(a.fim!));

  const calendario = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <BotaoFrota icone={ChevronLeft} aoClicar={() => setSemana(semana - 1)}>Semana anterior</BotaoFrota>
          <BotaoFrota aoClicar={() => setSemana(0)}>Esta semana</BotaoFrota>
          <BotaoFrota icone={ChevronRight} aoClicar={() => setSemana(semana + 1)}>Seguinte</BotaoFrota>
        </div>
        <span className="text-sm text-muted-foreground">{fData(dd[0])} a {fData(dd[6])}</span>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><i className={cn("h-3 w-3 rounded-sm border", BLOCO.perm)} aria-hidden="true" />Atribuição permanente</span>
        <span className="inline-flex items-center gap-1.5"><i className={cn("h-3 w-3 rounded-sm border", BLOCO.pont)} aria-hidden="true" />Reserva pontual (obra, ordem)</span>
        <span className="inline-flex items-center gap-1.5"><i className={cn("h-3 w-3 rounded-sm border", BLOCO.ofi)} aria-hidden="true" />Oficina ou manutenção marcada</span>
      </div>
      <Tabela>
        <Table className="min-w-[900px]">
          <caption className="sr-only">Calendário da semana de {fData(dd[0])} a {fData(dd[6])}</caption>
          <TableHeader><TableRow>
            <TableHead>Viatura</TableHead>
            {dd.map((d) => <TableHead key={d} className={cn(d === HOJE && "text-primary")}>{diaSemana(d)} {fDataC(d)}{d === HOJE ? " · hoje" : ""}</TableHead>)}
          </TableRow></TableHeader>
          <TableBody>
            {vs.map((v) => (
              <TableRow key={v.id}>
                <TableCell>
                  <button type="button" className="font-mono text-sm font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => abrir(v.id)}>{v.mat}</button>
                  <div className="text-xs text-muted-foreground">{v.marca} {v.modelo.split(" ")[0]}</div>
                </TableCell>
                {dd.map((d) => {
                  const bl = bloqueios(F, v.id, d);
                  if (!bl.length) return (
                    <TableCell key={d} className={cn(d === HOJE && "bg-primary/5")}>
                      {podeAgir && podeReservar(F, v.id, d) ? (
                        <button type="button" onClick={() => dlg("atribuir", { v: v.id, ini: d })} aria-label={`Reservar ${v.mat} a ${fData(d)}`}
                          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <Plus className="h-4 w-4" aria-hidden="true" />
                        </button>
                      ) : null}
                    </TableCell>
                  );
                  return (
                    <TableCell key={d} className={cn("align-top", d === HOJE && "bg-primary/5")}>
                      <div className="flex flex-col gap-1">
                        {bl.map((b, i) => {
                          if (b.tipo === "oficina" || b.tipo === "manutencao") return <span key={i} className={cn("rounded border px-1.5 py-0.5 text-xs font-medium", BLOCO.ofi)} title={b.manut ? `${b.manut.tipo} · ${b.manut.oficina}` : v.motivo}>{b.tipo === "oficina" ? "Oficina" : `Manutenção · ${b.txt}`}</span>;
                          const a = b.atrib!, nome = pessoa(F, a.pid)?.nome ?? "";
                          return (
                            <span key={i} className={cn("rounded border px-1.5 py-0.5 text-xs font-medium", a.tipo === "pontual" ? BLOCO.pont : BLOCO.perm)} title={nome + (a.nota ? " · " + a.nota : "")}>
                              {nome.split(" ")[0]}{a.tipo === "pontual" && a.nota ? " · " + a.nota.split(" ")[0] : ""}
                              {a.tipo === "pontual" && a.nota && a.obra ? <> <RefObra id={a.obra}>#{a.obra}</RefObra></> : null}
                            </span>
                          );
                        })}
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Tabela>
    </div>
  );

  const linhas = (l: Atribuicao[]) => (l.length ? (
    <Tabela>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Viatura</TableHead><TableHead>Condutor</TableHead><TableHead>Tipo</TableHead><TableHead>Período</TableHead>
          <TableHead className="text-right">Km</TableHead><TableHead>Motivo</TableHead><TableHead><span className="sr-only">Ações</span></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {l.map((a) => {
            const v = viatura(F, a.vid), p = pessoa(F, a.pid);
            return (
              <TableRow key={a.id}>
                <TableCell>{v ? <Placa mat={v.mat} /> : null}</TableCell>
                <TableCell>{p?.nome}</TableCell>
                <TableCell>{a.tipo === "pontual" ? <Selo tom="info">Pontual</Selo> : <Selo tom="violet">Permanente</Selo>}</TableCell>
                <TableCell className="whitespace-nowrap">{fData(a.ini)} → {a.fim ? fData(a.fim) : "sem fim"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {a.kmIni != null ? fKm(a.kmIni) : "—"}{a.kmFim != null ? " → " + fKm(a.kmFim) : ""}
                  {a.kmFim != null && a.kmIni != null ? <div className="text-xs text-muted-foreground">{fKm(a.kmFim - a.kmIni)} feitos</div> : null}
                </TableCell>
                <TableCell>{a.obra ? <RefObra id={a.obra}>{a.nota}</RefObra> : a.nota ?? ""}</TableCell>
                <TableCell className="text-right"><AcaoAtribuicao a={a} /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Tabela>
  ) : <Vazio titulo="Nada para mostrar" texto="As atribuições aparecem aqui quando entregares uma viatura." />);

  const abas: { id: Aba; label: string; count?: number }[] = [
    { id: "semana", label: "Calendário" }, { id: "curso", label: "Em curso", count: curso.length }, { id: "res", label: "Reservas", count: res.length }, { id: "hist", label: "Histórico", count: hist.length },
  ];
  return (
    <div className="space-y-6">
      <Cabecalho titulo="Atribuições" texto="Quem tem que viatura e quando. A atribuição confirma a carta de condução no RH e recusa sobreposições na mesma viatura e dias de manutenção marcada."
        acoes={<BotaoFrota variant="default" escrita icone={KeyRound} aoClicar={() => dlg("atribuir")}>Nova atribuição</BotaoFrota>} />
      <div className="border-b">
        <DocSheetTabs label="Atribuições" idBase="frota-atrib" tabs={abas} value={aba} onChange={(a) => setAba(a)} />
      </div>
      <div role="tabpanel" id={docTabPanelId("frota-atrib", aba)} aria-labelledby={docTabId("frota-atrib", aba)}>
        {aba === "semana" ? calendario : linhas(aba === "curso" ? curso : aba === "res" ? res : hist)}
      </div>
    </div>
  );
}
