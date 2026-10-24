// A simulação do portal do fornecedor (openPortalSim, psimHtml e psimNext do mockup), com o visual distinto `.dlg.portalsim`: primeiro acesso, definir password,
// confirmar a ficha e carregar o catálogo, concluído. Submeter corre a mesma regra do portal real (submeterPortal): a ficha e o catálogo chegam ao CRM.
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Play, Plus, Users, X } from "lucide-react";
import { fmtDT, fornecedor } from "./base";
import { Fonte } from "./cabInv";
import { useCtxInv } from "./ctxInv";
import { Dlg } from "./DialogosInv";
import { executar } from "./loja";
import { Rotulo, Sec, Texto } from "./pecasInv";
import { submeterPortal, type ArtigoPortal, type FichaPortal } from "./regrasForn";
import type { Fornecedor } from "./tipos";

const ARTIGO_VAZIO: ArtigoPortal = { ref: "", name: "", ean: "", price: "", unit: "Unidade", packN: 1, moq: 1, lead: "" };
const EXEMPLO: ArtigoPortal[] = [
  { ref: "NV-INV5", name: "Inversor híbrido 5 kW monofásico", ean: "5601234000035", price: "925", unit: "Unidade", packN: 1, moq: 1, lead: 5 },
  { ref: "NV-PV455", name: "Painel fotovoltaico 455 W", ean: "", price: "119.5", unit: "Unidade", packN: 1, moq: 10, lead: 7 },
  { ref: "NV-BAT10", name: "Bateria lítio 10 kWh", ean: "", price: "3100", unit: "Unidade", packN: 1, moq: 1, lead: 10 },
];
const CAMPOS_ARTIGO: (keyof ArtigoPortal)[] = ["ref", "name", "ean", "price", "unit", "packN", "moq", "lead"];
const LARGURA: Record<string, number> = { name: 200, ref: 120, ean: 120 };

function Catalogo({ items, set }: { items: ArtigoPortal[]; set: (i: ArtigoPortal[]) => void }) {
  const muda = (k: number, f: keyof ArtigoPortal, v: string): void => set(items.map((x, j) => (j === k ? { ...x, [f]: v } : x)));
  return (
    <>
      <h3 style={{ marginTop: 6 }}>Catálogo (opcional)</h3>
      <p className="muted" style={{ fontSize: 12.5 }}>Os artigos ficam “Por ligar” no CRM do cliente, com sugestões automáticas.</p>
      <div className="tw"><table className="min-900"><thead><tr><th>Ref.</th><th>Nome</th><th>EAN</th><th>Preço</th><th>Unidade</th><th>Un./emb.</th><th>MOQ</th><th>Prazo</th><th></th></tr></thead>
        <tbody>{items.map((i, k) => (
          <tr key={k}>{CAMPOS_ARTIGO.map((f) => (
            <td key={f}><input aria-label={f} style={{ width: LARGURA[f] ?? 80 }} value={String(i[f])} onChange={(e) => muda(k, f, e.target.value)}
              {...(["price", "packN", "moq", "lead"].includes(f) ? { type: "number", min: 0, step: f === "price" ? 0.01 : 1 } : {})} /></td>
          ))}<td><button type="button" className="btn btn-sm btn-ghost btn-icon" aria-label="Remover" onClick={() => set(items.filter((_, j) => j !== k))}><X className="ic" aria-hidden="true" /></button></td></tr>
        ))}</tbody></table></div>
      <div><button type="button" className="btn btn-sm" onClick={() => set([...items, { ...ARTIGO_VAZIO }])}><Plus className="ic" aria-hidden="true" />Artigo</button></div>
    </>
  );
}

export function PortalSimDialogo({ sid, aoFechar }: { sid: string; aoFechar: () => void }) {
  const { db, avisar, abrir } = useCtxInv();
  const s = fornecedor(db, sid) as Fornecedor;
  const [passo, setPasso] = useState(1);
  const [pw, setPw] = useState({ password: "", password2: "" });
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState(0);
  const [f, setF] = useState<Omit<FichaPortal, "password" | "password2">>({ addr: s.addr || "", cp: s.cp || "", city: s.city || "", country: s.country || "Portugal", phone: s.phone || "", web: s.web || "", contact: s.contact || "", sla: s.sla || 5 });
  const [items, setItems] = useState<ArtigoPortal[]>([{ ...ARTIGO_VAZIO }]);
  const campo = (k: keyof typeof f, rotulo: string, o: { tipo?: string; obrigatorio?: boolean; atributos?: React.InputHTMLAttributes<HTMLInputElement> } = {}): React.ReactNode => (
    <Texto rotulo={rotulo} tipo={o.tipo} valor={f[k]} aoMudar={(v) => setF((x) => ({ ...x, [k]: v }))} obrigatorio={o.obrigatorio} atributos={o.atributos} />
  );
  const exemplo = (): void => {
    setF((x) => ({ ...x, addr: x.addr || "Rua do Fornecedor 10", cp: x.cp || "2600-123", city: x.city || "Alverca", phone: x.phone || "219 000 000", web: x.web || "fornecedor.exemplo", contact: x.contact || s.contact, sla: x.sla || 4 }));
    setItems(EXEMPLO);
  };
  const seguinte = (): void => {
    setErro("");
    if (passo === 1) { setPasso(2); return; }
    if (passo === 2) { if (pw.password.length < 8) setErro("Password com pelo menos 8 caracteres."); else if (pw.password !== pw.password2) setErro("As passwords não coincidem."); else setPasso(3); return; }
    const r = executar((d) => submeterPortal(d, sid, { ...pw, ...f }, items));
    if (!r.ok) { setErro(r.erro); return; }
    setResultado(r.valor); setPasso(4);
    avisar(`${s.name} preencheu a ficha no portal${r.valor ? ` e enviou ${r.valor} artigo(s) para ligar.` : "."}`);
  };
  const convite = s.invite?.email || s.email;
  const passos = ["Primeiro acesso", "Definir password", "Ficha e catálogo", "Concluído"];
  return (
    <Dlg aberto aoFechar={aoFechar} largo classe="portalsim" titulo="Portal do Fornecedor"
      acima={<div style={{ fontSize: 12, opacity: 0.85 }}><Users className="ic sm" aria-hidden="true" /> Simulação · lado do fornecedor</div>} abaixo={<div style={{ fontSize: 13, opacity: 0.9 }}>{s.name}</div>}
      rodape={passo === 4 ? <button type="button" className="btn btn-p" onClick={() => { aoFechar(); abrir({ t: "sup", id: sid, tab: "portal" }); }}>Voltar ao CRM · ver ficha</button> : (
        <><Sec onClick={aoFechar}>Sair</Sec>{passo > 1 && <Sec onClick={() => { setPasso(passo - 1); setErro(""); }}>Voltar</Sec>}<button type="button" className="btn btn-ps" onClick={seguinte}>{passo === 1 ? "Abrir convite e entrar" : passo === 2 ? "Definir password" : "Submeter"}</button></>)}>
      <div className="ps-steps">{passos.map((t, i) => <span key={t} className={i + 1 === passo ? "on" : ""}>{i + 1}. {t}</span>)}</div>
      {passo === 1 && <div className="stack"><p>Olá {s.invite?.name || s.contact || ""},</p><p><b>Olyvia · {s.company}</b> convidou <b>{s.name}</b> (NIF {s.nif}) para o Portal do Fornecedor. Aqui vai ver as encomendas, confirmar datas e manter o seu catálogo e preços.</p><p className="muted">Convite enviado para {convite} em {fmtDT(s.invitedAt)}.</p></div>}
      {passo === 2 && <div className="fg">
        <Rotulo rotulo="Email">{(id) => <input id={id} value={convite} disabled title="O email é o do convite" />}</Rotulo><span />
        <Texto rotulo="Nova password" tipo="password" valor={pw.password} aoMudar={(v) => setPw((x) => ({ ...x, password: v }))} obrigatorio ajuda="Pelo menos 8 caracteres." atributos={{ autoComplete: "new-password" }} />
        <Texto rotulo="Repetir password" tipo="password" valor={pw.password2} aoMudar={(v) => setPw((x) => ({ ...x, password2: v }))} obrigatorio atributos={{ autoComplete: "new-password" }} />
      </div>}
      {passo === 3 && <>
        <div className="row between"><b>Confirme a ficha da sua empresa</b><button type="button" className="btn btn-sm" onClick={exemplo}>Preencher com exemplo</button></div>
        <div className="fg">
          <Rotulo rotulo="Empresa / NIF">{(id) => <input id={id} value={`${s.name} · ${s.nif}`} disabled title="Definidos pelo cliente no convite" />}</Rotulo>
          {campo("contact", "Pessoa de contacto")}{campo("addr", "Morada", { obrigatorio: true })}{campo("cp", "Código postal", { obrigatorio: true, atributos: { placeholder: "0000-000" } })}{campo("city", "Cidade", { obrigatorio: true })}
          {campo("country", "País")}{campo("phone", "Telefone", { tipo: "tel" })}{campo("web", "Website")}{campo("sla", "Prazo de entrega habitual (dias)", { tipo: "number", obrigatorio: true, atributos: { min: 0, step: 1 } })}
        </div>
        <Catalogo items={items} set={setItems} />
      </>}
      {passo === 4 && <div className="alert ok"><CheckCircle2 className="ic" aria-hidden="true" /><div><b>Obrigado! Ficha submetida.</b><br />{resultado} artigo(s) enviados para o catálogo. O cliente já vê os seus dados.</div></div>}
      {erro && <div className="alert bad" role="alert"><AlertTriangle className="ic" aria-hidden="true" />{erro}</div>}
      <Fonte>supplier portal: sp_* · supplier_portal_users · supplier_catalog_items (sp_catalog_import)</Fonte>
    </Dlg>
  );
}

/** O botão "Simular: fornecedor entra no portal" da ficha (`.btn-ps`). */
export const BotaoSimular = ({ aoClicar }: { aoClicar: () => void }) => (
  <button type="button" className="btn btn-ps" onClick={aoClicar}><Play className="ic sm" aria-hidden="true" />Simular: fornecedor entra no portal</button>
);
