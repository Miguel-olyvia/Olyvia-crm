// Os botões «Editar negócio» e «Enviar para o lixo» do detalhe de um negócio, com os seus diálogos. Só na ficha real (o exemplo não tem as
// escritas diretas) e atrás da permissão certa: editar exige pessoas.edit; o lixo exige pessoas.edit E pessoas.delete (a base pede as duas:
// a política de UPDATE e o gatilho do lixo). Depois de mandar para o lixo o negócio já não existe na lista: volta-se à lista de negócios.
import { useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useDadosNegocio } from "@/components/negocio-metas/costuraNegocio";
import { FOCO } from "@/components/negocio-metas/estilos";
import { useMutacoesDaFicha } from "@/components/negocio-metas/mutacoesNegocio";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { useAvisarNegocio } from "@/components/negocio-metas/useAvisarNegocio";
import { ConfirmarLixoNegocioDialogo } from "./ConfirmarLixoNegocioDialogo";
import { EditarNegocioDialogo } from "./EditarNegocioDialogo";
import { useFocoDepois } from "./useFocoDepois";

const N = "pessoasPagina.neg.";

interface AcoesEdicaoNegocioProps {
  negocio: NegocioMes;
  /** O negócio foi para o lixo: o detalhe fecha-se (volta-se à lista de negócios). */
  aoApagado: () => void;
}

export function AcoesEdicaoNegocio({ negocio, aoApagado }: AcoesEdicaoNegocioProps) {
  const { t } = useTranslation();
  const dados = useDadosNegocio();
  const mutacoes = useMutacoesDaFicha();
  const avisar = useAvisarNegocio();
  const [editando, setEditando] = useState(false);
  const [apagando, setApagando] = useState(false);
  const botaoEditar = useRef<HTMLButtonElement>(null);
  const focarDepois = useFocoDepois();
  const podeEditar = dados?.podeEditar === true && mutacoes?.editar !== undefined;
  const podeApagar = dados?.podeEditar === true && dados.podeApagar === true && mutacoes?.enviarParaLixo !== undefined;
  if (!podeEditar && !podeApagar) return null;
  return (
    <div className="flex flex-wrap items-start gap-3">
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
