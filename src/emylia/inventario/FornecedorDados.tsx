// O separador "Dados" da ficha do fornecedor (supDadosForm do mockup): todos os campos, com NIF e empresa bloqueados quando o portal está ativo (o fornecedor confirmou-os).
import { Lock } from "lucide-react";
import { fmtDT } from "./base";
import { Fonte } from "./cabInv";
import { Sw } from "./mockPecas";
import { Lista, Rotulo, Texto } from "./pecasInv";
import type { DadosForn, ErrosForn } from "./regrasForn";
import { useCtxInv } from "./ctxInv";
import type { Fornecedor } from "./tipos";

interface Props { s: Fornecedor | null; d: DadosForn; set: (p: Partial<DadosForn>) => void; errs: ErrosForn; revogar: () => void }

export function DadosForm({ s, d, set, errs, revogar }: Props) {
  const { db } = useCtxInv();
  const lock = !!s && s.portal === "active";
  const empresas = [...new Set(db.suppliers.map((x) => x.company))];
  return (
    <>
      {lock && <div className="alert warn" style={{ marginBottom: 12 }}><Lock className="ic" aria-hidden="true" /><div>NIF e empresa bloqueados porque o portal está ativo (o fornecedor confirmou estes dados). <button type="button" className="btn btn-xs" onClick={revogar}><Lock className="ic sm" aria-hidden="true" />Revogar acesso para editar</button></div></div>}
      {s?.dataUpdatedAt && <p className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Dados atualizados pelo fornecedor em {fmtDT(s.dataUpdatedAt)}.</p>}
      <div className="fg">
        <Lista rotulo="Empresa" valor={d.company} aoMudar={(v) => set({ company: v })} opcoes={empresas.map((c) => [c, c] as const)} desativado={lock} obrigatorio />
        <Texto rotulo="Nome" valor={d.name} aoMudar={(v) => set({ name: v })} obrigatorio erro={errs.name} />
        <Texto rotulo="Código" valor={d.code} aoMudar={(v) => set({ code: v })} obrigatorio erro={errs.code} />
        <Texto rotulo="Contacto" valor={d.contact} aoMudar={(v) => set({ contact: v })} />
        <Texto rotulo="Email" tipo="email" valor={d.email} aoMudar={(v) => set({ email: v })} erro={errs.email} />
        <Texto rotulo="Telefone" tipo="tel" valor={d.phone} aoMudar={(v) => set({ phone: v })} />
        <Texto rotulo="NIF" valor={d.nif} aoMudar={(v) => set({ nif: v })} erro={errs.nif} ajuda={lock ? "Bloqueado: portal ativo." : "Obrigatório e válido para convidar."} atributos={{ inputMode: "numeric", maxLength: 9, disabled: lock }} />
        <Texto rotulo="Prazo SLA (dias)" tipo="number" valor={d.sla} aoMudar={(v) => set({ sla: v })} erro={errs.sla} atributos={{ min: 0, step: 1 }} />
        <Texto rotulo="Morada" className="span2" valor={d.addr} aoMudar={(v) => set({ addr: v })} />
        <Texto rotulo="Cidade" valor={d.city} aoMudar={(v) => set({ city: v })} />
        <Texto rotulo="Código postal" valor={d.cp} aoMudar={(v) => set({ cp: v })} erro={errs.cp} atributos={{ placeholder: "0000-000" }} />
        <Texto rotulo="País" valor={d.country} aoMudar={(v) => set({ country: v })} />
        <Texto rotulo="Website" valor={d.web} aoMudar={(v) => set({ web: v })} />
        <Rotulo rotulo="Notas" className="span2">{(id) => <textarea id={id} rows={3} value={d.notes} onChange={(e) => set({ notes: e.target.value })} />}</Rotulo>
        <Sw rotulo="Ativo" ativo={d.active} aoMudar={(v) => set({ active: v })} />
      </div>
      <Fonte>suppliers · rpc_create_supplier / rpc_update_supplier</Fonte>
    </>
  );
}
