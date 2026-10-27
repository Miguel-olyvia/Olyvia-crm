// O corpo do painel "Nova pessoa": seis abas sublinhadas (Dados pessoais, Contacto e morada, Contrato e local, Retribuição e
// bancário, Outros dados, Acesso e convite), o contador de erros por aba e o rodapé fixo. Os erros só aparecem depois de sair do
// campo ou de tentar criar; ao tentar com erros, abre-se a aba do primeiro e o foco vai para esse campo.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CamposTocadosProvider } from "@/components/rh-exemplo/form/Campos";
import { dataDeHojeBase } from "@/components/rh-exemplo/lib/dataBase";
import { useConfiguracaoObrigatoriosAdmissao } from "@/components/rh-exemplo/hooks/useConfiguracaoObrigatoriosAdmissao";
import type { NovaPessoaExemplo } from "@/components/rh-exemplo/hooks/usePessoas";
import { useCargos } from "@/components/rh-exemplo/hooks/useCargos";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { AbaAcesso } from "./AbaAcesso";
import { AbaContacto } from "./AbaContacto";
import { AbaContrato } from "./AbaContrato";
import { AbaDados } from "./AbaDados";
import { AbaOutros } from "./AbaOutros";
import { AbaRetribuicao } from "./AbaRetribuicao";
import { AbaComErros, ListaAbasNova, Tabs, TabsContent } from "./AbasNova";
import { ProvedorNova } from "./contextoNova";
import { ABAS_NOVA, abaDoCampo, type AbaNova } from "./ids";
import { paraNovaPessoa } from "./paraStore";
import { RodapeNova } from "./RodapeNova";
import { comPatch, valoresIniciais, type AlterarNova, type ValoresNovaPessoa } from "./tiposNova";
import {
  idsObrigatorios, primeiroProblema, problemasDaNova, resumoDeProblemas, type ProblemaNova,
} from "./validacao";

interface FormularioNovaPessoaProps {
  colegas: ReadonlyArray<{ id: string; nome_completo: string }>;
  /** Chamado com os dados já validados. */
  aoCriar: (dados: NovaPessoaExemplo) => void;
  aoCancelar: () => void;
  /** Avisa que há alterações por gravar (um clique fora deixa de fechar o painel). */
  aoSujar: () => void;
}

const ABAS_CONTEUDO: Record<AbaNova, () => JSX.Element> = {
  dados: AbaDados, contacto: AbaContacto, contrato: AbaContrato, retribuicao: AbaRetribuicao, outros: AbaOutros, acesso: AbaAcesso,
};

/** Só os problemas que já se mostram: o campo foi tocado, ou já se tentou criar. */
function visiveisDe(problemas: readonly ProblemaNova[], tentou: boolean, tocados: ReadonlySet<string>): ProblemaNova[] {
  return problemas.filter((p) => tentou || tocados.has(p.campoId));
}

export function FormularioNovaPessoa({ colegas, aoCriar, aoCancelar, aoSujar }: FormularioNovaPessoaProps) {
  const { t } = useTranslation();
  const hoje = useMemo(() => dataDeHojeBase(), []);
  const { campos: config } = useConfiguracaoObrigatoriosAdmissao();
  const { cargos } = useCargos();
  const [valores, setValores] = useState<ValoresNovaPessoa>(() => valoresIniciais(hoje));
  const [aba, setAba] = useState<AbaNova>("dados");
  const [tentou, setTentou] = useState(false);
  const [comConvite, setComConvite] = useState(false);
  const [tocados, setTocados] = useState<ReadonlySet<string>>(new Set());
  const [focoPedido, setFocoPedido] = useState<string | null>(null);

  const opcoes = useMemo(() => ({ comConvite, config, hoje }), [comConvite, config, hoje]);
  const problemas = useMemo(() => problemasDaNova(valores, opcoes), [valores, opcoes]);
  const visiveis = visiveisDe(problemas, tentou, tocados);
  const resumo = resumoDeProblemas(visiveis);
  const obrigatorios = useMemo(() => idsObrigatorios(valores, opcoes), [valores, opcoes]);

  useEffect(() => {
    if (focoPedido === null) return;
    // O campo pode estar numa aba que acabou de abrir: tenta de novo nos quadros seguintes até existir.
    let tentativas = 0;
    let quadro = 0;
    const focar = () => {
      const controlo = document.getElementById(focoPedido);
      if (controlo) {
        controlo.focus();
        setFocoPedido(null);
      } else if (tentativas++ < 10) {
        quadro = requestAnimationFrame(focar);
      }
    };
    focar();
    return () => cancelAnimationFrame(quadro);
  }, [focoPedido, aba]);

  const alterar = useCallback<AlterarNova>((grupo, patch) => {
    aoSujar();
    setValores((atual) => comPatch(atual, grupo, patch));
  }, [aoSujar]);

  const erro = (campoId: string): string | null => {
    const p = visiveis.find((x) => x.campoId === campoId);
    return p ? t(p.mensagemKey) : null;
  };

  const entregar = (convite: boolean) => {
    try {
      const cargoNome = cargos.find((c) => c.id === valores.laborais.cargo_id)?.nome ?? null;
      aoCriar(paraNovaPessoa(valores, { config, comConvite: convite, cargoNome }));
    } catch (e) {
      // Um cargo escolhido sem nome (catálogo ainda por carregar) recusa-se aqui: nada vai à base.
      toast.error(e instanceof Error ? e.message : t("hr.erros.guardar"));
    }
  };

  const tentar = (convite: boolean) => {
    setComConvite(convite);
    setTentou(true);
    const lista = problemasDaNova(valores, { comConvite: convite, config, hoje });
    const primeiro = primeiroProblema(lista);
    if (primeiro === null) return entregar(convite);
    setAba(abaDoCampo(primeiro.campoId));
    setFocoPedido(primeiro.campoId);
  };

  const submeter = (e: FormEvent) => {
    e.preventDefault();
    tentar(false);
  };

  return (
    <CamposTocadosProvider
      rotuloObrigatorio={t("hr.campos.obrigatorio")}
      onTocar={(id) => setTocados((atual) => (atual.has(id) ? atual : new Set(atual).add(id)))}
    >
      <ProvedorNova
        valor={{ valores, alterar, erro, obrigatorio: (id) => obrigatorios.has(id), config, colegas }}
      >
        <form noValidate onSubmit={submeter} className="flex min-h-0 flex-1 flex-col">
          <Tabs value={aba} onValueChange={(v) => setAba(v as AbaNova)} className="flex min-h-0 flex-1 flex-col">
            <ListaAbasNova aria-label={t("rhForm.nova.tabs.label")} className="shrink-0">
              {ABAS_NOVA.map((id) => (
                <AbaComErros key={id} value={id} rotulo={t(`rhNova.tabs.${id}`)} erros={resumo.porAba[id]} />
              ))}
            </ListaAbasNova>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              {ABAS_NOVA.map((id) => {
                const Conteudo = ABAS_CONTEUDO[id];
                return <TabsContent key={id} value={id} className="mt-0"><Conteudo /></TabsContent>;
              })}
            </div>
          </Tabs>
          <RodapeNova erros={resumo.total} aoCancelar={aoCancelar} aoCriarEConvidar={() => tentar(true)} />
        </form>
      </ProvedorNova>
    </CamposTocadosProvider>
  );
}
