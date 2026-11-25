// 25/11 (Rúben: «o 3D às vezes não carrega os modelos: só caixas»). O visualizador com modelos com o 3D simples de reserva, para o Estúdio
// da obra e o do projeto. Antes, cada um tinha um `lazy` fixo e uma reserva que apanhava a falha em silêncio e para sempre: com o separador
// aberto durante um deploy, o ficheiro do 3D já não estava no servidor e o ecrã ficava nas caixas até recarregar. Agora:
//  - o visualizador vem pelo carregador comum (carregarVisualizador3D.ts: tenta outra vez, não guarda a falha, pede-se antes de abrir o 3D);
//  - a falha diz-se por cima do 3D simples, com o que a resolve (recarregar a página, se a aplicação mudou de versão; senão, tentar de novo);
//  - mudar o que se vê (`refazer`) depois de uma falha tenta outra vez sozinho, com um `lazy` novo (o React guarda a falha de cada `lazy`).
import { Component, Suspense, useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { forceReload } from "@/lib/recargaDeploy";
import { faltaVersaoNova, novoVisualizador3D } from "./carregarVisualizador3D";
import type VisualizadorComModelos from "./Visualizador3D";

type PropsVisualizador = ComponentProps<typeof VisualizadorComModelos>;

/** Se o 3D com modelos falhar, fica o 3D simples (`alternativa`), com o porquê e o que fazer por cima. */
export class Falha3D extends Component<{ alternativa: ReactNode; aoFalhar?: (e: unknown) => void; tentarDeNovo: () => void; children: ReactNode }, { erro: unknown; falhou: boolean }> {
  state = { erro: null as unknown, falhou: false };
  static getDerivedStateFromError(erro: unknown) { return { erro, falhou: true }; }
  componentDidCatch(e: unknown) { console.warn("[3D] o 3D com modelos falhou; fica o simples:", e); this.props.aoFalhar?.(e); }
  render() {
    if (!this.state.falhou) return this.props.children;
    const versao = faltaVersaoNova(this.state.erro);
    return (
      <div className="relative h-full">
        {this.props.alternativa}
        <div role="status" className="absolute inset-x-3 top-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-background/95 px-4 py-3 text-sm text-foreground shadow-sm ring-1 ring-border">
          <p className="min-w-0 flex-1">
            {versao
              ? <>Há uma versão nova da aplicação: <b className="font-medium">recarregue a página</b> para ver o 3D com os modelos. Por agora, o 3D simples.</>
              : <>O 3D com os modelos não abriu. Por agora, o 3D simples.</>}
          </p>
          {versao
            ? <Button size="sm" onClick={forceReload}>Recarregar a página</Button>
            : <Button size="sm" variant="outline" onClick={this.props.tentarDeNovo}>Tentar de novo</Button>}
        </div>
      </div>
    );
  }
}

/** O visualizador com modelos (carregado à parte) e o 3D simples de reserva. `refazer`: o que se vê (mudá-lo depois de uma falha tenta outra vez). */
export function Visualizador3DSeguro({ alternativa, refazer = "", ...props }: PropsVisualizador & { alternativa: ReactNode; refazer?: string }) {
  const [v3d, setV3d] = useState(() => ({ Visualizador3D: novoVisualizador3D(), n: 0 }));
  const [falhou, setFalhou] = useState(false);
  const tentarDeNovo = () => { setFalhou(false); setV3d((v) => ({ Visualizador3D: novoVisualizador3D(), n: v.n + 1 })); };
  useEffect(() => { if (falhou) tentarDeNovo(); }, [refazer]); // eslint-disable-line react-hooks/exhaustive-deps
  const { Visualizador3D } = v3d;
  return (
    <Falha3D key={v3d.n} alternativa={alternativa} aoFalhar={() => setFalhou(true)} tentarDeNovo={tentarDeNovo}>
      <Suspense fallback={<p role="status" className="grid h-full place-items-center text-[15px] text-muted-foreground">A abrir o 3D…</p>}>
        <Visualizador3D {...props} />
      </Suspense>
    </Falha3D>
  );
}
