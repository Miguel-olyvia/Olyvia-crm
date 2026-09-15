/**
 * O relatorio mensal de assiduidade de TODA a organizacao -- uma instancia de
 * `RelatorioAssiduidadeMensalConteudo` por pessoa, uma a seguir a outra, com
 * quebra de pagina entre elas.
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
 * SO IMPRIME QUANDO A PESSOA CLICA, NUNCA SOZINHO
 * -------------------------------------------------
 * Enquanto nem todas as pessoas terminaram de carregar, o conteudo fica
 * escondido (mas montado, para a busca continuar) e mostra-se um estado "a
 * preparar", com o botao de exportar desactivado. So depois de todas
 * terminarem e que o botao "Exportar / Imprimir" fica activo -- a pessoa
 * decide quando, o dialog nunca chama `window.print()` por conta propria.
 */
import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { Printer } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { RelatorioAssiduidadeMensalConteudo } from "@/components/hr/RelatorioAssiduidadeMensalConteudo";
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
  const [carregadas, setCarregadas] = useState<Set<string>>(() => new Set());

  // Reabrir (ou mudar de mes/pessoas) recomeca a contagem do zero.
  useEffect(() => {
    if (!aberto) return;
    setCarregadas(new Set());
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

  return (
    <Dialog open={aberto} onOpenChange={(valor) => !valor && onFechar()}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col print:max-h-none print:max-w-none">
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #hr-relatorio-organizacao-impressao, #hr-relatorio-organizacao-impressao * { visibility: visible; }
            #hr-relatorio-organizacao-impressao { position: static; padding: 1.5rem; }
            .no-print { display: none !important; }
            tr { break-inside: avoid; }
            .hr-relatorio-organizacao-pessoa { break-after: page; }
            .hr-relatorio-organizacao-pessoa:last-child { break-after: auto; }
          }
        `}</style>

        <DialogHeader className="no-print shrink-0 flex-row items-center justify-between space-y-0">
          <DialogTitle>{t("hr.relatorioMensal.organizacao.titulo")}</DialogTitle>
          <Button variant="outline" size="sm" onClick={() => window.print()} disabled={!pronto}>
            <Printer className="mr-2 h-4 w-4" />
            {t("hr.relatorioMensal.imprimir")}
          </Button>
        </DialogHeader>

        {!pronto && (
          <div className="no-print flex shrink-0 items-center gap-3 py-8" role="status" aria-live="polite">
            <OlyviaLoader />
            <p className="text-sm text-muted-foreground">
              {t("hr.relatorioMensal.organizacao.aPreparar", {
                prontas: String(carregadas.size),
                total: String(total),
              })}
            </p>
          </div>
        )}

        <div className="min-h-0 overflow-y-auto print:overflow-visible">
          <div id="hr-relatorio-organizacao-impressao" className={pronto ? "space-y-0" : "hidden"}>
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
                />
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
