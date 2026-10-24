// O Hoje da Frota: a fila do que precisa de atenção (cada cartão abre a lista já filtrada, por URL), os avisos do job
// diário (notifications fleet_*), quem está na estrada hoje (atribuições e manutenções do dia), as próximas reservas e as
// próximas manutenções (com a ligação para a semana no calendário). Sem viaturas, diz como começar.
import { useNavigate } from "react-router-dom";
import { CalendarClock, KeyRound, Plus, Route as RouteIcon, Truck, UserPlus, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ModuleAlertsBanner } from "@/components/ModuleAlertsBanner";
import type { ModuleAlert } from "@/hooks/useModuleAlerts";
import { WorkQueueCard } from "../inventarioUi";
import { ROTA_FROTA, useFrotaCtx, type EcraFrota } from "../contexto";
import { BotaoFrota, Cabecalho, Cartao, LinhaClicavel, ListaV, Placa, Seccao, Selo, Tabela, Vazio, tomInv } from "../pecas";
import { rotaAlerta, useAlertasFrota } from "../useAlertasFrota";
import {
  ESTADOS_MANUT, TIPOS_ATRIB, abaixoMin, atribEm, ativa, cobre, condutor, diaLongo, dias, fData, fDataC, linkCalendario, manutAbertas, multasPend, revisao, stockDe,
  vencimentos, viatura, type Tom,
} from "../dados";

interface CartaoFila { n: number; tom: Tom; t: string; d: string; dest: EcraFrota; vista: string }

export function HojeFrota() {
  const { F, abrir, dlg, dados } = useFrotaCtx();
  const navigate = useNavigate();
  const { alertas: avisos, dispensar } = useAlertasFrota(dados.org);
  const hoje = F.hoje;
  const vs = F.viaturas.filter(ativa);
  const venc = vs.flatMap((v) => vencimentos(v).map((x) => ({ v, ...x })));
  const vencidos = venc.filter((x) => x.data && dias(x.data, hoje) < 0), prox = venc.filter((x) => x.data && dias(x.data, hoje) >= 0 && dias(x.data, hoje) <= 30);
  const revs = vs.filter((v) => { const r = revisao(v, hoje); return r && r.tom !== "ok"; });
  const ofi = vs.filter((v) => v.status === "workshop");
  const livres = vs.filter((v) => v.status === "active" && !atribEm(F, v.id));
  const cartas = F.condutores.filter((p) => p.is_active && p.licence_expires_on && dias(p.licence_expires_on, hoje) <= 60);
  const stockBaixo = vs.filter((v) => abaixoMin(stockDe(F, v)).length);
  const mp = [...multasPend(F)].sort((a, b) => (a.identify_by ?? "").localeCompare(b.identify_by ?? ""));
  const fila: CartaoFila[] = [
    { n: vencidos.length, tom: "bad", t: "Documentos vencidos", d: vencidos.map((x) => `${x.tipo} da ${x.v.plate}`).join(" · ") || "Nada vencido", dest: "documentos", vista: "vencidos" },
    { n: mp.length, tom: "bad", t: "Multas por identificar", d: mp.length ? `Prazo mais próximo: ${fData(mp[0].identify_by)} (15 dias úteis)` : "Nenhuma pendente", dest: "ocorrencias", vista: "pend" },
    { n: prox.length, tom: "warn", t: "Vencimentos em 30 dias", d: prox.map((x) => `${x.tipo} ${x.v.plate}`).join(" · ") || "Nenhum", dest: "documentos", vista: "30d" },
    { n: revs.length, tom: "warn", t: "Revisões a fazer", d: revs.map((v) => `${v.plate}: ${revisao(v, hoje)!.txt.toLowerCase()}`).join(" · ") || "Tudo em dia", dest: "manutencao", vista: "rev" },
    { n: cartas.length, tom: "warn", t: "Cartas de condução a caducar", d: cartas.map((p) => `${p.full_name}: ${fData(p.licence_expires_on)}`).join(" · ") || "Nenhuma", dest: "condutores", vista: "carta" },
    { n: ofi.length, tom: "info", t: "Em oficina", d: ofi.map((v) => `${v.plate}${v.status_reason ? " · " + v.status_reason : ""}`).join(" · ") || "Nenhuma", dest: "viaturas", vista: "oficina" },
    { n: stockBaixo.length, tom: "warn", t: "Carrinhas com stock abaixo do mínimo", d: stockBaixo.map((v) => `${v.plate} (${abaixoMin(stockDe(F, v)).length})`).join(" · ") || "Tudo acima do mínimo", dest: "viaturas", vista: "stock" },
    { n: livres.length, tom: "ok", t: "Viaturas livres hoje", d: livres.map((v) => v.plate).join(" · ") || "Todas atribuídas", dest: "viaturas", vista: "livres" },
  ];
  // na estrada hoje: as atribuições de hoje e as manutenções marcadas (ou em curso) para hoje
  const naEstrada = [
    ...F.atrib.filter((a) => cobre(a, hoje)).map((a) => ({ id: a.id, vid: a.vehicle_id, quem: condutor(F, a.driver_id)?.full_name ?? "", oQue: TIPOS_ATRIB[a.kind] + (a.reason ? ` · ${a.reason}` : "") })),
    ...manutAbertas(F).filter((m) => m.scheduled_on <= hoje && (m.expected_end_on ?? m.scheduled_on) >= hoje)
      .map((m) => ({ id: m.id, vid: m.vehicle_id, quem: m.supplier_label ?? "Oficina", oQue: `${m.title} (${ESTADOS_MANUT[m.status][1].toLowerCase()})` })),
  ];
  const proxManut = manutAbertas(F).filter((m) => (m.expected_end_on ?? m.scheduled_on) >= hoje).sort((a, b) => a.scheduled_on.localeCompare(b.scheduled_on));
  const reservas = F.atrib.filter((a) => a.kind === "temporary" && a.starts_on > hoje && !a.cancelled_at).sort((a, b) => a.starts_on.localeCompare(b.starts_on));

  if (!F.viaturas.length) {
    return (
      <div className="space-y-6">
        <Cabecalho titulo="Hoje" texto={`A frota da organização, ${diaLongo(hoje)}.`} />
        <Cartao className="space-y-4">
          <Vazio titulo="Ainda não há viaturas" texto="Começa por criar as viaturas (com o armazém móvel e o recurso da Agenda, se fizer sentido) e os condutores. Depois atribui, agenda manutenções e regista custos." />
          <div className="flex flex-wrap justify-center gap-2">
            <BotaoFrota variant="default" requer="gerir" icone={Truck} aoClicar={() => dlg("nova")}>Nova viatura</BotaoFrota>
            <BotaoFrota requer="gerir" icone={UserPlus} aoClicar={() => dlg("condutor")}>Novo condutor</BotaoFrota>
          </div>
        </Cartao>
      </div>
    );
  }
  return (
    <div className="space-y-8">
      <Cabecalho titulo="Hoje" texto={`O que precisa de atenção na frota, ${diaLongo(hoje)}. Cada cartão abre a lista já filtrada.`}
        acoes={<BotaoFrota variant="default" requer="gerir" icone={KeyRound} aoClicar={() => dlg("atribuir")}>Nova atribuição</BotaoFrota>} />
      {avisos.length ? (
        <section aria-label="Avisos da Frota">
          <ModuleAlertsBanner
            alerts={avisos as unknown as ModuleAlert[]}
            onDismiss={(id) => void dispensar(id)}
            onAlertClick={(a) => {
              const x = avisos.find((z) => z.id === a.id);
              if (x?.data?.vehicle_id && viatura(F, x.data.vehicle_id)) abrir(x.data.vehicle_id);
              else if (x) navigate(rotaAlerta(x));
            }}
          />
        </section>
      ) : null}
      <section aria-label="Fila de trabalho" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {fila.map((x) => (
          <WorkQueueCard key={x.t} value={x.n} title={x.t} description={x.d} tone={tomInv(x.tom)} onClick={() => navigate(`${ROTA_FROTA[x.dest]}?vista=${x.vista}`)} />
        ))}
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Seccao titulo="Na estrada hoje" icone={RouteIcon}>
          <Tabela>
            <Table>
              <TableHeader><TableRow><TableHead>Viatura</TableHead><TableHead>Com quem</TableHead><TableHead>Serviço</TableHead></TableRow></TableHeader>
              <TableBody>
                {naEstrada.length ? naEstrada.map((a) => (
                  <LinhaClicavel key={a.id} aoAbrir={() => abrir(a.vid)} rotulo={`Abrir a ${viatura(F, a.vid)?.plate ?? ""}`}>
                    <TableCell><Placa mat={viatura(F, a.vid)?.plate ?? ""} /></TableCell>
                    <TableCell>{a.quem}</TableCell>
                    <TableCell className="text-sm">{a.oQue}</TableCell>
                  </LinhaClicavel>
                )) : <TableRow><TableCell colSpan={3}><Vazio titulo="Nada para hoje" texto="As atribuições e manutenções de hoje aparecem aqui." /></TableCell></TableRow>}
              </TableBody>
            </Table>
          </Tabela>
        </Seccao>
        <Seccao titulo="Próximas manutenções" icone={Wrench} acoes={<BotaoFrota requer="gerir" icone={Plus} aoClicar={() => dlg("manut")}>Agendar</BotaoFrota>}>
          <Cartao>
            {proxManut.length ? (
              <ListaV>
                {proxManut.map((m) => (
                  <div key={m.id}>
                    <span className="flex flex-col">
                      <b>{viatura(F, m.vehicle_id)?.plate} · {m.title}</b>
                      <span className="text-xs text-muted-foreground">{m.supplier_label ?? "Sem oficina"} · {ESTADOS_MANUT[m.status][1]}{m.expected_end_on ? `, prevista até ${fData(m.expected_end_on)}` : ""}</span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <Selo tom={ESTADOS_MANUT[m.status][0]}>{fDataC(m.scheduled_on)}</Selo>
                      <Link to={linkCalendario(m.scheduled_on)} className="text-xs font-medium text-primary underline-offset-2 hover:underline" aria-label={`Ver ${m.title} da ${viatura(F, m.vehicle_id)?.plate ?? ""} no calendário`}>Ver no calendário</Link>
                    </span>
                  </div>
                ))}
              </ListaV>
            ) : <p className="text-sm text-muted-foreground">Sem manutenções marcadas.</p>}
          </Cartao>
        </Seccao>
        <Seccao titulo="Próximas reservas" icone={CalendarClock}>
          <Cartao>
            {reservas.length ? (
              <ListaV>
                {reservas.map((a) => (
                  <div key={a.id}>
                    <span className="flex flex-col"><b>{viatura(F, a.vehicle_id)?.plate} · {condutor(F, a.driver_id)?.full_name}</b><span className="text-xs text-muted-foreground">{a.reason ?? ""}</span></span>
                    <Selo tom="info">{fDataC(a.starts_on)}–{fDataC(a.ends_on)}</Selo>
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
