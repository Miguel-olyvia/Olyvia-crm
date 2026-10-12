// A ficha de um fornecedor numa folha lateral (supSheet do mockup), existente ou rascunho: Resumo, Dados, Artigos e preços, Preços por aprovar e Portal.
// Um rascunho tem todos os separadores e nada fica gravado até "Gravar fornecedor"; numa ficha existente só "Dados" grava (Gravar/Cancelar), os outros separadores agem logo.
import { useState } from "react";
import { Check, Clock, Pencil, Play } from "lucide-react";
import { fmtDT, fornecedor } from "./base";
import { useCtxInv } from "./ctxInv";
import { AbasFolha, Confirmar, Folha } from "./DialogosInv";
import { ArtigosForn, ArtigosRascunho } from "./FornecedorArtigos";
import { DadosForm } from "./FornecedorDados";
import { PortalForn } from "./FornecedorPortal";
import { PrecosForn } from "./FornecedorPrecos";
import { ResumoForn, ResumoRascunho } from "./FornecedorResumo";
import { PortalSelo } from "./FornColunas";
import { precosPorAprovar } from "./fornecedores";
import { Fonte } from "./cabInv";
import { Nota, Pri, Sec, Selo, Vazio } from "./pecasInv";
import { PM, perm } from "./permForn";
import { PortalSimDialogo } from "./PortalSimDialogo";
import { acessoPortal, errosFicha, gravarFicha, podeSimular, proximoCodigoForn, type ArtigoRascunho, type DadosForn, type ErrosForn } from "./regrasForn";
import type { Fornecedor } from "./tipos";

type TabF = "resumo" | "dados" | "artigos" | "precos" | "portal";
interface Rascunho { items: ArtigoRascunho[]; enviar: boolean }
export type PreForn = Partial<Pick<DadosForn, "company" | "name" | "nif" | "email" | "contact">>;

const dadosDe = (s: Fornecedor): DadosForn => ({ company: s.company, name: s.name, code: s.code, contact: s.contact, email: s.email, phone: s.phone, nif: s.nif, sla: s.sla, addr: s.addr, city: s.city, cp: s.cp, country: s.country, web: s.web, notes: s.notes, active: s.active });

function Aviso({ s, simular, reenviar }: { s: Fornecedor | null; simular: () => void; reenviar: () => void }) {
  if (!s) return <div className="alert neu" style={{ marginTop: 10 }}><Pencil className="ic" aria-hidden="true" /><span><b>Rascunho:</b> pode preencher todos os separadores; nada é gravado até “Gravar fornecedor”.</span></div>;
  if (s.portal === "invited" && s.awaiting) {
    return (
      <div className="alert info" style={{ marginTop: 10 }}><Clock className="ic" aria-hidden="true" />
        <div><b>À espera que o fornecedor preencha a ficha.</b> Convite enviado a {s.invite?.email || s.email} em {fmtDT(s.invitedAt)}. <button type="button" className="btn btn-xs" onClick={simular}><Play className="ic sm" aria-hidden="true" />Simular: fornecedor entra no portal</button> <button type="button" className="btn btn-xs" onClick={reenviar}>Reenviar convite</button></div>
      </div>
    );
  }
  return s.dataUpdatedAt ? <div className="alert ok" style={{ marginTop: 10 }}><Check className="ic" aria-hidden="true" /><span>Dados atualizados pelo fornecedor em {fmtDT(s.dataUpdatedAt)}.</span></div> : null;
}

function Corpo({ tab, s, d, set, errs, rasc, setRasc, revogar, simular, irParaDados }: { tab: TabF; s: Fornecedor | null; d: DadosForn; set: (p: Partial<DadosForn>) => void; errs: ErrosForn; rasc: Rascunho; setRasc: (r: Rascunho) => void; revogar: () => void; simular: () => void; irParaDados: () => void }) {
  if (tab === "dados") return <DadosForm s={s} d={d} set={set} errs={errs} revogar={revogar} />;
  if (s) return tab === "resumo" ? <ResumoForn id={s.id} /> : tab === "artigos" ? <ArtigosForn id={s.id} /> : tab === "precos" ? <PrecosForn id={s.id} /> : <PortalForn s={s} revogar={revogar} simular={simular} />;
  if (tab === "resumo") return <ResumoRascunho d={d} items={rasc.items} enviar={rasc.enviar} />;
  if (tab === "artigos") return <ArtigosRascunho items={rasc.items} setItems={(items) => setRasc({ ...rasc, items })} sla={Number(d.sla)} />;
  if (tab === "precos") return <Vazio titulo="Sem preços por aprovar" texto="As alterações de preço chegam pelo portal depois de o fornecedor existir e ter acesso." />;
  return <PortalRascunho d={d} enviar={rasc.enviar} aoMudar={(enviar) => setRasc({ ...rasc, enviar })} aoCompletar={irParaDados} />;
}

function PortalRascunho({ d, enviar, aoMudar, aoCompletar }: { d: DadosForn; enviar: boolean; aoMudar: (v: boolean) => void; aoCompletar: () => void }) {
  const { db } = useCtxInv();
  const erros = errosFicha(db, d, null, true);
  const pode = !erros.nif && !erros.email;
  return (
    <>
      <label className="check"><input type="checkbox" checked={enviar} onChange={(e) => aoMudar(e.target.checked)} /> <b>Enviar acesso ao portal ao gravar</b></label>
      <p className="muted" style={{ fontSize: 12.5, margin: "6px 0 10px" }}>O fornecedor recebe o convite, define a password, confirma a ficha e carrega o catálogo.</p>
      {enviar && !pode && <Nota tom="warn">Para convidar é preciso NIF válido e email único. <button type="button" className="link" onClick={aoCompletar}>Completar em Dados</button></Nota>}
      <Fonte>rpc_supplier_portal_invite_prepare</Fonte>
    </>
  );
}

interface Props { id: string | null; pre?: PreForn; tabInicial?: string; aoFechar: () => void }
export function FolhaForn({ id, pre, tabInicial, aoFechar }: Props) {
  const { db, agir, avisar, abrir } = useCtxInv();
  const s = id ? fornecedor(db, id) ?? null : null;
  const rascunho = !id;
  const [tab, setTab] = useState<TabF>(rascunho ? "dados" : ((tabInicial as TabF) || "resumo"));
  const [d, setD] = useState<DadosForn>(() => (s ? dadosDe(s) : { company: db.suppliers[0].company, name: "", code: proximoCodigoForn(db), contact: "", email: "", phone: "", nif: "", sla: 5, addr: "", city: "", cp: "", country: "Portugal", web: "", notes: "", active: true, ...pre }));
  const [errs, setErrs] = useState<ErrosForn>({});
  const [rasc, setRasc] = useState<Rascunho>({ items: [], enviar: false });
  const [revogar, setRevogar] = useState(false), [sim, setSim] = useState(false);
  if (id && !s) return null;
  const gravar = (): void => {
    const e = errosFicha(db, d, id, rasc.enviar);
    setErrs(e);
    if (Object.keys(e).length) { setTab("dados"); avisar("Corrija os campos assinalados em Dados.", true); return; }
    const r = agir((x) => gravarFicha(x, d, id, rasc), () => (s ? "Fornecedor gravado." : `Fornecedor criado${rasc.enviar ? " e convite enviado." : ` com ${rasc.items.length} artigo(s).`}`));
    if (r.ok && rascunho) { aoFechar(); abrir({ t: "sup", id: r.valor.id }); }
  };
  const simular = (): void => { if (s && podeSimular(db, s.id, avisar)) setSim(true); };
  const abas: readonly (readonly [TabF, string, number?])[] = [["resumo", "Resumo"], ["dados", "Dados"], ["artigos", "Artigos e preços", s ? db.items.filter((i) => i.sup === s.id).length : rasc.items.length], ["precos", "Preços por aprovar", s ? precosPorAprovar(db, s.id).length : 0], ["portal", "Portal"]];
  const rodape = rascunho
    ? <><Sec onClick={aoFechar}>Descartar rascunho</Sec><Pri {...perm(PM)} onClick={gravar}><Check className="ic" aria-hidden="true" />Gravar fornecedor{rasc.enviar ? " e enviar acesso" : ""}</Pri></>
    : tab === "dados" ? <><Sec onClick={aoFechar}>Cancelar</Sec><Pri {...perm(PM)} onClick={gravar}><Check className="ic" aria-hidden="true" />Gravar</Pri></> : <Sec onClick={aoFechar}>Fechar</Sec>;
  return (
    <Folha aberta aoFechar={aoFechar} chave={id ?? "novo"} titulo={s ? s.name : `Novo fornecedor${d.name ? `: ${d.name}` : ""}`} subtitulo="Compras › Fornecedor"
      selos={s ? <><Selo tom="neu">{s.code}</Selo>{s.active ? <Selo tom="ok">Ativo</Selo> : <Selo>Inativo</Selo>}<PortalSelo s={s} />{s.deleted && <Selo>Eliminado</Selo>}</> : <Selo tom="warn">Rascunho · nada gravado</Selo>}
      abas={<><Aviso s={s} simular={simular} reenviar={() => { if (s) agir((x) => acessoPortal(x, s.id, "resend"), `Acesso reenviado para ${s.email}.`); }} /><div style={{ marginTop: 12 }}><AbasFolha<TabF> rotulo="Partes da ficha" atual={tab} escolher={setTab} abas={abas} /></div></>}
      rodape={rodape}>
      <div role="tabpanel" aria-labelledby={`fa-${tab}`} className="stack">
        <Corpo tab={tab} s={s} d={d} set={(p) => setD((x) => ({ ...x, ...p }))} errs={errs} rasc={rasc} setRasc={setRasc} revogar={() => setRevogar(true)} simular={simular} irParaDados={() => setTab("dados")} />
      </div>
      {revogar && s && <Confirmar aberto aoFechar={() => setRevogar(false)} titulo="Revogar acesso ao portal" ok="Revogar" perigo texto={<p>{s.name} deixa de entrar no portal; NIF e empresa voltam a ser editáveis. Encomendas publicadas continuam no CRM.</p>} aoConfirmar={() => agir((x) => acessoPortal(x, s.id, "revoke"))} />}
      {sim && s && <PortalSimDialogo sid={s.id} aoFechar={() => setSim(false)} />}
    </Folha>
  );
}

export function FornecedorFolha({ id, tabInicial, aoFechar }: { id: string; tabInicial?: string; aoFechar: () => void }) {
  return <FolhaForn id={id} tabInicial={tabInicial} aoFechar={aoFechar} />;
}
