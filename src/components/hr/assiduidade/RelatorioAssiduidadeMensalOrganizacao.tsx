/**
 * O relatorio mensal de assiduidade de TODA a organizacao -- uma instancia de
 * `RelatorioAssiduidadeMensalConteudo` por pessoa, uma a seguir a outra, com
 * quebra de pagina entre elas no PDF final.
 *
 * A LISTA DE PESSOAS VEM DE FORA, SEMPRE
 * ----------------------------------------
 * Este componente nao decide quem entra no relatorio: recebe a mesma lista
 * (e o mesmo mes) que ja esta visivel no Mapa de assiduidade, para respeitar
 * qualquer filtro activo nesse ecra. Nao faz pesquisa propria de pessoas.
 *
 * CADA PESSOA CHAMA O SEU PROPRIO HOOK
 * ---------------------------------------
 * As regras dos hooks nao deixam chamar `useRelatorioAssiduidadeMensal` num
 * ciclo -- por isso cada pessoa e uma instancia propria de
 * `RelatorioAssiduidadeMensalConteudo`, que chama o hook por si. Todas
 * arrancam a busca em paralelo assim que o dialog abre.
 *
 * SO GERA O PDF QUANDO A PESSOA CLICA, NUNCA SOZINHO
 * -----------------------------------------------------
 * Enquanto nem todas as pessoas terminaram de carregar, o conteudo fica
 * escondido (mas montado, para a busca continuar) e mostra-se um estado "a
 * preparar", com o botao de exportar desactivado. So depois de todas
 * terminarem e que o botao "Exportar" fica activo -- a pessoa decide quando.
 * Ao clicar, junta os dados ja acumulados de cada pessoa (via `aoObterDados`)
 * num so PDF (`generateRelatorioAssiduidadeMensalOrganizacaoPdfBlob`) e
 * descarrega-o -- o dialog nunca gera nem imprime nada por conta propria.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { Download, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "@/lib/toast";
import {
  RelatorioAssiduidadeMensalConteudo,
  type DadosRelatorioAssiduidadeMensal,
} from "@/components/hr/RelatorioAssiduidadeMensalConteudo";
import {
  generateRelatorioAssiduidadeMensalOrganizacaoPdfBlob,
  type PessoaComDadosDoRelatorio,
} from "@/utils/generateRelatorioAssiduidadeMensalOrganizacaoPdfBlob";
import type { PermissoesAssiduidade } from "@/types/hrAssiduidade";

export interface PessoaDoRelatorioOrganizacao {
  id: string;
  nome: string;
  cargo?: string | null;
  dataAdmissao?: string | null;
}

interface RelatorioAssiduidadeMensalOrganizacaoProps {
  aberto: boolean;
  onFechar: () => void;
  ano: number;
  mes: number;
  pessoas: PessoaDoRelatorioOrganizacao[];
  permissoes: PermissoesAssiduidade;
}

export function RelatorioAssiduidadeMensalOrganizacao({
  aberto,
  onFechar,
  ano,
  mes,
  pessoas,
  permissoes,
}: RelatorioAssiduidadeMensalOrganizacaoProps) {
  const { t } = useTranslation();
  const { activeCompany } = useCompany();
  const [carregadas, setCarregadas] = useState<Set<string>>(() => new Set());
  const [aExportar, setAExportar] = useState(false);
  const dadosPorPessoaRef = useRef<Record<string, DadosRelatorioAssiduidadeMensal>>({});

  // Reabrir (ou mudar de mes/pessoas) recomeca a contagem do zero.
  useEffect(() => {
    if (!aberto) return;
    setCarregadas(new Set());
    dadosPorPessoaRef.current = {};
  }, [aberto, ano, mes, pessoas]);

  const total = pessoas.length;
  const pronto = aberto && total > 0 && carregadas.size >= total;

  const marcarCarregada = useCallback((pessoaId: string) => {
    setCarregadas((atual) => {
      if (atual.has(pessoaId)) return atual;
      const seguinte = new Set(atual);
      seguinte.add(pessoaId);
      return seguinte;
    });
  }, []);

  const exportar = async () => {
    if (!pronto || aExportar) return;
    setAExportar(true);
    try {
      const pessoasComDados: PessoaComDadosDoRelatorio[] = pessoas.map((pessoa) => {
        const dados = dadosPorPessoaRef.current[pessoa.id];
        return {
          pessoaId: pessoa.id,
          pessoaNome: pessoa.nome,
          cargo: pessoa.cargo,
          dataAdmissao: pessoa.dataAdmissao,
          dias: dados?.dias ?? [],
          totais: dados?.totais ?? {
            diasTrabalhados: 0,
            planeadoMinutos: 0,
            realizadoMinutos: 0,
            obraHoras: 0,
            diasFeriadoTrabalhados: 0,
            diasComFaltaCompleta: 0,
            diasComFaltaIncompleta: 0,
            diasSemRegisto: 0,
            horasExtraMinutos: 0,
            horasExtraNoturnasMinutos: 0,
          },
          obras: dados?.obras ?? [],
        };
      });
      const { blob, fileName, falhas } = await generateRelatorioAssiduidadeMensalOrganizacaoPdfBlob(
        pessoasComDados,
        ano,
        mes,
        activeCompany?.name,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);

      if (falhas.length > 0) {
        toast.warning(
          t("hr.relatorioMensal.exportarParcial", {
            falhas: String(falhas.length),
            total: String(pessoas.length),
          }),
        );
      }
    } catch (erro) {
      toast.error(t("hr.relatorioMensal.exportarErro"));
    } finally {
      setAExportar(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(valor) => !valor && onFechar()}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col">
        <DialogHeader className="shrink-0 flex-row items-center justify-between space-y-0">
          <DialogTitle>{t("hr.relatorioMensal.organizacao.titulo")}</DialogTitle>
          <Button variant="outline" size="sm" onClick={exportar} disabled={!pronto || aExportar}>
            {aExportar ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {t("hr.relatorioMensal.exportar")}
          </Button>
        </DialogHeader>

        {!pronto && (
          <div className="flex shrink-0 items-center gap-3 py-8" role="status" aria-live="polite">
            <OlyviaLoader />
            <p className="text-sm text-muted-foreground">
              {t("hr.relatorioMensal.organizacao.aPreparar", {
                prontas: String(carregadas.size),
                total: String(total),
              })}
            </p>
          </div>
        )}

        <div className="min-h-0 overflow-y-auto">
          <div className={pronto ? "space-y-0" : "hidden"}>
            {pessoas.map((pessoa) => (
              <div key={pessoa.id} className="hr-relatorio-organizacao-pessoa">
                <RelatorioAssiduidadeMensalConteudo
                  pessoaId={pessoa.id}
                  ano={ano}
                  mes={mes}
                  pessoaNome={pessoa.nome}
                  cargo={pessoa.cargo}
                  dataAdmissao={pessoa.dataAdmissao}
                  permissoes={permissoes}
                  aoTerminarCarregamento={() => marcarCarregada(pessoa.id)}
                  aoObterDados={(dados) => {
                    dadosPorPessoaRef.current[pessoa.id] = dados;
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
