// Armazém › Receção (16/10, redesenho; 19/10 barra de leitura e ordem de chegada): separadores Por receber · Recebidas · Guias, o painel "Dar entrada" e o leitor de códigos num diálogo.
// A folha da guia (GuiaFolha) e os diálogos (GuiaDialogo) são ficheiros próprios. Igual ao ecrã scrRec do mockup.
import { useState } from "react";
import { Plus, ScanLine } from "lucide-react";
import { fmtD, guiaEnviadaForn, nomeForn } from "./base";
import { AcoesCab, Fonte } from "./cabInv";
import { useCtxInv } from "./ctxInv";
import { contaGuias, filtrarGuias, type FiltrosGuia } from "./filtros";
import { GuiaForm } from "./GuiaDialogo";
import { SeloGuia, SeloOrigemGuia } from "./GuiaFolha";
import { resumoGuia } from "./guias";
import { Chip } from "./mockPecas";
import { Selo, Vazio } from "./pecasInv";
import { can, porqueNao } from "./perfil";
import { RececaoTelemovel } from "./RececaoTelemovel";
import { PainelPoRececao } from "./PainelPoRececao";
import { EncomendasPorReceber, FILTROS_REC, type FiltrosRec } from "./EncomendasPorReceber";
import { BarraLeituraRec, abrirPoLida } from "./BarraLeituraRec";
import { RecebidasInv, recebidas } from "./RecebidasInv";
import { AbasFolha, Dlg } from "./DialogosInv";
import { definirFilaRececao, lerPedidoRececaoInv, tirarPedidoRececaoInv } from "./loja";
import { limparRececao } from "./rececao";
import { poRecebivel } from "./po";
import { Sec } from "./pecasInv";
import { TabelaInv } from "./TabelaInv";

const ESTADOS: readonly (readonly [FiltrosGuia["estado"], string])[] = [["all", "Todas"], ["open", "Abertas"], ["div", "Com divergências"], ["closed", "Fechadas"], ["cancelled", "Canceladas"]];

/** O painel das guias (guiasPanel do mockup). */
function PainelGuias() {
  const { db, filtros, setFiltros, abrir } = useCtxInv();
  const f = filtros.guia;
  const lista = filtrarGuias(db, f);
  return (
    <>
      <div className="row between" style={{ marginBottom: 8 }}><h2 style={{ fontSize: 16 }}>Guias <span className="new">Novo</span></h2></div>
      <div className="chips" style={{ marginBottom: 10 }}>
        {ESTADOS.map(([k, nome]) => <Chip key={k} ativo={f.estado === k} aoClicar={() => setFiltros("guia", { estado: k })} n={contaGuias(db, k)}>{nome}</Chip>)}
      </div>
      {lista.length === 0 ? <Vazio titulo="Sem guias" texto="" /> : (
        <TabelaInv titulo="Guias do fornecedor" minimo={640} chave={(g) => g.id} linhas={lista} abrir={(g) => abrir({ t: "guia", id: g.id })} rotuloAbrir={(g) => `Abrir a guia ${g.id}`}
          colunas={[
            { id: "n", titulo: "Nº", classe: () => "mono", celula: (g) => <b>{g.id}</b>, valor: (g) => g.id },
            { id: "f", titulo: "Fornecedor", celula: (g) => <>{nomeForn(db, g.sup)}{guiaEnviadaForn(g) ? <><br /><SeloOrigemGuia g={g} />{g.anexo ? <small className="muted"> · com ficheiro</small> : null}</> : null}</>, valor: (g) => nomeForn(db, g.sup) },
            { id: "d", titulo: "Data", celula: (g) => fmtD(g.date), valor: (g) => g.date },
            { id: "p", titulo: "POs", classe: () => "mono", celula: (g) => g.pos.length ? <span style={{ fontSize: 12 }}>{g.pos.map((p, i) => <span key={p}>{i > 0 ? <br /> : null}{p}</span>)}</span> : "—" },
            { id: "ar", titulo: "Anunciado / Recebido", direita: true, celula: (g) => { const s = resumoGuia(db, g); return `${s.annT} / ${s.recT}`; } },
            { id: "dv", titulo: "Divergências", celula: (g) => { const s = resumoGuia(db, g); return s.div ? <Selo tom="bad">{s.div}</Selo> : s.anyRec ? <Selo tom="ok">0</Selo> : <span className="muted">—</span>; } },
            { id: "e", titulo: "Estado", celula: (g) => <SeloGuia g={g} /> },
          ]} />
      )}
      <Fonte>supplier_delivery_notes · supplier_delivery_note_lines · fn_delivery_note_summary</Fonte>
    </>
  );
}

type SepRec = "receber" | "recebidas" | "guias";
/** O separador da Receção onde se estava (a página desmonta ao mudar de ecrã); "Receber no armazém →" abre sempre Por receber. */
let sepGuardado: SepRec = "receber";

/** Armazém › Receção (19/10): a barra de leitura (um só campo: PO, guia, fornecedor, EAN/SKU) acima dos separadores Por receber (por ordem de
 *  chegada) · Recebidas · Guias; "Dar entrada" abre o painel lateral da encomenda; "Ler artigo a artigo" abre o leitor (o telemóvel da receção), sempre limpo. */
export function GuiasInv() {
  const { db, agir, perfil } = useCtxInv();
  const [sep, setSepEstado] = useState<SepRec>(() => (db.rc.poFilter || lerPedidoRececaoInv() ? "receber" : sepGuardado));
  const setSep = (s: SepRec): void => { sepGuardado = s; setSepEstado(s); };
  // os filtros de Por receber (a barra de leitura também filtra); aberta pelo negócio ("Abrir Receção"): já filtrada pelo cliente/obra
  const [f, setF] = useState<FiltrosRec>(() => { const cli = tirarPedidoRececaoInv(); return cli ? { ...FILTROS_REC, cli } : FILTROS_REC; });
  const [destaque, setDestaque] = useState<string | undefined>(undefined);
  const [nova, setNova] = useState(false);
  const [leitor, setLeitor] = useState(false);
  const ro = !can("inventory.receive");
  void perfil;
  const nRec = db.pos.filter(poRecebivel).length, nFeitas = recebidas(db).filter((x) => x.r.state === "Ativa").length, nGuias = db.guias.filter((g) => g.state === "open").length;
  const abrirPo = (id: string, sku?: string): void => { setDestaque(sku); setSep("receber"); abrirPoLida(agir, id); };
  const filtrar = (x: Partial<FiltrosRec>): void => { setSep("receber"); setF({ ...FILTROS_REC, ...x }); };
  // o leitor artigo a artigo abre sempre limpo (sem fornecedor, guia nem PO de uma receção anterior)
  const artigo = (): void => { definirFilaRececao([]); agir((d) => limparRececao(d)); setLeitor(true); };
  return (
    <>
      <AcoesCab>
        <button type="button" className="btn" onClick={artigo}><ScanLine className="ic" aria-hidden="true" />Ler artigo a artigo</button>
        <button type="button" className="btn" disabled={ro} title={ro ? porqueNao("inventory.receive") : undefined} onClick={() => setNova(true)}><Plus className="ic" aria-hidden="true" />Nova guia</button>
      </AcoesCab>
      <p className="muted" style={{ margin: "0 0 8px" }}>Aqui dá entrada no armazém a mercadoria que chega dos fornecedores.</p>
      <BarraLeituraRec aoAbrirPo={abrirPo} aoFiltrar={filtrar} aoArtigo={artigo} />
      <AbasFolha rotulo="Receção" atual={sep} escolher={setSep} abas={[["receber", "Por receber", nRec], ["recebidas", "Recebidas", nFeitas], ["guias", "Guias", nGuias ? `${nGuias} ${nGuias === 1 ? "aberta" : "abertas"}` : undefined]]} />
      <div style={{ marginTop: 12 }}>
        {sep === "receber" && <EncomendasPorReceber f={f} setF={setF} />}
        {sep === "recebidas" && <RecebidasInv />}
        {sep === "guias" && <PainelGuias />}
      </div>
      <PainelPoRececao destaque={destaque} />
      {leitor && (
        <Dlg aberto aoFechar={() => setLeitor(false)} titulo="Ler artigo a artigo" descricao="Leitor de código de barras, teclado ou câmara: encha o cesto e confirme." rodape={<Sec onClick={() => setLeitor(false)}>Fechar</Sec>}>
          <RececaoTelemovel aoNovaGuia={() => setNova(true)} />
          <Fonte>rpc_receiving_lookup · rpc_receive_by_code · fn_receiving_open_lines · fn_po_receipt_allocation · receiving_scans · fn_receiving_scan_replay</Fonte>
        </Dlg>
      )}
      {nova && <GuiaForm aoFechar={() => setNova(false)} />}
    </>
  );
}

export { GuiaFolha } from "./GuiaFolha";
