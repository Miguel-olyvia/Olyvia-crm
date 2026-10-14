// O corpo do painel "Nova pessoa": três abas sublinhadas (Dados pessoais, Contrato e local, Acesso), o aviso de erros por aba
// e o rodapé fixo com Cancelar e "Criar pessoa" (o único botão primário). Os erros só aparecem depois de sair do campo ou
// de tentar criar; ao tentar com erros, abre-se a aba do primeiro e o foco vai para esse campo.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { CamposTocadosProvider } from "@/components/rh-exemplo/form/Campos";
import { hojeIso } from "@/components/rh-exemplo/dados/datas";
import type { NovaPessoaExemplo } from "@/components/rh-exemplo/hooks/usePessoas";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { AbaComErros, ListaAbasNova, Tabs, TabsContent } from "./AbasNova";
import { CamposAcesso } from "./CamposAcesso";
import { CamposContrato } from "./CamposContrato";
import { CamposDados } from "./CamposDados";
import { idCampo, mensagemErro, type CamposNovaProps } from "./tiposCampos";
import {
  ABAS_NOVA, abaDoCampo, paraNovaPessoa, primeiroErro, resumoDeErros, validarNovaPessoa, valoresIniciais,
  type AbaNova, type CampoNova, type ErrosNova, type ValoresNovaPessoa,
} from "./valores";

interface FormularioNovaPessoaProps {
  colegas: ReadonlyArray<{ id: string; nome_completo: string }>;
  /** Chamado com os dados já validados. */
  aoCriar: (dados: NovaPessoaExemplo) => void;
  aoCancelar: () => void;
  /** Avisa que há alterações por gravar (um clique fora deixa de fechar o painel). */
  aoSujar: () => void;
}

/** Só os erros que já se mostram: o campo foi tocado, ou já se tentou criar. */
function errosVisiveis(erros: ErrosNova, tentou: boolean, tocados: ReadonlySet<string>): ErrosNova {
  const visiveis: ErrosNova = {};
  for (const campo of Object.keys(erros) as CampoNova[]) {
    if (tentou || tocados.has(idCampo(campo))) visiveis[campo] = erros[campo];
  }
  return visiveis;
}

export function FormularioNovaPessoa({ colegas, aoCriar, aoCancelar, aoSujar }: FormularioNovaPessoaProps) {
  const { t } = useTranslation();
  const hoje = useMemo(() => hojeIso(), []);
  const [valores, setValores] = useState<ValoresNovaPessoa>(() => valoresIniciais(hoje));
  const [aba, setAba] = useState<AbaNova>("dados");
  const [tentou, setTentou] = useState(false);
  const [tocados, setTocados] = useState<ReadonlySet<string>>(new Set());
  const [focoPedido, setFocoPedido] = useState<CampoNova | null>(null);

  const erros = useMemo(() => validarNovaPessoa(valores, hoje), [valores, hoje]);
  const visiveis = errosVisiveis(erros, tentou, tocados);
  const resumo = resumoDeErros(visiveis);

  useEffect(() => {
    if (focoPedido === null) return;
    document.getElementById(idCampo(focoPedido))?.focus();
    setFocoPedido(null);
  }, [focoPedido, aba]);

  const definir = (alteracao: Partial<ValoresNovaPessoa>) => {
    aoSujar();
    setValores((atual) => ({ ...atual, ...alteracao }));
  };
  const campos: CamposNovaProps = {
    valores, definir,
    erro: (campo) => (visiveis[campo] ? mensagemErro(t, campo, visiveis[campo]) : null),
  };

  const submeter = (e: FormEvent) => {
    e.preventDefault();
    setTentou(true);
    const primeiro = primeiroErro(erros);
    if (primeiro === null) return aoCriar(paraNovaPessoa(valores));
    setAba(abaDoCampo(primeiro));
    setFocoPedido(primeiro);
  };

  return (
    <CamposTocadosProvider
      rotuloObrigatorio={t("hr.campos.obrigatorio")}
      onTocar={(id) => setTocados((atual) => (atual.has(id) ? atual : new Set(atual).add(id)))}
    >
      <form noValidate onSubmit={submeter} className="flex min-h-0 flex-1 flex-col">
        <Tabs value={aba} onValueChange={(v) => setAba(v as AbaNova)} className="flex min-h-0 flex-1 flex-col">
          <ListaAbasNova aria-label={t("rhForm.nova.tabs.label")} className="shrink-0">
            {ABAS_NOVA.map((id) => (
              <AbaComErros key={id} value={id} rotulo={t(`rhForm.nova.tabs.${id}`)} erros={resumo.porAba[id]} />
            ))}
          </ListaAbasNova>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <TabsContent value="dados" className="mt-0"><CamposDados {...campos} /></TabsContent>
            <TabsContent value="contrato" className="mt-0"><CamposContrato {...campos} colegas={colegas} /></TabsContent>
            <TabsContent value="acesso" className="mt-0"><CamposAcesso {...campos} /></TabsContent>
          </div>
        </Tabs>
        <footer className="flex flex-wrap items-center gap-3 border-t border-border p-4 px-6">
          <p role="status" className="min-w-0 flex-1 text-sm text-destructive">
            {resumo.total === 0 ? "" : t(resumo.total === 1 ? "rhForm.nova.erros.um" : "rhForm.nova.erros.varios", { n: resumo.total })}
          </p>
          <Button type="button" variant="outline" onClick={aoCancelar} className={cn("min-h-11", FOCO)}>
            {t("rhForm.nova.cancel")}
          </Button>
          <Button type="submit" className={cn("min-h-11", FOCO)}>{t("rhForm.nova.create")}</Button>
        </footer>
      </form>
    </CamposTocadosProvider>
  );
}
