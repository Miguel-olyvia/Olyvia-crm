/**
 * Os dados reais da pagina «Organizacao»: a arvore da organizacao activa (filiais), os centros
 * (`hr_locais_trabalho`), as pessoas e a colocacao de cada uma no organograma. Tambem grava
 * («Ligar», «Alterar ligacao», «Desligar») na colocacao.
 *
 * O CENTRO nao se grava aqui: `pessoas.local_id` e derivado da afectacao em aberto e muda-se na ficha da pessoa.
 * O vinculo legal por empresa nao tem tabela: a empresa e a propria organizacao. O historico de ligacoes de
 * cada pessoa NAO se carrega aqui (a lista so tem as colocacoes vigentes): le-se por pessoa, ao abrir o
 * «Historico» na lista (`ListaPessoasNo`), de `pessoas_colocacao_organograma`; `estado.historico` fica vazio.
 */
import { useCallback, useMemo } from "react";
import { useCompany } from "@/components/rh-exemplo/hooks/useCompany";
import { useColocacoesDaOrganizacao } from "@/components/rh-exemplo/hooks/useColocacoesDaOrganizacao";
import { useFiliaisDaArvore } from "@/components/rh-exemplo/hooks/useFiliaisDaArvore";
import { useLocaisTrabalho } from "@/components/rh-exemplo/hooks/useLocaisTrabalho";
import { usePessoas } from "@/components/rh-exemplo/hooks/usePessoas";
import {
  construirEstruturaReal, ligacoesReais, pessoasOrgReais, validarPedidoReal,
} from "@/components/rh-exemplo/organizacao/estruturaReal";
import { MOTIVO_MINIMO } from "@/components/rh-exemplo/organizacao/tipos";
import type {
  EstadoOrganizacao, EstruturaOrg, PedidoLigacao, PessoaOrg, ResultadoGravacao,
} from "@/components/rh-exemplo/organizacao/tipos";

export interface OrganizacaoReal {
  est: EstruturaOrg;
  estado: EstadoOrganizacao;
  pessoas: PessoaOrg[];
  loading: boolean;
  /** Sem permissao para ver a colocacao: a pagina avisa em vez de mostrar «ninguem ligado». */
  semPermissao: boolean;
  /** A leitura da colocacao falhou (nao por permissao): a pagina avisa e oferece «Tentar de novo» em vez de mostrar «ninguem ligado». */
  falhaLeitura: boolean;
  recarregar: () => void;
  guardar: (pedido: PedidoLigacao) => Promise<ResultadoGravacao>;
  desligar: (pessoaId: string, motivo: string) => Promise<ResultadoGravacao>;
}

export function useOrganizacaoReal(): OrganizacaoReal {
  const { activeCompany, isLoading: empresaA } = useCompany();
  const { filiais, loading: filiaisA } = useFiliaisDaArvore();
  const { locais, loading: locaisA } = useLocaisTrabalho();
  const { pessoas: fichas, loading: pessoasA } = usePessoas();
  const col = useColocacoesDaOrganizacao();
  const empresaId = activeCompany.id;
  const empresaNome = activeCompany.name;

  const est = useMemo(
    () => construirEstruturaReal({ empresa: { id: empresaId, name: empresaNome }, filiais, locais }),
    [empresaId, empresaNome, filiais, locais],
  );
  const ligacoes = useMemo(() => ligacoesReais(est, fichas, col.vigentes), [est, fichas, col.vigentes]);
  const estado = useMemo<EstadoOrganizacao>(() => ({ ligacoes, historico: [] }), [ligacoes]);
  const pessoas = useMemo(() => pessoasOrgReais(fichas), [fichas]);

  const guardar = useCallback(
    async (pedido: PedidoLigacao): Promise<ResultadoGravacao> => {
      const erro = validarPedidoReal(est, pedido);
      if (erro) return { ok: false, erro };
      const r = await col.guardar({
        pessoaId: pedido.pessoaId, nodeId: pedido.filialId, desde: pedido.desde, motivo: pedido.motivo.trim() || null,
      });
      if (r.tipo === "ok") return { ok: true, tipo: r.operacao === "desligar" ? "alterar" : r.operacao };
      return { ok: false, erro: r.codigo === "base" ? "falhaBase" : r.codigo === "naoLigada" ? "naoLigada" : "inicioNaoPosterior", mensagem: r.mensagem };
    },
    [est, col],
  );

  const desligar = useCallback(
    async (pessoaId: string, motivo: string): Promise<ResultadoGravacao> => {
      if (motivo.trim().length < MOTIVO_MINIMO) return { ok: false, erro: "motivoCurto" };
      const r = await col.desligar(pessoaId, motivo.trim());
      if (r.tipo === "ok") return { ok: true, tipo: "desligar" };
      return { ok: false, erro: r.codigo === "naoLigada" ? "naoLigada" : "falhaBase", mensagem: r.mensagem };
    },
    [col],
  );

  return {
    est, estado, pessoas, guardar, desligar,
    loading: empresaA || filiaisA || locaisA || pessoasA || col.loading,
    semPermissao: col.recusado,
    falhaLeitura: col.erro,
    recarregar: () => void col.recarregar(),
  };
}
