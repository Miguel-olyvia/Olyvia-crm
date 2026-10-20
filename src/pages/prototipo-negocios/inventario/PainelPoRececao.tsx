// Armazém › Receção › "Dar entrada" (19/10): o painel lateral de uma encomenda a fornecedor, em modo resumo por omissão. Cabeçalho (fornecedor,
// selo do portal, cliente e contrato), "Entra em [armazém]" (muda-se aqui), "Vai entrar N un (L linhas)" com a pré-visualização de cada linha
// (repartirRececao: reservadas para a EC / stock / misto) e a nota de transferência se a EC expede de outro armazém. A guia do fornecedor é opcional:
// escolhe-se uma aberta do fornecedor ou escreve-se o nº de uma nova (guardarGuia, antes de receber). "✓ Receber tudo · N un" recebe o que falta
// com receberLinhas (receber.ts), sem mudar nada das regras. "Veio diferente? Conferir linha a linha" abre a tabela (máximo = o que falta) e pede
// o motivo da diferença, que fica no histórico da PO (e da guia); "Não vou receber o resto" é o ReceberDialogo de sempre. Depois de receber, o
// painel mostra o que entrou, "Ver EC-…" e as outras encomendas por receber do mesmo fornecedor. Fechar limpa a Receção (limparRececao).
import { useState } from "react";
import { ArrowRightLeft, Check as Visto, ScanLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { HOJE, agora, ecPorId, falhar, guiaPorId, nomeArm, nomeForn, nomeProd, poPorId } from "./base";
import { useCtxInv } from "./ctxInv";
import { Folha } from "./DialogosInv";
import { SeloNova, SeloRec } from "./EncomendasPorReceber";
import { guardarGuia } from "./guias";
import { definirFilaRececao, lerFilaRececao } from "./loja";
import { opcoesArmazens } from "./opcoes";
import { Nota, Peq, Pri, Sec, Selo } from "./pecasInv";
import { can, porqueNao } from "./perfil";
import { poOpen, poRecebivel, poRem, poStatus, poStatusLabel, poUnits } from "./po";
import { receberLinhas, type ResultadoRececao } from "./receber";
import { ReceberDialogo } from "./ReceberDialogo";
import { abrirRececaoDaPo, fixarRececao, limparRececao } from "./rececao";
import { faltaPo, novaConfirmacao, ordenarRececao, textoFalta } from "./rececaoLista";
import { repartirRececao } from "./ec";
import type { Inventario, Po, PoLinha } from "./tipos";

/** "Entrou no Armazém Central · 8 un reservadas para Tiago Almeida · 2 un para stock." */
export function textoEntrada(db: Inventario, p: Po, wh: string, out: ResultadoRececao): string {
  const ec = out.res.reduce((a, x) => a + x.toEC, 0), st = out.res.reduce((a, x) => a + x.toStock, 0);
  const para = p.origin.client || p.origin.ref || out.res.find((x) => x.ec)?.ec || "a encomenda de cliente";
  return [`Entrou no ${nomeArm(db, wh)}`, ec ? `${ec} un reservadas para ${para}` : "", st ? `${st} un para stock` : ""].filter(Boolean).join(" · ") + ".";
}

/** Os motivos de uma conferência com diferença (ficam no histórico da PO e da guia). */
export const MOTIVOS_DIFERENCA = ["Veio menos", "Danificado (não dou entrada)", "Outro"] as const;
type MotivoDif = "" | (typeof MOTIVOS_DIFERENCA)[number];

/** A pré-visualização de uma linha: para onde vão as unidades (a EC e/ou o stock) e se a EC expede de outro armazém. */
function Previsao({ db, l, qty, wh, alvo }: { db: Inventario; l: PoLinha; qty: number; wh: string; alvo: boolean }) {
  const sp = repartirRececao(db, l, qty);
  const e = sp.ec ? ecPorId(db, sp.ec) : undefined;
  return (
    <li className={cn("rec-prev-l", alvo && "rec-alvo")}>
      <span><b>{qty}×</b> {nomeProd(db, l.sku)} <small className="muted mono">{l.sku}</small></span>
      <span className="split">
        {sp.toEC ? <span className="to-ec">→ {sp.toEC} reservadas para {e?.client ?? sp.ec} ({sp.ec})</span> : null}
        {sp.toStock ? <span className="to-st">→ {sp.toStock} para stock</span> : null}
        {sp.inactive ? <Selo tom="warn">EC {sp.ec} inativa: vai para stock</Selo> : null}
      </span>
      {sp.toEC > 0 && e && e.wh !== wh ? <small className="muted"><ArrowRightLeft className="ic sm" aria-hidden="true" /> {sp.toEC} un para {e.id} seguem para {nomeArm(db, e.wh)}: é criado um pedido de transferência.</small> : null}
    </li>
  );
}

interface Feito { texto: string; ecs: string[] }

function Corpo({ p, destaque, fechar }: { p: Po; destaque?: string; fechar: () => void }) {
  const { db, agir, abrir } = useCtxInv();
  const rc = db.rc;
  const g0 = rc.guia ? guiaPorId(db, rc.guia) : undefined;
  const [guia, setGuia] = useState(g0 && g0.sup === p.sup && g0.state === "open" ? g0.id : "");
  // SÓ PROTÓTIPO (20/10): com a guia de remessa de uma expedição do portal, o que vem é o que o fornecedor expediu nessa guia (menos o já recebido com ela)
  const expedicaoDe = (x: Po, gtxt: string) => (gtxt.trim() ? (x.portal.expedicoes ?? []).find((e) => e.guia.toLowerCase() === gtxt.trim().toLowerCase()) : undefined);
  const vemDe = (x: Po, gtxt: string) => (l: PoLinha): number => {
    const e = expedicaoDe(x, gtxt);
    if (!e) return Math.max(0, poRem(l));
    const q = e.linhas.filter((y) => y.lineId === l.id).reduce((a, y) => a + y.qty, 0);
    const ja = x.receipts.filter((r) => r.state === "Ativa" && r.type === "Receção" && r.lineId === l.id && (r.guia ?? "").toLowerCase() === e.guia.toLowerCase()).reduce((a, r) => a + r.qty, 0);
    return Math.max(0, Math.min(poRem(l), q - ja));
  };
  const exped = expedicaoDe(p, guia);
  const vem = vemDe(p, guia);
  const faltaDe = (x: Po, gtxt = "") => Object.fromEntries(x.lines.map((l) => [l.id, String(vemDe(x, gtxt)(l))]));
  const [qtd, setQtd] = useState<Record<string, string>>(() => faltaDe(p, guia));
  const [conferir, setConferir] = useState(false);
  const [motivo, setMotivo] = useState<MotivoDif>("");
  const [nota, setNota] = useState("");
  const [resto, setResto] = useState(false);
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState<Feito | null>(null);
  const pode = can("inventory.receive") && poRecebivel(p);
  const guias = db.guias.filter((g) => g.state === "open" && g.sup === p.sup);
  const guiaNova = !!guia.trim() && !db.guias.some((g) => g.sup === p.sup && g.id.toLowerCase() === guia.trim().toLowerCase());
  const fila = lerFilaRececao();
  const abertas = p.lines.filter((l) => poRem(l) > 0);
  // o que vai entrar: tudo o que falta (resumo) ou o que se escreveu na conferência
  const quanto = (l: PoLinha): number => { if (!conferir) return vem(l); const n = Number(qtd[l.id] ?? ""); return Number.isFinite(n) && n > 0 ? n : 0; };
  const total = abertas.reduce((a, l) => a + quanto(l), 0), nLinhas = abertas.filter((l) => quanto(l) > 0).length;
  const diferencas = conferir ? abertas.filter((l) => quanto(l) < vem(l)) : [];
  const mais = ordenarRececao(db.pos.filter((x) => x.id !== p.id && x.sup === p.sup && poRecebivel(x)));
  const mudarQtd = (l: PoLinha, v: string): void => { setErro(""); const n = Number(v); setQtd((x) => ({ ...x, [l.id]: v !== "" && Number.isFinite(n) && n > poRem(l) ? String(poRem(l)) : v })); };
  const passo = (l: PoLinha, d: number): void => { const n = Math.max(0, Math.min(poRem(l), (Number(qtd[l.id]) || 0) + d)); mudarQtd(l, String(n)); };

  const confirmar = (): void => {
    const itens: { lineId: string; qty: number }[] = [];
    for (const l of abertas) {
      const v = conferir ? qtd[l.id] ?? "" : String(vem(l)), n = Number(v);
      if (v === "" || n === 0) continue;
      if (!Number.isInteger(n) || n < 0) { setErro(`Quantidades inteiras: ${nomeProd(db, l.sku)}.`); return; }
      itens.push({ lineId: l.id, qty: n });
    }
    if (!itens.length) { setErro("Indique pelo menos uma quantidade a receber."); return; }
    if (diferencas.length && !motivo) { setErro("Veio diferente: escolha o motivo da diferença."); return; }
    if (diferencas.length && motivo === "Outro" && nota.trim().length < 3) { setErro("Com motivo “Outro”, escreva uma nota (mínimo 3 caracteres)."); return; }
    const wh = rc.wh, gtxt = guia.trim();
    const dif = diferencas.map((l) => `${l.sku} ${quanto(l)} de ${vem(l)}`).join(", ");
    const r = agir((d) => {
      const po = poPorId(d, p.id) ?? falhar("Encomenda inexistente: " + p.id);
      // a guia: uma aberta do fornecedor ou uma nova (fica com o que se recebe como anunciado)
      let gid: string | null = null;
      if (gtxt) {
        const g = d.guias.find((x) => x.sup === po.sup && x.id.toLowerCase() === gtxt.toLowerCase());
        gid = g ? g.id : guardarGuia(d, { no: gtxt, sup: po.sup, wh, date: HOJE, ann: itens.map((i) => ({ sku: po.lines.find((l) => l.id === i.lineId)?.sku ?? "", qty: i.qty })) }).id;
      }
      const out = receberLinhas(d, po, itens, wh, gid);
      if (dif) {
        const t = `Conferência na receção: ${motivo}${nota.trim() ? " — " + nota.trim() : ""} (${dif})`;
        po.log.push({ at: agora(d), t });
        if (gid) guiaPorId(d, gid)?.history.push({ at: agora(d), t: `${po.id} · ${t}` });
      }
      // com "Receber tudo" (fila do bloco) passa à seguinte que ainda se recebe; senão o painel fica a mostrar o que entrou
      const seguintes = lerFilaRececao().filter((x) => x !== po.id);
      const prox = seguintes.map((x) => poPorId(d, x)).find((x): x is Po => !!x && poRecebivel(x));
      definirFilaRececao(prox ? seguintes.slice(seguintes.indexOf(prox.id) + 1) : []);
      if (prox) abrirRececaoDaPo(d, prox); else if (gid) fixarRececao(d, { guia: gid });
      return { out, prox: !!prox };
    }, (v) => textoEntrada(db, p, wh, v.out));
    if (!r.ok) { setErro(r.erro); return; }
    if (!r.valor.prox) setFeito({ texto: textoEntrada(db, p, wh, r.valor.out), ecs: [...new Set(r.valor.out.res.filter((x) => x.toEC && x.ec).map((x) => x.ec as string))] });
  };
  const outra = (x: Po): void => { agir((d) => abrirRececaoDaPo(d, poPorId(d, x.id) as Po)); };

  const selos = <>
    <SeloRec p={p} />{novaConfirmacao(p) ? <SeloNova /> : null}
    {p.status !== "pending" ? <Selo tom="info">{poStatusLabel[poStatus(p)]}</Selo> : null}
    {p.origin.client ? <Selo tom="violet">{`${p.origin.client} · ${p.origin.ref ?? p.origin.ec}`}</Selo> : <Selo tom="neu">Para stock</Selo>}
  </>;
  const rodape = feito
    ? <Pri onClick={fechar}>Concluir</Pri>
    : <><Sec onClick={fechar}>Cancelar</Sec>
      <Pri className="rec-receber" disabled={!pode} title={pode ? undefined : porqueNao("inventory.receive")} onClick={confirmar}>
        <Visto className="ic" aria-hidden="true" />{conferir ? `Confirmar entrada · ${total} un` : `Receber tudo · ${total} un`}
      </Pri></>;

  return (
    <Folha aberta aoFechar={fechar} classe="rec-painel" chave={p.id} titulo={`Dar entrada · ${p.id}`} subtitulo={`Armazém › Receção · ${nomeForn(db, p.sup)}`} selos={selos} rodape={rodape}>
      {feito ? (
        <div className="stack rec-feito" style={{ gap: 10 }}>
          <Nota tom="ok">{feito.texto}</Nota>
          {feito.ecs.length > 0 && <div className="row">{feito.ecs.map((ec) => <Sec key={ec} onClick={() => { fechar(); abrir({ t: "ec", id: ec }); }}>Ver {ec}</Sec>)}</div>}
          {poRecebivel(p) && <div className="row"><span>Ainda falta {textoFalta(p)} nesta encomenda.</span><Peq onClick={() => { setFeito(null); setConferir(false); setMotivo(""); setNota(""); setGuia(""); setQtd(faltaDe(p)); }}>Dar entrada ao que falta</Peq></div>}
          {mais.length > 0 && (
            <div role="group" aria-label={`Mais da ${nomeForn(db, p.sup)}`} className="stack" style={{ gap: 6 }}>
              <b>Mais da {nomeForn(db, p.sup)}:</b>
              {mais.map((x) => <div key={x.id} className="row between rec-mais"><span><b className="mono">{x.id}</b> ({faltaPo(x).un} un) <SeloRec p={x} /></span><Peq aria-label={`Dar entrada ${x.id}`} onClick={() => outra(x)}>Dar entrada</Peq></div>)}
            </div>
          )}
        </div>
      ) : (
        <>
          {fila.length > 0 && <Nota tom="info">Receber tudo: depois desta, {fila.length === 1 ? "falta 1 encomenda" : `faltam ${fila.length} encomendas`} deste bloco ({fila.join(", ")}).</Nota>}
          {p.status === "pending" && <Nota tom="warn">{p.id} ainda está pendente (não confirmada ao fornecedor). Pode dar entrada; passa a Encomendado, sem envio ao fornecedor.</Nota>}
          {exped && <Nota tom="info">Guia de remessa {exped.guia} do fornecedor (expedida a {exped.data.split("-").reverse().join("/")}{exped.transportador ? ` · ${exped.transportador}` : ""}): as quantidades são as que vêm nesta guia.</Nota>}
          {destaque && abertas.some((l) => l.sku === destaque) && <Nota tom="info"><ScanLine className="ic sm" aria-hidden="true" /> Lido: {nomeProd(db, destaque)} (linha destacada).</Nota>}
          <div className="fg" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
            <label className="fl">Entra em
              <select value={rc.wh} disabled={!pode} onChange={(e) => agir((d) => fixarRececao(d, { wh: e.target.value }))}>{opcoesArmazens(db, true).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
            </label>
            <label className="fl">Guia do fornecedor (opcional)
              <input list={`rec-guias-${p.id}`} value={guia} disabled={!pode} placeholder="Escolher ou escrever o nº" autoComplete="off" onChange={(e) => { setErro(""); setGuia(e.target.value); }} />
              <datalist id={`rec-guias-${p.id}`}>{guias.map((g) => <option key={g.id} value={g.id} />)}</datalist>
              <small className="help">{guiaNova ? "Guia nova: fica criada ao receber." : guias.length ? `${guias.length} ${guias.length === 1 ? "guia aberta" : "guias abertas"} deste fornecedor.` : "Sem guias abertas deste fornecedor."}</small>
            </label>
          </div>
          <div>
            <b>Vai entrar {total} un ({nLinhas} {nLinhas === 1 ? "linha" : "linhas"})</b>
            <ul className="rec-prev">{abertas.filter((l) => quanto(l) > 0).map((l) => <Previsao key={l.id} db={db} l={l} qty={quanto(l)} wh={rc.wh} alvo={l.sku === destaque} />)}</ul>
          </div>
          {!conferir ? (
            pode ? <button type="button" className="link" onClick={() => setConferir(true)}>Veio diferente? Conferir linha a linha</button> : null
          ) : (
            <>
              <div className="tw"><table className="min-560 rec-conf">
                <caption className="sr">Conferir linha a linha: o que veio de cada linha (máximo = o que falta).</caption>
                <thead><tr><th>Produto</th><th className="num">Pedido</th><th className="num">Recebido</th><th className="num">Falta</th><th className="num">Dar entrada</th></tr></thead>
                <tbody>{p.lines.map((l) => (
                  <tr key={l.id} className={cn(l.sku === destaque && "rec-alvo")}><td data-rot="Produto">{nomeProd(db, l.sku)} <small className="muted mono">{l.sku}</small>{l.ec ? <><br /><small className="muted">reserva para {l.ec}</small></> : null}</td>
                    <td className="num" data-rot="Pedido">{poUnits(l) - l.cancelled}</td><td className="num" data-rot="Recebido">{l.recv}</td><td className="num" data-rot="Falta">{poRem(l)}</td>
                    <td className="num" data-rot="Dar entrada"><span className="stepper rec-stepper">
                      <button type="button" aria-label={`Menos: ${nomeProd(db, l.sku)}`} disabled={!pode || poRem(l) <= 0} onClick={() => passo(l, -1)}>−</button>
                      <input type="number" min={0} max={poRem(l)} step={1} inputMode="numeric" aria-label={`Dar entrada: ${nomeProd(db, l.sku)}`} disabled={!pode || poRem(l) <= 0}
                        value={qtd[l.id] ?? ""} onChange={(e) => mudarQtd(l, e.target.value)} />
                      <button type="button" aria-label={`Mais: ${nomeProd(db, l.sku)}`} disabled={!pode || poRem(l) <= 0} onClick={() => passo(l, 1)}>+</button>
                    </span></td></tr>
                ))}</tbody>
              </table></div>
              <p className="muted" style={{ fontSize: 12.5 }}>Máximo = o que falta. Excesso: registe à parte (não entra nesta encomenda).</p>
              {diferencas.length > 0 && (
                <div className="fg" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
                  <label className="fl">Porque veio diferente? <b className="req" aria-hidden="true">*</b>
                    <select value={motivo} onChange={(e) => { setErro(""); setMotivo(e.target.value as MotivoDif); }}><option value="">Escolher…</option>{MOTIVOS_DIFERENCA.map((m) => <option key={m} value={m}>{m}</option>)}</select>
                  </label>
                  <label className="fl">Nota{motivo === "Outro" ? <> <b className="req" aria-hidden="true">*</b></> : null}
                    <input type="text" value={nota} onChange={(e) => { setErro(""); setNota(e.target.value); }} placeholder={motivo === "Outro" ? "Mínimo 3 caracteres" : "Opcional"} />
                  </label>
                </div>
              )}
              <div className="row">
                <button type="button" className="link" onClick={() => { setConferir(false); setErro(""); }}>Voltar ao resumo (receber tudo)</button>
                {poOpen(p) && <button type="button" className="link" disabled={!can("purchase_orders.manage")} title={can("purchase_orders.manage") ? undefined : porqueNao("purchase_orders.manage")} onClick={() => setResto(true)}>Não vou receber o resto</button>}
              </div>
            </>
          )}
          {erro && <Nota tom="bad" alerta>{erro}</Nota>}
        </>
      )}
      {resto && <ReceberDialogo aberto aoFechar={() => setResto(false)} id={p.id} soResto />}
    </Folha>
  );
}

/** O painel "Dar entrada" da encomenda escolhida na Receção (db.rc.poFilter). Fechar limpa a Receção (fornecedor, guia e PO) e a fila. */
export function PainelPoRececao({ destaque }: { destaque?: string }) {
  const { db, agir } = useCtxInv();
  const p = db.rc.poFilter ? poPorId(db, db.rc.poFilter) : undefined;
  if (!p) return null;
  const fechar = (): void => { definirFilaRececao([]); agir((d) => limparRececao(d)); };
  return <Corpo key={p.id} p={p} destaque={destaque} fechar={fechar} />;
}
