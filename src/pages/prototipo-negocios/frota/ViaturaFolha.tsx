// A ficha da viatura (folhaHtml do protótipo HTML), numa folha lateral com 8 abas: Resumo, Atribuições, Manutenção, Custos, Ocorrências,
// Documentos, Stock na carrinha (só as que são armazém móvel: lido do Inventário, com "Pedir reposição" a criar transferências reais) e Ligações
// (a agenda e as ordens das obras do protótipo, o recurso de agenda e o armazém móvel). O rodapé tem as ações do perfil.
import { useRef, useState } from "react";
import { CalendarDays, CircleAlert, FileText, Fuel, Gauge, Info, KeyRound, Package, PackagePlus, TriangleAlert, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { AbasFolha } from "../inventario/DialogosInv";
import { Selo } from "../inventario/pecasInv";
import { fData, fEur, fKm, fNum, soma } from "./base";
import { AvisoFrota } from "./DialogosFrota";
import { useCtxFrota, type AbaFolha } from "./ctxFrota";
import { Btn, LigObra, Placa, Prog, SeloEstado, Src, VazioF } from "./pecasFrota";
import { pedidosPendentes, pedirReposicao } from "./pontesInv";
import { abaixoMin, alertas, atribEm, ativa, compromissos, condutor, consumo, custoKm, custoTotal, custosV, kmPeriodo, pessoa, revisao, textoData, tomSelo, vencimentos } from "./regras";
import { TOM_OCORR } from "./OcorrenciasFrota";
import { OperacoesViatura } from "./OperacoesViatura";
import type { Viatura } from "./tipos";

const Dl = ({ itens }: { itens: readonly (readonly [string, React.ReactNode])[] }) => (
  <div className="dl">{itens.map(([l, x]) => <div key={l}><span className="lbl">{l}</span>{x}</div>)}</div>
);

function Resumo({ v }: { v: Viatura }) {
  const { F, stock } = useCtxFrota();
  const al = alertas(F, v, stock(v.id)), r = revisao(v), k = custoKm(F, v.id), c = consumo(F, v.id);
  return (
    <>
      {al.length ? <div className="stack" style={{ gap: 6 }}>{al.map((x) => <div key={x.txt} className={cn("alert", x.tom)}>{x.tom === "bad" ? <CircleAlert className="ic" aria-hidden="true" /> : <TriangleAlert className="ic" aria-hidden="true" />}<span>{x.txt}</span></div>)}</div> : null}
      {v.motivo ? <div className="alert neu"><Info className="ic" aria-hidden="true" /><span>{v.motivo}</span></div> : null}
      <div className="card pad">
        <Dl itens={[["Marca e modelo", `${v.marca} ${v.modelo}`], ["Tipo", v.tipo], ["Combustível", v.comb], ["Ano", String(v.ano)],
          ["Posse", v.posse + (v.renda ? ` · ${fEur(v.renda)}/mês até ${fData(v.fimContrato)}` : "")], ["Carta exigida", "Categoria " + v.cat], ["Centro de custo", v.centro],
          ["Seguro", `${v.seguradora}${v.apolice !== "—" ? " · " + v.apolice : ""}`], ["Uso pessoal", v.usoPessoal ? "Autorizado (tributação em sede de IRS)" : "Não"],
          ["Armazém móvel", v.armazem ? "Carrinha " + v.mat : "Não tem"]]} />
      </div>
      <div className="two">
        <div className="card pad">
          <h3 style={{ marginBottom: 8 }}>Vencimentos</h3>
          <div className="vlist">{vencimentos(v).map((x) => (
            <div key={x.k}><span>{x.tipo}<br /><small className="muted">{x.data ? fData(x.data) : "Isento"}</small></span>{x.data ? <Selo tom={tomSelo(x.data)}>{textoData(x.data)}</Selo> : <Selo tom="neu">Isento</Selo>}</div>
          ))}</div>
        </div>
        <div className="card pad">
          <h3 style={{ marginBottom: 8 }}>Próxima revisão</h3>
          <p><b>{fKm(r.nextKm)}</b> ou até <b>{fData(r.nextData)}</b></p>
          <Prog tom={r.tom} pct={r.pct} largo />
          <Selo tom={r.tom}>{r.txt}</Selo>
          <h3 style={{ margin: "14px 0 6px" }}>No período</h3>
          <div className="vlist">
            <div><span>Km percorridos</span><b>{fNum(kmPeriodo(F, v.id))}</b></div>
            <div><span>Custo total</span><b>{fEur(custoTotal(F, v.id))}</b></div>
            <div><span>Custo por km</span><b>{k != null ? fEur(k) : "—"}</b></div>
            {c ? <div><span>Consumo médio</span><b>{fNum(c, 1)} {v.comb === "Elétrico" ? "kWh" : "L"}/100 km</b></div> : null}
          </div>
        </div>
      </div>
    </>
  );
}

function Corpo({ v, aba }: { v: Viatura; aba: AbaFolha }) {
  const ctx = useCtxFrota();
  const { F, inv, stock, agirInv, irAgenda, irInventario } = ctx;
  if (aba === "resumo") return <Resumo v={v} />;
  if (aba === "atrib") {
    const l = F.atrib.filter((x) => x.vid === v.id).sort((x, y) => y.ini.localeCompare(x.ini));
    return (
      <div className="tw"><table className="min-560">
        <thead><tr><th>Condutor</th><th>Tipo</th><th>Período</th><th className="num">Km</th><th>Motivo</th></tr></thead>
        <tbody>{l.length ? l.map((x) => (
          <tr key={x.id}><td>{pessoa(F, x.pid)?.nome}</td><td>{x.tipo === "pontual" ? <Selo tom="info">Pontual</Selo> : <Selo tom="violet">Permanente</Selo>}</td>
            <td>{fData(x.ini)} → {x.fim ? fData(x.fim) : "sem fim"}</td><td className="num">{x.kmIni != null ? fNum(x.kmIni) : "—"}{x.kmFim != null ? " → " + fNum(x.kmFim) : ""}</td>
            <td>{x.obra ? <LigObra id={x.obra}>{x.nota}</LigObra> : x.nota ?? ""}</td></tr>
        )) : <tr><td colSpan={5}><VazioF titulo="Sem atribuições" texto="Esta viatura nunca foi entregue a ninguém." /></td></tr>}</tbody>
      </table></div>
    );
  }
  if (aba === "manut") {
    const l = F.manut.filter((x) => x.vid === v.id).sort((x, y) => y.data.localeCompare(x.data));
    return (
      <>
        <p className="muted">Regra: revisão a cada {fKm(v.rev.cadaKm)} ou {v.rev.cadaMeses} meses. Última aos {fKm(v.rev.ultKm)} em {fData(v.rev.ultData)}.</p>
        <div className="tw"><table className="min-560">
          <thead><tr><th>Data</th><th>Intervenção</th><th>Oficina</th><th>Estado</th><th className="num">Valor</th></tr></thead>
          <tbody>{l.length ? l.map((m) => (
            <tr key={m.id}><td>{fData(m.data)}</td><td>{m.tipo}</td><td>{m.oficina}</td><td><Selo tom={m.estado === "concluída" ? "ok" : m.estado === "em curso" ? "warn" : "info"}>{m.estado}</Selo></td><td className="num">{fEur(m.valor)}</td></tr>
          )) : <tr><td colSpan={5}><VazioF titulo="Sem intervenções registadas" texto="Agenda a próxima revisão a partir daqui." /></td></tr>}</tbody>
        </table></div>
      </>
    );
  }
  if (aba === "custos") {
    const l = [...custosV(F, v.id)].sort((x, y) => y.data.localeCompare(x.data));
    return (
      <>
        <div className="tw"><table className="min-560">
          <thead><tr><th>Data</th><th>Tipo</th><th>Origem</th><th className="num">Km</th><th className="num">Valor</th></tr></thead>
          <tbody>{l.length ? l.map((x) => (
            <tr key={x.id}><td>{fData(x.data)}</td><td>{x.tipo}{x.qtd ? <><br /><small className="muted">{fNum(x.qtd, 1)} {x.un}</small></> : null}</td><td>{x.fonte}</td><td className="num">{x.km ? fNum(x.km) : "—"}</td><td className="num">{fEur(x.valor)}</td></tr>
          )) : <tr><td colSpan={5}><VazioF titulo="Sem custos" texto="Ainda não há despesas desta viatura." /></td></tr>}</tbody>
        </table></div>
        <div className="tbl-foot"><span>{l.length} lançamento(s)</span><b>Total {fEur(soma(l, (x) => x.valor))}</b></div>
      </>
    );
  }
  if (aba === "ocorr") {
    const l = F.ocorr.filter((x) => x.vid === v.id);
    return l.length ? (
      <div className="stack">{l.map((o) => (
        <div key={o.id} className="card pad">
          <div className="row between"><b>{o.tipo} · {fData(o.quando.slice(0, 10))} {o.quando.slice(11)}</b><Selo tom={TOM_OCORR[o.estado] ?? "warn"}>{o.estado}</Selo></div>
          <p>{o.desc}</p><small className="muted">{o.local}{o.pid ? " · " + pessoa(F, o.pid)?.nome : ""}</small>
        </div>
      ))}</div>
    ) : <VazioF titulo="Sem ocorrências" texto="Nenhuma multa, sinistro ou avaria registada." />;
  }
  if (aba === "docs") {
    const docs: [string, string][] = [["Documento único automóvel (DUA)", "Permanente"], ["Apólice de seguro", v.venc.seguro ? "Válida até " + fData(v.venc.seguro) : "—"],
      ["Certificado de inspeção", v.venc.ipo ? "Válido até " + fData(v.venc.ipo) : "—"], ["Comprovativo IUC", v.venc.iuc ? "Até " + fData(v.venc.iuc) : "Isento (elétrico)"], ["Carta verde", "Com a apólice"],
      ...(v.fimContrato ? [["Contrato de " + v.posse.toLowerCase(), "Até " + fData(v.fimContrato)] as [string, string]] : [])];
    return (
      <>
        <div className="card pad vlist">{docs.map(([t, d]) => (
          <div key={t}><span className="row" style={{ gap: 8 }}><FileText className="ic" aria-hidden="true" /><span>{t}<br /><small className="muted">{d}</small></span></span>
            <Btn pequeno aoClicar={() => ctx.avisar("Pré-visualização do documento (protótipo).")}>Abrir</Btn></div>
        ))}</div>
        <Src t="documents (entity_type='vehicle', entity_id) · bucket documents" />
      </>
    );
  }
  if (aba === "stock") {
    const st = stock(v.id), baixo = abaixoMin(st), pend = pedidosPendentes(inv, v.armazemId);
    return (
      <>
        <p className="muted">A carrinha é um armazém do Inventário ({inv.warehouses.find((w) => w.id === v.armazemId)?.name ?? "sem armazém"}). O técnico vê o que leva; a reposição é uma transferência a partir do armazém central.</p>
        <div className="tw"><table className="min-560">
          <thead><tr><th>Ref.</th><th>Artigo</th><th className="num">Na carrinha</th><th className="num">Mínimo</th><th>Estado</th></tr></thead>
          <tbody>{st.length ? st.map((s) => (
            <tr key={s.sku}><td className="mono">{s.sku}</td><td>{s.nome}</td><td className="num">{fNum(s.qty)} {s.un}</td><td className="num">{fNum(s.min)} {s.un}</td>
              <td>{s.qty < s.min ? <Selo tom="warn">{`Repor ${fNum(s.min - s.qty)}`}</Selo> : <Selo tom="ok">OK</Selo>}{pend.some((t) => t.sku === s.sku) ? <> <Selo tom="info">Pedido pendente</Selo></> : null}</td></tr>
          )) : <tr><td colSpan={5}><VazioF titulo="Carrinha vazia" texto="Ainda não há stock neste armazém móvel." /></td></tr>}</tbody>
        </table></div>
        {pend.length ? <p className="muted">Pedidos de transferência pendentes no Inventário: {pend.map((t) => `${t.id} (${t.sku} × ${t.qty})`).join(", ")}.</p> : null}
        <div className="row">
          <Btn icone={PackagePlus} acao="stock" aoClicar={() => v.armazemId && agirInv((d) => pedirReposicao(d, v.armazemId!),
            (ids) => `Pedido de transferência criado: Armazém central → carrinha ${v.mat} (${ids.length} artigo${ids.length > 1 ? "s" : ""}: ${ids.join(", ")}).`)}>
            Pedir reposição ao armazém central{baixo.length ? ` (${baixo.length})` : ""}
          </Btn>
          {irInventario ? <Btn icone={Package} aoClicar={irInventario}>Ver no Inventário</Btn> : null}
        </div>
        <Src t="warehouses (viatura) · get_effective_stock · rpc_register_stock_transfer" />
      </>
    );
  }
  if (aba === "hist") {
    // o histórico da viatura: as entradas do log de atividade (registar() em acoes.ts), mais recentes primeiro
    const l = (F.log ?? []).filter((e) => e.vid === v.id);
    return l.length ? (
      <div className="tw"><table className="min-560">
        <thead><tr><th>Quando</th><th>Quem</th><th>O quê</th><th>Detalhe</th></tr></thead>
        <tbody>{l.map((e, i) => (
          <tr key={e.at + i}><td>{new Date(e.at).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}</td><td>{e.quem ?? "—"}</td>
            <td>{e.acao ? <><Selo tom="neu">{e.acao}</Selo><br /></> : null}{e.t}</td><td><small className="muted">{e.det ?? ""}</small></td></tr>
        ))}</tbody>
      </table></div>
    ) : <VazioF titulo="Sem atividade" texto="Cada ação feita nesta viatura fica aqui: quando, quem e o quê." />;
  }
  // ligações: a agenda (tarefas das obras do protótipo, visitas, manutenções), o recurso de agenda e o armazém móvel
  const ag = compromissos(F, v.id);
  const arm = inv.warehouses.find((w) => w.id === v.armazemId);
  return (
    <div className="stack">
      <div className="card pad">
        <div className="row between" style={{ marginBottom: 8 }}><h3><CalendarDays className="ic" aria-hidden="true" /> Agenda e ordens de trabalho</h3>
          {irAgenda && v.agenda !== false ? <Btn pequeno icone={CalendarDays} aoClicar={irAgenda}>Ver na Agenda</Btn> : null}</div>
        <div className="vlist">{ag.length ? ag.map((x, i) => (
          <div key={i}><span><span className="mono">{x.obra ? <LigObra id={x.obra}>{x.ref}</LigObra> : x.ref}</span> · {x.desc}<br /><small className="muted">{fData(x.data)} {x.hora !== "—" ? x.hora : ""}{x.pid ? " · " + (pessoa(F, x.pid)?.nome ?? "") : ""}</small></span></div>
        )) : <div className="muted">Nada agendado com esta viatura.</div>}</div>
        <Src t="schedule_items · ops_ordem (viatura_id nova)" />
      </div>
      <OperacoesViatura v={v} />
      <div className="card pad">
        <Dl itens={[["Recurso de agenda", v.agenda === false ? "Não é recurso da agenda" : `${v.recursoAgenda ? v.recursoAgenda + " · " : ""}${v.mat} · tipo veículo`], ["Armazém móvel", arm ? `${arm.name} (${arm.code})` : "—"],
          ["Centro de custo", v.centro], ["Seguradora (fornecedor)", v.seguradora]]} />
      </div>
    </div>
  );
}

export function ViaturaFolha({ vid, aba, mudarAba, aoFechar }: { vid: string; aba: AbaFolha; mudarAba: (a: AbaFolha) => void; aoFechar: () => void }) {
  const { F, fontes, stock, dlg } = useCtxFrota();
  const conteudo = useRef<HTMLDivElement>(null);
  // o elemento que tinha o foco ao abrir a ficha (a linha, o cartão, o resultado da pesquisa…): recebe-o de volta ao fechar
  const [origem] = useState<HTMLElement | null>(() => (typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null));
  const v = F.viaturas.find((x) => x.id === vid);
  if (!v) return null;
  const c = condutor(F, v.id), a = atribEm(F, v.id), r = revisao(v), al = alertas(F, v, stock(v.id)), k = custoKm(F, v.id);
  const abas: [AbaFolha, string][] = [["resumo", "Resumo"], ["atrib", "Atribuições"], ["manut", "Manutenção"], ["custos", "Custos"], ["ocorr", "Ocorrências"], ["docs", "Documentos"],
    ...(v.armazem ? [["stock", "Stock na carrinha"] as [AbaFolha, string]] : []), ["lig", "Ligações"], ["hist", "Histórico"]];
  const atual = abas.some((x) => x[0] === aba) ? aba : "resumo";
  const podeAtrib = v.estado === "ativa" && !a;
  return (
    <Sheet open onOpenChange={(o) => { if (!o) aoFechar(); }}>
      <SheetContent ref={conteudo} side="right" className={cn("inv-root sheet flex flex-col gap-0 border-0 p-0 sm:!max-w-none [&>button.absolute]:hidden", fontes && "show-src")}
        onOpenAutoFocus={(e) => { e.preventDefault(); conteudo.current?.querySelector<HTMLElement>("h2[tabindex='-1']")?.focus(); }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          const volta = origem && origem !== document.body && origem.isConnected ? origem : document.getElementById("frota-h1");
          volta?.focus();
        }}>
        <div className="sh-head">
          <div className="sh-top">
            <div style={{ minWidth: 0 }}>
              <SheetDescription className="crumbs">Frota › Viaturas</SheetDescription>
              <div className="row" style={{ marginTop: 4 }}><Placa mat={v.mat} grande /><SheetTitle tabIndex={-1} style={{ outline: "none" }}>{v.marca} {v.modelo}</SheetTitle></div>
              <div className="row" style={{ marginTop: 8 }}>
                <SeloEstado v={v} />{v.pool ? <Selo tom="violet">Partilhada</Selo> : null}
                {al.length ? <Selo tom={al.some((x) => x.tom === "bad") ? "bad" : "warn"}>{al.length + " alertas"}</Selo> : null}
              </div>
            </div>
            <button type="button" className="btn btn-ghost btn-icon" onClick={aoFechar} aria-label="Fechar"><X className="ic" aria-hidden="true" /></button>
          </div>
          <div className="sh-info">
            <div><span className="lbl">Condutor</span>{c ? c.nome + (a?.tipo === "pontual" ? " · reserva" : "") : "—"}</div>
            <div><span className="lbl">Km atuais</span>{fKm(v.km)}</div>
            <div><span className="lbl">Próxima revisão</span>{fKm(r.nextKm)}</div>
            <div><span className="lbl">Custo por km</span>{k != null ? fEur(k) : "—"}</div>
          </div>
          <AbasFolha rotulo="Ficha da viatura" abas={abas} atual={atual} escolher={mudarAba} />
        </div>
        <div className="sh-body"><div className="stack"><AvisoFrota /><Corpo v={v} aba={atual} /></div></div>
        <div className="sh-foot">
          <div className="left">
            {ativa(v) ? <Btn acao="estado" aoClicar={() => dlg("estado", { v: v.id })}>Mudar estado</Btn> : null}
            {a && a.tipo === "permanente" ? <Btn acao="atribuir" aoClicar={() => dlg("devolver", { a: a.id })}>Devolver</Btn> : null}
          </div>
          {ativa(v) ? <>
            <Btn icone={Fuel} acao="abastecer" aoClicar={() => dlg("abastecer", { v: v.id })}>{v.comb === "Elétrico" ? "Registar carregamento" : "Registar abastecimento"}</Btn>
            <Btn icone={TriangleAlert} acao="ocorrencia" aoClicar={() => dlg("ocorrencia", { v: v.id })}>Ocorrência</Btn>
            {podeAtrib ? <Btn primario icone={KeyRound} acao="atribuir" aoClicar={() => dlg("atribuir", { v: v.id })}>Atribuir</Btn>
              : <Btn primario icone={Gauge} acao="km" aoClicar={() => dlg("km", { v: v.id })}>Registar km</Btn>}
          </> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
