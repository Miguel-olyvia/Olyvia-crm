// A barra de leitura da Receção (19/10): um só campo acima dos separadores para o que se lê ou escreve — nº da PO (inteiro ou os últimos
// dígitos), nº da guia, EAN/SKU/código aprendido (de qualquer fornecedor) ou o fornecedor. Enter resolve (resolverCodigoRececao, rececao.ts):
// uma PO abre o painel; uma guia fica escolhida (1 PO abre, várias filtram); um artigo encontra as POs que o têm; um fornecedor filtra; nada diz
// "Não encontrei «X»" e oferece "Ler artigo a artigo". No telemóvel o campo fica fixo em baixo, com a câmara (simulada) ao lado.
import { useRef, useState } from "react";
import { Camera, ScanLine } from "lucide-react";
import { nomeForn, nomeProd } from "./base";
import { useCtxInv } from "./ctxInv";
import { CameraDlg } from "./GuiaDialogo";
import { definirFilaRececao } from "./loja";
import { fixarRececao, abrirRececaoDaPo, resolverCodigoRececao } from "./rececao";
import type { FiltrosRec } from "./EncomendasPorReceber";
import type { Po } from "./tipos";

interface Props {
  /** Abre o painel "Dar entrada" da PO (com a linha do artigo lido destacada). */
  aoAbrirPo: (id: string, sku?: string) => void;
  /** Filtra a lista "Por receber" (e mostra-a). */
  aoFiltrar: (f: Partial<FiltrosRec>) => void;
  /** Abre o leitor artigo a artigo (o telemóvel da receção). */
  aoArtigo: () => void;
}

export function BarraLeituraRec({ aoAbrirPo, aoFiltrar, aoArtigo }: Props) {
  const { db, agir } = useCtxInv();
  const campo = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ t: string; erro: boolean; artigo?: boolean } | null>(null);
  const [camara, setCamara] = useState(false);
  const ler = (txt0: string): void => {
    const txt = txt0.trim();
    if (!txt) return;
    const r = resolverCodigoRececao(db, txt);
    if (r.t === "po") { aoAbrirPo(r.po, r.sku); setMsg({ t: `${r.po} aberta${r.sku ? ` · ${nomeProd(db, r.sku)}` : ""}.`, erro: false }); }
    else if (r.t === "guia") {
      agir((d) => fixarRececao(d, { guia: r.guia }));
      const g = db.guias.find((x) => x.id === r.guia);
      if (r.pos.length === 1) { aoAbrirPo(r.pos[0]); setMsg({ t: `Guia ${r.guia} escolhida · ${r.pos[0]} aberta.`, erro: false }); }
      else {
        aoFiltrar({ ids: r.pos, lido: txt });
        setMsg({ t: r.pos.length ? `Guia ${r.guia} escolhida: ${r.pos.length} encomendas de ${nomeForn(db, g?.sup ?? "")} por receber.` : `Guia ${r.guia} escolhida: ${nomeForn(db, g?.sup ?? "")} não tem encomendas por receber.`, erro: !r.pos.length });
      }
    } else if (r.t === "skus" || r.t === "pos") {
      aoFiltrar({ ids: r.pos, lido: txt });
      setMsg({ t: `${r.pos.length} encomendas ${r.t === "skus" ? `com ${r.skus.map((s) => nomeProd(db, s)).join(" ou ")}` : `acabam em ${txt}`}: escolha uma.`, erro: false });
    } else if (r.t === "forn") { aoFiltrar({ sup: r.sup, ids: [], lido: "" }); setMsg({ t: `Encomendas de ${nomeForn(db, r.sup)}.`, erro: false }); }
    else setMsg({ t: r.aviso ?? `Não encontrei «${txt}».`, erro: true, artigo: true });
  };
  const enviar = (): void => { if (!campo.current) return; ler(campo.current.value); campo.current.value = ""; };
  return (
    <div className="rec-leitura" role="search" aria-label="Ler na Receção">
      <label className="fl" htmlFor="rec-ler"><span>Ler ou escrever: nº PO, guia, fornecedor, EAN/SKU</span></label>
      <div className="scanbox">
        <input id="rec-ler" ref={campo} type="text" autoComplete="off" enterKeyHint="go" placeholder="Ex.: 0146, GR 2026/311, 5601234000028 ou Zeta"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); enviar(); } }} />
        <button type="button" className="btn btn-icon rec-camara" aria-label="Câmara" onClick={() => setCamara(true)}><Camera className="ic" aria-hidden="true" /></button>
        <button type="button" className="btn btn-p rec-ir" onClick={enviar}>Ir</button>
      </div>
      <div role="status" aria-live="polite" className="rec-leitura-msg">
        {msg ? <span className={msg.erro ? "late" : "muted"}>{msg.t}</span> : null}
        {msg?.artigo ? <> <button type="button" className="link" onClick={aoArtigo}><ScanLine className="ic sm" aria-hidden="true" /> Ler artigo a artigo</button></> : null}
      </div>
      {camara && <CameraDlg aoFechar={() => setCamara(false)} aoLer={(c) => ler(c)} />}
    </div>
  );
}

/** Abrir o painel de uma PO a partir da leitura: sem fila, com a guia escolhida se for do mesmo fornecedor (abrirRececaoDaPo). */
export function abrirPoLida(agir: ReturnType<typeof useCtxInv>["agir"], id: string): void {
  definirFilaRececao([]);
  agir((d) => abrirRececaoDaPo(d, d.pos.find((x) => x.id === id) as Po));
}
