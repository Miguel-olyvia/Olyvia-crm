// Os «Registos ligados» de um negócio na ficha real: os registos vêm dos dados da ficha (contexto), ligar e desligar vão para a base e
// esperam por ela (a linha fica aria-busy; o resultado anuncia-se no fim; um erro diz-se pelo código em role="alert"). Depois de escrever,
// a ficha refaz-se e as listas mudam por si: aqui não se mexe em nada em memória.
import { useRef } from "react";
import { CalendarPlus } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { useAnunciar } from "@/components/ficha-comum/anuncioFicha";
import { registosDoNegocio, registosPorLigar } from "@/components/negocio-metas/acoesRegistos";
import { useDadosNegocio } from "@/components/negocio-metas/costuraNegocio";
import type { MutacoesNegocio, RefRegistoBase } from "@/components/negocio-metas/mutacoesNegocio";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { FOCO } from "@/components/negocio-metas/estilos";
import { useRegistosPessoa } from "@/components/negocio-metas/registosPessoa";
import { cn } from "@/lib/utils";
import { useMarcarVisita } from "./marcarVisitaContexto";
import { chaveDe, itensDe, oQueDoRegisto, RegistosLigadosLista, type ItemRegisto } from "./RegistosLigadosLista";
import { useLigacoes } from "./useLigacoes";

const P = "pessoasPagina.linked.";

interface RegistosLigadosRealProps {
  negocio: NegocioMes;
  aberto: boolean;
  mutacoes: MutacoesNegocio;
}

export function RegistosLigadosReal({ negocio, aberto, mutacoes }: RegistosLigadosRealProps) {
  const { t } = useTranslation();
  const anunciar = useAnunciar();
  const dados = useDadosNegocio();
  const estado = useRegistosPessoa();
  const { ocupadas, erro, correr } = useLigacoes();
  // Só a ficha real monta o diálogo de marcar visita; fora dela (sem provider) o botão não existe.
  const marcarVisita = useMarcarVisita();
  // A linha clicada muda de lista quando a ficha se refaz e o botão desaparece: o foco vai para o título de «por ligar», que é estável.
  const foco = useRef<HTMLParagraphElement>(null);
  const ligados = itensDe(registosDoNegocio(estado, negocio.id));
  const porLigar = itensDe(registosPorLigar(estado, negocio.pessoaId ?? ""));
  const podeAgir = dados?.podeEditar ?? false;
  const oQue = (i: ItemRegisto): string => oQueDoRegisto(t, i);

  const mudar = (ref: RefRegistoBase, oQueDiz: string, ligar: boolean): void => {
    correr(
      chaveDe(ref),
      () => (ligar ? mutacoes.ligar(negocio.id, ref) : mutacoes.desligar(negocio.id, ref)),
      () => {
        anunciar(t(`${P}live.${ligar ? "linked" : "unlinked"}`, { what: oQueDiz }));
        foco.current?.focus();
      },
    );
  };

  // Sem fornecedor do questionário: o painel «Visita e levantamento» monta o seu (PainelVisitaLevantamentoReal), só quando se abre.
  return (
    <RegistosLigadosLista
      ligados={ligados} porLigar={porLigar} aberto={aberto} podeAgir={podeAgir} desligaLevantamento={false} oQue={oQue}
      aoLigar={(i) => mudar(i.ref, oQue(i), true)} aoDesligar={(i) => mudar(i.ref, oQue(i), false)} ocupadas={ocupadas} erro={erro} focoRef={foco}
      depois={aberto && podeAgir && dados ? (
        <>
          {marcarVisita && negocio.pessoaId && (
            <Button
              type="button" variant="outline" className={cn("min-h-11 gap-2", FOCO)}
              onClick={() => marcarVisita.pedir({ pessoaId: negocio.pessoaId, nome: negocio.pessoa, moradaLead: null, negocioId: negocio.id })}
            >
              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              {t(`${P}markVisit`)}
            </Button>
          )}
        </>
      ) : null}
    />
  );
}
