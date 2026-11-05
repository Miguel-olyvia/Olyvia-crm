// 5/11 (Rúben, a visita real: «reconstruir tudo o que está em papel, a planta da área»). A planta da divisão na Visita: o desenho é o
// EditorPlanta (retas com a medida por cima, peças arrastadas da barra); aqui ficam os m² do chão e das paredes, que vão para as medidas
// com um toque. A planta grava-se no negócio (f.planta, JSON). A geometria está em planta.ts.
import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { guardarParaEstudio, projetoDaVisita } from "@/pages/prototipo-estudio/daVisita";
import { Button } from "@/components/ui/button";
import { porMedida, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { EditorPlanta } from "./EditorPlanta";
import { PLANTA_VAZIA, areaChaoM2, areaParedesM2, gravarPlanta, lerPlanta, peDireitoDoCampo, type Planta } from "./planta";

const PE_DIREITO_SEM_RESPOSTA = 2.5;
const nf = (n: number) => n.toLocaleString("pt-PT", { maximumFractionDigits: 2 });

export function PlantaDivisao({ ctx, d, divisao }: { ctx: Ctx; d: Negocio; divisao?: string }) {
  const [p, setP] = useState<Planta>(() => lerPlanta(d.f.planta) ?? PLANTA_VAZIA);
  const [feito, setFeito] = useState("");
  // a planta gravada por fora (ex.: «Usar esta planta» da folha) entra no desenho
  const gravada = lerPlanta(d.f.planta);
  const atual = gravada && d.f.planta !== gravarPlanta(p) ? gravada : p;

  const mudar = (np: Planta) => { setP(np); setFeito(""); ctx.A.campo(d.id, "planta", gravarPlanta(np)); };
  const chao = areaChaoM2(atual.paredes);
  const peCampo = peDireitoDoCampo(d.f.diag_pe_direito_m);
  const pe = peCampo ?? PE_DIREITO_SEM_RESPOSTA;
  const paredes = areaParedesM2(atual, pe);

  const usarNasMedidas = () => {
    if (chao === null) return;
    ctx.run(() => {
      porMedida(d.visita.med, "pav", chao);
      if (paredes !== null) porMedida(d.visita.med, "par", paredes);
    });
    setFeito(`Nas medidas: chão ${nf(chao)} m²${paredes !== null ? ` e paredes ${nf(paredes)} m²` : ""}.`);
  };

  return (
    <div className="space-y-4">
      <EditorPlanta planta={atual} onMudar={mudar} divisao={divisao} />
      {/* o que a planta dá, e passá-lo às medidas */}
      <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[15px]">
          {chao === null ? "Feche a planta para ver os m²." : <>
            Chão <b>{nf(chao)} m²</b>{paredes !== null && <> · paredes <b>{nf(paredes)} m²</b></>}
            <span className="block text-sm text-muted-foreground">
              Paredes com {nf(pe)} m de pé-direito{peCampo === null ? " (o pé-direito ainda não foi respondido)" : ""}, sem as portas e as janelas da planta.
            </span>
          </>}
        </p>
        <Button type="button" className="min-h-11 shrink-0" disabled={chao === null} onClick={usarNasMedidas}>
          <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />Usar nas medidas
        </Button>
      </div>
      <p role="status" className="min-h-5 text-sm text-success">{feito}</p>
      {/* 5/11 (Rúben): o projeto do depois, no Estúdio (protótipo): esta planta é o antes, com o pé-direito, o teto falso e o estilo da visita */}
      {chao !== null && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[15px]">Desenhar como vai ficar, escolher as peças no catálogo e ver em 3D.</p>
          <Button type="button" variant="outline" className="min-h-11 shrink-0" onClick={() => {
            const proj = projetoDaVisita(d.nome, { ...d.f, planta: gravarPlanta(atual) });
            if (proj && guardarParaEstudio(proj)) window.open("/prototipo/estudio", "_blank", "noopener");
            else setFeito("Não deu para abrir o Estúdio neste browser.");
          }}><Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />Abrir no Estúdio</Button>
        </div>
      )}
    </div>
  );
}
