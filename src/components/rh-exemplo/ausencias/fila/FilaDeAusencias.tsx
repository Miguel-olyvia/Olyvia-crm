/**
 * A fila do ecra de Ausencias: as PESSOAS com pedidos por decidir (a mesma lista da fila do mapa de assiduidade) e, ao abrir
 * uma, o painel com todos os pedidos dela. Substitui a tabela plana por pedido do separador «A decidir».
 */
import { ListaFila } from "@/components/rh-exemplo/assiduidade/fila/ListaFilaPessoas";
import { FONTES_AUSENCIAS, TIPOS_AUSENCIAS, type FilaDeTrabalho, type FonteAusencias } from "@/components/rh-exemplo/hooks/useFilaDeTrabalho";
import { PainelAusenciasPessoa, type DecisoesDeAusencia } from "./PainelAusenciasPessoa";

interface FilaDeAusenciasProps {
  fila: FilaDeTrabalho<FonteAusencias>;
  permissoes: { aprovarChefia: boolean; aprovarRh: boolean };
  decisoes: DecisoesDeAusencia;
  /** Abre o detalhe inteiro do pedido (onde se cancela ou se le o motivo). */
  aoAbrirDetalhe: (pedidoId: string) => void;
}

const TEXTOS = {
  titulo: "rhFila.ausencias.titulo",
  ajuda: "rhFila.ausencias.ajuda",
  vazia: "rhFila.ausencias.vazia",
  notaComPeriodo: "rhFila.ausencias.nota",
};

export function FilaDeAusencias({ fila, permissoes, decisoes, aoAbrirDetalhe }: FilaDeAusenciasProps) {
  return (
    <ListaFila
      fila={fila}
      fontes={FONTES_AUSENCIAS}
      tipos={TIPOS_AUSENCIAS}
      textos={TEXTOS}
      renderPainel={(painel) => (
        <PainelAusenciasPessoa
          aberta={painel.aberta}
          pessoa={painel.pessoa}
          hoje={fila.hoje}
          lidaComSucesso={fila.lidaComSucesso}
          fontesComProblema={painel.fontesComProblema}
          permissoes={permissoes}
          decisoes={decisoes}
          aoAbrirDetalhe={aoAbrirDetalhe}
          aoFechar={painel.aoFechar}
          aoDevolverFoco={painel.aoDevolverFoco}
        />
      )}
    />
  );
}