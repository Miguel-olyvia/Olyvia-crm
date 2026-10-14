// O Hoje da Frota (pgHoje do protótipo): a fila do que precisa de atenção (cada cartão abre a lista já filtrada, por
// URL), quem está na estrada hoje (a agenda de exemplo) e as próximas reservas.
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, KeyRound, Route as RouteIcon } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WorkQueueCard } from "@/components/frota-exemplo/inventarioUi";
import { ROTA_FROTA, useFrotaCtx, type EcraFrota } from "../contexto";
import { BotaoFrota, Cabecalho, Cartao, LinhaClicavel, ListaV, Placa, RefObra, Seccao, Selo, Tabela, Vazio, tomInv } from "../pecas";
import { HOJE, abaixoMin, atribEm, ativa, diaLongo, dias, fData, fDataC, multasPend, pessoa, prazoMulta, revisao, vencimentos, viatura, type Tom } from "../dados";

interface CartaoFila { n: number; tom: Tom; t: string; d: string; dest: EcraFrota; vista: string }

export function HojeFrota() {
  const { F, stock, abrir, dlg } = useFrotaCtx();
  const navigate = useNavigate();
  const vs = F.viaturas.filter(ativa);
  const venc = vs.flatMap((v) => vencimentos(v).map((x) => ({ v, ...x })));
  const vencidos = venc.filter((x) => x.data && dias(x.data) < 0), prox = venc.filter((x) => x.data && dias(x.data) >= 0 && dias(x.data) <= 30);
  const revs = vs.filter((v) => revisao(v).tom !== "ok");
  const ofi = vs.filter((v) => v.estado === "oficina");
  const livres = vs.filter((v) => v.estado === "ativa" && !atribEm(F, v.id));
  const cartas = F.pessoas.filter((p) => p.cartaVal && dias(p.cartaVal) <= 60);
  const stockBaixo = vs.filter((v) => abaixoMin(stock(v.id)).length);
  const mp = [...multasPend(F)].sort((a, b) => prazoMulta(a).localeCompare(prazoMulta(b)));
  const fila: CartaoFila[] = [
    { n: vencidos.length, tom: "bad", t: "Documentos vencidos", d: vencidos.map((x) => `${x.tipo} da ${x.v.mat}`).join(" · ") || "Nada vencido", dest: "documentos", vista: "vencidos" },
    { n: mp.length, tom: "bad", t: "Multas por identificar", d: mp.length ? `Prazo mais próximo: ${fData(prazoMulta(mp[0]))} (15 dias úteis)` : "Nenhuma pendente", dest: "ocorrencias", vista: "pend" },
    { n: prox.length, tom: "warn", t: "Vencimentos em 30 dias", d: prox.map((x) => `${x.tipo} ${x.v.mat}`).join(" · ") || "Nenhum", dest: "documentos", vista: "30d" },
    { n: revs.length, tom: "warn", t: "Revisões a fazer", d: revs.map((v) => `${v.mat}: ${revisao(v).txt.toLowerCase()}`).join(" · ") || "Tudo em dia", dest: "manutencao", vista: "rev" },
    { n: cartas.length, tom: "warn", t: "Cartas de condução a caducar", d: cartas.map((p) => `${p.nome}: ${fData(p.cartaVal)}`).join(" · ") || "Nenhuma", dest: "condutores", vista: "carta" },
    { n: ofi.length, tom: "info", t: "Em oficina", d: ofi.map((v) => `${v.mat} · ${v.motivo || ""}`).join(" · ") || "Nenhuma", dest: "viaturas", vista: "oficina" },
    { n: stockBaixo.length, tom: "warn", t: "Carrinhas com stock abaixo do mínimo", d: stockBaixo.map((v) => `${v.mat} (${abaixoMin(stock(v.id)).length})`).join(" · ") || "Tudo acima do mínimo", dest: "viaturas", vista: "stock" },
    { n: livres.length, tom: "ok", t: "Viaturas livres hoje", d: livres.map((v) => v.mat).join(" · ") || "Todas atribuídas", dest: "viaturas", vista: "livres" },
  ];
  const hojeAg = F.agenda.filter((a) => a.data === HOJE).sort((a, b) => a.hora.localeCompare(b.hora));
  const reservas = F.atrib.filter((a) => a.tipo === "pontual" && a.ini > HOJE).sort((a, b) => a.ini.localeCompare(b.ini));
  const nota = (texto: string | undefined, obra: number | undefined): ReactNode => (obra ? <RefObra id={obra}>{texto}</RefObra> : texto);
  return (
    <div className="space-y-8">
      <Cabecalho titulo="Hoje" texto={`O que precisa de atenção na frota, ${diaLongo(HOJE)}. Cada cartão abre a lista já filtrada.`}
        acoes={<BotaoFrota variant="default" escrita icone={KeyRound} aoClicar={() => dlg("atribuir")}>Nova atribuição</BotaoFrota>} />
      <section aria-label="Fila de trabalho" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {fila.map((x) => (
          <WorkQueueCard key={x.t} value={x.n} title={x.t} description={x.d} tone={tomInv(x.tom)} onClick={() => navigate(`${ROTA_FROTA[x.dest]}?vista=${x.vista}`)} />
        ))}
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Seccao titulo="Na estrada hoje" icone={RouteIcon}>
          <Tabela>
            <Table>
              <TableHeader><TableRow><TableHead>Hora</TableHead><TableHead>Viatura</TableHead><TableHead>Condutor</TableHead><TableHead>Serviço</TableHead></TableRow></TableHeader>
              <TableBody>
                {hojeAg.length ? hojeAg.map((a) => (
                  <LinhaClicavel key={a.vid + a.hora} aoAbrir={() => abrir(a.vid)} rotulo={`Abrir a ${viatura(F, a.vid)?.mat ?? ""}`}>
                    <TableCell className="tabular-nums">{a.hora}</TableCell>
                    <TableCell><Placa mat={viatura(F, a.vid)?.mat ?? ""} /></TableCell>
                    <TableCell>{pessoa(F, a.pid)?.nome}</TableCell>
                    <TableCell><div className="flex flex-col"><span className="font-mono text-xs">{nota(a.ref, a.obra)}</span><span className="text-xs text-muted-foreground">{a.desc}</span></div></TableCell>
                  </LinhaClicavel>
                )) : <TableRow><TableCell colSpan={4}><Vazio titulo="Nada agendado hoje" texto="As ordens e visitas da agenda aparecem aqui." /></TableCell></TableRow>}
              </TableBody>
            </Table>
          </Tabela>
        </Seccao>
        <Seccao titulo="Próximas reservas" icone={CalendarClock}>
          <Cartao>
            {reservas.length ? (
              <ListaV>
                {reservas.map((a) => (
                  <div key={a.id}>
                    <span className="flex flex-col"><b>{viatura(F, a.vid)?.mat} · {pessoa(F, a.pid)?.nome}</b><span className="text-xs text-muted-foreground">{nota(a.nota, a.obra)}</span></span>
                    <Selo tom="info">{fDataC(a.ini)}–{fDataC(a.fim)}</Selo>
                  </div>
                ))}
              </ListaV>
            ) : <p className="text-sm text-muted-foreground">Sem reservas.</p>}
          </Cartao>
        </Seccao>
      </div>
    </div>
  );
}
