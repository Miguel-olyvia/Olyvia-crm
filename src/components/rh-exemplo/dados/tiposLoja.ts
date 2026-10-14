/** A forma do que a apresentação guarda em memória: uma ficha por pessoa e os catálogos da organização. */
import type {
  HorarioPlaneado,
  HorarioRealizado,
  LocalTrabalho,
  Pessoa,
  PessoaAfectacao,
  PessoaAnexo,
  PessoaColocacaoOrganograma,
  PessoaConta,
  PessoaContactoEmergencia,
  PessoaDadosBancarios,
  PessoaDadosPessoais,
  PessoaDadosSaude,
  PessoaDocumento,
  PessoaDocumentoModelo,
  PessoaFardamento,
  PessoaIdentificacao,
  PessoaMorada,
  PessoaRetribuicao,
  PessoaSindicalizacao,
  PessoaVinculo,
  PessoaVinculoHoras,
} from "@/components/rh-exemplo/tipos";
import type {
  AusenciaAjuste,
  AusenciaDecisao,
  AusenciaDia,
  AusenciaDireito,
  AusenciaPedido,
  AusenciaTipo,
} from "@/components/rh-exemplo/tiposAusencias";
import type { HrCargoPeriodo, PessoaCargoPeriodo } from "@/components/rh-exemplo/lib/cargosPeriodos";
import type {
  AvisoContrato,
  IndicacaoContrato,
  RenovacaoContrato,
  RespostaIndicacao,
} from "@/components/rh-exemplo/lib/fimContrato";
import type { AlteracaoDoVinculo } from "@/components/rh-exemplo/hooks/usePessoaVinculoAlteracoes";
import type { HrCargo } from "@/components/rh-exemplo/hooks/useCargos";
import type { Pendencia } from "@/components/rh-exemplo/hooks/useAdmissaoPendencias";
import type { ResumoConvite } from "@/components/rh-exemplo/hooks/useConviteAdmissaoResumo";

export interface FichaRh {
  pessoa: Pessoa;
  dadosPessoais: PessoaDadosPessoais | null;
  identificacao: PessoaIdentificacao | null;
  morada: PessoaMorada | null;
  emergencia: PessoaContactoEmergencia | null;
  vinculos: PessoaVinculo[];
  retribuicoes: PessoaRetribuicao[];
  horasVersoes: PessoaVinculoHoras[];
  horarioPlaneado: HorarioPlaneado[];
  horarioRealizado: HorarioRealizado[];
  bancarios: PessoaDadosBancarios | null;
  saude: PessoaDadosSaude | null;
  conta: PessoaConta | null;
  fardamento: PessoaFardamento | null;
  sindicalizacao: PessoaSindicalizacao | null;
  afectacoes: PessoaAfectacao[];
  colocacoes: PessoaColocacaoOrganograma[];
  cargosPeriodos: PessoaCargoPeriodo[];
  documentos: PessoaDocumento[];
  anexos: PessoaAnexo[];
  convite: ResumoConvite | null;
  pendencias: Pendencia[];
  alteracoesVinculo: AlteracaoDoVinculo[];
  renovacoes: RenovacaoContrato[];
  avisos: AvisoContrato[];
  indicacoes: IndicacaoContrato[];
  /** Resposta do responsável ao aviso de fim de contrato, por vínculo. */
  respostasFim: Record<string, { resposta: RespostaIndicacao; em: string }>;
  ausencias: {
    pedidos: AusenciaPedido[];
    decisoes: AusenciaDecisao[];
    dias: AusenciaDia[];
    direitos: AusenciaDireito[];
    ajustes: AusenciaAjuste[];
  };
  /** Valores de exemplo que o "revelar" mostra (nunca vêm de lado nenhum). */
  segredos: { niss: string; conta: string };
}

export interface FilialExemplo {
  id: string;
  name: string;
}

export interface EstadoRh {
  /** Ordem de apresentação da lista. */
  ordem: string[];
  fichas: Record<string, FichaRh>;
  locais: LocalTrabalho[];
  cargos: HrCargo[];
  cargosPeriodos: HrCargoPeriodo[];
  modelos: PessoaDocumentoModelo[];
  tiposAusencia: AusenciaTipo[];
  filiais: FilialExemplo[];
  papeis: Array<{ id: string; name: string; code: string | null }>;
  /** A pessoa a que pertence quem está a ver o ecrã (para "a minha ficha"). */
  minhaPessoaId: string | null;
}
