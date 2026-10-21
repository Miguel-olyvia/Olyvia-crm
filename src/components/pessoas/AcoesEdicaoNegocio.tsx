// Os botões «Editar negócio» e «Enviar para o lixo» do detalhe de um negócio, com os seus diálogos. Só na ficha real (o exemplo não tem as
// escritas diretas) e atrás da permissão certa: editar exige pessoas.edit; o lixo exige pessoas.edit E pessoas.delete (a base pede as duas:
// a política de UPDATE e o gatilho do lixo). Um negócio ganho ou perdido não se edita: o ecrã diz que é preciso reabri-lo primeiro (o lixo não
// depende do estado). Depois de mandar para o lixo o negócio já não existe na lista: volta-se à lista de negócios.
import { useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { useMutacoesDaFicha } from "@/components/negocio-metas/mutacoesNegocio";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { useAvisarNegocio } from "@/components/negocio-metas/useAvisarNegocio";
import { useAlteracoesNegocios } from "@/components/negocio-metas/negociosAlterados";
import { ConfirmarLixoNegocioDialogo } from "./ConfirmarLixoNegocioDialogo";
import { EditarNegocioDialogo } from "./EditarNegocioDialogo";
import { estadoFechado, useAcoesDoNegocio } from "./permissoesNegocio";
import { useFocoDepois } from "./useFocoDepois";

const N = "pessoasPagina.neg.";

interface AcoesEdicaoNegocioProps {
  negocio: NegocioMes;
  /** O negócio foi para o lixo: o detalhe fecha-se (volta-se à lista de negócios). */
  aoApagado: () => void;
}

export function AcoesEdicaoNegocio({ negocio, aoApagado }: AcoesEdicaoNegocioProps) {
  const { t } = useTranslation();
  const acoes = useAcoesDoNegocio(negocio);
  const fechado = estadoFechado(negocio, useAlteracoesNegocios().perdidos[negocio.id]);
  const mutacoes = useMutacoesDaFicha();
  const avisar = useAvisarNegocio();
  const [editando, setEditando] = useState(false);
  const [apagando, setApagando] = useState(false);
  const botaoEditar = useRef<HTMLButtonElement>(null);
  const focarDepois = useFocoDepois();
  const podeEditar = acoes.podeEditar && mutacoes?.editar !== undefined;
  const podeApagar = acoes.podeApagar && mutacoes?.enviarParaLixo !== undefined;
  // Fechado e sem mais nada a oferecer: nada se desenha; com permissão para o editar, diz-se o que falta fazer (reabrir).
  const avisoFechado = fechado !== null && acoes.podeAgir && mutacoes?.editar !== undefined;
  if (!podeEditar && !podeApagar && !avisoFechado) return null;
  return (
    <div className="flex flex-wrap items-start gap-3">
      {avisoFechado && <p className="w-full text-sm text-muted-foreground">{t(`${N}${fechado === "ganho" ? "closed.won" : "closed.lost"}`)}</p>}
      {podeEditar && (
        <Button ref={botaoEditar} type="button" variant="outline" className={cn("min-h-11 gap-2", FOCO)} onClick={() => setEditando(true)}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
          {t(`${N}edit.button`)}
        </Button>
      )}
      {podeApagar && (
        <Button type="button" variant="outline" className={cn("min-h-11 gap-2", FOCO)} onClick={() => setApagando(true)}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {t(`${N}trash.button`)}
        </Button>
      )}
      <EditarNegocioDialogo
        negocio={editando ? negocio : null} aoFechar={() => setEditando(false)}
        aoEditado={(anuncio) => {
          avisar(anuncio);
          // O botão que abriu o diálogo continua aí: o foco volta-lhe (o diálogo não o devolve depois de gravar).
          focarDepois(botaoEditar);
        }}
      />
      <ConfirmarLixoNegocioDialogo
        modo="apagar" negocio={apagando ? { id: negocio.id, pessoa: negocio.pessoa, servico: negocio.servico } : null}
        aoFechar={() => setApagando(false)} aoConcluido={(anuncio) => { avisar(anuncio); aoApagado(); }}
      />
    </div>
  );
}
