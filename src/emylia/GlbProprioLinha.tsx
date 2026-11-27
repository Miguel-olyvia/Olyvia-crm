// 27/11: as duas peças que as linhas de Categorias, Subcategorias e Modelos partilham para o GLB PRÓPRIO: o chip («GLB · 1,2 MB» ou «Sem GLB») e o botão «Modelo 3D próprio…» que abre
// o diálogo (ModeloGlbDialogo.tsx). O botão fica sempre à vista; sem permissão (ou a gravar, ou numa partilhada) fica aria-disabled com a razão ligada e no `title`, e o clique não faz nada
// (nada de `disabled`: o foco não se perde).
import { Box } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOTAO_TEXTO, Razao, protegido } from "./gestaoPecas";
import { chipGlb } from "./glbProprioTextos";

/** O chip da linha: o que está guardado. Sem a chave na leitura (migração por aplicar) também diz «Sem GLB». */
export function ChipGlb({ caminho, bytes }: { caminho: string | null | undefined; bytes: number | null | undefined }) {
  return <span className={cn("rounded-md bg-muted px-2 py-0.5 text-sm", caminho ? "text-foreground/75" : "text-muted-foreground")}>{chipGlb(caminho, bytes)}</span>;
}

/** O botão que abre o diálogo. `idBotao`: o id a que o foco regressa ao fechar; `rotulo`: o nome acessível (começa pelo texto visível); `razao`: porque está bloqueado (null: livre). */
export function BotaoGlbProprio({ idBotao, rotulo, aberto, razao, aoAbrir }: { idBotao: string; rotulo: string; aberto: boolean; razao: string | null; aoAbrir: () => void }) {
  const idRazao = `rz-${idBotao}`;
  return (
    <>
      <button id={idBotao} type="button" aria-label={rotulo} aria-haspopup="dialog" aria-expanded={aberto} title={razao ?? undefined} className={BOTAO_TEXTO} {...protegido(razao, idRazao, aoAbrir)}>
        <Box className="h-4 w-4" aria-hidden="true" />Modelo 3D próprio…
      </button>
      <Razao id={idRazao}>{razao}</Razao>
    </>
  );
}
