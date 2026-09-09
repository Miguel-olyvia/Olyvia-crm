/**
 * O separador Organograma: a arvore de PESSOAS, construida sobre
 * `pessoas.reporta_a_pessoa_id`.
 *
 * PORQUE NAO SE REAPROVEITA O ORGANOGRAMA QUE JA EXISTE
 * -----------------------------------------------------
 * `src/pages/OrgChart.tsx` e um organograma de ORGANIZACOES
 * (`anew_organizations` + `anew_hierarchy`): nao tem nenhuma relacao
 * pessoa -> chefe. Embuti-lo aqui daria o mapa de empresas duas vezes, nao o
 * organograma de pessoas. `PeopleOrgChartDialog.tsx`, apesar do nome, tambem
 * nao serve: e uma lista plana de `anew_memberships`, cega a `pessoas` -- nao
 * mostra quem existe no RH sem conta de acesso.
 *
 * Por isso: arvore propria aqui, e um LINK para o organograma de empresas no
 * cabecalho, rotulado como tal, para os dois conceitos nao se confundirem.
 *
 * RAIZES ORFAS
 * ------------
 * Quem tem chefe que a RLS nao deixa ver aparece como raiz, com legenda. NAO
 * SE INVENTA HIERARQUIA A PARTIR DE DADOS INVISIVEIS: o alternativo seria
 * desenhar uma arvore falsa e nao dizer nada.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { Building2, Network, User } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import type { PessoaListItem } from "@/types/hr";

interface NoDePessoa {
  pessoa: PessoaListItem;
  filhos: NoDePessoa[];
  /** O chefe existe mas nao esta visivel (RLS, arquivo, outra organizacao). */
  orfa: boolean;
}

interface PessoasOrganogramaTabProps {
  pessoas: PessoaListItem[];
  loading: boolean;
  error: string | null;
}

/**
 * Constroi a arvore. O `visitados` nao e zelo excessivo: uma cadeia de chefia
 * circular (A reporta a B, B reporta a A) e possivel na base -- o CHECK so
 * impede reportar a si proprio -- e sem esta guarda o ecra entrava em recursao
 * infinita.
 */
function construirArvore(pessoas: PessoaListItem[]): NoDePessoa[] {
  const porId = new Map(pessoas.map((pessoa) => [pessoa.id, pessoa]));
  const filhosDe = new Map<string, PessoaListItem[]>();

  for (const pessoa of pessoas) {
    const chefe = pessoa.reporta_a_pessoa_id;
    if (!chefe || !porId.has(chefe)) continue;
    const lista = filhosDe.get(chefe) ?? [];
    lista.push(pessoa);
    filhosDe.set(chefe, lista);
  }

  const construir = (pessoa: PessoaListItem, visitados: Set<string>): NoDePessoa => {
    visitados.add(pessoa.id);
    const filhos = (filhosDe.get(pessoa.id) ?? [])
      .filter((filho) => !visitados.has(filho.id))
      .map((filho) => construir(filho, visitados));
    return {
      pessoa,
      filhos,
      orfa: Boolean(pessoa.reporta_a_pessoa_id) && !porId.has(pessoa.reporta_a_pessoa_id ?? ""),
    };
  };

  const visitados = new Set<string>();
  return pessoas
    .filter(
      (pessoa) =>
        !pessoa.reporta_a_pessoa_id || !porId.has(pessoa.reporta_a_pessoa_id),
    )
    .filter((pessoa) => !visitados.has(pessoa.id))
    .map((pessoa) => construir(pessoa, visitados));
}

function No({
  no,
  onAbrir,
  nivel,
}: {
  no: NoDePessoa;
  onAbrir: (id: string) => void;
  nivel: number;
}) {
  const { t } = useTranslation();
  return (
    <li className="space-y-2">
      <button
        type="button"
        onClick={() => onAbrir(no.pessoa.id)}
        className="flex w-full items-center gap-3 rounded-md border bg-card px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-muted/50"
        style={{ marginLeft: nivel === 0 ? 0 : undefined }}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <User className="h-4 w-4 text-muted-foreground" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {no.pessoa.nome_completo}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {no.pessoa.cargo ?? "—"}
          </span>
        </span>
        {no.filhos.length > 0 && (
          <Badge variant="secondary" className="font-normal tabular-nums">
            {no.filhos.length}
          </Badge>
        )}
        {no.orfa && (
          <Badge variant="outline" className="font-normal">
            {t("hr.organograma.chefeInvisivel")}
          </Badge>
        )}
      </button>
      {no.filhos.length > 0 && (
        <ul className="ml-6 space-y-2 border-l pl-4">
          {no.filhos.map((filho) => (
            <No key={filho.pessoa.id} no={filho} onAbrir={onAbrir} nivel={nivel + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function PessoasOrganogramaTab({
  pessoas,
  loading,
  error,
}: PessoasOrganogramaTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const arvore = useMemo(() => construirArvore(pessoas), [pessoas]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Network className="h-4 w-4 text-muted-foreground" />
          {t("hr.organograma.titulo")}
        </CardTitle>
        {/* Link, nao componente reaproveitado: sao dois conceitos diferentes e
            o rotulo diz qual e qual. */}
        <Button variant="link" size="sm" className="gap-1.5" onClick={() => navigate("/org-chart")}>
          <Building2 className="h-4 w-4" />
          {t("hr.organograma.verEmpresas")}
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p className="pb-3 text-sm text-destructive">{error}</p>}
        {loading ? (
          <OlyviaLoader />
        ) : arvore.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">{t("employees.empty")}</p>
        ) : (
          <>
            <p className="pb-3 text-sm text-muted-foreground">{t("hr.organograma.explicacao")}</p>
            <ul className="space-y-2">
              {arvore.map((no) => (
                <No
                  key={no.pessoa.id}
                  no={no}
                  nivel={0}
                  onAbrir={(id) => navigate(`/rh/pessoas/${id}`)}
                />
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
