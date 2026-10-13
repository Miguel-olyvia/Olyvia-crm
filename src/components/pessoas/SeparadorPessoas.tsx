import { useMemo, useRef, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { BarraPessoas } from "./BarraPessoas";
import { contagensChips, filtrarPessoas, ordenarPessoas } from "./filtrosPessoas";
import type { ChipPessoa, OrdemPessoa, ResumoPessoa } from "./pessoasTipos";
import { TabelaPessoas } from "./TabelaPessoas";
import { useAtalhosPessoas } from "./useAtalhosPessoas";

interface SeparadorPessoasProps {
  resumos: ResumoPessoa[];
  pendentes: ReadonlySet<string>;
  hoje: string;
  chip: ChipPessoa;
  ordem: OrdemPessoa;
  comVoltou: boolean;
  aoMudarChip: (chip: ChipPessoa) => void;
  aoMudarOrdem: (ordem: OrdemPessoa) => void;
  aoAbrir: (id: string) => void;
}

/** O separador "Pessoas": chips, pesquisa, ordem e a tabela. A pesquisa vale só para esta visita. */
export function SeparadorPessoas(p: SeparadorPessoasProps) {
  const { t } = useTranslation();
  const [pesquisa, setPesquisa] = useState("");
  const [ajudaAberta, setAjudaAberta] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const pesquisaRef = useRef<HTMLInputElement>(null);
  const { resumos, pendentes, chip, ordem } = p;

  const contagens = useMemo(() => contagensChips(resumos, pesquisa, pendentes), [resumos, pesquisa, pendentes]);
  const visiveis = useMemo(
    () => ordenarPessoas(filtrarPessoas(resumos, { chip, pesquisa }, pendentes), ordem, pendentes),
    [resumos, chip, pesquisa, ordem, pendentes],
  );
  const aoTeclar = useAtalhosPessoas(raiz, {
    pesquisa: () => pesquisaRef.current?.focus(),
    ajuda: () => setAjudaAberta((a) => !a),
    abrir: p.aoAbrir,
  });
  const limpar = () => {
    setPesquisa("");
    p.aoMudarChip("todos");
  };

  return (
    <div ref={raiz} onKeyDown={aoTeclar} className="space-y-4">
      <BarraPessoas
        chipAtivo={chip} contagens={contagens} pesquisa={pesquisa} ordem={ordem} comVoltou={p.comVoltou}
        pesquisaRef={pesquisaRef} ajudaAberta={ajudaAberta} aoMudarAjuda={setAjudaAberta}
        aoMudarChip={p.aoMudarChip} aoMudarPesquisa={setPesquisa} aoMudarOrdem={p.aoMudarOrdem}
      />
      <p role="status" className="sr-only">{t("pessoasPagina.result", { shown: visiveis.length, total: resumos.length })}</p>
      <TabelaPessoas resumos={visiveis} pendentes={pendentes} hoje={p.hoje} aoAbrir={p.aoAbrir} aoLimpar={limpar} />
    </div>
  );
}
