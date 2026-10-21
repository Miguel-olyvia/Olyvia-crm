// A lista de negócios da ficha real com o filtro «Lixo»: «Em lista» (a lista normal, que não mostra negócios apagados) e «Lixo» (os negócios
// mandados para o lixo, com o estado, a data e os eventos apagado e restaurado, e o botão que os restaura). Só aparece a quem pode restaurar:
// a base exige pessoas.edit e pessoas.delete (com âmbito) para apagar e restaurar. Um negócio no lixo não se edita. Sem a ficha real (o exemplo)
// ou sem essas permissões mostra só a lista normal.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Undo2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Seccao } from "@/components/ficha-comum/Seccao";
import { useDadosNegocio } from "@/components/negocio-metas/costuraNegocio";
import { FOCO } from "@/components/negocio-metas/estilos";
import { useMutacoesDaFicha } from "@/components/negocio-metas/mutacoesNegocio";
import { useAvisarNegocio } from "@/components/negocio-metas/useAvisarNegocio";
import { usePermissoesPorNegocio } from "@/hooks/pessoas/bandeirasNegocio";
import { diaLisboa } from "@/hooks/pessoas/tempoLisboa";
import { useNegociosNoLixo, type NegocioNoLixo } from "@/hooks/pessoas/useNegociosNoLixo";
import { ConfirmarLixoNegocioDialogo, type NegocioDoLixo } from "./ConfirmarLixoNegocioDialogo";
import { textoDiaCompleto } from "./formatoPessoas";
import { podeRestaurarDoLixo } from "./permissoesNegocio";
import { useFocoDepois } from "./useFocoDepois";

const N = "pessoasPagina.neg.bin.";
const R = "pessoasPagina.neg.restore.";

/** «dd/mm/aaaa» de um instante (o dia de Lisboa); vazio se não se lê. */
const dia = (instante: string | null): string => {
  const d = instante ? diaLisboa(instante) : null;
  return d ? textoDiaCompleto(d) : "";
};

interface ItemProps {
  negocio: NegocioNoLixo;
  aoRestaurar: (negocio: NegocioNoLixo) => void;
}

function ItemDoLixo({ negocio, aoRestaurar }: ItemProps) {
  const { t } = useTranslation();
  // Com a bandeira da migration B, `pode_restaurar` deste negócio (se a ficha o trouxe) pode esconder o botão; sem ele vale o que a página já sabe.
  const podeRestaurar = podeRestaurarDoLixo(useDadosNegocio(), negocio.id, usePermissoesPorNegocio());
  return (
    <li className="space-y-2 border-b border-border py-3 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="break-words text-[15px] font-semibold text-foreground">{negocio.titulo}</p>
          <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{t(`${N}state.${negocio.estado}`)}</span>
            {negocio.apagadoEm && <span>{t(`${N}deletedAt`, { date: dia(negocio.apagadoEm) })}</span>}
          </p>
        </div>
        {podeRestaurar && (
          <Button
            type="button" variant="outline" aria-label={t(`${R}sr`, { work: negocio.titulo })} className={cn("min-h-11 gap-2", FOCO)}
            onClick={() => aoRestaurar(negocio)}
          >
            <Undo2 className="h-4 w-4" aria-hidden="true" />
            {t(`${R}button`)}
          </Button>
        )}
      </div>
      {negocio.eventos.length > 0 && (
        <ul className="space-y-0.5 text-sm text-muted-foreground">
          {negocio.eventos.map((e) => <li key={e.id}>{t(`${N}event.${e.tipo}`, { date: dia(e.em) })}</li>)}
        </ul>
      )}
      <p className="text-sm text-muted-foreground">{t(`${N}noEdit`)}</p>
    </li>
  );
}

interface NegociosNoLixoProps {
  pessoaId: string;
  pessoaNome: string;
  aoRestaurar: (negocio: NegocioDoLixo) => void;
}

/** O lixo da pessoa. Só existe montado com o filtro «Lixo» escolhido: é aqui que se lê (a lista normal e o exemplo nunca o leem). */
function NegociosNoLixo({ pessoaId, pessoaNome, aoRestaurar }: NegociosNoLixoProps) {
  const { t } = useTranslation();
  const lixo = useNegociosNoLixo(pessoaId, true);
  return (
    <Seccao titulo={t(`${N}title`)}>
      {lixo.isLoading && <p role="status" className="text-sm text-muted-foreground">{t(`${N}loading`)}</p>}
      {lixo.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-foreground">
          <p>{t(`${N}error`)}</p>
          <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={lixo.repetir}>{t(`${N}retry`)}</Button>
        </div>
      )}
      {!lixo.isLoading && !lixo.isError && lixo.itens.length === 0 && <p className="text-sm text-muted-foreground">{t(`${N}empty`)}</p>}
      {lixo.itens.length > 0 && (
        <ul aria-label={t(`${N}list.label`)}>
          {lixo.itens.map((n) => (
            <ItemDoLixo
              key={n.id} negocio={n}
              aoRestaurar={(negocio) => aoRestaurar({ id: negocio.id, pessoa: pessoaNome, servico: negocio.titulo })}
            />
          ))}
        </ul>
      )}
    </Seccao>
  );
}

export interface ListaNegociosComLixoProps {
  pessoaId: string;
  pessoaNome: string;
  lista: ReactNode;
  /** A ficha pede o foco para o filtro (o negócio acabou de ir para o lixo e o detalhe fechou-se: o botão que o tinha desapareceu). */
  focarAoEntrar?: boolean;
  /** O foco já foi dado: a ficha deixa de o pedir. */
  aoFocado?: () => void;
}

/**
 * A lista fica SEMPRE no mesmo sítio da árvore: o que depende das permissões (que carregam a seguir à ficha) é só o filtro e o lixo. Se a lista
 * mudasse de lugar quando `podeApagar` passa a verdadeiro, remontava e perdia o estado local e o scroll.
 */
export function ListaNegociosComLixo({ pessoaId, pessoaNome, lista, focarAoEntrar = false, aoFocado }: ListaNegociosComLixoProps) {
  const { t } = useTranslation();
  const dados = useDadosNegocio();
  const mutacoes = useMutacoesDaFicha();
  const avisar = useAvisarNegocio();
  const focarDepois = useFocoDepois();
  const [vista, setVista] = useState<"lista" | "lixo">("lista");
  const [restaurando, setRestaurando] = useState<NegocioDoLixo | null>(null);
  const botaoLista = useRef<HTMLButtonElement>(null);
  const botaoLixo = useRef<HTMLButtonElement>(null);
  const veLixo = dados?.podeApagar === true && dados.podeEditar && mutacoes?.restaurar !== undefined;
  const noLixo = veLixo && vista === "lixo";
  // Ao mandar um negócio para o lixo o detalhe fecha-se e o botão que tinha o foco desaparece: a ficha pede-o para o filtro. Só nesse caso: abrir
  // a ficha ou o separador não tira o foco a quem acabou de chegar.
  useEffect(() => {
    if (!focarAoEntrar) return;
    // Adiado um ciclo: o diálogo de confirmação sai junto com o detalhe e devolve o foco ao corpo da página no ciclo seguinte; este pedido, feito
    // depois, é o que fica.
    focarDepois(botaoLista);
    aoFocado?.();
  }, [focarAoEntrar, aoFocado, focarDepois]);
  const botoes = [
    { id: "lista" as const, texto: t(`${N}filter.active`), ref: botaoLista },
    { id: "lixo" as const, texto: t(`${N}filter.bin`), ref: botaoLixo },
  ];
  return (
    <div className="space-y-4">
      {veLixo && (
        <div role="group" aria-label={t(`${N}filter.label`)} className="flex flex-wrap gap-2">
          {botoes.map((b) => (
            <Button
              key={b.id} ref={b.ref} type="button" variant={vista === b.id ? "default" : "outline"} aria-pressed={vista === b.id}
              className={cn("min-h-11", FOCO)} onClick={() => setVista(b.id)}
            >
              {b.texto}
            </Button>
          ))}
        </div>
      )}
      {!noLixo ? lista : <NegociosNoLixo pessoaId={pessoaId} pessoaNome={pessoaNome} aoRestaurar={setRestaurando} />}
      {veLixo && (
        <ConfirmarLixoNegocioDialogo
          modo="restaurar" negocio={restaurando} aoFechar={() => setRestaurando(null)}
          aoConcluido={(anuncio) => {
            avisar(anuncio);
            // O botão «Restaurar» desapareceu com o negócio: o foco passa para o filtro.
            focarDepois(botaoLixo);
          }}
        />
      )}
    </div>
  );
}
