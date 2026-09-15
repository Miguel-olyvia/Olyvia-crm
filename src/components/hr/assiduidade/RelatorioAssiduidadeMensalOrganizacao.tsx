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
 * NAO IMPRIME A MEIO DO CARREGAMENTO
 * -------------------------------------
 * Enquanto nem todas as pessoas terminaram de carregar, o conteudo fica
 * escondido (mas montado, para a busca continuar) e mostra-se um estado "a
 * preparar". So depois de todas terminarem e que o conteudo aparece e
 * `window.print()` e chamado -- nunca antes, para nao imprimir paginas em
 * branco.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
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
  /**
   * Ref, nao estado: marcar aqui nao pode disparar um novo render, senao o
   * proprio efeito que agenda o `window.print()` cancela-se a si mesmo antes
   * de o temporizador chegar a disparar.
   */
  const imprimiuRef = useRef(false);

  // Reabrir (ou mudar de mes/pessoas) recomeca a contagem do zero.
  useEffect(() => {
    if (!aberto) return;
    setCarregadas(new Set());
    imprimiuRef.current = false;
  }, [aberto, ano, mes, pessoas]);

  const total = pessoas.length;
  const pronto = aberto && total > 0 && carregadas.size >= total;

  useEffect(() => {
    if (!pronto || imprimiuRef.current) return;
    imprimiuRef.current = true;
    // Um instante para o layout assentar antes de imprimir.
    const temporizador = window.setTimeout(() => window.print(), 50);
    return () => window.clearTimeout(temporizador);
  }, [pronto]);

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
      <DialogContent className="max-w-4xl print:max-w-none">
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

        <DialogHeader className="no-print">
          <DialogTitle>{t("hr.relatorioMensal.organizacao.titulo")}</DialogTitle>
        </DialogHeader>

        {!pronto && (
          <div className="no-print flex items-center gap-3 py-8" role="status" aria-live="polite">
            <OlyviaLoader />
            <p className="text-sm text-muted-foreground">
              {t("hr.relatorioMensal.organizacao.aPreparar", {
                prontas: String(carregadas.size),
                total: String(total),
              })}
            </p>
          </div>
        )}

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
      </DialogContent>
    </Dialog>
  );
}
