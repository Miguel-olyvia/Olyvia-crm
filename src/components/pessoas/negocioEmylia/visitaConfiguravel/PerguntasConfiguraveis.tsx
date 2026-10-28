// As perguntas do questionário da organização dentro da visita da Emylia (as que NÃO estão ligadas a um campo da Emylia: as ligadas já aparecem como o
// campo da Emylia, uma só vez). A resposta fica em d.f (negocio_respostas, gravada por neg_guardar_negocio, a mesma via de tudo na visita), na chave
// «cfg_<pergunta>»; por baixo de cada pergunta, a nota ao vivo do efeito no orçamento. Estado de carga e de erro das perguntas diz-se em texto.
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { INPUT_G } from "@/emylia/CamposFase";
import type { Negocio } from "@/emylia/motor";
import type { Ctx } from "@/emylia/pecas";
import type { PerguntaDef, SeccaoDef } from "@/components/negocio-metas/perguntasTipos";
import { chaveCfg, efeitosDaPergunta, opcoesEscolhidas, perguntaVisivel } from "./efeitosConfigurados";
import { NotaOrcamento } from "./NotaOrcamento";

const ehEscolha = (p: PerguntaDef): boolean => p.tipo === "escolha_unica" || p.tipo === "escolha_multipla";

/** Uma pergunta sem campo da Emylia (a que a Emylia não tem) é desta camada. */
export const ehPerguntaDaConfiguracao = (p: PerguntaDef): boolean => (p.efeitoCfg?.campoEmylia ?? "") === "";

export { perguntaVisivel };

export const respondida = (p: PerguntaDef, f: Record<string, string>): boolean => (f[chaveCfg(p.id)] ?? "").trim() !== "";

/** As perguntas desta secção que a pessoa responde aqui e que se veem agora. */
export function perguntasDaSeccao(seccao: SeccaoDef, todas: readonly PerguntaDef[], f: Record<string, string>): PerguntaDef[] {
  return seccao.blocos.flatMap((b) => b.perguntas).filter((p) => ehPerguntaDaConfiguracao(p) && perguntaVisivel(p, todas, f));
}

interface CampoProps { pergunta: PerguntaDef; d: Negocio; ctx: Ctx }

function CampoEscrito({ pergunta, d, ctx, id, valor }: CampoProps & { id: string; valor: string }) {
  const [texto, setTexto] = useState(valor);
  // a resposta vem de fora quando o negócio é relido; enquanto se escreve, vale o que se escreve
  useEffect(() => { setTexto(valor); }, [valor]);
  const k = chaveCfg(pergunta.id);
  const gravar = (): void => { if (texto !== valor) ctx.run(() => ctx.A.campo(d.id, k, texto)); };
  const numerico = pergunta.tipo === "numero";
  return numerico ? (
    <span className="flex items-center gap-2">
      <input
        id={id} aria-labelledby={`${id}-rot`} aria-describedby={`${id}-nota`} type="number" step="any" min={pergunta.numero?.min ?? undefined} max={pergunta.numero?.max ?? undefined} value={texto} className={INPUT_G}
        onChange={(e) => setTexto(e.target.value)} onBlur={gravar} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      />
      {pergunta.numero?.unidade && <em className="whitespace-nowrap text-sm not-italic text-muted-foreground">{pergunta.numero.unidade}</em>}
    </span>
  ) : (
    <textarea id={id} aria-labelledby={`${id}-rot`} aria-describedby={`${id}-nota`} rows={2} maxLength={pergunta.textoMax} value={texto} className={cn(INPUT_G, "h-auto resize-y py-2")} onChange={(e) => setTexto(e.target.value)} onBlur={gravar} />
  );
}

function PerguntaConfigurada({ pergunta, d, ctx }: CampoProps) {
  const k = chaveCfg(pergunta.id);
  const valor = d.f[k] ?? "";
  const id = `cfg-${pergunta.id}-${d.id}`;
  const rotulo = pergunta.rotulo[0];
  const escolhidas = opcoesEscolhidas(pergunta, d.f);
  const definir = (v: string): void => ctx.run(() => ctx.A.campo(d.id, k, v));
  const alternar = (chave: string): void => {
    if (pergunta.tipo === "escolha_unica") { definir(escolhidas.includes(chave) ? "" : chave); return; }
    const quais = new Set(escolhidas);
    if (quais.has(chave)) quais.delete(chave); else quais.add(chave);
    definir(pergunta.opcoes.map(([c]) => c).filter((c) => quais.has(c)).join(", "));
  };
  return (
    <div className="grid gap-2 py-4">
      <span id={`${id}-rot`} className="text-[15px] font-medium text-foreground">{rotulo}</span>
      {ehEscolha(pergunta) ? (
        <div role="group" aria-labelledby={`${id}-rot`} className="flex flex-wrap gap-1.5">
          {pergunta.opcoes.map(([chave, texto]) => (
            <button
              key={chave} type="button" aria-pressed={escolhidas.includes(chave)} onClick={() => alternar(chave)}
              className={cn("min-h-11 rounded-lg border px-3 text-[15px] transition-colors",
                escolhidas.includes(chave) ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-input bg-background text-foreground hover:bg-muted")}
            >
              {texto}
            </button>
          ))}
        </div>
      ) : <CampoEscrito pergunta={pergunta} d={d} ctx={ctx} id={id} valor={valor} />}
      <NotaOrcamento id={`${id}-nota`} efeitos={efeitosDaPergunta(pergunta, d.f)} />
    </div>
  );
}

/** O corpo de um passo da visita com as perguntas da organização de uma secção. */
export function PerguntasConfiguraveis({ seccao, todas, d, ctx }: { seccao: SeccaoDef; todas: readonly PerguntaDef[]; d: Negocio; ctx: Ctx }) {
  const visiveis = new Set(perguntasDaSeccao(seccao, todas, d.f).map((p) => p.id));
  return (
    <div className="space-y-6">
      {seccao.blocos.map((b) => {
        const perguntas = b.perguntas.filter((p) => visiveis.has(p.id));
        if (perguntas.length === 0) return null;
        return (
          <section key={b.id} aria-label={b.titulo?.[0]}>
            {b.titulo && <h3 className="mb-1 text-base font-semibold text-foreground">{b.titulo[0]}</h3>}
            <div className="divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5">
              {perguntas.map((p) => <PerguntaConfigurada key={p.id} pergunta={p} d={d} ctx={ctx} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
