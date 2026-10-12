// O separador "Portal" da ficha do fornecedor (supTab 'portal' e portalAccess do mockup): o estado do acesso, enviar/reenviar/revogar, simular a entrada do fornecedor e o catálogo
// que ele carregou, onde cada artigo se liga a um produto (com a sugestão), se cria o produto a partir dele, se dispensa ou se repõe.
import { useState } from "react";
import { Lock, Send } from "lucide-react";
import { fmtDT, nomeProd } from "./base";
import { desligarCatalogo, dispensarCatalogo, ligarCatalogo } from "./cadastros";
import { Fonte } from "./cabInv";
import { useCtxInv } from "./ctxInv";
import { Chip } from "./mockPecas";
import { BotaoSimular } from "./PortalSimDialogo";
import { PortalSelo } from "./FornColunas";
import { Peq, Sec, Selo, Vazio } from "./pecasInv";
import { can, porqueNao } from "./perfil";
import { PM, perm } from "./permForn";
import { dinheiro } from "./ProdutoCampo";
import { acessoPortal, criarProdutoDoCatalogo, reporCatalogo } from "./regrasForn";
import { TabelaInv } from "./TabelaInv";
import type { Fornecedor, ItemCatalogo } from "./tipos";

type Vista = "unlinked" | "linked" | "dismissed" | "all";
const CONF: Record<string, "ok" | "info" | "warn" | "neu"> = { Exata: "ok", Alta: "info", Média: "warn", Baixa: "neu" };
const VISTAS: readonly (readonly [Vista, string])[] = [["unlinked", "Por ligar"], ["linked", "Ligados"], ["dismissed", "Dispensados"], ["all", "Todos"]];

function Acesso({ s, revogar, simular }: { s: Fornecedor; revogar: () => void; simular: () => void }) {
  const { agir } = useCtxInv();
  const man = can(PM);
  const enviar = (k: "invite" | "resend"): void => { agir((d) => acessoPortal(d, s.id, k), k === "invite" ? `Convite enviado para ${s.email}.` : `Acesso reenviado para ${s.email}.`); };
  const dentro = s.portal === "invited" || s.portal === "active";
  return (
    <div className="row" style={{ margin: "12px 0" }}>
      {man ? <>
        {(s.portal === "none" || s.portal === "revoked") && <button type="button" className="btn btn-p" onClick={() => enviar("invite")}><Send className="ic" aria-hidden="true" />Enviar acesso</button>}
        {dentro && <><Sec onClick={() => enviar("resend")}><Send className="ic" aria-hidden="true" />Reenviar</Sec><Sec onClick={revogar}>Revogar</Sec></>}
      </> : <span className="muted"><Lock className="ic sm" aria-hidden="true" /> {porqueNao(PM)}</span>}
      {s.portal === "invited" && <BotaoSimular aoClicar={simular} />}
    </div>
  );
}

function Catalogo({ s }: { s: Fornecedor }) {
  const { db, agir, avisar } = useCtxInv();
  const [vista, setVista] = useState<Vista>("unlinked");
  const [csel, setCsel] = useState<Record<string, boolean>>({});
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const man = can(PM);
  const doForn = db.catalog.filter((c) => c.sup === s.id);
  const lista = doForn.filter((c) => vista === "all" || c.state === vista);
  const exatas = doForn.filter((c) => c.state === "unlinked" && c.sug?.conf === "Exata");
  const marcados = Object.keys(csel).filter((k) => csel[k] && doForn.some((c) => c.id === k && c.state === "unlinked"));
  const produtos = db.products.filter((p) => !p.kit && !p.deleted);
  const alvo = (c: ItemCatalogo): string => escolha[c.id] ?? c.sug?.sku ?? "";
  const ligar = (c: ItemCatalogo): void => {
    if (!alvo(c)) { avisar("Escolha o produto a ligar.", true); return; }
    agir((d) => ligarCatalogo(d, c.id, alvo(c)), `Artigo ligado a ${alvo(c)}.`);
  };
  const acoes = (c: ItemCatalogo): React.ReactNode => {
    if (!man) return <span className="muted" title={porqueNao(PM)}><Lock className="ic sm" aria-hidden="true" /></span>;
    if (c.state === "unlinked") return <><Peq onClick={() => ligar(c)}>Ligar</Peq><Peq onClick={() => agir((d) => criarProdutoDoCatalogo(d, c.id), (r) => `Produto ${r} criado e ligado.`)}>Criar produto</Peq><Peq className="btn-ghost" onClick={() => agir((d) => dispensarCatalogo(d, c.id), "Artigo dispensado.")}>Dispensar</Peq></>;
    if (c.state === "dismissed") return <Peq onClick={() => agir((d) => reporCatalogo(d, c.id), "Artigo reposto.")}>Repor</Peq>;
    return <Peq onClick={() => agir((d) => desligarCatalogo(d, c.id), "Artigo desligado.")}>Desligar</Peq>;
  };
  return (
    <>
      <h3 style={{ margin: "16px 0 8px" }}>Catálogo do fornecedor</h3>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>O fornecedor carrega o catálogo no portal; aqui liga cada artigo a um produto. Ligar cria o artigo em “Artigos e preços”.</p>
      <div className="row between" style={{ marginBottom: 8 }}>
        <div className="chips">{VISTAS.map(([k, nome]) => <Chip key={k} ativo={vista === k} aoClicar={() => setVista(k)} n={doForn.filter((c) => k === "all" || c.state === k).length}>{nome}</Chip>)}</div>
        <div className="row">
          <Peq {...(exatas.length ? perm(PM) : { disabled: true, title: "Sem sugestões exatas por aceitar" })} onClick={() => agir((d) => { for (const c of d.catalog.filter((x) => x.sup === s.id && x.state === "unlinked" && x.sug?.conf === "Exata")) ligarCatalogo(d, c.id, c.sug?.sku ?? ""); }, "Sugestões exatas aceites.")}>Aceitar sugestões exatas ({exatas.length})</Peq>
          <Peq {...(marcados.length ? perm(PM) : { disabled: true, title: "Selecione artigos por ligar" })} onClick={() => { agir((d) => { for (const k of marcados) { const c = d.catalog.find((x) => x.id === k); if (c && c.state === "unlinked") criarProdutoDoCatalogo(d, k); } }, "Produtos criados e ligados."); setCsel({}); }}>Criar produtos selecionados ({marcados.length})</Peq>
        </div>
      </div>
      {lista.length ? <TabelaInv titulo="Catálogo do portal" minimo={900} linhas={lista} chave={(c) => c.id}
        colunas={[
          { id: "s", titulo: "", celula: (c) => (c.state === "unlinked" ? <input type="checkbox" aria-label="Selecionar" checked={!!csel[c.id]} onChange={(e) => setCsel((x) => ({ ...x, [c.id]: e.target.checked }))} /> : null) },
          { id: "r", titulo: "Ref.", classe: () => "mono", celula: (c) => c.ref },
          { id: "a", titulo: "Artigo", celula: (c) => <>{c.name}<br /><small className="muted">{c.unitLabel}{c.ean ? ` · EAN ${c.ean}` : ""}{c.moq ? ` · MOQ ${c.moq}` : ""}</small></> },
          { id: "p", titulo: "Preço", direita: true, celula: (c) => dinheiro(c.price) },
          { id: "l", titulo: "Produto / sugestão", celula: (c) => (c.state === "linked" ? <><Selo tom="ok">Ligado</Selo> {nomeProd(db, c.link ?? "")}</> : c.state === "dismissed" ? <Selo>Dispensado</Selo> : (
            <><select aria-label="Produto a ligar" value={alvo(c)} onChange={(e) => setEscolha((x) => ({ ...x, [c.id]: e.target.value }))}>{c.sug ? null : <option value="">Sem sugestão — escolher…</option>}{produtos.map((p) => <option key={p.sku} value={p.sku}>{p.sku} — {p.name}</option>)}</select>{" "}{c.sug ? <Selo tom={CONF[c.sug.conf]}>{c.sug.conf}</Selo> : null}</>)) },
        ]}
        acoes={acoes} /> : <Vazio titulo="Nada nesta vista" texto="" />}
      <Fonte>supplier_catalog_items · rpc_catalog_link_suggestions · rpc_catalog_link · supplier_catalog_dismissals</Fonte>
    </>
  );
}

export function PortalForn({ s, revogar, simular }: { s: Fornecedor; revogar: () => void; simular: () => void }) {
  const { db } = useCtxInv();
  const n = db.catalog.filter((c) => c.sup === s.id).length;
  const inv = s.invite;
  const itens: [string, React.ReactNode][] = [["Estado", <PortalSelo s={s} />], ["NIF", <>{s.nif}{s.portal === "active" ? <> <Lock className="ic sm" aria-hidden="true" /></> : null}</>], ["Utilizadores ativos", s.portalUsers || 0], ["Último acesso", fmtDT(s.lastAccess)], ["Artigos no catálogo", n], ["Dados confirmados", s.dataConfirmed ? `Sim${s.dataUpdatedAt ? ` · ${fmtDT(s.dataUpdatedAt)}` : ""}` : "Ainda não"]];
  return (
    <>
      <div className="dl">{itens.map(([a, b]) => <div key={a}><span className="lbl">{a}</span>{b}</div>)}</div>
      {inv && <div className="cardlet" style={{ marginTop: 10 }}><b>Utilizador do portal:</b> {inv.name} · {inv.email} · {inv.state === "pending" ? <Selo tom="info">Convite pendente</Selo> : <Selo tom="ok">Ativo</Selo>}{s.lastAccess ? ` · último acesso ${fmtDT(s.lastAccess)}` : ""}</div>}
      <Acesso s={s} revogar={revogar} simular={simular} />
      <Fonte>supplier_portal_user_access · rpc_supplier_portal_invite_prepare · rpc_supplier_portal_resend_prepare · rpc_supplier_portal_revoke_access · rpc_supplier_portal_status</Fonte>
      <Catalogo s={s} />
    </>
  );
}
