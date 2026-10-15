// A ficha da viatura (folhaHtml do protótipo) numa folha lateral (DocumentSheet do Inventário real) com 9 abas: Resumo,
// Atribuições, Manutenção, Custos, Ocorrências, Documentos, Stock na carrinha (só as que são armazém móvel), Ligações e
// Histórico (as entradas do log de atividade desta viatura).
// O rodapé tem as ações; sem a permissão real ficam desativadas e dizem porquê.
import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, CalendarPlus, CircleAlert, FileText, Fuel, Gauge, Info, KeyRound, Package, PackagePlus, Plus, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocInfoGrid, DocSection, DocSheetTabs, DocumentSheetContent, docTabId, docTabPanelId } from "@/components/inventory/DocumentSheet";
import { usePermissionGate } from "@/components/frota-exemplo/inventarioUi";
import { cn } from "@/lib/utils";
import { useFrotaCtx, type AbaFicha } from "./contexto";
import { AvisoRegiao, BotaoFrota, Cartao, ListaV, Placa, Prog, RefObra, Selo, SeloEstado, Tabela, Vazio } from "./pecas";
import { AcaoOcorrencia, TOM_OCORR } from "./ecras/OcorrenciasFrota";
import { AcaoAtribuicao } from "./ecras/AtribuicoesFrota";
import { PERMISSAO_AGENDA } from "./dados/exemplo";
import { pedidosDaCarrinha, pedirReposicaoExemplo } from "./dados/acoesApp";
import { ListaHistorico } from "./ecras/AtividadeFrota";
import {
  abaixoMin, alertas, atribEm, ativa, compromissos, condutor, consumo, custoKm, custoTotal, custosV, fData, fEur, fKm, fNum, kmPeriodo, pessoa, revisao,
  soma, textoData, tomSelo, vencimentos, VENC, type ChaveVenc, type Viatura,
} from "./dados";

const ID_BASE = "frota-ficha";
const ALERTA = { ok: "border-success/40 bg-success/10", info: "border-info/40 bg-info/10", warn: "border-warning/50 bg-warning/15", bad: "border-destructive/40 bg-destructive/10", violet: "border-primary/40 bg-primary/10", neu: "border-border bg-muted" } as const;

function Resumo({ v }: { v: Viatura }) {
  const { F, stock } = useFrotaCtx();
  const al = alertas(F, v, stock(v.id)), r = revisao(v), k = custoKm(F, v.id), c = consumo(F, v.id);
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
      {v.motivo ? <div className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-sm", ALERTA.neu)}><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{v.motivo}</span></div> : null}
      <Cartao>
        <DocInfoGrid className="my-0" items={[
          { label: "Marca e modelo", value: `${v.marca} ${v.modelo}` }, { label: "Tipo", value: v.tipo }, { label: "Combustível", value: v.comb }, { label: "Ano", value: String(v.ano) },
          { label: "Posse", value: v.posse + (v.renda ? ` · ${fEur(v.renda)}/mês até ${fData(v.fimContrato)}` : "") }, { label: "Carta exigida", value: "Categoria " + v.cat },
          { label: "Centro de custo", value: v.centro }, { label: "Seguro", value: `${v.seguradora}${v.apolice !== "—" ? " · " + v.apolice : ""}` },
          { label: "Uso pessoal", value: v.usoPessoal ? "Autorizado (tributação em sede de IRS)" : "Não" }, { label: "Armazém móvel", value: v.armazem ? "Carrinha " + v.mat : "Não tem" },
        ]} />
      </Cartao>
      <div className="grid gap-4 md:grid-cols-2">
        <Cartao>
          <DocSection title="Vencimentos">
            <ListaV>{vencimentos(v).map((x) => (
              <div key={x.k}>
                <span className="flex flex-col"><span>{x.tipo}</span><span className="text-xs text-muted-foreground">{x.data ? fData(x.data) : "Isento"}</span></span>
                {x.data ? <Selo tom={tomSelo(x.data)}>{textoData(x.data)}</Selo> : <Selo tom="neu">Isento</Selo>}
              </div>
            ))}</ListaV>
          </DocSection>
        </Cartao>
        <Cartao className="space-y-3">
          <DocSection title="Próxima revisão">
            <p><b>{fKm(r.nextKm)}</b> ou até <b>{fData(r.nextData)}</b></p>
            <Prog tom={r.tom} pct={r.pct} largo />
            <Selo tom={r.tom}>{r.txt}</Selo>
          </DocSection>
          <DocSection title="No período">
            <ListaV>
              <div><span>Km percorridos</span><b className="tabular-nums">{fNum(kmPeriodo(F, v.id))}</b></div>
              <div><span>Custo total</span><b className="tabular-nums">{fEur(custoTotal(F, v.id))}</b></div>
              <div><span>Custo por km</span><b className="tabular-nums">{k != null ? fEur(k) : "—"}</b></div>
              {c ? <div><span>Consumo médio</span><b className="tabular-nums">{fNum(c, 1)} {v.comb === "Elétrico" ? "kWh" : "L"}/100 km</b></div> : null}
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

function Corpo({ v, aba }: { v: Viatura; aba: AbaFicha }) {
  const { F, stock, avisar, agir, dlg } = useFrotaCtx();
  const gate = usePermissionGate();
  if (aba === "resumo") return <Resumo v={v} />;
  if (aba === "atrib") {
    const l = F.atrib.filter((x) => x.vid === v.id).sort((x, y) => y.ini.localeCompare(x.ini));
    return (
      <Linhas cab={["Condutor", "Tipo", "Período", "Km", "Motivo"]} acoes vazio={l.length ? null : ["Sem atribuições", "Esta viatura nunca foi entregue a ninguém."]}>
        {l.map((x) => (
          <TableRow key={x.id}>
            <TableCell>{pessoa(F, x.pid)?.nome}</TableCell>
            <TableCell>{x.tipo === "pontual" ? <Selo tom="info">Pontual</Selo> : <Selo tom="violet">Permanente</Selo>}</TableCell>
            <TableCell className="whitespace-nowrap">{fData(x.ini)} → {x.fim ? fData(x.fim) : "sem fim"}</TableCell>
            <TableCell className="tabular-nums">{x.kmIni != null ? fNum(x.kmIni) : "—"}{x.kmFim != null ? " → " + fNum(x.kmFim) : ""}</TableCell>
            <TableCell>{x.obra ? <RefObra id={x.obra}>{x.nota}</RefObra> : x.nota ?? ""}</TableCell>
            {/* a mesma ação das listas das Atribuições: Devolver (em curso) ou Cancelar (reserva futura) */}
            <TableCell className="text-right"><AcaoAtribuicao a={x} /></TableCell>
          </TableRow>
        ))}
      </Linhas>
    );
  }
  if (aba === "manut") {
    const l = F.manut.filter((x) => x.vid === v.id).sort((x, y) => y.data.localeCompare(x.data));
    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">Regra: revisão a cada {fKm(v.rev.cadaKm)} ou {v.rev.cadaMeses} meses. Última aos {fKm(v.rev.ultKm)} em {fData(v.rev.ultData)}.</p>
          {ativa(v) ? <BotaoFrota escrita icone={CalendarPlus} aoClicar={() => dlg("manut", { v: v.id })}>Agendar manutenção</BotaoFrota> : null}
        </div>
        <Linhas cab={["Data", "Intervenção", "Oficina", "Estado", "Valor"]} acoes vazio={l.length ? null : ["Sem intervenções registadas", "Agenda a próxima revisão em Manutenção."]}>
          {l.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="whitespace-nowrap">{fData(m.data)}</TableCell><TableCell>{m.tipo}</TableCell><TableCell>{m.oficina}</TableCell>
              <TableCell><Selo tom={m.estado === "concluída" ? "ok" : m.estado === "em curso" ? "warn" : "info"}>{m.estado}</Selo></TableCell>
              <TableCell className="text-right tabular-nums">{fEur(m.valor)}</TableCell>
              {/* o mesmo diálogo "Concluir intervenção" da Manutenção */}
              <TableCell className="text-right">{m.estado !== "concluída" ? <BotaoFrota escrita aoClicar={() => dlg("concluir", { m: m.id })} aria-label={`Concluir ${m.tipo} de ${fData(m.data)}`}>Concluir</BotaoFrota> : null}</TableCell>
            </TableRow>
          ))}
        </Linhas>
      </>
    );
  }
  if (aba === "custos") {
    const l = [...custosV(F, v.id)].sort((x, y) => y.data.localeCompare(x.data));
    return (
      <>
        <Linhas cab={["Data", "Tipo", "Origem", "Km", "Valor"]} vazio={l.length ? null : ["Sem custos", "Ainda não há despesas desta viatura."]}>
          {l.map((x) => (
            <TableRow key={x.id}>
              <TableCell className="whitespace-nowrap">{fData(x.data)}</TableCell>
              <TableCell>{x.tipo}{x.qtd ? <div className="text-xs text-muted-foreground">{fNum(x.qtd, 1)} {x.un}</div> : null}</TableCell>
              <TableCell>{x.fonte}</TableCell>
              <TableCell className="tabular-nums">{x.km ? fNum(x.km) : "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{fEur(x.valor)}</TableCell>
            </TableRow>
          ))}
        </Linhas>
        <p className="flex justify-between text-sm"><span className="text-muted-foreground">{l.length} lançamento(s)</span><b>Total {fEur(soma(l, (x) => x.valor))}</b></p>
        {/* o mesmo diálogo "Registar despesa" dos Custos, já com esta viatura */}
        {ativa(v) ? <div className="flex justify-end"><BotaoFrota escrita icone={Plus} aoClicar={() => dlg("despesa", { v: v.id })}>Registar despesa</BotaoFrota></div> : null}
      </>
    );
  }
  if (aba === "ocorr") {
    const l = F.ocorr.filter((x) => x.vid === v.id);
    return l.length ? (
      <div className="space-y-2">{l.map((o) => (
        <Cartao key={o.id} className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2"><b>{o.tipo} · {fData(o.quando.slice(0, 10))} {o.quando.slice(11)}</b><Selo tom={TOM_OCORR[o.estado] ?? "warn"}>{o.estado}</Selo></div>
          <p className="text-sm">{o.desc}</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{o.local}{o.pid ? " · " + pessoa(F, o.pid)?.nome : ""}</p>
            {/* a mesma ação da lista das Ocorrências: Identificar condutor ou Marcar resolvida */}
            <AcaoOcorrencia o={o} />
          </div>
        </Cartao>
      ))}</div>
    ) : <Vazio titulo="Sem ocorrências" texto="Nenhuma multa, sinistro ou avaria registada." />;
  }
  if (aba === "docs") {
    // [título, validade, o vencimento que se renova (seguro, IPO, IUC)]
    const docs: [string, string, ChaveVenc?][] = [["Documento único automóvel (DUA)", "Permanente"], ["Apólice de seguro", v.venc.seguro ? "Válida até " + fData(v.venc.seguro) : "—", "seguro"],
      ["Certificado de inspeção", v.venc.ipo ? "Válido até " + fData(v.venc.ipo) : "—", "ipo"], ["Comprovativo IUC", v.venc.iuc ? "Até " + fData(v.venc.iuc) : "Isento (elétrico)", "iuc"], ["Carta verde", "Com a apólice"],
      ...(v.fimContrato ? [["Contrato de " + v.posse.toLowerCase(), "Até " + fData(v.fimContrato)] as [string, string]] : [])];
    return (
      <Cartao>
        <ListaV>{docs.map(([t, d, k]) => {
          // renova-se o mesmo que o ecrã Documentos: só em viaturas ativas e só vencimentos com data (o IUC isento não)
          const data = k ? v.venc[k] : null, renova = k && data && ativa(v) ? k : null;
          return (
            <div key={t}>
              <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" /><span className="flex flex-col"><span>{t}</span><span className="text-xs text-muted-foreground">{d}</span></span></span>
              <span className="flex flex-wrap items-center justify-end gap-2">
                {renova && data ? <Selo tom={tomSelo(data)}>{textoData(data)}</Selo> : null}
                <BotaoFrota aoClicar={() => avisar("Os ficheiros da viatura ficarão em Documentos quando a Frota tiver tabelas (exemplo).")}>Abrir</BotaoFrota>
                {/* o mesmo diálogo "Renovar documento" do ecrã Documentos */}
                {renova ? <BotaoFrota escrita aoClicar={() => dlg("renovar", { v: v.id, k: renova })} aria-label={`Renovar ${VENC[renova]} da ${v.mat}`}>Renovar</BotaoFrota> : null}
              </span>
            </div>
          );
        })}</ListaV>
      </Cartao>
    );
  }
  if (aba === "stock") {
    const st = stock(v.id), pend = pedidosDaCarrinha(F, v.id);
    return (
      <>
        <p className="text-sm text-muted-foreground">A carrinha é um armazém móvel do Inventário. Neste exemplo o stock é inventado; com as tabelas, lê-se do armazém da viatura e a reposição é um pedido de transferência a partir do armazém central.</p>
        <Linhas cab={["Ref.", "Artigo", "Na carrinha", "Mínimo", "Estado"]} vazio={st.length ? null : ["Carrinha vazia", "Ainda não há stock neste armazém móvel."]}>
          {st.map((s) => (
            <TableRow key={s.sku}>
              <TableCell className="font-mono text-xs">{s.sku}</TableCell><TableCell>{s.nome}</TableCell>
              <TableCell className="tabular-nums">{fNum(s.qty)} {s.un}</TableCell><TableCell className="tabular-nums">{fNum(s.min)} {s.un}</TableCell>
              <TableCell><div className="flex flex-wrap gap-1">{s.qty < s.min ? <Selo tom="warn">{`Repor ${fNum(s.min - s.qty)}`}</Selo> : <Selo tom="ok">OK</Selo>}
                {pend.some((p) => p.sku === s.sku) ? <Selo tom="info">Pedido</Selo> : null}</div></TableCell>
            </TableRow>
          ))}
        </Linhas>
        {abaixoMin(st).length ? <p className="text-sm">{abaixoMin(st).length} artigo(s) abaixo do mínimo.</p> : null}
        {pend.length ? (
          <DocSection title="Pedidos de reposição">
            <ListaV>{pend.map((p) => (
              <div key={p.id}><span>{p.sku} · {p.nome} × {fNum(p.qty)} {p.un}<span className="block text-xs text-muted-foreground">Armazém central → carrinha {v.mat}</span></span><Selo tom="info">Pedido</Selo></div>
            ))}</ListaV>
          </DocSection>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {st.length ? (
            <BotaoFrota escrita icone={PackagePlus} aoClicar={() => agir((G) => pedirReposicaoExemplo(G, v.id), (m) => m)}>
              Pedir reposição ao armazém central{abaixoMin(st).length ? ` (${abaixoMin(st).length})` : ""}
            </BotaoFrota>
          ) : null}
          {gate("warehouses.view").allowed ? (
            <Button asChild size="sm" variant="outline" className="gap-1.5"><Link to="/warehouses"><Package className="h-4 w-4" aria-hidden="true" />Ver os armazéns no Inventário</Link></Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">O pedido fica registado no exemplo da Frota. A transferência real no Inventário só existe quando houver tabelas fleet_*.</p>
      </>
    );
  }
  if (aba === "hist") return <ListaHistorico entradas={(F.log ?? []).filter((e) => e.vid === v.id)} semViatura />;
  const ag = compromissos(F, v.id);
  return (
    <div className="space-y-4">
      <Cartao>
        <DocSection title="Agenda e ordens de trabalho" actions={v.agenda !== false && gate(PERMISSAO_AGENDA).allowed ? (
          <Button asChild size="sm" variant="outline" className="gap-1.5"><Link to="/scheduling"><CalendarDays className="h-4 w-4" aria-hidden="true" />Abrir a Agenda</Link></Button>
        ) : null}>
          {ag.length ? (
            <ListaV>{ag.map((x, i) => (
              <div key={i}>
                <span className="flex flex-col">
                  <span><span className="font-mono text-xs">{x.obra ? <RefObra id={x.obra}>{x.ref}</RefObra> : x.ref}</span> · {x.desc}</span>
                  <span className="text-xs text-muted-foreground">{fData(x.data)} {x.hora !== "—" ? x.hora : ""}{x.pid ? " · " + (pessoa(F, x.pid)?.nome ?? "") : ""}</span>
                </span>
              </div>
            ))}</ListaV>
          ) : <p className="text-sm text-muted-foreground">Nada agendado com esta viatura.</p>}
          <p className="text-xs text-muted-foreground">Compromissos de exemplo: a Agenda real ainda não conhece as viaturas da Frota.</p>
        </DocSection>
      </Cartao>
      <Cartao>
        <DocInfoGrid className="my-0" items={[
          { label: "Recurso de agenda", value: v.agenda === false ? "Não é recurso da agenda" : `${v.recursoAgenda ? v.recursoAgenda + " · " : ""}${v.mat} · tipo veículo` },
          { label: "Armazém móvel", value: v.armazem ? `Carrinha ${v.mat} (exemplo)` : "—" },
          { label: "Centro de custo", value: v.centro }, { label: "Seguradora (fornecedor)", value: v.seguradora },
        ]} />
      </Cartao>
    </div>
  );
}

export function ViaturaFicha({ vid, aba, mudarAba, aoFechar }: { vid: string; aba: AbaFicha; mudarAba: (a: AbaFicha) => void; aoFechar: () => void }) {
  const { F, stock, dlg } = useFrotaCtx();
  // o elemento que tinha o foco ao abrir a ficha (a linha, o cartão, o resultado da pesquisa…): recebe-o de volta ao fechar
  const [origem] = useState<HTMLElement | null>(() => (typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null));
  const conteudo = useRef<HTMLDivElement>(null);
  const v = F.viaturas.find((x) => x.id === vid);
  if (!v) return null;
  const c = condutor(F, v.id), a = atribEm(F, v.id), r = revisao(v), al = alertas(F, v, stock(v.id)), k = custoKm(F, v.id);
  const abas: { id: AbaFicha; label: string; hidden?: boolean }[] = [
    { id: "resumo", label: "Resumo" }, { id: "atrib", label: "Atribuições" }, { id: "manut", label: "Manutenção" }, { id: "custos", label: "Custos" },
    { id: "ocorr", label: "Ocorrências" }, { id: "docs", label: "Documentos" }, { id: "stock", label: "Stock na carrinha", hidden: !v.armazem }, { id: "lig", label: "Ligações" },
    { id: "hist", label: "Histórico" },
  ];
  const atual: AbaFicha = abas.some((x) => x.id === aba && !x.hidden) ? aba : "resumo";
  const podeAtrib = v.estado === "ativa" && !a;
  return (
    <Sheet open onOpenChange={(o) => { if (!o) aoFechar(); }}>
      <DocumentSheetContent
        ref={conteudo}
        crumbs="Frota › Viaturas"
        title={<span className="flex flex-wrap items-center gap-2"><Placa mat={v.mat} grande /><span>{v.marca} {v.modelo}</span></span>}
        badges={<>
          <SeloEstado v={v} />{v.pool ? <Selo tom="violet">Partilhada</Selo> : null}
          {al.length ? <Selo tom={al.some((x) => x.tom === "bad") ? "bad" : "warn"}>{al.length + (al.length > 1 ? " alertas" : " alerta")}</Selo> : null}
          <Selo tom="neu">Dados de exemplo</Selo>
        </>}
        onClose={aoFechar}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          const volta = origem && origem !== document.body && origem.isConnected ? origem : document.getElementById("frota-h1");
          volta?.focus();
        }}
        header={<>
          <DocInfoGrid items={[
            { label: "Condutor", value: c ? c.nome + (a?.tipo === "pontual" ? " · reserva" : "") : "—" },
            { label: "Km atuais", value: fKm(v.km) },
            { label: "Próxima revisão", value: fKm(r.nextKm) },
            { label: "Custo por km", value: k != null ? fEur(k) : "—" },
          ]} />
          <DocSheetTabs label="Ficha da viatura" idBase={ID_BASE} tabs={abas} value={atual} onChange={mudarAba} />
        </>}
        footer={{
          left: <>
            {ativa(v) ? <BotaoFrota escrita aoClicar={() => dlg("estado", { v: v.id })}>Mudar estado</BotaoFrota> : null}
            {a && a.tipo === "permanente" ? <BotaoFrota escrita aoClicar={() => dlg("devolver", { a: a.id })}>Devolver</BotaoFrota> : null}
          </>,
          right: ativa(v) ? <>
            <BotaoFrota escrita icone={Fuel} aoClicar={() => dlg("abastecer", { v: v.id })}>{v.comb === "Elétrico" ? "Registar carregamento" : "Registar abastecimento"}</BotaoFrota>
            <BotaoFrota escrita icone={TriangleAlert} aoClicar={() => dlg("ocorrencia", { v: v.id })}>Ocorrência</BotaoFrota>
            {/* os km registam-se sempre (também numa viatura livre); com a viatura livre, a ação principal é Atribuir */}
            <BotaoFrota variant={podeAtrib ? "outline" : "default"} escrita icone={Gauge} aoClicar={() => dlg("km", { v: v.id })}>Registar km</BotaoFrota>
            {podeAtrib ? <BotaoFrota variant="default" escrita icone={KeyRound} aoClicar={() => dlg("atribuir", { v: v.id })}>Atribuir</BotaoFrota> : null}
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
