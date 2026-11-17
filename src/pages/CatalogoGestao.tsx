// 17/11: as páginas de gestão dos produtos do Catálogo (/catalogo/produtos/categorias, …/subcategorias, …/modelos, …/marcas, …/atributos, …/referencia).
// 17/11 (correção do utilizador): com os separadores de Produtos no topo (cada separador é uma rota). Cada uma monta o componente que já existia (os mesmos de GestaoCatalogo) e esse lê só o que precisa: não passa por cat_ler_catalogo.
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { usePaginaInteira } from "@/hooks/usePaginaInteira";
import { marcarCatalogoDesatualizado } from "@/emylia/v2/catalogoStore";
import type { FichaProdutoReal } from "@/emylia/fichaProdutoDados";
import { GestaoAtributos } from "@/emylia/GestaoAtributos";
import { GestaoCategorias } from "@/emylia/GestaoCategorias";
import { GestaoMarcas } from "@/emylia/GestaoMarcas";
import { GestaoModelos } from "@/emylia/GestaoModelos";
import { GestaoSku } from "@/emylia/GestaoSku";
import { GestaoSubcategorias } from "@/emylia/GestaoSubcategorias";
import type { SeparadorGestao } from "@/emylia/GestaoCatalogo";
import { CAMINHO_GESTAO, CAMINHO_SECCAO, idSeparadorCatalogo } from "@/emylia/catalogoRotas";
import { NOTA } from "@/emylia/pecasForm";
import { SeparadoresCatalogo } from "@/emylia/SeparadoresCatalogo";
import "@/emylia/prototipo.css";
import "@/emylia/blocosPagina.css";

const NOTA_GESTAO = "Gestão do Catálogo. Vale para toda a organização.";

export default function CatalogoGestao({ separador }: { separador: SeparadorGestao }) {
  usePaginaInteira();
  const navigate = useNavigate();
  const { activeCompany, isLoading } = useCompany();
  const org = activeCompany?.id ?? null;
  const { hasPermission } = usePermissions();
  const podeEditar = hasPermission("products.edit"), podeMudarPrecos = hasPermission("products.manage_prices");
  const podeStock = hasPermission("inventory.edit"), podeVerCusto = hasPermission("products.view_cost");
  // Cada separador lê os seus dados sozinho. O que a gestão grava também está no Catálogo partilhado (useCatalogo, que os orçamentos usam):
  // recarregar marca-o como desatualizado em vez de reler os 13 MB a cada gravação; quem abre o Catálogo a seguir lê-o de novo.
  const real = useMemo<FichaProdutoReal | undefined>(
    () => (org ? { org, podeEditar, podeMudarPrecos, podeStock, podeVerCusto, recarregar: async () => { marcarCatalogoDesatualizado(); } } : undefined),
    [org, podeEditar, podeMudarPrecos, podeStock, podeVerCusto],
  );
  const [aviso, setAviso] = useState<{ msg: string; n: number } | null>(null);
  const anunciar = useCallback((msg: string) => setAviso((a) => ({ msg, n: (a?.n ?? 0) + 1 })), []);

  if (isLoading) return <div className="p-6 text-muted-foreground">A carregar…</div>;
  if (!real) return <div className="p-6">Escolha uma organização para ver o Catálogo e custos.</div>;
  return (
    <div className="pn calma pg-root min-h-full bg-background">
      <div className="mx-auto w-full max-w-[90rem] px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
        <h1 className="text-3xl font-semibold tracking-tight">Catálogo e custos</h1>
        <div className="mt-6"><SeparadoresCatalogo grupo="produtos" ativo={separador} ir={(c) => navigate(c)} painelId={`painel-${separador}`} /></div>
        <div id={`painel-${separador}`} role="tabpanel" aria-labelledby={idSeparadorCatalogo(separador)} className="grid max-w-3xl gap-5 pt-6">
          <p className={NOTA}>{NOTA_GESTAO}</p>
          {separador === "categorias" && <GestaoCategorias real={real} anunciar={anunciar} />}
          {separador === "subcategorias" && <GestaoSubcategorias real={real} anunciar={anunciar} />}
          {separador === "modelos" && <GestaoModelos real={real} anunciar={anunciar} />}
          {separador === "marcas" && <GestaoMarcas real={real} anunciar={anunciar} />}
          {separador === "atributos" && <GestaoAtributos real={real} voltar={() => navigate(CAMINHO_SECCAO.produtos)} anunciar={anunciar} embutido />}
          {separador === "sku" && <GestaoSku real={real} anunciar={anunciar} irPara={(s) => navigate(CAMINHO_GESTAO[s])} />}
        </div>
        <div aria-live="polite" role="status" aria-label="Avisos" className="pointer-events-none sticky bottom-4 z-10 mt-6 flex justify-center">
          {aviso && <p key={aviso.n} className="pointer-events-auto rounded-xl border border-border bg-card px-4 py-2 text-[15px] shadow-[var(--shadow-sm)]">{aviso.msg}</p>}
        </div>
      </div>
    </div>
  );
}
