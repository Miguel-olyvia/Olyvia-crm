// O telemóvel da Receção (`.phone` do mockup): ler um código (leitor, teclado ou câmara), escolher armazém, fornecedor e guia, encher o cesto e confirmar.
// Sem permissão `inventory.receive` fica em modo consulta: vê tudo e não regista. Sem rede, as leituras e confirmações ficam em pendentes.
import { useRef, useState } from "react";
import { Camera, Check, FileText, Keyboard, Lock, ScanLine, Truck, Wifi } from "lucide-react";
import { nomeForn, utilizadorAtual, guiaPorId } from "./base";
import { useCtxInv } from "./ctxInv";
import { AprenderDlg, CameraDlg, EscolherProdutoDlg } from "./GuiaDialogo";
import { resumoGuia } from "./guias";
import { opcoesArmazens } from "./opcoes";
import { Ligacao, Rotulo, Selo } from "./pecasInv";
import { can } from "./perfil";
import { Cesto, Pendentes, bloqueio, useRecAcao } from "./RececaoCesto";
import { confirmarCesto, fixarRececao, fornecedorDaRececao, lerCodigo, planoRececao, textoAnunciado } from "./rececao";
import type { Recepcao } from "./tipos";

type Dialogo = { t: "camera" } | { t: "aprender"; k: number } | { t: "varios"; code: string; skus: string[] };

function CartaoGuia({ rc }: { rc: Recepcao }) {
  const { db, abrir } = useCtxInv();
  const g = rc.guia ? guiaPorId(db, rc.guia) : null;
  if (!g) return null;
  const s = resumoGuia(db, g);
  return (
    <div className="cardlet"><h4><FileText className="ic sm" aria-hidden="true" /> {g.id} · {nomeForn(db, g.sup)}</h4>
      <div className="mini">Anunciado {s.annT} · recebido {s.recT} · {textoAnunciado(g)}</div>
      <Ligacao className="mini" aoClicar={() => abrir({ t: "guia", id: g.id })}>Ver guia</Ligacao>
    </div>
  );
}

function Escolhas({ rc, ro, aoNovaGuia }: { rc: Recepcao; ro: boolean; aoNovaGuia: () => void }) {
  const { db } = useCtxInv();
  const correr = useRecAcao();
  const dis = bloqueio(ro);
  // 19/10: o fornecedor não se escolhe à parte (ficava preso de uma receção anterior): vem da guia ou da PO escolhida; sem elas, todos
  const guias = db.guias.filter((x) => x.state === "open");
  const forn = fornecedorDaRececao(db);
  return (
    <>
      <div className="fg" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Rotulo rotulo="Armazém">{(id) => <select id={id} {...dis} value={rc.wh} onChange={(e) => correr((d) => fixarRececao(d, { wh: e.target.value }))}>{opcoesArmazens(db).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>}</Rotulo>
        <div className="fl"><span>Fornecedor</span><span className="rc-forn" style={{ fontWeight: 400, minHeight: 36, display: "flex", alignItems: "center" }}>{forn.sup ? `${nomeForn(db, forn.sup)} (${forn.de === "guia" ? "da guia" : "da " + rc.poFilter})` : "Todos"}</span></div>
        <Rotulo rotulo="Guia (opcional)" className="span2">{(id) => (
          <select id={id} {...dis} value={rc.guia} onChange={(e) => { if (e.target.value === "__new") aoNovaGuia(); else correr((d) => fixarRececao(d, { guia: e.target.value })); }}>
            <option value="">Sem guia</option>{guias.map((x) => <option key={x.id} value={x.id}>{x.id} · {nomeForn(db, x.sup)}</option>)}<option value="__new">+ Nova guia…</option>
          </select>)}</Rotulo>
      </div>
      {rc.poFilter ? <div className="row"><Selo tom="info">Filtrado: {rc.poFilter}</Selo><button type="button" className="btn btn-xs" onClick={() => correr((d) => fixarRececao(d, { poFilter: "" }))}>Tirar filtro</button></div> : null}
    </>
  );
}

function Leitura({ rc, ro, aoCamera, aoVarios }: { rc: Recepcao; ro: boolean; aoCamera: () => void; aoVarios: (code: string, skus: string[]) => void }) {
  const correr = useRecAcao();
  const campo = useRef<HTMLInputElement>(null);
  const dis = bloqueio(ro);
  const ler = (code: string): void => correr((d) => { const r = lerCodigo(d, code); if (r?.t === "varios") { aoVarios(r.code, r.skus); return undefined; } return r?.aviso; });
  const enviar = (): void => { if (!campo.current) return; ler(campo.current.value); campo.current.value = ""; };
  const leitor = rc.mode === "scanner";
  return (
    <div>
      <label className="fl" htmlFor="rc-scan"><span>{leitor ? "Leitor de código de barras" : "Teclado"}: código, ref. ou SKU</span></label>
      <div className="scanbox">
        <input id="rc-scan" ref={campo} {...dis} inputMode={leitor ? "none" : "text"} placeholder="Ex.: 5601234000028 ou PV-450" autoComplete="off" onKeyDown={(e) => { if (e.key === "Enter") enviar(); }} />
        <button type="button" className="btn btn-icon" {...dis} aria-label="Câmara" onClick={aoCamera}><Camera className="ic" aria-hidden="true" /></button>
      </div>
      <div className="row" style={{ marginTop: 6, gap: 6 }}>
        <button type="button" className="btn btn-xs" {...dis} onClick={() => correr((d) => fixarRececao(d, { mode: leitor ? "keyboard" : "scanner" }))}>{leitor ? <Keyboard className="ic sm" aria-hidden="true" /> : <ScanLine className="ic sm" aria-hidden="true" />}{leitor ? "Usar teclado" : "Usar leitor"}</button>
        <button type="button" className="btn btn-xs" {...dis} onClick={enviar}>Adicionar</button>
        <label className="switch" style={{ fontSize: 12 }}><input type="checkbox" checked={!rc.net} onChange={(e) => correr((d) => fixarRececao(d, { net: !e.target.checked }))} /><span className="sw" aria-hidden="true" /><span>Simular falha de rede</span></label>
      </div>
    </div>
  );
}

export function RececaoTelemovel({ aoNovaGuia }: { aoNovaGuia: () => void }) {
  const { db } = useCtxInv();
  const correr = useRecAcao();
  const [dlg, setDlg] = useState<Dialogo | null>(null);
  const rc = db.rc;
  const ro = !can("inventory.receive");
  const plano = planoRececao(db);
  const tot = rc.basket.reduce((a, b) => a + b.qty, 0);
  const bloqueado = ro || !rc.basket.length || plano.errors.length > 0 || (plano.warns.length > 0 && !rc.ack);
  const porque = ro ? "Modo consulta: requer inventory.receive" : !rc.basket.length ? "Cesto vazio: leia um código" : plano.errors.length ? "Corrija os erros acima (nunca mais do que falta)" : "Marque “Confirmo que recebo mesmo assim”";
  const lerSkus = (code: string, skus: string[]): void => setDlg({ t: "varios", code, skus });
  return (
    <div className="phone" aria-label="Receção no telemóvel">
      <div className="ph-status"><span>09:41</span><span>{rc.net ? <><Wifi className="ic sm" aria-hidden="true" /> online</> : "sem rede"}</span></div>
      <div className="ph-bar"><Truck className="ic" aria-hidden="true" /><b>Receção</b><span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.8 }}>{utilizadorAtual()}</span></div>
      <div className="ph-body">
        {ro && <div className="alert warn"><Lock className="ic" aria-hidden="true" /><span><b>Modo consulta</b>: sem permissão <span className="mono">inventory.receive</span>. Vê tudo, não regista.</span></div>}
        <Escolhas rc={rc} ro={ro} aoNovaGuia={aoNovaGuia} />
        <CartaoGuia rc={rc} />
        <Leitura rc={rc} ro={ro} aoCamera={() => setDlg({ t: "camera" })} aoVarios={lerSkus} />
        <Pendentes rc={rc} ro={ro} aoAprender={(k) => setDlg({ t: "aprender", k })} aoVarios={lerSkus} />
        <Cesto rc={rc} plano={plano} ro={ro} />
      </div>
      <div className="ph-foot">
        <button type="button" className="btn btn-p" disabled={bloqueado} title={bloqueado ? porque : undefined} onClick={() => correr((d) => confirmarCesto(d))}><Check className="ic" aria-hidden="true" />Confirmar receção ({tot} un)</button>
      </div>
      {dlg?.t === "camera" && <CameraDlg aoFechar={() => setDlg(null)} aoLer={(c) => correr((d) => { const r = lerCodigo(d, c); if (r?.t === "varios") { lerSkus(r.code, r.skus); return undefined; } return r?.aviso; })} />}
      {dlg?.t === "aprender" && <AprenderDlg code={rc.rejected[dlg.k]?.code ?? ""} k={dlg.k} aoFechar={() => setDlg(null)} />}
      {dlg?.t === "varios" && <EscolherProdutoDlg code={dlg.code} skus={dlg.skus} aoFechar={() => setDlg(null)} />}
    </div>
  );
}
