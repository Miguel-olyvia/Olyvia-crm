// 26/11: a vista de uma família com 3D (/catalogo/produtos/familias/:id): abrir a família (botão «Ver» da lista), ver o produto em 3D e escolher a cor e os outros eixos.
// Só lê: a família com o PVP e o stock (cat_ler_familia_vista, 20270129300000, POR APLICAR: até lá mostra um erro claro) e a árvore leve de categorias, para o 3D classificar o
// produto como a ficha (um revestimento sem ela cairia na caixa). A árvore não bloqueia: com ela a ler o 3D diz «A preparar o 3D…» e as escolhas já se usam; se falhar, o 3D classifica pelo nome.
// A rota exige services.view como a lista (App.tsx); não há permissões nem perfis novos. O conteúdo tem `key`: mudar de organização ou de família recomeça tudo, MENOS a
// árvore de categorias, que se lê uma vez por organização (mudar de medida não a volta a ler). Foco: depois de mudar de medida ou de «Tentar de novo» o botão ou a ligação
// desapareceram com a página, por isso o foco vai para o título da família (ou para o aviso de erro).
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/contexts/CompanyContext";
import { usePaginaInteira } from "@/hooks/usePaginaInteira";
import { useTranslation } from "@/hooks/useTranslation";
import { CAMINHO_FAMILIAS } from "@/emylia/catalogoRotas";
import { AINDA_NAO } from "@/emylia/fichaProdutoDados";
import { veioDeMudancaDeMedida } from "@/emylia/familias/escolhaVariacao";
import { VerFamilia3D } from "@/emylia/familias/VerFamilia3D";
import { useFamiliaVista } from "@/emylia/familias/usarFamiliaVista";
import { lerCatalogoLeve, type CatalogoLeve } from "@/emylia/real/produtosLeves";
import "@/emylia/prototipo.css";
import "@/emylia/blocosPagina.css";

export default function CatalogoFamiliaVer() {
  usePaginaInteira();
  const { t } = useTranslation();
  const { activeCompany, isLoading } = useCompany();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const org = isLoading ? null : activeCompany?.id ?? null;
  // a árvore vive AQUI (chave: só a organização) e não na página por família: mudar de medida muda de família e não deve voltar a ler 3 RPCs nem refazer o «A preparar o 3D…»
  const K = useArvore(org);
  if (isLoading) return <div className="p-6"><p role="status" className="text-muted-foreground">{t("catFamiliaVer.aLer")}</p></div>;
  if (!org || !id) return <div className="p-6">{t("catFamiliaVer.semOrganizacao")}</div>;
  return <PaginaVer key={`${org}:${id}`} org={org} id={id} K={K} focarAoAbrir={veioDeMudancaDeMedida(location.state)} />;
}

type ArvoreLida = CatalogoLeve["K"] | "falhou";

/** A árvore leve: null enquanto lê (e sem organização); depois a árvore (ou «falhou»: o 3D classifica pelo nome). Uma leitura por organização. */
function useArvore(org: string | null): ArvoreLida | null {
  const [lida, setLida] = useState<{ org: string; v: ArvoreLida } | null>(null);
  useEffect(() => {
    if (!org) return undefined;
    let vivo = true;
    lerCatalogoLeve(org).then(
      (r) => { if (vivo) setLida({ org, v: "erro" in r ? "falhou" : r.v.K }); },
      () => { if (vivo) setLida({ org, v: "falhou" }); },
    );
    return () => { vivo = false; };
  }, [org]);
  return lida && lida.org === org ? lida.v : null;
}

interface PaginaVerProps { org: string; id: string; K: ArvoreLida | null; focarAoAbrir: boolean }

function PaginaVer({ org, id, K, focarAoAbrir }: PaginaVerProps) {
  const { t } = useTranslation();
  const { estado, tentar } = useFamiliaVista(org, id);
  const [focar, setFocar] = useState(focarAoAbrir);
  const alerta = useRef<HTMLDivElement>(null);
  // depois de «Tentar de novo» a leitura pode falhar outra vez: o aviso novo recebe o foco (o botão que o tinha desapareceu)
  useEffect(() => { if (estado.k === "erro" && focar) alerta.current?.focus(); }, [estado.k, focar]);
  const tentarDeNovo = () => { setFocar(true); tentar(); };
  return (
    <div className="pn calma pg-root min-h-full bg-background">
      <div className="mx-auto w-full max-w-[90rem] px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
        {estado.k === "a-ler" && (
          <div aria-busy="true" className="grid gap-5">
            <p role="status" className="text-[15px] text-muted-foreground">{t("catFamiliaVer.aLer")}</p>
            <div aria-hidden="true" className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              <div className="h-[45vh] min-h-64 animate-pulse rounded-xl bg-muted lg:h-[min(34rem,70vh)]" />
              <div className="grid content-start gap-3"><div className="h-6 w-1/3 animate-pulse rounded bg-muted" /><div className="h-11 animate-pulse rounded bg-muted" /><div className="h-24 animate-pulse rounded bg-muted" /></div>
            </div>
          </div>
        )}
        {estado.k === "erro" && (
          <div ref={alerta} role="alert" tabIndex={-1} className="grid max-w-xl gap-3 focus:outline-none">
            <p className="text-base font-semibold text-destructive">{t("catFamiliaVer.erro")}</p>
            <p className="text-[15px] text-muted-foreground">{estado.erro === AINDA_NAO ? t("catFamiliaVer.naoDisponivel") : estado.erro}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="min-h-11" onClick={tentarDeNovo}>{t("catFamiliaVer.tentar")}</Button>
              <Link to={CAMINHO_FAMILIAS} className="inline-flex min-h-11 items-center rounded-lg px-3 text-[15px] font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{t("catFamiliaVer.voltarLista")}</Link>
            </div>
          </div>
        )}
        {estado.k === "ok" && (
          <VerFamilia3D familia={estado.familia} focarTitulo={focar} arvore={K === null ? null : K === "falhou" ? [] : K.arvore} categoriasProduto={K === null || K === "falhou" ? [] : K.categoriasProduto ?? []} />
        )}
      </div>
    </div>
  );
}
