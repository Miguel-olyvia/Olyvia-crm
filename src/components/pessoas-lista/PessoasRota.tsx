import { useMemo, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { usePodeApagarNegocios } from "@/hooks/pessoas/usePodeApagarNegocios";
import { usePodeApagarPessoa } from "@/hooks/pessoas/usePodeApagarPessoa";
import { usePermissoesDoFechoNoNegocio } from "@/hooks/pessoas/usePermissoesDoFechoNoNegocio";
import { useUtilizadorPessoas } from "@/hooks/pessoas/useUtilizadorPessoas";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { FontePessoasContext, type FontePessoas, type MomentoGanho } from "@/hooks/pessoas/useFontePessoas";
import { useNegociosAtivos } from "@/hooks/pessoas/useNegociosAtivos";

const MOMENTOS: readonly MomentoGanho[] = ["manual", "proposta_aceite", "contrato_assinado"];

/**
 * A guarda da rota /pessoas: monta a página (em modo real) em todas as organizações; já não há interruptor por organização.
 * A carregar mostra o loader (num contentor status com texto), para a página nascer já com o momento de ganho certo.
 * Se a leitura da configuração do fecho falhar, a página monta na mesma com o momento de ganho a null (as ações que dependem
 * dele ficam escondidas, a base continua a decidir). Só sem organização vai para a página inicial: /leads e /clients
 * redirecionam para /pessoas, por isso redirecionar para lá (ou para /leads) faria um ciclo.
 */
export function PessoasRota({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const negocios = useNegociosAtivos();
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const momentoGanho = MOMENTOS.find((m) => m === negocios.momentoGanho) ?? null;
  // O anew_users.id da sessão (o mesmo que a página de Leads usa em «Só os meus»); null até a leitura acabar.
  const utilizadorId = useUtilizadorPessoas();
  // pessoas.delete: o lixo de negócios só se mostra a quem pode apagar e restaurar.
  const podeApagarNegocios = usePodeApagarNegocios();
  // Apagar uma lead ou um cliente por engano (o item «Apagar» do menu «Mais» da ficha).
  const podeApagarPessoa = usePodeApagarPessoa();
  // As permissões do fecho (documentos, reabrir, converter): só servem para esconder o que a base recusaria. Inclui
  // negocios.proposta.decidir (fn_cat_pode), que a base exige para aceitar/recusar uma proposta de um negócio.
  const permissoesFecho = usePermissoesDoFechoNoNegocio();
  const fonte = useMemo<FontePessoas | null>(
    () => (organizationId ? { modo: "real", organizationId, momentoGanho, utilizadorId, podeApagarNegocios, podeApagarPessoa, permissoesFecho } : null),
    [organizationId, momentoGanho, utilizadorId, podeApagarNegocios, podeApagarPessoa, permissoesFecho],
  );

  if (negocios.isLoading) {
    // O loader partilhado tem alt fixo em português e anima sem parar: aqui a imagem fica escondida
    // do leitor de ecrã e o texto traduzido é que se anuncia.
    return (
      <div role="status" className="flex flex-1 items-center justify-center p-8">
        <span className="sr-only">{t("pessoasPagina.real.loading")}</span>
        <div aria-hidden="true"><OlyviaLoader size={40} /></div>
      </div>
    );
  }
  if (!fonte) return <Navigate to="/" replace />;
  // `key`: ao trocar de organização a página remonta e os filtros (formulário, «Só as minhas») voltam ao início, em vez de levarem
  // para a organização nova um id que é da anterior (a lista viria vazia).
  return <FontePessoasContext.Provider key={organizationId ?? ""} value={fonte}>{children}</FontePessoasContext.Provider>;
}
