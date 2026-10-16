// Armazém › Receção (16/10, redesenho): separadores Por receber · Recebidas · Guias, o painel "Dar entrada" e o leitor de códigos num diálogo.
// A folha da guia (GuiaFolha) e os diálogos (GuiaDialogo) são ficheiros próprios. Igual ao ecrã scrRec do mockup.
import { useState } from "react";
import { Plus, ScanLine } from "lucide-react";
import { fmtD, nomeForn } from "./base";
import { AcoesCab, Fonte } from "./cabInv";
import { useCtxInv } from "./ctxInv";
import { contaGuias, filtrarGuias, type FiltrosGuia } from "./filtros";
import { GuiaForm } from "./GuiaDialogo";
import { SeloGuia } from "./GuiaFolha";
import { resumoGuia } from "./guias";
import { Chip } from "./mockPecas";
import { Selo, Vazio } from "./pecasInv";
import { can, porqueNao } from "./perfil";
import { RececaoTelemovel } from "./RececaoTelemovel";
import { PainelPoRececao } from "./PainelPoRececao";
import { EncomendasPorReceber } from "./EncomendasPorReceber";
import { RecebidasInv, recebidas } from "./RecebidasInv";
import { AbasFolha, Dlg } from "./DialogosInv";
import { lerPedidoRececaoInv } from "./loja";
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
            { id: "f", titulo: "Fornecedor", celula: (g) => nomeForn(db, g.sup), valor: (g) => nomeForn(db, g.sup) },
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

/** Armazém › Receção (16/10, redesenho): um só sítio para receber. Separadores Por receber (por omissão) · Recebidas · Guias; "Dar entrada"
 *  abre o painel lateral da encomenda; o leitor de códigos (o telemóvel da receção) abre-se em "Ler códigos". */
export function GuiasInv() {
  const { db, perfil } = useCtxInv();
  const [sep, setSepEstado] = useState<SepRec>(() => (db.rc.poFilter || lerPedidoRececaoInv() ? "receber" : sepGuardado));
  const setSep = (s: SepRec): void => { sepGuardado = s; setSepEstado(s); };
  const [nova, setNova] = useState(false);
  const [leitor, setLeitor] = useState(false);
  const ro = !can("inventory.receive");
  void perfil;
  const nRec = db.pos.filter(poRecebivel).length, nFeitas = recebidas(db).filter((x) => x.r.state === "Ativa").length, nGuias = db.guias.filter((g) => g.state === "open").length;
  return (
    <>
      <AcoesCab>
        <button type="button" className="btn" onClick={() => setLeitor(true)}><ScanLine className="ic" aria-hidden="true" />Ler códigos</button>
        <button type="button" className="btn" disabled={ro} title={ro ? porqueNao("inventory.receive") : undefined} onClick={() => setNova(true)}><Plus className="ic" aria-hidden="true" />Nova guia</button>
      </AcoesCab>
      <p className="muted" style={{ margin: "0 0 8px" }}>Aqui dá entrada no armazém a mercadoria que chega dos fornecedores.</p>
      <AbasFolha rotulo="Receção" atual={sep} escolher={setSep} abas={[["receber", "Por receber", nRec], ["recebidas", "Recebidas", nFeitas], ["guias", "Guias", nGuias]]} />
      <div style={{ marginTop: 12 }}>
        {sep === "receber" && <EncomendasPorReceber />}
        {sep === "recebidas" && <RecebidasInv />}
        {sep === "guias" && <PainelGuias />}
      </div>
      <PainelPoRececao aoNovaGuia={() => setNova(true)} />
      {leitor && (
        <Dlg aberto aoFechar={() => setLeitor(false)} titulo="Ler códigos" descricao="Leitor de código de barras, teclado ou câmara: encha o cesto e confirme." rodape={<Sec onClick={() => setLeitor(false)}>Fechar</Sec>}>
          <RececaoTelemovel aoNovaGuia={() => setNova(true)} />
          <Fonte>rpc_receiving_lookup · rpc_receive_by_code · fn_receiving_open_lines · fn_po_receipt_allocation · receiving_scans · fn_receiving_scan_replay</Fonte>
        </Dlg>
      )}
      {nova && <GuiaForm aoFechar={() => setNova(false)} />}
    </>
  );
}

export { GuiaFolha } from "./GuiaFolha";
