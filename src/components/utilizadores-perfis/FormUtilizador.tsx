// O formulário de utilizador (convidar/criar e editar), num painel lateral no estilo de "Novo negócio": abas Dados, Vínculos e
// Permissões (só leitura, com a origem). Grava na memória (`perfisStore`), nunca na base, e nunca guarda a palavra-passe.
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { AbaDadosUtilizador } from "./AbaDadosUtilizador";
import { AbaForm, ListaAbasForm, Tabs, TabsContent } from "./AbaForm";
import { AbaVinculosForm, type AcoesVinculos } from "./AbaVinculosForm";
import { EDITOR_EXEMPLO } from "./catalogoExemplo";
import type { ResultadoForm } from "./FormRole";
import { ehProtegido } from "./logica";
import { PainelFormulario } from "./PainelFormulario";
import { criarUtilizador, guardarUtilizador, utilizadoresAtuais } from "./perfisStore";
import { RodapeForm } from "./RodapeForm";
import { SeparadorPermissoesUtilizador } from "./SeparadorPermissoesUtilizador";
import { CHAVE_MODO, type AbaFormUtilizador, type FormAberto, type Organizacao, type Role, type Utilizador } from "./tipos";
import { gerarPalavraPasse, paraDados, utilizadorDeValores, valoresIniciaisUtilizador, vinculoVazio, type ValoresFormUtilizador } from "./utilizadorForm";
import { useFocoCampo } from "./useFocoCampo";
import { useUltimo } from "./useUltimo";
import { abasComErroUtilizador, primeiroErroUtilizador, validarUtilizador, type CampoUtilizador } from "./validacoes";

type FormUtilizadorAberto = Extract<NonNullable<FormAberto>, { tipo: "utilizador" }>;

interface FormUtilizadorProps {
  form: FormAberto;
  utilizadores: Utilizador[];
  roles: Role[];
  organizacoes: Organizacao[];
  aoFechar: () => void;
  aoConcluir: (r: ResultadoForm) => void;
}

interface InteriorProps extends Omit<FormUtilizadorProps, "form" | "aoFechar"> {
  form: FormUtilizadorAberto;
  utilizador: Utilizador | undefined;
  aoSujar: () => void;
}

const ID_DO_CAMPO: Record<CampoUtilizador, string> = {
  nome: "nome", email: "email", telefone: "telefone", palavraPasse: "palavraPasse", vinculos: "v0-org",
};

function acoesDeVinculos(valores: ValoresFormUtilizador, mudar: (p: Partial<ValoresFormUtilizador>) => void): AcoesVinculos {
  return {
    mudar: (indice, parcial) => mudar({ vinculos: valores.vinculos.map((v, i) => (i === indice ? { ...v, ...parcial } : v)) }),
    adicionar: () => mudar({ vinculos: [...valores.vinculos, vinculoVazio()] }),
    remover: (indice) => mudar({ vinculos: valores.vinculos.filter((_, i) => i !== indice) }),
  };
}

type Traduzir = (chave: string, params?: Record<string, string | number>) => string;

/** Grava o utilizador no store (cria ou guarda; sem a palavra-passe) e diz o que o ecrã deve avisar. */
function gravarUtilizador(form: FormUtilizadorAberto, valores: ValoresFormUtilizador, t: Traduzir): ResultadoForm {
  const criar = form.modo === "criar";
  const nome = valores.nome.trim();
  if (criar) criarUtilizador(paraDados(valores));
  else if (form.id) guardarUtilizador(form.id, paraDados(valores));
  return {
    aviso: t(criar ? "usersProfiles.form.user.created" : "usersProfiles.form.user.saved"),
    anuncio: criar
      ? t("usersProfiles.form.user.announce.created", { name: nome, state: t(`usersProfiles.form.user.status.${valores.estado}`), total: utilizadoresAtuais().length })
      : t("usersProfiles.form.user.announce.saved", { name: nome }),
  };
}

/** Os valores do formulário, os erros (só depois de tentar enviar) e o que deles se deriva. */
function useEstadoUtilizador({ form, utilizador, utilizadores, roles, aoSujar }: InteriorProps, tentou: boolean) {
  const criar = form.modo === "criar";
  const [valores, setValores] = useState<ValoresFormUtilizador>(() => valoresIniciaisUtilizador(utilizador));
  const erros = validarUtilizador(valores, utilizadores, { criar, idAtual: form.id });
  const mudar = (parcial: Partial<ValoresFormUtilizador>) => { aoSujar(); setValores((v) => ({ ...v, ...parcial })); };
  return {
    criar, valores, mudar, erros, mostrados: tentou ? erros : {}, acoes: acoesDeVinculos(valores, mudar),
    bloqueado: !criar && !!utilizador && ehProtegido(utilizador, roles),
    previsao: useMemo(() => utilizadorDeValores(valores, form.id ?? "novo"), [valores, form.id]),
  };
}

function Interior(props: InteriorProps) {
  const { form, roles, organizacoes, aoConcluir } = props;
  const { t } = useTranslation();
  const id = useId();
  const pedirFoco = useFocoCampo();
  const [aba, setAba] = useState<AbaFormUtilizador>(form.aba ?? "dados");
  const [tentou, setTentou] = useState(false);
  const { criar, valores, mudar, erros, mostrados, acoes, bloqueado, previsao } = useEstadoUtilizador(props, tentou);
  const marcas = abasComErroUtilizador(mostrados);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setTentou(true);
    const primeiro = primeiroErroUtilizador(erros);
    if (primeiro) {
      setAba(primeiro.aba);
      pedirFoco(`${id}-${ID_DO_CAMPO[primeiro.campo]}`);
      return;
    }
    aoConcluir(gravarUtilizador(form, valores, t));
  };

  return (
    <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
      <Tabs value={aba} onValueChange={(v) => setAba(v as AbaFormUtilizador)} className="flex min-h-0 flex-1 flex-col">
        <ListaAbasForm aria-label={t("usersProfiles.form.tabs")}>
          <AbaForm value="dados" rotulo={t("usersProfiles.form.user.tab.data")} comErros={marcas.dados} />
          <AbaForm value="vinculos" rotulo={t("usersProfiles.form.user.tab.links")} contador={valores.vinculos.length} comErros={marcas.vinculos} />
          <AbaForm value="permissoes" rotulo={t("usersProfiles.form.user.tab.permissions")} />
        </ListaAbasForm>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <TabsContent value="dados" className="mt-0">
            <AbaDadosUtilizador
              id={id} valores={valores} erros={mostrados} criar={criar} bloqueado={bloqueado} aoMudar={mudar}
              aoGerar={() => mudar({ palavraPasse: gerarPalavraPasse() })}
            />
          </TabsContent>
          <TabsContent value="vinculos" className="mt-0">
            <AbaVinculosForm
              id={id} vinculos={valores.vinculos} erro={mostrados.vinculos} organizacoes={organizacoes} roles={roles}
              editor={EDITOR_EXEMPLO} bloqueado={bloqueado} acoes={acoes}
            />
          </TabsContent>
          <TabsContent value="permissoes" className="mt-0 space-y-3">
            <p className="text-sm text-muted-foreground">{t("usersProfiles.form.perms.note")}</p>
            <SeparadorPermissoesUtilizador utilizador={previsao} roles={roles} />
          </TabsContent>
        </div>
      </Tabs>
      <RodapeForm submeter={bloqueado ? null : t(criar ? "usersProfiles.form.user.submit.create" : "usersProfiles.form.user.submit.save")} />
    </form>
  );
}

/** O painel do utilizador: «Convidar utilizador» ou «Editar utilizador». */
export function FormUtilizador({ form, aoFechar, ...resto }: FormUtilizadorProps) {
  const { t } = useTranslation();
  const [sujo, setSujo] = useState(false);
  const ultimo = useUltimo(form?.tipo === "utilizador" ? form : null);
  const aberto = form?.tipo === "utilizador";
  useEffect(() => { if (aberto) setSujo(false); }, [aberto]);
  const utilizador = ultimo?.id ? resto.utilizadores.find((u) => u.id === ultimo.id) : undefined;
  const modo = ultimo?.modo ?? "criar";
  const protegido = modo === "editar" && !!utilizador && ehProtegido(utilizador, resto.roles);
  const selo = modo === "criar" ? "new" : protegido ? "viewing" : "editing";
  return (
    <PainelFormulario
      aberto={aberto} aoFechar={aoFechar} sujo={sujo} pai={t("usersProfiles.title")}
      titulo={t(`usersProfiles.form.user.title.${CHAVE_MODO[modo]}`)} selo={t(`usersProfiles.form.badge.${selo}`)}
    >
      {ultimo && <Interior form={ultimo} utilizador={utilizador} aoSujar={() => setSujo(true)} {...resto} />}
    </PainelFormulario>
  );
}
