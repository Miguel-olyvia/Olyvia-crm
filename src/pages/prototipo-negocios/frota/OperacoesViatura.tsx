// Ficha da viatura › Ligações › "Operações (ordens e obras)" (16/10/2026, como na app): ligar a viatura a uma obra do protótipo e levar os
// materiais por fases (Carregar → na carrinha → Entregar na obra), com as regras do Inventário (transporteObra.ts). Liga-se sempre; carregar
// só com a obra pronta (diz o que falta); desligar só sem material dessa obra na carrinha.
import { useState } from "react";
import { HardHat, Link2, PackageCheck, Truck, Unlink, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Selo } from "../inventario/pecasInv";
import { useCtxFrota } from "./ctxFrota";
import { Btn, LigObra, Src, VazioF } from "./pecasFrota";
import { carregarFase, desligarObra, entregarFase, faltaParaCarregar, fasesTransporte, ligacoesViatura, ligarObra, type EstadoFase } from "./transporteObra";
import type { ObraRef, Viatura } from "./tipos";

export const TOM_FASE: Record<EstadoFase, "neu" | "info" | "ok"> = { "por carregar": "neu", "na carrinha": "info", entregue: "ok" };

function LigarDialogo({ v, aberto, aoFechar }: { v: Viatura; aberto: boolean; aoFechar: () => void }) {
  const { F, inv, obras, agir } = useCtxFrota();
  const ja = new Set(ligacoesViatura(F, v.id).map((x) => x.obra));
  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) aoFechar(); }}>
      <DialogContent hideClose className="inv-root dlg !flex !max-w-none !flex-col !gap-0 !border-0 !p-0">
        <div className="dh"><div><DialogTitle>Ligar a ordem ou obra</DialogTitle><DialogDescription className="muted" style={{ marginTop: 4 }}>{`As obras em curso ou por arrancar. Liga-se sempre; carregar material só com a obra pronta.`}</DialogDescription></div>
          <button type="button" className="btn btn-ghost btn-icon" onClick={aoFechar} aria-label="Fechar"><X className="ic" aria-hidden="true" /></button></div>
        <div className="db">
          <div className="vlist" role="list" aria-label="Obras">{obras.filter((o) => o.estado !== "concluída").map((o) => {
            const falta = faltaParaCarregar(inv, o);
            return (
              <div key={o.id} role="listitem" className="row between">
                <span><b>Obra #{o.id}</b> · {o.servico} · {o.nome}, {o.local}<br />
                  {falta.length ? <small className="muted">Por preparar: falta {falta.join(" e ")}.</small> : <small className="muted">Pronta: materiais em armazém e plano aprovado.</small>}</span>
                <span className="row">{falta.length ? <Selo tom="warn">Por preparar</Selo> : <Selo tom="ok">Pronta</Selo>}
                  {ja.has(o.id) ? <Selo tom="neu">Ligada</Selo>
                    : <Btn pequeno primario acao="atribuir" icone={Link2} rotulo={`Ligar à obra #${o.id}`} aoClicar={() => { if (agir((x) => ligarObra(x, v.id, o.id), `${v.mat} ligada à obra #${o.id}.`).ok) aoFechar(); }}>Ligar</Btn>}</span>
              </div>
            );
          })}</div>
        </div>
        <div className="df"><button type="button" className="btn" onClick={aoFechar}>Cancelar</button></div>
      </DialogContent>
    </Dialog>
  );
}

/** As fases de uma obra ligada, com Carregar e Entregar na obra. */
function ObraLigada({ v, o }: { v: Viatura; o: ObraRef }) {
  const { inv, agir, agirInv } = useCtxFrota();
  const falta = faltaParaCarregar(inv, o), fases = fasesTransporte(inv, o);
  return (
    <div className="card pad" aria-label={`Obra #${o.id} ligada`}>
      <div className="row between">
        <span><HardHat className="ic" aria-hidden="true" /> <LigObra id={o.id}>{`Obra #${o.id}`}</LigObra> · {o.servico} · {o.nome}</span>
        <Btn pequeno acao="atribuir" icone={Unlink} rotulo={`Desligar da obra #${o.id}`} aoClicar={() => agir((x) => desligarObra(x, inv, v.id, o), `${v.mat} desligada da obra #${o.id}.`)}>Desligar</Btn>
      </div>
      {falta.length ? <p className="muted" role="note">Ainda não se carrega: falta {falta.join(" e ")}.</p> : null}
      {fases.length ? (
        <div className="tw"><table className="min-560">
          <thead><tr><th>Fase</th><th>Materiais</th><th>Estado</th><th /></tr></thead>
          <tbody>{fases.map((f) => (
            <tr key={f.fase}><td>{f.fase} · {f.nome}</td><td>{f.linhas.map((l) => `${l.n} × ${l.qty}`).join(", ")}</td><td><Selo tom={TOM_FASE[f.estado]}>{f.estado}</Selo></td>
              <td>{f.estado === "por carregar"
                ? <Btn pequeno acao="stock" icone={Truck} rotulo={`Carregar a fase ${f.fase}`} aoClicar={() => agirInv((d) => carregarFase(d, o, v, f.fase), `Fase ${f.fase} carregada na carrinha ${v.mat}.`)}>Carregar</Btn>
                : f.estado === "na carrinha"
                  ? <Btn pequeno primario acao="stock" icone={PackageCheck} rotulo={`Entregar na obra a fase ${f.fase}`} aoClicar={() => agirInv((d) => entregarFase(d, o, f.fase), `Fase ${f.fase} entregue na obra #${o.id}.`)}>Entregar na obra</Btn>
                  : null}</td></tr>
          ))}</tbody>
        </table></div>
      ) : <p className="muted">Sem materiais da encomenda de cliente para levar.</p>}
    </div>
  );
}

export function OperacoesViatura({ v }: { v: Viatura }) {
  const { F, obras } = useCtxFrota();
  const [ligar, setLigar] = useState(false);
  const lig = ligacoesViatura(F, v.id).map((x) => obras.find((o) => o.id === x.obra) ?? { id: x.obra, nome: "", servico: "Obra", local: "", estado: "", tarefas: [], ec: null });
  return (
    <div className="card pad">
      <div className="row between" style={{ marginBottom: 8 }}><h3><HardHat className="ic" aria-hidden="true" /> Operações (ordens e obras)</h3>
        <Btn pequeno acao="atribuir" icone={Link2} aoClicar={() => setLigar(true)}>Ligar a ordem ou obra</Btn></div>
      {lig.length ? <div className="stack">{lig.map((o) => <ObraLigada key={o.id} v={v} o={o} />)}</div>
        : <VazioF titulo="Sem ligações" texto="Esta viatura ainda não foi ligada a ordens nem obras." />}
      <Src t="ops_ordem.viatura_id · rpc_register_stock_transfer · saída da EC" />
      <LigarDialogo v={v} aberto={ligar} aoFechar={() => setLigar(false)} />
    </div>
  );
}
