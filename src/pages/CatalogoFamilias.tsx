// 18/11: a página «Famílias» do módulo Produtos do Catálogo (/catalogo/produtos/familias). Uma família junta produtos que JÁ EXISTEM no catálogo e só mudam nos atributos
// (medida, cor…): o utilizador escolhe os produtos e que atributo faz as bolinhas de cor e quais compõem a medida; o resto deriva dos produtos (SKU e preço incluídos).
// 20/11: as famílias GRAVAM-SE NA BASE (20270125100000, funções cat_*familia*, via useFamilias): a lista lê-se da base, «Guardar» grava (nome, eixos e produtos),
// «Editar» lê a família (cat_ler_familia) antes de abrir o assistente, «Apagar» pede confirmação. Sem products.edit a página fica só de leitura.
// Lê o catálogo LEVE (árvore e atributos) e pesquisa os produtos no servidor. O conteúdo tem `key={org}`: mudar de organização recomeça tudo.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCompany } from "@/contexts/CompanyContext";
import { usePaginaInteira } from "@/hooks/usePaginaInteira";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { NOTA } from "@/emylia/pecasForm";
import { SeparadoresCatalogo } from "@/emylia/SeparadoresCatalogo";
import { idSeparadorCatalogo } from "@/emylia/catalogoRotas";
import { AssistenteFamilia, type FamiliaAberta } from "@/emylia/familias/AssistenteFamilia";
import type { FamiliaGuardada } from "@/emylia/familias/derivarFamilia";
import { BTN, idApagarFamilia, idEditarFamilia } from "@/emylia/familias/estilosFamilias";
import { eixosDaBase, eixosParaGravar, lerFamilia, type FamiliaResumo } from "@/emylia/familias/familiasDados";
import { ListaFamilias } from "@/emylia/familias/ListaFamilias";
import { PREFIXO_FAMILIA, slug } from "@/emylia/familias/nucleo";
import { ErroLeitura } from "@/emylia/familias/pecasFamilias";
import { produtoDaLinha } from "@/emylia/familias/selecao";
import { useFamilias } from "@/emylia/familias/usarFamilias";
import { criarCacheAtributos } from "@/emylia/familias/usarAtributosEscolhidos";
import { lerCatalogoLeve, type CatalogoLeve } from "@/emylia/real/produtosLeves";
import "@/emylia/prototipo.css";
import "@/emylia/blocosPagina.css";

const SEPARADOR = "familias";
const ID_NOVA = "nova-familia";
type Modo = { k: "lista" } | { k: "assistente"; editar: FamiliaAberta | null };

export default function CatalogoFamilias() {
  usePaginaInteira();
  const { activeCompany, isLoading } = useCompany();
  const org = activeCompany?.id ?? null;
  if (isLoading) return <div className="p-6 text-muted-foreground">A carregar…</div>;
  if (!org) return <div className="p-6">Escolha uma organização para ver o Catálogo e custos.</div>;
  return <PaginaFamilias key={org} org={org} />;
}

function PaginaFamilias({ org }: { org: string }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const podeEditar = hasPermission("products.edit");
  const [leve, setLeve] = useState<CatalogoLeve | null>(null), [erroLer, setErroLer] = useState<string | null>(null), [tentativa, setTentativa] = useState(0);
  const fam = useFamilias(org);
  const familias = useMemo(() => (fam.estado.k === "ok" ? fam.estado.familias : []), [fam.estado]);
  const [modo, setModo] = useState<Modo>({ k: "lista" });
  const [aAbrir, setAAbrir] = useState<string | null>(null);
  const [aApagar, setAApagar] = useState<FamiliaResumo | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ msg: string; n: number } | null>(null);
  const anunciar = useCallback((msg: string) => setAviso((a) => ({ msg, n: (a?.n ?? 0) + 1 })), []);
  // os atributos já lidos duram o que durar a página (recarregar esvazia-os); a página é desta organização (key), por isso a cache também
  const [cache] = useState(criarCacheAtributos);
  /** o id do botão que recebe o foco depois do próximo desenho (undefined: nada a fazer) */
  const alvoFoco = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (alvoFoco.current === undefined) return;
    const el = document.getElementById(alvoFoco.current);
    if (!el) return;
    alvoFoco.current = undefined;
    el.focus();
  });

  useEffect(() => {
    let vivo = true;
    setErroLer(null); setLeve(null);
    lerCatalogoLeve(org).then(
      (r) => { if (!vivo) return; if ("erro" in r) setErroLer(r.erro); else setLeve(r.v); },
      (e: unknown) => { if (vivo) setErroLer(e instanceof Error && e.message ? e.message : "Não foi possível ler o Catálogo."); },
    );
    return () => { vivo = false; };
  }, [org, tentativa]);

  const editarId = modo.k === "assistente" ? modo.editar?.id ?? null : null;
  // o núcleo recusa um nome repetido antes de ir à base: os identificadores das outras famílias (a base volta a conferir, sem acentos nem maiúsculas)
  const outrosIds = useMemo(() => familias.filter((f) => f.id !== editarId).map((f) => `${PREFIXO_FAMILIA}${slug(f.nome)}`), [familias, editarId]);

  const guardar = async (g: FamiliaGuardada): Promise<string | null> => {
    if (!leve || modo.k !== "assistente") return null;
    const eixos = eixosParaGravar(g.familia.eixos, leve.K.atributos ?? []);
    if ("erro" in eixos) return t("catFamilias.atributoEmFalta", { name: eixos.erro });
    const editar = modo.editar;
    const r = await fam.guardar({ id: editar?.id ?? null, nome: g.familia.nome, eixos: eixos.v, produtos: g.produtos.map((p) => p.id), versao: editar?.versao ?? null });
    if ("erro" in r) return r.erro;
    alvoFoco.current = idEditarFamilia(r.v.id);
    setModo({ k: "lista" });
    anunciar(t("catFamilias.guardada", { name: r.v.nome }));
    return null;
  };
  const cancelar = () => {
    alvoFoco.current = modo.k === "assistente" && modo.editar ? idEditarFamilia(modo.editar.id) : ID_NOVA;
    setModo({ k: "lista" });
  };
  const abrir = async (f: FamiliaResumo) => {
    if (!leve) return;
    setErroAcao(null); setAAbrir(f.id);
    const r = await lerFamilia(org, f.id);
    setAAbrir(null);
    if ("erro" in r) { setErroAcao(t("catFamilias.erroAbrir", { erro: r.erro })); return; }
    setModo({ k: "assistente", editar: { id: r.v.id, versao: r.v.versao, nome: r.v.nome, produtos: r.v.linhas.map(produtoDaLinha), eixos: eixosDaBase(r.v.eixos, leve.K.atributos ?? []) } });
  };
  const apagar = async (f: FamiliaResumo) => {
    setAApagar(null); setErroAcao(null);
    const i = familias.findIndex((x) => x.id === f.id), vizinha = familias[i + 1] ?? familias[i - 1];
    const r = await fam.apagar(f.id);
    if ("erro" in r) { setErroAcao(t("catFamilias.erroApagar", { erro: r.erro })); return; }
    alvoFoco.current = vizinha ? idApagarFamilia(vizinha.id) : ID_NOVA;
    anunciar(t("catFamilias.apagada", { name: f.nome }));
  };

  const painelId = `painel-${SEPARADOR}`, semAtributos = !!leve?.erroAtributos;
  return (
    <div className="pn calma pg-root min-h-full bg-background">
      <div className="mx-auto w-full max-w-[90rem] px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
        <h1 className="text-3xl font-semibold tracking-tight">Catálogo e custos</h1>
        <div className="mt-6"><SeparadoresCatalogo grupo="produtos" ativo={SEPARADOR} ir={(c) => navigate(c)} painelId={painelId} /></div>
        <div id={painelId} role="tabpanel" aria-labelledby={idSeparadorCatalogo(SEPARADOR)} className="grid max-w-5xl gap-5 pt-6">
          <p className={NOTA}>Uma família junta produtos que já existem no catálogo e só mudam nos atributos (medida, cor…). Nada se escreve no catálogo: o SKU e o preço de cada variante são os do produto.</p>
          {!podeEditar && <p role="note" className="rounded-lg border border-border bg-muted px-3 py-2 text-[15px]">{t("catFamilias.soLeitura")}</p>}
          {erroLer && <ErroLeitura texto="Não foi possível ler o Catálogo" erro={erroLer} tentar={() => setTentativa((n) => n + 1)} />}
          {!leve && !erroLer && <p role="status" className={NOTA}>A ler o Catálogo…</p>}
          {leve && semAtributos && <p role="alert" className="text-[15px] text-destructive">{leve.erroAtributos} Sem os atributos não se podem criar famílias.</p>}
          {leve && modo.k === "lista" && (
            <>
              {podeEditar && <div><Button type="button" id={ID_NOVA} className={BTN} disabled={semAtributos} onClick={() => setModo({ k: "assistente", editar: null })}>{t("catFamilias.nova")}</Button></div>}
              {erroAcao && <p role="alert" className="text-[15px] text-destructive">{erroAcao}</p>}
              {aAbrir && <p role="status" className={NOTA}>{t("catFamilias.aAbrir")}</p>}
              {fam.estado.k === "a-ler" && <p role="status" className={NOTA}>{t("catFamilias.lista.aLer")}</p>}
              {fam.estado.k === "erro" && <ErroLeitura texto={t("catFamilias.lista.erroLer")} erro={fam.estado.erro} tentar={fam.tentar} />}
              {fam.estado.k === "ok" && (
                <ListaFamilias familias={familias} podeEditar={podeEditar} aAbrir={aAbrir} onEditar={(f) => { void abrir(f); }} onApagar={(f) => { setErroAcao(null); setAApagar(f); }} />
              )}
            </>
          )}
          {leve && modo.k === "assistente" && (
            <>
              <h2 className="text-xl font-semibold">{modo.editar ? `Editar família: ${modo.editar.nome}` : t("catFamilias.nova")}</h2>
              <AssistenteFamilia org={org} K={leve.K} outrosIds={outrosIds} editar={modo.editar} cacheAtributos={cache} onGuardar={guardar} onCancelar={cancelar} />
            </>
          )}
        </div>
        <div aria-live="polite" role="status" aria-label="Avisos" className="pointer-events-none sticky bottom-4 z-10 mt-6 flex justify-center">
          {aviso && <p key={aviso.n} className="pointer-events-auto rounded-xl border border-border bg-card px-4 py-2 text-[15px] shadow-[var(--shadow-sm)]">{aviso.msg}</p>}
        </div>
      </div>
      <AlertDialog open={aApagar !== null} onOpenChange={(aberto) => { if (!aberto) setAApagar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("catFamilias.confirmar.titulo", { name: aApagar?.nome ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("catFamilias.confirmar.texto")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">{t("catFamilias.confirmar.cancelar")}</AlertDialogCancel>
            <AlertDialogAction className={cn(buttonVariants({ variant: "destructive" }), "min-h-11")}
              onClick={() => { if (aApagar) void apagar(aApagar); }}>{t("catFamilias.confirmar.apagar")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
