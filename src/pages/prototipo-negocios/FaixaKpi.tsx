// A faixa de KPIs do Inventário (função kpi()): rótulo, número grande e nota. Com `aoClicar` o cartão é um botão que aplica o filtro. Os números vêm de quem a usa
// (os cartões dos dashboards, que já batem com as listas); aqui só se desenham. Precisa de um ancestral com a classe pg-root.
import { cn } from "@/lib/utils";
import "./blocosPagina.css";

export interface ItemKpi {
  id: string;
  rotulo: string;
  valor: string;
  nota?: string;
  tom?: "ok" | "warn" | "bad" | "info";
  /** O que o botão faz: é o nome acessível dele. */
  acaoRotulo?: string;
  aoClicar?: () => void;
}

function Cartao({ k }: { k: ItemKpi }) {
  const corpo = (
    <>
      <span className="kl">{k.rotulo}</span><span className="kv">{k.valor}</span>{k.nota ? <span className="kh">{k.nota}</span> : null}
    </>
  );
  const cls = cn("kpi", k.tom && `k-${k.tom}`);
  // O nome acessível do botão é o que ele faz ("Filtrar por Perdidas: 2 pessoas"), não o rótulo solto: assim não se confunde com o chip que tem o mesmo nome.
  return k.aoClicar ? <button type="button" className={cls} onClick={k.aoClicar} aria-label={k.acaoRotulo}>{corpo}</button> : <div className={cls}>{corpo}</div>;
}

export function FaixaKpi({ nome, itens }: { nome: string; itens: readonly ItemKpi[] }) {
  return <section aria-label={nome} className="kpis">{itens.map((k) => <Cartao key={k.id} k={k} />)}</section>;
}
