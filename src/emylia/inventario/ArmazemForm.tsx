// O diálogo "Novo armazém" / "Editar" (whForm e whSave do mockup): os erros por campo só aparecem ao gravar, e o código postal dá as coordenadas.
import { useState } from "react";
import { Map } from "lucide-react";
import { Fonte } from "./cabInv";
import { cpGeo, erosArmazem, guardarArmazem, type DadosArmazem } from "./cadastros";
import { useCtxInv } from "./ctxInv";
import { Dlg } from "./DialogosInv";
import { Sw } from "./mockPecas";
import { Pri, Sec, Texto } from "./pecasInv";

const VAZIO: DadosArmazem = { name: "", code: "", addr: "", cp: "", city: "", manager: "", phone: "", email: "", cap: "", active: true, serves: true };

export function ArmazemForm({ id, aoFechar }: { id?: string; aoFechar: () => void }) {
  const { db, agir } = useCtxInv();
  const w = id ? db.warehouses.find((x) => x.id === id) : undefined;
  const [f, setF] = useState<DadosArmazem>(() => (w ? { name: w.name, code: w.code, addr: w.addr, cp: w.cp, city: w.city, manager: w.manager, phone: w.phone, email: w.email, cap: w.cap, active: w.active, serves: w.serves } : { ...VAZIO, code: "ARM-" + String(db.warehouses.length + 1).padStart(2, "0") }));
  const [erros, setErros] = useState<ReturnType<typeof erosArmazem>>({});
  const geo = cpGeo(f.cp);
  const m = (p: Partial<DadosArmazem>): void => setF((x) => ({ ...x, ...p }));
  const gravar = (): void => {
    const e = erosArmazem(db, f, id ?? null);
    setErros(e);
    if (Object.keys(e).length) return;
    if (agir((d) => guardarArmazem(d, f, id ?? null), "Armazém gravado.").ok) aoFechar();
  };
  return (
    <Dlg aberto aoFechar={aoFechar} titulo={w ? `Editar ${w.name}` : "Novo armazém"} rodape={<><Sec onClick={aoFechar}>Cancelar</Sec><Pri onClick={gravar}>Gravar</Pri></>}>
      <div className="fg">
        <Texto rotulo="Nome" valor={f.name} aoMudar={(v) => m({ name: v })} erro={erros.name} obrigatorio />
        <Texto rotulo="Código" valor={f.code} aoMudar={(v) => m({ code: v })} erro={erros.code} obrigatorio />
        <Texto rotulo="Morada" valor={f.addr} aoMudar={(v) => m({ addr: v })} className="span2" />
        <Texto rotulo="Código postal" valor={f.cp} aoMudar={(v) => m({ cp: v })} erro={erros.cp} atributos={{ placeholder: "0000-000", maxLength: 8 }} />
        <Texto rotulo="Cidade" valor={f.city} aoMudar={(v) => m({ city: v })} />
        <Texto rotulo="Gestor" valor={f.manager} aoMudar={(v) => m({ manager: v })} />
        <Texto rotulo="Telefone" tipo="tel" valor={f.phone} aoMudar={(v) => m({ phone: v })} />
        <Texto rotulo="Email" tipo="email" valor={f.email} aoMudar={(v) => m({ email: v })} erro={erros.email} />
        <Texto rotulo="Capacidade" valor={f.cap} aoMudar={(v) => m({ cap: v })} />
      </div>
      {geo
        ? <div className="alert info"><Map className="ic" aria-hidden="true" /><span>Coordenadas obtidas pelo código postal: <b className="mono">{geo[0]}, {geo[1]}</b>. Usadas para escolher o armazém mais próximo da morada do cliente.</span></div>
        : <div className="alert neu"><Map className="ic" aria-hidden="true" /><span>Indique o código postal (0000-000) para obter as coordenadas.</span></div>}
      <div className="row"><Sw rotulo="Ativo" ativo={f.active} aoMudar={(v) => m({ active: v })} /><Sw rotulo="Serve clientes" ativo={f.serves} aoMudar={(v) => m({ serves: v })} /></div>
      <small className="muted">Só armazéns ativos e que servem clientes entram na reserva FIFO, no desconto ao assinar e nas saídas para EC.</small>
      <Fonte>warehouses (latitude, longitude, serves_customers) · find_nearest_resources · rpc_assign_client_order_warehouse</Fonte>
    </Dlg>
  );
}
