/**
 * "O que falta para a admissao ficar completa" -- na ficha, sem obrigar
 * ninguem a abrir seis separadores a procura de campos vazios.
 *
 * AS DUAS LISTAS SAO DE DONOS DIFERENTES, e e por isso que aparecem separadas:
 *  - origem "pessoa": o que a PROPRIA preenche, e o que o convite de admissao
 *    lhe pede. Enquanto faltar algum, a submissao do convite nem passa.
 *  - origem "rh": o que a retaguarda preenche (hoje so a data de admissao).
 *    Nunca trava o convite -- mas tambem nao se preenche sozinho.
 * Junta-las numa lista so poria os RH a espera de a pessoa fazer uma coisa que
 * so eles podem fazer.
 *
 * Quando nao falta nada, isto DIZ-SE: e o sinal de que se podem enviar as
 * credenciais de acesso, e e a unica pergunta a que este cartao serve para
 * responder.
 *
 * A lista vem toda da base (`hr_admissao_pendencias`), que devolve so codigos
 * -- nunca valores. "Falta o NISS" nao revela NISS nenhum.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ClipboardList } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAdmissaoPendencias, type Pendencia } from "@/hooks/useAdmissaoPendencias";

interface PessoaAdmissaoPendenciasProps {
  pessoaId: string;
}

function ListaDeCampos({ titulo, itens }: { titulo: string; itens: Pendencia[] }) {
  const { t } = useTranslation();
  if (itens.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {itens.map((item) => (
          <li key={`${item.origem}-${item.codigo}`}>
            <Badge variant="outline" className="font-normal">
              {t(`hr.pendencias.campo.${item.codigo}`)}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PessoaAdmissaoPendencias({ pessoaId }: PessoaAdmissaoPendenciasProps) {
  const { t } = useTranslation();
  const { daPessoa, doRh, pendencias, carregando, semAcesso, erro } =
    useAdmissaoPendencias(pessoaId);

  // Uma recusa por permissao NAO e um cartao vazio nem um cartao verde: o
  // cartao simplesmente nao aparece. Dizer "esta tudo preenchido" a quem nao
  // pode ver nada seria a pior das tres respostas.
  if (carregando || semAcesso || erro) return null;

  const completo = pendencias.length === 0;

  return (
    <Card className={completo ? "border-emerald-500/40" : undefined}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {completo ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          ) : (
            <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
          {t("hr.pendencias.titulo")}
          {!completo && (
            <span className="text-sm font-normal text-muted-foreground">
              {t("hr.pendencias.contagem", { n: pendencias.length })}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {completo ? (
          <p className="text-sm text-muted-foreground">{t("hr.pendencias.completo")}</p>
        ) : (
          <>
            <ListaDeCampos titulo={t("hr.pendencias.daPessoa")} itens={daPessoa} />
            <ListaDeCampos titulo={t("hr.pendencias.doRh")} itens={doRh} />
            <p className="text-xs text-muted-foreground">{t("hr.pendencias.ajuda")}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
