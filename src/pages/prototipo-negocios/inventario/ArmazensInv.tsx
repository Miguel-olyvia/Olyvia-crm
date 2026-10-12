// Armazém › Armazéns (scrWh do mockup): os cartões dos armazéns e as definições do inventário. Só armazéns ativos e que servem clientes entram na reserva FIFO das
// Encomendas Clientes; um armazém desligado continua a receber e guardar stock. As ações (Ver eliminados, Exportar, Importar, Novo armazém) vivem no cabeçalho.
import { useState } from "react";
import { Plus, Upload } from "lucide-react";
import { ArmazemCartao } from "./ArmazemCartao";
import { ArmazemForm } from "./ArmazemForm";
import { AcoesCab, Fonte } from "./cabInv";
import { definirArmazemPorDefeito, eliminarArmazem } from "./cadastros";
import { useCtxInv } from "./ctxInv";
import { Confirmar } from "./DialogosInv";
import { BotaoExportar, ImportarDlg } from "./ImportarInv";
import { defArmazens } from "./importContArm";
import { Check } from "./mockPecas";
import { MovimentoDialogo } from "./MovimentoDialogo";
import { Pri, Rotulo, Sec, Vazio } from "./pecasInv";
import { can, porqueNao } from "./perfil";

function Definicoes() {
  const { db, agir } = useCtxInv();
  const man = can("inventory.manage"), ded = db.settings.deduction;
  const porque = man ? undefined : porqueNao("inventory.manage");
  const baixa = (v: "contract" | "proposal"): void => { agir((d) => { d.settings.deduction = v; }, v === "contract" ? "Baixa no contrato assinado." : "Baixa na proposta aceite."); };
  return (
    <section className="card pad stack" style={{ marginBottom: 14 }} aria-labelledby="h-def">
      <h2 id="h-def" style={{ fontSize: 15 }}>Definições de inventário</h2>
      <div className="fg">
        <Rotulo rotulo="Armazém por defeito" ajuda="Usado na baixa por venda e em novas encomendas.">
          {(id) => (
            <select id={id} disabled={!man} title={porque} value={db.settings.defaultWh} onChange={(e) => agir((d) => definirArmazemPorDefeito(d, e.target.value), "Armazém por defeito atualizado.")}>
              {db.warehouses.filter((w) => !w.deleted && w.active).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          )}
        </Rotulo>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="fl" style={{ marginBottom: 6 }}>Momento da baixa de stock por venda</legend>
          <label className="check"><input type="radio" name="ded" checked={ded === "contract"} disabled={!man} title={porque} onChange={() => baixa("contract")} /> Contrato assinado</label><br />
          <label className="check"><input type="radio" name="ded" checked={ded === "proposal"} disabled={!man} title={porque} onChange={() => baixa("proposal")} /> Proposta aceite</label>
          <small className="help muted" style={{ display: "block" }}>Nunca os dois. Linha que falha não bloqueia as outras; anular o contrato reverte as saídas.</small>
        </fieldset>
      </div>
      <Fonte>organization_inventory_settings · rpc_upsert_inventory_settings · stock_deduction_trigger</Fonte>
    </section>
  );
}

type Dlg4 = { t: "form"; id?: string } | { t: "eliminar" | "mov"; id: string } | { t: "importar" } | null;

export function ArmazensInv() {
  const { db, agir } = useCtxInv();
  const [dlg, setDlg] = useState<Dlg4>(null);
  const [eliminados, setEliminados] = useState(false);
  const man = can("inventory.manage"), porque = man ? undefined : porqueNao("inventory.manage");
  const lista = db.warehouses.filter((w) => eliminados || !w.deleted);
  const alvo = dlg && (dlg.t === "eliminar" || dlg.t === "mov") ? db.warehouses.find((w) => w.id === dlg.id) : undefined;
  return (
    <div>
      <AcoesCab>
        <Check rotulo="Ver eliminados" ativo={eliminados} aoMudar={setEliminados} />
        <BotaoExportar def={defArmazens(db)} />
        <Sec disabled={!man} title={porque} onClick={() => setDlg({ t: "importar" })}><Upload className="ic" aria-hidden="true" />Importar</Sec>
        <Pri disabled={!man} title={porque} onClick={() => setDlg({ t: "form" })}><Plus className="ic" aria-hidden="true" />Novo armazém</Pri>
      </AcoesCab>
      <Definicoes />
      {lista.length ? (
        <div className="whcards">
          {lista.map((w) => <ArmazemCartao key={w.id} w={w} aoEditar={() => setDlg({ t: "form", id: w.id })} aoEliminar={() => setDlg({ t: "eliminar", id: w.id })} aoMovimento={() => setDlg({ t: "mov", id: w.id })} />)}
        </div>
      ) : <Vazio titulo="Sem armazéns" />}
      {dlg?.t === "form" && <ArmazemForm id={dlg.id} aoFechar={() => setDlg(null)} />}
      {dlg?.t === "importar" && <ImportarDlg def={defArmazens(db)} aoFechar={() => setDlg(null)} />}
      {dlg?.t === "mov" && <MovimentoDialogo aberto aoFechar={() => setDlg(null)} pre={{ wh: dlg.id }} />}
      {dlg?.t === "eliminar" && alvo && <Confirmar aberto aoFechar={() => setDlg(null)} titulo={`Eliminar ${alvo.name}`} ok="Eliminar" perigo texto={<p>Só é possível sem stock, sem ser o armazém por defeito e sem encomendas a expedir daqui.</p>} aoConfirmar={() => agir((d) => eliminarArmazem(d, alvo.id), "Armazém eliminado.")} />}
    </div>
  );
}
