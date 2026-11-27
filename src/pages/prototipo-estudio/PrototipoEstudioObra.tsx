// 11/11: o Estúdio da obra com uma obra em curso de exemplo (estudioObra/exemploObra.ts), sem conta: para o ver e mostrar sem mexer em
// negócios reais. Abre logo o Estúdio; «Voltar ao negócio» mostra o resumo e volta a abrir.
import { useMemo, useReducer, useState } from "react";
import { HardHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { acoes } from "@/emylia/motor";
import type { Ctx } from "@/emylia/pecas";
import { EstudioObra } from "@/emylia/estudioObra/EstudioObra";
import { encomendaDeExemploNoInventario, obraDeExemplo } from "@/emylia/estudioObra/exemploObra";
import "@/emylia/prototipo.css";
import { EnderecoAtivo } from "@/emylia/usarParamUrl";

export default function PrototipoEstudioObra() {
  // 27/11: com «?inventario» no endereço, a encomenda da obra vai ao Inventário (em memória), para as tarefas novas se encomendarem
  // como numa obra a sério (o separador Materiais, «Falta para as tarefas novas»). Sem ele, a obra de exemplo de sempre.
  const { S, d } = useMemo(() => {
    const x = obraDeExemplo();
    if (new URLSearchParams(window.location.search).has("inventario")) encomendaDeExemploNoInventario(x.d);
    return x;
  }, []);
  const [, redesenhar] = useReducer((x: number) => x + 1, 0);
  const [aviso, setAviso] = useState("");
  const run = (fn: () => void) => { fn(); redesenhar(); };
  const A = useMemo(() => acoes(S, (a) => setAviso(`${a.msg}${a.sub ? " · " + a.sub : ""}`), run), [S]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = { S, A, run, go: (fn: () => void) => () => run(fn), q: "" } as unknown as Ctx;
  const [aberto, setAberto] = useState(true);
  return (
    <main className="pn calma pg-root min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Protótipo · dados de exemplo</p>
          <h1 className="text-2xl font-semibold tracking-tight">O Estúdio da obra · {d.nome}</h1>
          <p className="text-[15px] text-muted-foreground">Uma obra em curso no 5.º dia: uma tarefa validada, uma por validar, uma atrasada, um imprevisto por propor, folga para adiantar e o montador noutra obra.</p>
        </div>
        <Button type="button" size="lg" className="min-h-14" onClick={() => setAberto(true)}><HardHat className="mr-2 h-5 w-5" aria-hidden="true" />Abrir o Estúdio da obra</Button>
        <p role="status" className="min-h-6 text-sm text-muted-foreground">{aviso}</p>
      </div>
      {/* 12/11: como na app, o separador e o painel do Estúdio vão para o endereço (?aba=, ?painel=), para experimentar o «voltar» */}
      <EnderecoAtivo.Provider value="pesquisa">
        {aberto && <EstudioObra ctx={ctx} d={d} fechar={() => setAberto(false)} />}
      </EnderecoAtivo.Provider>
    </main>
  );
}
