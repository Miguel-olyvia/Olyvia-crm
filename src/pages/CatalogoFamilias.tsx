// 18/11: a página «Famílias» do módulo Produtos do Catálogo (/catalogo/produtos/familias). Uma família junta produtos que JÁ EXISTEM no catálogo e só mudam nos atributos
// (medida, cor…): o utilizador escolhe os produtos e que atributo faz as bolinhas de cor e quais compõem a medida; o resto deriva dos produtos (SKU e preço incluídos).
// As famílias vivem só em memória, num armazém por organização (armazemFamilias.ts): sobrevivem a mudar de separador e perdem-se ao recarregar; nada se grava e nada se escreve
// na base. Lê o catálogo LEVE (árvore e atributos) e pesquisa os produtos no servidor. O conteúdo tem `key={org}`: mudar de organização recomeça tudo (nada de pedidos com ids antigos).
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/contexts/CompanyContext";
import { usePaginaInteira } from "@/hooks/usePaginaInteira";
import { NOTA } from "@/emylia/pecasForm";
import { SeparadoresCatalogo } from "@/emylia/SeparadoresCatalogo";
import { idSeparadorCatalogo } from "@/emylia/catalogoRotas";
import { AssistenteFamilia } from "@/emylia/familias/AssistenteFamilia";
import type { FamiliaGuardada } from "@/emylia/familias/derivarFamilia";
import { BTN, idApagarFamilia, idEditarFamilia } from "@/emylia/familias/estilosFamilias";
import { ListaFamilias } from "@/emylia/familias/ListaFamilias";
import { useFamiliasDaSessao } from "@/emylia/familias/armazemFamilias";
import { ErroLeitura } from "@/emylia/familias/pecasFamilias";
import { criarCacheAtributos } from "@/emylia/familias/usarAtributosEscolhidos";
import { lerCatalogoLeve, type CatalogoLeve } from "@/emylia/real/produtosLeves";
import "@/emylia/prototipo.css";
import "@/emylia/blocosPagina.css";

const SEPARADOR = "familias";
const ID_NOVA = "nova-familia";
const NOTA_SESSAO = "As famílias ficam só até recarregar a página; mudar de separador não as perde.";
type Modo = { k: "lista" } | { k: "assistente"; editar: FamiliaGuardada | null };

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
  const [leve, setLeve] = useState<CatalogoLeve | null>(null), [erroLer, setErroLer] = useState<string | null>(null), [tentativa, setTentativa] = useState(0);
  const [familias, mudarFamilias] = useFamiliasDaSessao(org);
  const [modo, setModo] = useState<Modo>({ k: "lista" });
  const [aviso, setAviso] = useState<{ msg: string; n: number } | null>(null);
  const anunciar = useCallback((msg: string) => setAviso((a) => ({ msg, n: (a?.n ?? 0) + 1 })), []);
  // os atributos já lidos duram o que durar a página (recarregar esvazia-os); a página é desta organização (key), por isso a cache também
  const [cache] = useState(criarCacheAtributos);
  /** o id do botão que recebe o foco depois do próximo desenho (undefined: nada a fazer) */
  const alvoFoco = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (alvoFoco.current === undefined) return;
    const id = alvoFoco.current;
    alvoFoco.current = undefined;
    document.getElementById(id)?.focus();
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

  const guardar = (g: FamiliaGuardada) => {
    const original = modo.k === "assistente" ? modo.editar?.familia.id : undefined;
    mudarFamilias((l) => (original ? l.map((x) => (x.familia.id === original ? g : x)) : [...l, g]));
    alvoFoco.current = idEditarFamilia(g.familia.id);
    setModo({ k: "lista" });
    anunciar(`Família «${g.familia.nome}» guardada.`);
  };
  const cancelar = () => {
    alvoFoco.current = modo.k === "assistente" && modo.editar ? idEditarFamilia(modo.editar.familia.id) : ID_NOVA;
    setModo({ k: "lista" });
  };
  const apagar = (g: FamiliaGuardada) => {
    const i = familias.findIndex((x) => x.familia.id === g.familia.id), vizinha = familias[i + 1] ?? familias[i - 1];
    alvoFoco.current = vizinha ? idApagarFamilia(vizinha.familia.id) : ID_NOVA;
    mudarFamilias((l) => l.filter((x) => x.familia.id !== g.familia.id));
    anunciar(`Família «${g.familia.nome}» apagada.`);
  };

  const painelId = `painel-${SEPARADOR}`, semAtributos = !!leve?.erroAtributos;
  return (
    <div className="pn calma pg-root min-h-full bg-background">
      <div className="mx-auto w-full max-w-[90rem] px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
        <h1 className="text-3xl font-semibold tracking-tight">Catálogo e custos</h1>
        <div className="mt-6"><SeparadoresCatalogo grupo="produtos" ativo={SEPARADOR} ir={(c) => navigate(c)} painelId={painelId} /></div>
        <div id={painelId} role="tabpanel" aria-labelledby={idSeparadorCatalogo(SEPARADOR)} className="grid max-w-5xl gap-5 pt-6">
          <p className={NOTA}>Uma família junta produtos que já existem no catálogo e só mudam nos atributos (medida, cor…). Nada se escreve no catálogo: o SKU e o preço de cada variante são os do produto.</p>
          <p role="note" className="rounded-lg border border-border bg-muted px-3 py-2 text-[15px]">{NOTA_SESSAO}</p>
          {erroLer && <ErroLeitura texto="Não foi possível ler o Catálogo" erro={erroLer} tentar={() => setTentativa((n) => n + 1)} />}
          {!leve && !erroLer && <p role="status" className={NOTA}>A ler o Catálogo…</p>}
          {leve && semAtributos && <p role="alert" className="text-[15px] text-destructive">{leve.erroAtributos} Sem os atributos não se podem criar famílias.</p>}
          {leve && modo.k === "lista" && (
            <>
              <div><Button type="button" id={ID_NOVA} className={BTN} disabled={semAtributos} onClick={() => setModo({ k: "assistente", editar: null })}>Nova família</Button></div>
              <ListaFamilias familias={familias} onEditar={(g) => setModo({ k: "assistente", editar: g })} onApagar={apagar} />
            </>
          )}
          {leve && modo.k === "assistente" && (
            <>
              <h2 className="text-xl font-semibold">{modo.editar ? `Editar família: ${modo.editar.familia.nome}` : "Nova família"}</h2>
              <AssistenteFamilia org={org} K={leve.K} familias={familias} editar={modo.editar} cacheAtributos={cache} onGuardar={guardar} onCancelar={cancelar} />
            </>
          )}
        </div>
        <div aria-live="polite" role="status" aria-label="Avisos" className="pointer-events-none sticky bottom-4 z-10 mt-6 flex justify-center">
          {aviso && <p key={aviso.n} className="pointer-events-auto rounded-xl border border-border bg-card px-4 py-2 text-[15px] shadow-[var(--shadow-sm)]">{aviso.msg}</p>}
        </div>
      </div>
    </div>
  );
}
