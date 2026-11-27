// 27/11: a pré-visualização 3D do GLB próprio dentro do diálogo (ModeloGlbDialogo.tsx). Só existe depois de se pedir («Ver em 3D»): o corpo (ModeloGlbPreviaCorpo.tsx, que puxa o three.js)
// vem num ficheiro à parte, pedido aqui. Mostra o ficheiro com o ModeloProprio (a forma do GLB; sem medidas nem cor de produto, no tamanho do ficheiro).
// Se o ficheiro do 3D não vier (aplicação mudou de versão, rede), diz-se em texto e há «Tentar de novo», com um `lazy` novo (o React guarda a falha de cada `lazy`).
import { Component, Suspense, lazy, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NOTA } from "./pecasForm";
import type { FontePrevia } from "./ModeloGlbPreviaCorpo";

export type { FontePrevia };

const novaPrevia = () => lazy(() => import("./ModeloGlbPreviaCorpo"));

/** Apanha a falha de pedir o código do 3D (o `Previa3DProduto` já apanha as falhas do próprio 3D). */
class FalhaPrevia extends Component<{ aoTentarDeNovo: () => void; children: ReactNode }, { falhou: boolean }> {
  state = { falhou: false };
  static getDerivedStateFromError() { return { falhou: true }; }
  componentDidCatch(e: unknown) { console.warn("[catálogo] a pré-visualização do GLB próprio não abriu:", e); }
  render() {
    if (!this.state.falhou) return this.props.children;
    return (
      <div className="grid justify-items-start gap-2 rounded-xl border border-border bg-muted/50 p-4">
        <p role="status" className={NOTA}>Não foi possível abrir a pré-visualização 3D. Se a aplicação foi atualizada, recarregue a página.</p>
        <Button variant="outline" className="min-h-11 text-[15px]" onClick={this.props.aoTentarDeNovo}>Tentar de novo</Button>
      </div>
    );
  }
}

/** O 3D do GLB `fonte` (o ficheiro escolhido, em memória, ou o público do já guardado). `nome`: o do nível, que só serve de etiqueta. */
export function ModeloGlbPrevia({ fonte, nome }: { fonte: FontePrevia; nome: string }) {
  const [v, setV] = useState(() => ({ Previa: novaPrevia(), n: 0 }));
  const { Previa } = v;
  return (
    <FalhaPrevia key={v.n} aoTentarDeNovo={() => setV((x) => ({ Previa: novaPrevia(), n: x.n + 1 }))}>
      <Suspense fallback={<p role="status" className={`${NOTA} flex items-center gap-2`}><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />A abrir o 3D…</p>}>
        <Previa fonte={fonte} nome={nome} />
      </Suspense>
    </FalhaPrevia>
  );
}
