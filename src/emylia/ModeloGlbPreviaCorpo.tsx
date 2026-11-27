// 27/11: o corpo da pré-visualização do GLB próprio (ModeloGlbPrevia.tsx o pede à parte, só depois de «Ver em 3D»): põe o ficheiro escolhido na cache dos GLB pelos bytes (semearGlb:
// um endereço `blob:` seria bloqueado pela CSP da aplicação, que não o tem no connect-src) e mostra-o com a pré-visualização do produto (Previa3DProduto → ModeloProprio). Um GLB já guardado
// vai pelo URL público do storage. Este ficheiro puxa o three.js (glb.ts): por isso fica fora do diálogo, que só o carrega ao pedir o 3D.
import { useEffect, useState } from "react";
import { Previa3DProduto } from "./Previa3DProduto";
import { semearGlb, soltarGlb } from "./planta3d/modelosHtml/glb";

/** De onde vem o GLB a mostrar: um ficheiro já guardado (URL público) ou o que se acabou de escolher (bytes em memória, com a chave da cache). */
export type FontePrevia = { t: "url"; url: string } | { t: "local"; chave: string; dados: ArrayBuffer };

export default function ModeloGlbPreviaCorpo({ fonte, nome }: { fonte: FontePrevia; nome: string }) {
  // semeia-se ANTES de o 3D ler (a leitura acontece no desenho do filho, antes de qualquer efeito); semear de novo a mesma chave não faz nada
  useState(() => { if (fonte.t === "local") semearGlb(fonte.chave, fonte.dados.slice(0)); return null; });
  const chave = fonte.t === "local" ? fonte.chave : null;
  // ao sair, o ficheiro semeado liberta-se da cache (passado o tempo de espera habitual: voltar a abrir o 3D logo a seguir não o volta a ler)
  useEffect(() => {
    if (!chave) return undefined;
    return () => { soltarGlb(chave); };
  }, [chave]);
  return <Previa3DProduto nome={nome} no={null} arvore={[]} glbProprio={fonte.t === "local" ? fonte.chave : fonte.url} alturaClasse="h-64" />;
}
