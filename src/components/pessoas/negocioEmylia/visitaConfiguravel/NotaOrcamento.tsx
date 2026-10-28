// A nota ao vivo por baixo de uma pergunta configurada: «+ X € no orçamento · motivo» (e «+ N% sobre os serviços · motivo»), com o mesmo texto e o mesmo
// aspeto da que a Emylia mostra nos seus campos (CamposFase.tsx). Sem efeitos não desenha nada.
import { eur } from "@/emylia/motor";
import type { Efeito } from "@/emylia/efeitosLevantamento";

export function NotaOrcamento({ efeitos, id }: { efeitos: readonly Efeito[]; id?: string }) {
  if (efeitos.length === 0) return null;
  return (
    <p id={id} aria-live="polite" className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md bg-success/10 px-2 py-1 text-sm font-medium text-success motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150">
      {efeitos.map((e) => (
        <span key={`${e.k}:${e.d}`}>
          {e.t === "linha" ? `+ ${eur(e.preco)} € no orçamento · ${e.d}` : e.t === "percent" ? `+ ${Math.round((e.pct ?? 0) * 100)}% sobre os serviços · ${e.d}` : e.d}
        </span>
      ))}
    </p>
  );
}
