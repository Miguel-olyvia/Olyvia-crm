// 23/11: o corpo da secção «Modelo 3D» do formulário de produto (criar e ficha): uma frase, o botão «Ver em 3D» e, só depois de aberto, a pré-visualização.
// Começa fechado: o canvas e o three só arrancam ao clicar, e fechar desmonta o canvas (um só de cada vez). O título da secção é de quem o usa.
import { useId, useMemo, useState } from "react";
import { Box } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";
import { Previa3DProduto } from "./Previa3DProduto";
import type { Config3dPrevia } from "./Previa3DLigacoes";
import { ligacoesDaConfig, type Ligacao } from "./config3dDados";
import { useConfig3d, type AlvoConfig3d } from "./useConfig3d";
import { urlDaFotoOpcao } from "./fotoOpcaoUrl";
import { corDosAtributos, fotoDosAtributos, medidaDosAtributos } from "./planta3d/previaProduto3d";
import { LADO_TEXTURA_CM } from "./planta3d/texturaProduto";
import { aparenciaUnicaDasZonas, zonasDosAtributos, zonasVisuais } from "./planta3d/zonasGlb";
import { leiturasPorOmissao } from "./planta3d/acabamentoCor3d";
import type { NoCat } from "./planta3d/catalogo3d";
import { resolverDoNo, textoDaOrigem } from "./planta3d/modelos3dEscolha";
import { aplicacaoDosAtributos, medidaDoRevestimento } from "./planta3d/revestimentoPrevia";
import type { AtributoDef, AtributoProduto } from "./v2/catalogoModelo";

/** Espera depois da última tecla (no nome ou numa medida) antes de redesenhar o 3D (ms). */
const ESPERA_MS = 350;

export interface Modelo3DProdutoProps {
  nome: string; sub?: string | null; no: string | null; arvore: readonly NoCat[];
  /** Os atributos do produto e a lista deles: a Medida e a Cor entram no 3D. */
  attrs?: readonly AtributoProduto[]; defs?: readonly AtributoDef[];
  /** O «Modelo 3D» escolhido no próprio produto (a subcategoria e a categoria vêm da árvore): manda sobre o classificador. */
  modelo3d?: string | null;
  /**
   * 25/11: o produto cuja configuração 3D (eixos da Medida e ligações atributo → zona) se lê, ao abrir o 3D, e se grava. Só a ficha de um produto da base o passa; sem ele (o formulário
   * de criar, o protótipo) a secção é só para ver, como era.
   */
  alvoConfig3d?: AlvoConfig3d;
}

const mesmasLigacoes = (a: readonly Ligacao[], b: readonly Ligacao[]): boolean => JSON.stringify(a) === JSON.stringify(b);
const SEM_LIGACOES: readonly Ligacao[] = [];

/** O 3D aberto: nasce com o que há agora e, ao escrever o nome ou as medidas, espera um instante antes de se redesenhar. Só existe enquanto está aberto. */
function Aberto({ nome, sub, no, arvore, attrs, defs, modelo3d, alvoConfig3d }: Modelo3DProdutoProps) {
  // 25/11: a configuração 3D lê-se aqui, quando o 3D abre (uma vez), e não antes; o rascunho das ligações vive aqui para o 3D o mostrar logo, sem gravar
  const cfg = useConfig3d(alvoConfig3d);
  const [rascunho, setRascunho] = useState<readonly Ligacao[] | null>(null);
  const guardadas = cfg.config?.efectiva.ligacoes ?? null;
  const ligacoesEmVigor = rascunho ?? guardadas ?? SEM_LIGACOES;
  const ligadas = useMemo(() => ligacoesDaConfig(ligacoesEmVigor), [ligacoesEmVigor]);
  const nomeEspera = useDebounce(nome, ESPERA_MS);
  const attrsEspera = useDebounce(attrs, ESPERA_MS);
  const medida = useMemo(() => medidaDosAtributos(attrsEspera), [attrsEspera]);
  // 25/11: COM configuração (ligações ou exclusões) manda a configuração, para qualquer atributo: a foto e a cor únicas saem das zonas (aparenciaUnicaDasZonas); SEM ela, valem os nomes, como sempre
  const comConfig = Object.keys(ligadas.ligacoes).length > 0 || ligadas.excluidos.size > 0;
  const zonasAtributos = useMemo(() => zonasDosAtributos(attrsEspera, defs, ligadas.ligacoes, ligadas.excluidos), [attrsEspera, defs, ligadas]);
  const unica = useMemo(() => (comConfig ? aparenciaUnicaDasZonas(zonasAtributos) : null), [comConfig, zonasAtributos]);
  const cor = useMemo(() => (comConfig ? unica?.hex ?? undefined : corDosAtributos(attrsEspera, defs)), [comConfig, unica, attrsEspera, defs]);
  // a foto da opção de cor escolhida (corpo > frente > cor) passa a textura do 3D; sem foto (ou sem URL do storage), a cor lisa de sempre
  const caminhoFoto = useMemo(() => (comConfig ? unica?.foto ?? null : fotoDosAtributos(attrsEspera, defs)), [comConfig, unica, attrsEspera, defs]);
  const textura = useMemo(() => { const url = caminhoFoto ? urlDaFotoOpcao(caminhoFoto) : null; return url ? { url, ladoCm: LADO_TEXTURA_CM } : undefined; }, [caminhoFoto]);
  // 24/11: um revestimento lê a Medida sem os limites do modelo 3D (a espessura em mm de um laminado) e o atributo «Aplicação» (chão ou parede por omissão)
  const medidaRevestimento = useMemo(() => medidaDoRevestimento(attrsEspera), [attrsEspera]);
  const aplicacao = useMemo(() => aplicacaoDosAtributos(attrsEspera, defs), [attrsEspera, defs]);
  // 24/11 (fase 1): a aparência de cada zona pelo nome do atributo («Cor da frente» → frente, «Cor do corpo» → corpo, «Cor» → o resto); sem estes atributos, nada muda
  // 25/11: as ligações explícitas (guardadas, ou o rascunho) mandam sobre os nomes; sem configuração, `ligadas` está vazio e o resultado é o de sempre
  const zonas = useMemo(() => (zonasAtributos ? zonasVisuais(zonasAtributos, urlDaFotoOpcao) : undefined), [zonasAtributos]);
  // 25/11: TODOS os atributos com hex, foto ou aspeto, e o que o 3D faz com cada um por omissão (os nomes conhecidos aplicam-se; os outros, Puxador…, ficam desligados até se ligarem)
  const omissoes = useMemo(() => leiturasPorOmissao(defs), [defs]);
  const config3d = useMemo<Config3dPrevia | undefined>(() => {
    const c = cfg.config;
    if (!c || !alvoConfig3d) return undefined;
    const e = c.efectiva;
    return {
      podeEditar: alvoConfig3d.podeEditar,
      eixos: { guardados: e.eixos, origem: e.eixosOrigem, proprio: !!c.proprio?.eixos, gravar: cfg.gravarEixos },
      ligacoes: {
        valor: ligacoesEmVigor, alterado: rascunho !== null && !mesmasLigacoes(rascunho, guardadas ?? SEM_LIGACOES), origem: e.ligacoesOrigem, proprio: c.proprio?.ligacoes != null,
        atributos: omissoes.map((o) => ({ id: o.id, nome: o.nome })), omissoes,
        orfas: c.proprio?.orfas ?? 0, ignoradas: c.proprio?.ignoradas ?? 0,
        aoMudar: (l) => setRascunho(l),
        // depois de gravar, o rascunho acaba: valem as ligações que a base acabou de guardar (o gancho relê a configuração antes de responder)
        gravar: async () => { const erro = await cfg.gravarLigacoes(ligacoesEmVigor); if (!erro) setRascunho(null); return erro; },
        herdar: async () => { const erro = await cfg.gravarLigacoes(null); if (!erro) setRascunho(null); return erro; },
      },
    };
  }, [cfg, alvoConfig3d, omissoes, ligacoesEmVigor, rascunho, guardadas]);
  return (
    <>
      {cfg.erro && <p role="status" className="mb-2 text-[15px] text-muted-foreground">{cfg.erro} O 3D usa a regra automática.</p>}
      <Previa3DProduto nome={nomeEspera} sub={sub} no={no} arvore={arvore} medida={medida} cor={cor} textura={textura} modelo3d={modelo3d} medidaRevestimento={medidaRevestimento} aplicacao={aplicacao} zonas={zonas} painelMedidas config3d={config3d} />
    </>
  );
}

export function Modelo3DProduto(props: Modelo3DProdutoProps) {
  const [aberto, setAberto] = useState(false);
  const idPainel = useId();
  // o modelo e de onde vem: do produto, da subcategoria, da categoria ou automático (pelo nome)
  const origem = resolverDoNo({ produto: props.modelo3d, arvore: props.arvore, no: props.no });
  return (
    <div className="grid gap-3">
      {props.alvoConfig3d
        ? <p className="text-[15px] text-muted-foreground">O 3D que o catálogo daria a este produto, pelo modelo escolhido, pelo nome, pela subcategoria e pelas medidas. Os eixos da Medida e as ligações dos atributos às zonas podem guardar-se neste produto, abrindo o 3D.</p>
        : <p className="text-[15px] text-muted-foreground">Só para ver: o 3D que o catálogo daria a este produto, pelo modelo escolhido, pelo nome, pela subcategoria e pelas medidas. Não grava nada.</p>}
      <p data-testid="modelo3d-origem" className="text-[15px]">Modelo: <span className="font-medium">{textoDaOrigem(origem)}</span></p>
      {/* o rótulo fica sempre «Ver em 3D» e quem diz se está aberto é o aria-expanded (o fundo também muda): um rótulo que muda E um aria-expanded diziam a mesma coisa duas vezes */}
      <button type="button" aria-expanded={aberto} aria-controls={idPainel} onClick={() => setAberto((v) => !v)}
        className={cn("inline-flex min-h-11 items-center gap-2 justify-self-start rounded-lg border border-input bg-card px-4 text-[15px] font-medium transition-colors hover:bg-muted aria-expanded:border-primary aria-expanded:bg-muted",
          "focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25")}>
        <Box className="h-4 w-4 text-primary" aria-hidden="true" />Ver em 3D
      </button>
      <div id={idPainel}>
        {aberto && <Aberto {...props} />}
      </div>
    </div>
  );
}
