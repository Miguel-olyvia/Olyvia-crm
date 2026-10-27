// "Novo fornecedor" = convidá-lo para o portal (newSupDlg do mockup): empresa, nome, NIF, email e contacto, com NIF e email únicos e os dados de teste do mockup.
// "Criar e enviar acesso" convida; "Criar sem portal" abre a ficha como rascunho para o preencher à mão.
import { useState } from "react";
import { Send } from "lucide-react";
import { fornecedor, nifCompleto } from "./base";
import { Fonte } from "./cabInv";
import { useCtxInv } from "./ctxInv";
import { Dlg } from "./DialogosInv";
import { Lista, Ligacao, Nota, Pri, Sec, Texto } from "./pecasInv";
import { PM, perm } from "./permForn";
import { PESSOAS, convidarFornecedor, nifValido, primeiroErro, validarNovoForn, type NovoForn } from "./regrasForn";
import { pedirAcessoForn } from "../acessosPortal";

export interface PreFicha { company: string; name: string; nif: string; email: string; contact: string }
const LIMITE_NIF = { inputMode: "numeric" as const, maxLength: 9, placeholder: "9 dígitos" };

export function NovoFornecedorDialogo({ aoFechar, aoRascunho }: { aoFechar: () => void; aoRascunho: (p: PreFicha) => void }) {
  const { db, agir, avisar, abrir } = useCtxInv();
  const empresas = [...new Set(db.suppliers.map((s) => s.company))];
  const [d, setD] = useState<NovoForn>({ company: db.suppliers[0].company, name: "", nif: "", email: "", contactName: "" });
  const [tentou, setTentou] = useState(false);
  const m = (p: Partial<NovoForn>): void => setD((x) => ({ ...x, ...p }));
  const v = validarNovoForn(db, d, true);
  const e = tentou ? v.errs : Object.fromEntries(Object.entries(v.errs).filter(([k]) => String(d[k as keyof NovoForn] || "").trim()));
  const okNif = nifCompleto("51234567"), alfa = fornecedor(db, "alfa");
  const convidar = (): void => {
    setTentou(true);
    const erro = primeiroErro(v.errs);
    if (erro) { avisar(erro, true); return; }
    const r = agir((x) => convidarFornecedor(x, d), (s) => `Acesso enviado para ${s.email}. À espera que o fornecedor preencha a ficha.`);
    if (r.ok) { aoFechar(); abrir({ t: "sup", id: r.valor.id, tab: "portal" }); pedirAcessoForn({ sid: r.valor.id, reenviar: false }); }
  };
  const semPortal = (): void => {
    setTentou(true);
    const erro = primeiroErro(validarNovoForn(db, d, false).errs);
    if (erro) { avisar(erro, true); return; }
    aoFechar(); aoRascunho({ company: d.company, name: d.name, nif: d.nif, email: d.email, contact: d.contactName });
  };
  return (
    <Dlg aberto aoFechar={aoFechar} titulo="Novo fornecedor"
      rodape={<><Sec onClick={aoFechar}>Cancelar</Sec><Sec {...perm(PM)} onClick={semPortal}>Criar sem portal (preencho eu)</Sec><Pri {...perm(PM)} onClick={convidar}><Send className="ic" aria-hidden="true" />Criar e enviar acesso ao portal</Pri></>}>
      <p className="muted">Na realidade é o fornecedor que preenche a ficha: indique o essencial e envie-lhe o acesso ao portal.</p>
      <div className="fg">
        <Lista rotulo="Empresa" valor={d.company} aoMudar={(x) => m({ company: x })} opcoes={empresas.map((c) => [c, c] as const)} obrigatorio erro={e.company} />
        <Texto rotulo="Nome do fornecedor" valor={d.name} aoMudar={(x) => m({ name: x })} obrigatorio erro={e.name} />
        <Texto rotulo="NIF" valor={d.nif} aoMudar={(x) => m({ nif: x })} obrigatorio erro={e.nif} atributos={LIMITE_NIF} ajuda={nifValido(d.nif) ? "✓ NIF válido" : "Obrigatório e válido para convidar (dígito de controlo)."} />
        <Texto rotulo="Email" tipo="email" valor={d.email} aoMudar={(x) => m({ email: x })} obrigatorio erro={e.email} />
        <Texto rotulo="Nome do contacto" valor={d.contactName} aoMudar={(x) => m({ contactName: x })} obrigatorio erro={e.contactName} ajuda="Recebe o convite e fica como primeiro utilizador." />
      </div>
      {v.warns.map((w) => <Nota key={w} tom="warn">{w}</Nota>)}
      <details className="box"><summary>Dados para testar</summary>
        <div style={{ fontSize: 13 }}>
          NIF válido: <Ligacao className="mono" aoClicar={() => m({ nif: okNif })}>{okNif}</Ligacao> · NIF inválido: <Ligacao className="mono" aoClicar={() => m({ nif: "123456780" })}>123456780</Ligacao>
          {alfa ? <> · NIF repetido: <Ligacao className="mono" aoClicar={() => m({ nif: alfa.nif })}>{alfa.nif}</Ligacao></> : null}<br />
          Emails recusados: {PESSOAS.map((p, i) => <span key={p.email}>{i ? ", " : ""}<Ligacao aoClicar={() => m({ email: p.email })}>{p.email}</Ligacao> ({p.kind.toLowerCase()})</span>)}
          {alfa ? <>, <Ligacao aoClicar={() => m({ email: alfa.email })}>{alfa.email}</Ligacao> (fornecedor)</> : null}
        </div>
      </details>
      <Fonte>rpc_supplier_portal_invite_prepare · suppliers · auth/emails da organização</Fonte>
    </Dlg>
  );
}
