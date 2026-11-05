// Protótipo do visualizador 3D (ramo proto/visualizador-3d): a planta da área e o 3D, sozinhos, numa página pública. Sem sessão, sem base de dados:
// o «negócio» vive em memória (e a planta no estado desta página); as escolhas de espaço e revestimento ficam no localStorage deste aparelho.
// A mesma planta, dentro do negócio real, está no passo «Medidas da área» da Visita (/negocios).
import { useState } from "react";
import { PlantaDivisao } from "@/emylia/PlantaDivisao";
import type { Negocio } from "@/emylia/motor";
import type { Ctx } from "@/emylia/pecas";

const DIVISOES = ["Casa de banho", "Cozinha", "Quarto", "Sala"];

function Pagina({ divisao, id }: { divisao: string; id: number }) {
  const [d, setD] = useState<Negocio>(() => ({ id, f: {}, visita: { med: { pav: 0, par: 0, pts: 0, pcs: 0 } } }) as unknown as Negocio);
  const ctx = {
    A: { campo: (_id: number, k: string, v: string) => setD((x) => ({ ...x, f: { ...x.f, [k]: v } })) },
    run: (fn: () => void) => { fn(); setD((x) => ({ ...x, visita: { ...x.visita, med: { ...x.visita.med } } })); },
  } as unknown as Ctx;
  const med = d.visita.med as unknown as Record<string, number>;
  return (
    <>
      <PlantaDivisao ctx={ctx} d={d} divisao={divisao} />
      <p className="mt-4 text-sm text-muted-foreground">Medidas preenchidas: pavimento {med.pav || 0} m², paredes {med.par || 0} m² (só aparecem depois de «Usar nas medidas»).</p>
    </>
  );
}

export default function PrototipoPlanta3D() {
  const [i, setI] = useState(0);
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="text-xl font-semibold">Protótipo: planta e visualizador 3D</h1>
      <p className="text-[15px] text-muted-foreground">
        Desenhe as paredes com o dedo ou o rato, ponha portas, janelas e produtos do catálogo, e abra «Ver em 3D». Nada se grava na base de dados.
      </p>
      <label className="grid w-60 gap-1 text-sm font-medium">Divisão
        <select className="h-11 rounded-lg border border-input bg-card px-3 text-[15px]" value={i} onChange={(e) => setI(Number(e.target.value))}>
          {DIVISOES.map((n, k) => <option key={n} value={k}>{n}</option>)}
        </select>
      </label>
      <Pagina key={i} divisao={DIVISOES[i]} id={9000 + i} />
    </main>
  );
}
