// O formulário de role (criar, editar e duplicar), num painel lateral no estilo de "Novo negócio": abas Geral e Permissões,
// rodapé fixo com Cancelar e um único botão primário. Grava na base pelas ações que a página passa (hooks/useGuardarRole):
// um erro fica no painel (e em aviso), o painel não fecha e nada se dá por gravado sem a base o confirmar.
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { AbaForm, ListaAbasForm, Tabs, TabsContent } from "./AbaForm";
import { AbaGeralRole, MODELO_DUPLICAR, MODELO_EM_BRANCO, type AcoesGeralRole } from "./AbaGeralRole";
import { contarConcedidas, fundirPermissoes } from "./matriz";
import { MatrizEditavel } from "./MatrizEditavel";
import { aplicarOrigem, valoresIniciaisRole, type ModeloRole, type ValoresFormRole } from "./modelosRole";
import { PainelFormulario } from "./PainelFormulario";
import { RodapeForm } from "./RodapeForm";
import { CHAVE_MODO, type DadosRole, type FormAberto, type Permissao, type ResultadoMutacao, type Role } from "./tipos";
import { useFocoCampo } from "./useFocoCampo";
import { useUltimo } from "./useUltimo";
import { abasComErroRole, gerarCodigo, validarRole } from "./validacoes";

type FormRoleAberto = Extract<NonNullable<FormAberto>, { tipo: "role" }>;
type AbaRole = "geral" | "permissoes";
const ehCriacao = (form: FormRoleAberto): boolean => form.modo !== "editar";

/** O que a página faz quando o formulário termina: aviso (toast), anúncio para o leitor de ecrã, e fecha. */
export interface ResultadoForm {
  aviso: string;
  anuncio: string;
}

/** As permissões que a matriz mostra e o estado da sua leitura. */
export interface CatalogoForm {
  visiveis: Permissao[];
  carregando: boolean;
  erro: string | null;
}

export interface ModelosForm {
  lista: ModeloRole[];
  erro: string | null;
}

export interface AcoesGravarRole {
  criar: (dados: DadosRole) => Promise<ResultadoMutacao>;
  guardar: (id: string, dados: DadosRole, sistema: boolean) => Promise<ResultadoMutacao>;
}

interface FormRoleProps {
  form: FormAberto;
  roles: Role[];
  catalogo: CatalogoForm;
  modelos: ModelosForm;
  acoes: AcoesGravarRole;
  /** Se quem está ligado pode editar a role (roles.edit, âmbito, não eliminada); senão abre só para ver. */
  podeEditar: (role: Role) => boolean;
  aoFechar: () => void;
  aoConcluir: (r: ResultadoForm) => void;
}

interface InteriorProps extends Omit<FormRoleProps, "form" | "aoFechar"> {
  form: FormRoleAberto;
  role: Role | undefined;
  aoSujar: () => void;
}

function useValoresRole(form: FormRoleAberto, role: Role | undefined, roles: Role[], modelos: ModeloRole[], aoSujar: () => void) {
  const { t } = useTranslation();
  const sufixo = t("usersProfiles.form.role.copySuffix");
  const [valores, setValores] = useState<ValoresFormRole>(() => valoresIniciaisRole(form.modo, role, sufixo));
  const [codigoManual, setCodigoManual] = useState(form.modo === "editar");
  const [modelo, setModelo] = useState(MODELO_EM_BRANCO);
  const [fonteId, setFonteId] = useState("");
  const mudar = (parcial: Partial<ValoresFormRole>) => { aoSujar(); setValores((v) => ({ ...v, ...parcial })); };
  const acompanhar = (nome: string) => (codigoManual ? {} : { codigo: gerarCodigo(nome) });
  const partirDe = (origem: Parameters<typeof aplicarOrigem>[1], marca = "") => {
    const novo = aplicarOrigem(valores, origem, marca);
    mudar({ ...novo, ...acompanhar(novo.nome) });
  };
  const acoes: AcoesGeralRole = {
    nome: (nome) => mudar({ nome, ...acompanhar(nome) }),
    codigo: (codigo) => { setCodigoManual(true); mudar({ codigo }); },
    descricao: (descricao) => mudar({ descricao }),
    podeAssinar: (podeAssinar) => mudar({ podeAssinar }),
    modelo: (m) => {
      setModelo(m);
      if (m === MODELO_EM_BRANCO) mudar({ permissoes: [] });
      else if (m !== MODELO_DUPLICAR) partirDe(modelos.find((x) => x.id === m) ?? null);
    },
    fonte: (roleId) => { setFonteId(roleId); partirDe(roles.find((r) => r.id === roleId) ?? null, sufixo); },
  };
  return { valores, mudar, acoes, modelo, fonteId };
}

type Traduzir = (chave: string, params?: Record<string, string | number>) => string;

/** O que se grava: as permissões editadas mais as que a role já tinha e quem edita não vê (não se perdem em silêncio). */
function dadosDoForm(form: FormRoleAberto, role: Role | undefined, valores: ValoresFormRole, visiveis: Permissao[]): DadosRole {
  return {
    nome: valores.nome.trim(), codigo: valores.codigo.trim(), descricao: valores.descricao.trim(), podeAssinar: valores.podeAssinar,
    permissoes: fundirPermissoes(form.modo === "editar" ? role?.permissoes ?? [] : [], valores.permissoes, visiveis),
  };
}

function resultadoDe(criacao: boolean, nome: string, t: Traduzir): ResultadoForm {
  return {
    aviso: t(criacao ? "usersProfiles.form.role.created" : "usersProfiles.form.role.saved"),
    anuncio: t(criacao ? "usersProfiles.form.role.announce.created" : "usersProfiles.form.role.announce.saved", { name: nome }),
  };
}

function Interior({ form, role, roles, catalogo, modelos, acoes, podeEditar, aoSujar, aoConcluir }: InteriorProps) {
  const { t } = useTranslation();
  const id = useId();
  const pedirFoco = useFocoCampo();
  const [aba, setAba] = useState<AbaRole>("geral");
  const [tentou, setTentou] = useState(false);
  const [aGravar, setAGravar] = useState(false);
  const [erroGravar, setErroGravar] = useState<string | null>(null);
  const { visiveis } = catalogo;
  const { valores, mudar, acoes: acoesGeral, modelo, fonteId } = useValoresRole(form, role, roles, modelos.lista, aoSujar);
  const editar = form.modo === "editar";
  const semPermissao = editar && !!role && !role.sistema && !podeEditar(role);
  const bloqueado = editar && (!!role?.sistema || semPermissao);
  const catalogoPronto = !catalogo.carregando && !catalogo.erro;
  const erros = validarRole(valores, roles, editar ? form.id : undefined);
  const mostrados = tentou ? erros : {};
  const contadas = useMemo(() => contarConcedidas(valores.permissoes, visiveis), [valores.permissoes, visiveis]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setTentou(true);
    if (abasComErroRole(erros).length > 0) {
      setAba("geral");
      pedirFoco(`${id}-${erros.nome ? "nome" : "codigo"}`);
      return;
    }
    const dados = dadosDoForm(form, role, valores, visiveis);
    setErroGravar(null);
    setAGravar(true);
    const r = editar && form.id ? await acoes.guardar(form.id, dados, !!role?.sistema) : await acoes.criar(dados);
    setAGravar(false);
    if (r.ok) { aoConcluir(resultadoDe(ehCriacao(form), dados.nome, t)); return; }
    setErroGravar(r.erro);
    toast.error(t("usersProfiles.form.role.saveError", { message: r.erro }));
  };

  return (
    <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
      {erroGravar && (
        <p role="alert" className="mx-6 mt-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {t("usersProfiles.form.role.saveError", { message: erroGravar })}
        </p>
      )}
      <Tabs value={aba} onValueChange={(v) => setAba(v === "permissoes" ? "permissoes" : "geral")} className="flex min-h-0 flex-1 flex-col">
        <ListaAbasForm aria-label={t("usersProfiles.form.tabs")}>
          <AbaForm value="geral" rotulo={t("usersProfiles.form.role.tab.general")} comErros={abasComErroRole(mostrados).includes("geral")} />
          <AbaForm value="permissoes" rotulo={t("usersProfiles.form.role.tab.permissions")} contador={contadas} />
        </ListaAbasForm>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <TabsContent value="geral" className="mt-0">
            <AbaGeralRole
              id={id} valores={valores} erros={mostrados} bloqueado={bloqueado} comModelo={form.modo === "criar"}
              modelo={modelo} fonteId={fonteId} roles={roles} modelos={modelos.lista} erroModelos={modelos.erro}
              aviso={semPermissao ? t("usersProfiles.form.role.noEditNote") : null} acoes={acoesGeral}
            />
          </TabsContent>
          <TabsContent value="permissoes" className="mt-0">
            {catalogo.carregando && <p role="status" className="text-sm text-muted-foreground">{t("usersProfiles.form.role.catalogLoading")}</p>}
            {catalogo.erro && <p role="alert" className="text-sm text-destructive">{t("usersProfiles.form.role.catalogError", { message: catalogo.erro })}</p>}
            {catalogoPronto && <MatrizEditavel visiveis={visiveis} concedidas={valores.permissoes} somenteLeitura={bloqueado} aoMudar={(permissoes) => mudar({ permissoes })} />}
          </TabsContent>
        </div>
      </Tabs>
      <RodapeForm
        submeter={bloqueado ? null : t(ehCriacao(form) ? "usersProfiles.form.role.submit.create" : "usersProfiles.form.role.submit.save")}
        desativado={aGravar || !catalogoPronto || (editar && !role)}
      />
    </form>
  );
}

/** O painel da role: título e selo conforme o modo (e "só leitura" numa role de sistema ou sem permissão para editar). */
export function FormRole({ form, aoFechar, ...resto }: FormRoleProps) {
  const { t } = useTranslation();
  const [sujo, setSujo] = useState(false);
  const ultimo = useUltimo(form?.tipo === "role" ? form : null);
  const aberto = form?.tipo === "role";
  useEffect(() => { if (aberto) setSujo(false); }, [aberto]);
  const role = ultimo?.id ? resto.roles.find((r) => r.id === ultimo.id) : undefined;
  const tituloModo = ultimo?.modo ?? "criar";
  const soLeitura = !!role && (role.sistema || !resto.podeEditar(role));
  const selo = tituloModo !== "editar" ? "new" : soLeitura ? "viewing" : "editing";
  return (
    <PainelFormulario
      aberto={aberto} aoFechar={aoFechar} sujo={sujo} pai={t("usersProfiles.title")}
      titulo={t(`usersProfiles.form.role.title.${CHAVE_MODO[tituloModo]}`)} selo={t(`usersProfiles.form.badge.${selo}`)}
    >
      {ultimo && <Interior form={ultimo} role={role} aoSujar={() => setSujo(true)} {...resto} />}
    </PainelFormulario>
  );
}
