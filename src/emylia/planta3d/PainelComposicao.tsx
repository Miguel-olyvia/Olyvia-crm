// Protótipo (visualizador 3D): o painel da composição modular de cozinha escolhida: cada ranhura (tipo de módulo, largura, cor, armário de
// parede por cima), acrescentar, retirar e reordenar, e a soma contra o preço da composição (desconto só com os obrigatórios).
import { ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LARGURAS, ROTULO_MODULO, acrescentarModulo, moverModulo, mudarModulo, precoComposicao, retirarModulo, type ComposicaoCozinha, type TipoModulo } from "./composicaoCozinha";

const eur = (n: number) => n.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
const SEL = "h-11 rounded-md border border-input bg-background px-2 text-[15px]";

export function PainelComposicao({ cfg, onMudar }: { cfg: ComposicaoCozinha; onMudar: (c: ComposicaoCozinha) => void }) {
  const preco = precoComposicao(cfg);
  return (
    <fieldset className="w-full space-y-2 rounded-xl border border-border p-3">
      <legend className="px-1 text-sm font-medium">{cfg.nome}{cfg.ilha ? " (ilha)" : ""}</legend>
      <ol className="space-y-2" aria-label="Módulos da composição">
        {cfg.modulos.map((m, i) => (
          <li key={m.id} className="flex flex-wrap items-center gap-2">
            <span className="w-6 text-sm text-muted-foreground">{i + 1}.</span>
            <select className={SEL} aria-label={`Tipo do módulo ${i + 1}`} value={m.tipo} onChange={(e) => onMudar(mudarModulo(cfg, m.id, { tipo: e.target.value as TipoModulo }))}>
              {(Object.keys(ROTULO_MODULO) as TipoModulo[]).map((t) => <option key={t} value={t}>{ROTULO_MODULO[t]}</option>)}
            </select>
            <select className={SEL} aria-label={`Largura do módulo ${i + 1} (cm)`} value={m.largura} onChange={(e) => onMudar(mudarModulo(cfg, m.id, { largura: Number(e.target.value) }))}>
              {LARGURAS.map((l) => <option key={l} value={l}>{l} cm</option>)}
            </select>
            <input type="color" className="h-11 w-12 rounded border border-input" aria-label={`Cor do módulo ${i + 1}`} value={m.cor} onChange={(e) => onMudar(mudarModulo(cfg, m.id, { cor: e.target.value }))} />
            {!m.tipo.startsWith("coluna") && (
              <label className="flex min-h-11 items-center gap-2 text-[15px]"><input type="checkbox" className="h-5 w-5" checked={!!m.parede} onChange={(e) => onMudar(mudarModulo(cfg, m.id, { parede: e.target.checked }))} />Armário de parede por cima</label>
            )}
            <Button type="button" variant="outline" size="icon" className="h-11 w-11" aria-label={`Passar o módulo ${i + 1} para a esquerda`} disabled={i === 0} onClick={() => onMudar(moverModulo(cfg, m.id, -1))}><ArrowLeft className="h-4 w-4" aria-hidden="true" /></Button>
            <Button type="button" variant="outline" size="icon" className="h-11 w-11" aria-label={`Passar o módulo ${i + 1} para a direita`} disabled={i === cfg.modulos.length - 1} onClick={() => onMudar(moverModulo(cfg, m.id, 1))}><ArrowRight className="h-4 w-4" aria-hidden="true" /></Button>
            <Button type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label={`Retirar o módulo ${i + 1}`} disabled={cfg.modulos.length === 1} onClick={() => onMudar(retirarModulo(cfg, m.id))}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
          </li>
        ))}
      </ol>
      <Button type="button" variant="outline" className="min-h-11" onClick={() => onMudar(acrescentarModulo(cfg))}><Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />Acrescentar módulo</Button>
      <p className="text-[15px]" role="status">
        Soma dos módulos {eur(preco.soma)}{preco.completo ? ` · composição ${eur(preco.total)} (poupa ${eur(preco.poupanca)})` : ` · sem desconto: faltam ${preco.faltam.join(", ")}`}
      </p>
    </fieldset>
  );
}
