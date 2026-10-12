// As peças partilhadas dos ecrãs das Encomendas Clientes, com o DOM do mockup: a barra de progresso (segBar), a origem (ecOriginChip) e abrir a folha (openEC).
import { ecSegmentos, origemTexto } from "./ec";
import type { Ec, Inventario } from "./tipos";

/** segBar() do mockup: a barra (servido, em stock, à espera de PO, em falta) e o mesmo em texto. */
export function Progresso({ db, e }: { db: Inventario; e: Ec }) {
  const s = ecSegmentos(db, e);
  if (!s.tot) return <span className="muted">Só serviços</span>;
  const w = (n: number): string => `${(n / s.tot) * 100}%`;
  return (
    <>
      <div className="seg" role="img" aria-label={`Servido ${s.s}, em stock ${s.st}, a aguardar PO ${s.po}, em falta ${s.mi}`}>
        <span className="s-served" style={{ width: w(s.s) }} /><span className="s-stock" style={{ width: w(s.st) }} /><span className="s-po" style={{ width: w(s.po) }} /><span className="s-miss" style={{ width: w(s.mi) }} />
      </div>
      <small className="muted">{s.s} servido · {s.st} em stock · {s.po} PO · {s.mi} falta</small>
    </>
  );
}

/** ecOriginChip() do mockup. */
export function OrigemChip({ e }: { e: Ec }) {
  if (e.origin.k === "VD") return <span className="chip-o" style={{ background: "var(--i-accent-soft)", color: "var(--i-accent)", borderColor: "transparent" }}>{origemTexto(e)}</span>;
  return <span className="chip-o">{origemTexto(e)}</span>;
}
