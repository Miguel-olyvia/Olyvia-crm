// 23/11 (revisão: «Avisar os técnicos afetados com a lista de quem muda e o quê; nada é enviado sem o toque do gestor»).
// O cartão aparece no Estúdio da obra depois de uma mudança de dias ou de técnico (replanear, ligar ou tirar uma ligação, passar a outro,
// arrastar uma barra): uma linha por técnico, com o que muda para ele. «Avisar» põe a mudança no Hoje de cada técnico escolhido.
import { useState } from "react";
import { motion } from "framer-motion";
import { BellRing, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AvatarTec, nomeTec } from "../AcompanhamentoObra";
import { useReduzir } from "../movimento";
import { porTecnico, type AvisoPorDar } from "./avisosTecnicos";

export function AvisarTecnicos({ L, avisar, agoraNao }: { L: AvisoPorDar[]; avisar: (escolhidos: AvisoPorDar[]) => void; agoraNao: () => void }) {
  const reduzir = useReduzir();
  const grupos = porTecnico(L);
  const [fora, setFora] = useState<Set<string>>(new Set());
  const escolhidos = L.filter((x) => !fora.has(x.tec));
  const nEsc = grupos.filter((g) => !fora.has(g.tec)).length;
  return (
    <motion.section aria-label="Avisar os técnicos afetados" initial={reduzir ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-warning/40 bg-warning/[0.06] p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warning/15 text-amber-700 dark:text-amber-300"><BellRing className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Avisar os técnicos afetados</h2>
          <p className="text-sm text-muted-foreground">O plano mudou para {grupos.length === 1 ? "uma pessoa" : `${grupos.length} pessoas`}. Ainda ninguém foi avisado: o aviso só sai quando tocar em «Avisar», e fica marcado no Hoje de cada um.</p>
        </div>
      </div>
      <ul className="mt-3 space-y-2">
        {grupos.map((g) => {
          const on = !fora.has(g.tec);
          return (
            <li key={g.tec}>
              <label className={cn("flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-3 transition-colors", on ? "border-border" : "border-dashed border-border opacity-60")}>
                <input type="checkbox" className="mt-2 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" checked={on}
                  onChange={() => setFora((s) => { const n = new Set(s); if (n.has(g.tec)) n.delete(g.tec); else n.add(g.tec); return n; })}
                  aria-label={`Avisar ${nomeTec(g.tec) || g.tec}`} />
                <AvatarTec id={g.tec} tam="h-8 w-8" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{nomeTec(g.tec) || g.tec}</span>
                  <ul className="mt-0.5 space-y-0.5">
                    {g.itens.map((x, k) => <li key={k} className="text-sm text-muted-foreground">{x.t}</li>)}
                  </ul>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" className="min-h-11 rounded-full" onClick={agoraNao}>Não avisar</Button>
        <Button type="button" className="min-h-11 rounded-full" disabled={!escolhidos.length} onClick={() => avisar(escolhidos)}>
          <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />{nEsc === 1 ? `Avisar ${(nomeTec(escolhidos[0].tec) || "o técnico").split(" ")[0]}` : `Avisar os ${nEsc} técnicos`}
        </Button>
      </div>
    </motion.section>
  );
}
