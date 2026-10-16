import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { BarraPessoas } from "./BarraPessoas";
import type { OpcoesFiltros } from "./PopoverFiltros";
import {
  FILTROS_LOCAIS_INICIAIS, chipValido, contagensChips, contagensTipos, filtrarPessoas, ordenarPessoas, type FiltrosLocais,
} from "./filtrosPessoas";
import type { ChipPessoa, FiltrosPessoas, OrdemPessoa, ResumoPessoa, TipoPessoa, VistaPessoas } from "./pessoasTipos";
import { QuadroPessoas } from "./quadro/QuadroPessoas";
import { COLUNAS_QUADRO, cartoesDoQuadro } from "./quadro/cartoesQuadroPessoas";
import { TabelaPessoas } from "./TabelaPessoas";
import { useAtalhosPessoas } from "./useAtalhosPessoas";

interface SeparadorPessoasProps {
  resumos: ResumoPessoa[];
  pendentes: ReadonlySet<string>;
  tipo: TipoPessoa;
  chip: ChipPessoa;
  ordem: OrdemPessoa;
  vista: VistaPessoas;
  /** AAAA-MM-DD: o dia que o quadro usa para marcar os prazos ultrapassados. */
  hoje: string;
  comVoltou: boolean;
  aoMudarTipo: (tipo: TipoPessoa) => void;
  aoMudarChip: (chip: ChipPessoa) => void;
  aoMudarOrdem: (ordem: OrdemPessoa) => void;
  aoMudarVista: (vista: VistaPessoas) => void;
  aoAbrir: (id: string) => void;
  /** Os ids das pessoas visíveis, pela ordem da lista: a ficha usa-os para passar à anterior e à seguinte. */
  aoMudarVisiveis: (ids: string[]) => void;
}

const LOCAIS_INICIAIS = FILTROS_LOCAIS_INICIAIS;

const unicos = (valores: string[]): string[] => [...new Set(valores)].sort((a, b) => a.localeCompare(b, "pt"));

function opcoesDe(resumos: readonly ResumoPessoa[]): OpcoesFiltros {
  return {
    comerciais: unicos(resumos.map((r) => r.pessoa.comercial)),
    formularios: unicos(resumos.flatMap((r) => (r.formulario ? [r.formulario] : []))),
    temManual: resumos.some((r) => r.formulario === null),
  };
}

/** O separador "Pessoas": pesquisa, tipo, filtros, chips e a tabela ou o quadro (os mesmos `visiveis`). A pesquisa e os filtros do popover valem só para esta visita. */
export function SeparadorPessoas(p: SeparadorPessoasProps) {
  const { t } = useTranslation();
  const [locais, setLocais] = useState<FiltrosLocais>(LOCAIS_INICIAIS);
  const [ajudaAberta, setAjudaAberta] = useState(false);
  // As pessoas com os negócios à vista na Lista: estado local desta visita, que não persiste (tudo fecha ao voltar).
  const [abertas, setAbertas] = useState<ReadonlySet<string>>(new Set());
  const alternar = (id: string) => setAbertas((atual) => (atual.has(id) ? new Set([...atual].filter((x) => x !== id)) : new Set([...atual, id])));
  const raiz = useRef<HTMLDivElement>(null);
  const pesquisaRef = useRef<HTMLInputElement>(null);
  const { resumos, pendentes, tipo, ordem, vista, hoje } = p;
  const chip = chipValido(tipo, p.chip);
  const filtros = useMemo<FiltrosPessoas>(
    () => ({ ...locais, voltou: p.comVoltou && locais.voltou, tipo, chip }),
    [locais, p.comVoltou, tipo, chip],
  );

  const contagensTipo = useMemo(() => contagensTipos(resumos, filtros, pendentes), [resumos, filtros, pendentes]);
  const contagensChip = useMemo(() => contagensChips(resumos, filtros, pendentes), [resumos, filtros, pendentes]);
  const visiveis = useMemo(
    () => ordenarPessoas(filtrarPessoas(resumos, filtros, pendentes), ordem, pendentes),
    [resumos, filtros, ordem, pendentes],
  );
  const opcoes = useMemo(() => opcoesDe(resumos), [resumos]);
  const cartoes = useMemo(() => cartoesDoQuadro(visiveis, hoje), [visiveis, hoje]);

  const ids = visiveis.map((r) => r.pessoa.id).join("|");
  const avisar = useRef(p.aoMudarVisiveis);
  avisar.current = p.aoMudarVisiveis;
  useEffect(() => avisar.current(ids === "" ? [] : ids.split("|")), [ids]);

  const aoTeclar = useAtalhosPessoas(raiz, {
    pesquisa: () => pesquisaRef.current?.focus(),
    ajuda: () => setAjudaAberta((a) => !a),
    abrir: p.aoAbrir,
  });
  const limparPopover = () => {
    setLocais((l) => ({ ...LOCAIS_INICIAIS, pesquisa: l.pesquisa }));
    if (chip === "atrasadas") p.aoMudarChip("todas");
  };
  const limparTudo = () => {
    setLocais(LOCAIS_INICIAIS);
    p.aoMudarChip("todas");
    p.aoMudarTipo("todos");
  };

  return (
    <div ref={raiz} onKeyDown={aoTeclar} className="space-y-4">
      <BarraPessoas
        filtros={filtros} ordem={ordem} vista={vista} contagensTipo={contagensTipo} contagensChip={contagensChip} total={visiveis.length}
        opcoes={opcoes} comVoltou={p.comVoltou} pesquisaRef={pesquisaRef} ajudaAberta={ajudaAberta} aoMudarAjuda={setAjudaAberta}
        aoMudar={(v) => setLocais((l) => ({ ...l, ...v }))} aoMudarTipo={p.aoMudarTipo} aoMudarChip={p.aoMudarChip}
        aoMudarOrdem={p.aoMudarOrdem} aoMudarVista={p.aoMudarVista} aoLimpar={limparPopover}
      />
      <div role="status" className="sr-only">
        {vista === "quadro" ? t("pessoasPagina.view.announce.board", { count: COLUNAS_QUADRO.length }) : t("pessoasPagina.view.announce.list")}
      </div>
      {vista === "quadro"
        ? <QuadroPessoas cartoes={cartoes} hoje={hoje} chip={chip} aoAbrir={p.aoAbrir} aoLimpar={limparTudo} />
        : <TabelaPessoas resumos={visiveis} pendentes={pendentes} hoje={hoje} abertas={abertas} aoAlternar={alternar} aoAbrir={p.aoAbrir} aoLimpar={limparTudo} />}
    </div>
  );
}
