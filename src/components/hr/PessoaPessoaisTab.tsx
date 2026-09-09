/**
 * Detalhes pessoais: sete blocos, cada um com a sua permissao.
 *
 * A REGRA DE VISIBILIDADE
 * -----------------------
 * Um bloco sem permissao de leitura NAO aparece -- nao aparece vazio, nao
 * aparece com "sem acesso". Mostrar sete molduras cinzentas a dizer que ha ali
 * dados sensiveis ja e informacao a mais, e enche o ecra de quem so tem uma
 * das permissoes. Quem tem `hr.pessoas.pessoais.view` mas nao
 * `hr.pessoas.saude.view` ve seis blocos e nunca soube que o setimo existe.
 *
 * A base diz o mesmo por outra via: cada satelite tem a sua politica de SELECT
 * e devolve zero linhas a quem nao tem a permissao. Esta camada e a cortesia
 * visual; a garantia esta la.
 *
 * O NISS e o IBAN tem componentes proprios porque nao sao campos normais: um
 * revela-se por RPC auditada, o outro nunca se revela.
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreditCard, IdCard, Loader2, MapPin, Phone, Receipt, User } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { PessoaContaBancariaField } from "@/components/hr/PessoaContaBancariaField";
import { CountrySelect } from "@/components/CountrySelect";
import { PessoaNissField } from "@/components/hr/PessoaNissField";
import { PessoaSaudeCard } from "@/components/hr/PessoaSaudeCard";
import {
  ESTADOS_CIVIS,
  GENEROS,
  TIPOS_DOCUMENTO,
  type EstadoCivil,
  type Genero,
  type PessoaContactoEmergencia,
  type PessoaDadosBancarios,
  type PessoaDadosPessoais,
  type PessoaDadosSaude,
  type PessoaIdentificacao,
  type FormatoConta,
  type PessoaMorada,
  type TipoDocumento,
} from "@/types/hr";

const SEM_ESCOLHA = "__sem_escolha__";

/** Permissoes que este separador consulta, todas resolvidas por quem o monta. */
export interface PessoaPessoaisPermissoes {
  pessoaisView: boolean;
  pessoaisEdit: boolean;
  identificacaoView: boolean;
  identificacaoEdit: boolean;
  identificacaoReveal: boolean;
  moradaView: boolean;
  moradaEdit: boolean;
  emergenciaView: boolean;
  emergenciaEdit: boolean;
  bancariosView: boolean;
  bancariosEdit: boolean;
  saudeView: boolean;
  saudeEdit: boolean;
}

interface PessoaPessoaisTabProps {
  dadosPessoais: PessoaDadosPessoais | null;
  identificacao: PessoaIdentificacao | null;
  morada: PessoaMorada | null;
  emergencia: PessoaContactoEmergencia | null;
  bancarios: PessoaDadosBancarios | null;
  saude: PessoaDadosSaude | null;
  permissoes: PessoaPessoaisPermissoes;
  saving: boolean;
  onGuardarDadosPessoais: (patch: Partial<PessoaDadosPessoais>) => Promise<string | null>;
  onGuardarIdentificacao: (patch: Partial<PessoaIdentificacao>) => Promise<string | null>;
  onGuardarMorada: (patch: Partial<PessoaMorada>) => Promise<string | null>;
  onGuardarEmergencia: (patch: Partial<PessoaContactoEmergencia>) => Promise<string | null>;
  onGuardarSaude: (patch: Partial<PessoaDadosSaude>) => Promise<string | null>;
  onRevelarNiss: () => Promise<string | null>;
  onDefinirNiss: (niss: string) => Promise<string | null>;
  onDefinirConta: (args: {
    formato: FormatoConta;
    conta: string;
    titular?: string | null;
    banco?: string | null;
    swift?: string | null;
  }) => Promise<string | null>;
}

/** Texto -> valor de coluna: string vazia e ausencia, nao string vazia. */
function ouNull(valor: string): string | null {
  return valor.trim() === "" ? null : valor.trim();
}

function numeroOuNull(valor: string): number | null {
  if (valor.trim() === "") return null;
  const numero = Number(valor);
  return Number.isNaN(numero) ? null : numero;
}

/** Rodape com o botao de gravar, mostrado so quando ha algo por gravar. */
function AccoesBloco({
  visivel,
  saving,
  onGravar,
  onCancelar,
}: {
  visivel: boolean;
  saving: boolean;
  onGravar: () => void;
  onCancelar: () => void;
}) {
  const { t } = useTranslation();
  if (!visivel) return null;
  return (
    <div className="flex gap-2 pt-1">
      <Button size="sm" onClick={onGravar} disabled={saving}>
        {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
        {t("employees.form.update")}
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancelar} disabled={saving}>
        {t("employees.form.cancel")}
      </Button>
    </div>
  );
}

export function PessoaPessoaisTab({
  dadosPessoais,
  identificacao,
  morada,
  emergencia,
  bancarios,
  saude,
  permissoes,
  saving,
  onGuardarDadosPessoais,
  onGuardarIdentificacao,
  onGuardarMorada,
  onGuardarEmergencia,
  onGuardarSaude,
  onRevelarNiss,
  onDefinirNiss,
  onDefinirConta,
}: PessoaPessoaisTabProps) {
  const { t } = useTranslation();

  // -- Bloco 1 e 7: dados pessoais (partilham a mesma linha na base) --------
  const geralOriginal = useMemo(
    () => ({
      data_nascimento: dadosPessoais?.data_nascimento ?? "",
      ocultar_aniversario: dadosPessoais?.ocultar_aniversario ?? false,
      genero: dadosPessoais?.genero ?? SEM_ESCOLHA,
      nacionalidade: dadosPessoais?.nacionalidade ?? "",
      telefone_pessoal: dadosPessoais?.telefone_pessoal ?? "",
      email_comunicacoes: dadosPessoais?.email_comunicacoes ?? "",
      estado_civil: dadosPessoais?.estado_civil ?? SEM_ESCOLHA,
      dependentes:
        dadosPessoais?.dependentes === null || dadosPessoais?.dependentes === undefined
          ? ""
          : String(dadosPessoais.dependentes),
      irs:
        dadosPessoais?.irs_retencao_percentagem === null ||
        dadosPessoais?.irs_retencao_percentagem === undefined
          ? ""
          : String(dadosPessoais.irs_retencao_percentagem),
    }),
    [dadosPessoais],
  );
  const [geral, setGeral] = useState(geralOriginal);
  useEffect(() => setGeral(geralOriginal), [geralOriginal]);
  const geralAlterado = useMemo(
    () => JSON.stringify(geral) !== JSON.stringify(geralOriginal),
    [geral, geralOriginal],
  );

  const gravarGeral = async () => {
    const erro = await onGuardarDadosPessoais({
      data_nascimento: ouNull(geral.data_nascimento),
      ocultar_aniversario: geral.ocultar_aniversario,
      genero: geral.genero === SEM_ESCOLHA ? null : (geral.genero as Genero),
      nacionalidade: ouNull(geral.nacionalidade)?.toUpperCase() ?? null,
      telefone_pessoal: ouNull(geral.telefone_pessoal),
      email_comunicacoes: ouNull(geral.email_comunicacoes),
      estado_civil: geral.estado_civil === SEM_ESCOLHA ? null : (geral.estado_civil as EstadoCivil),
      dependentes: numeroOuNull(geral.dependentes),
      irs_retencao_percentagem: numeroOuNull(geral.irs),
    });
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.sucesso.guardado"));
  };

  // -- Bloco 2: identificacao ----------------------------------------------
  const idOriginal = useMemo(
    () => ({
      tipo_documento: identificacao?.tipo_documento ?? SEM_ESCOLHA,
      numero_documento: identificacao?.numero_documento ?? "",
      validade_documento: identificacao?.validade_documento ?? "",
      nif: identificacao?.nif ?? "",
    }),
    [identificacao],
  );
  const [ident, setIdent] = useState(idOriginal);
  useEffect(() => setIdent(idOriginal), [idOriginal]);
  const identAlterado = useMemo(
    () => JSON.stringify(ident) !== JSON.stringify(idOriginal),
    [ident, idOriginal],
  );
  const [nissNovo, setNissNovo] = useState("");

  const gravarIdent = async () => {
    const erro = await onGuardarIdentificacao({
      tipo_documento:
        ident.tipo_documento === SEM_ESCOLHA ? null : (ident.tipo_documento as TipoDocumento),
      numero_documento: ouNull(ident.numero_documento),
      validade_documento: ouNull(ident.validade_documento),
      nif: ouNull(ident.nif),
    });
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.sucesso.guardado"));
  };

  const gravarNiss = async () => {
    const erro = await onDefinirNiss(nissNovo.replace(/\s+/g, ""));
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.sucesso.guardado"));
    setNissNovo("");
  };

  // -- Bloco 3: morada ------------------------------------------------------
  const moradaOriginal = useMemo(
    () => ({
      linha1: morada?.linha1 ?? "",
      linha2: morada?.linha2 ?? "",
      codigo_postal: morada?.codigo_postal ?? "",
      localidade: morada?.localidade ?? "",
      distrito: morada?.distrito ?? "",
      pais: morada?.pais ?? "PT",
    }),
    [morada],
  );
  const [moradaDraft, setMoradaDraft] = useState(moradaOriginal);
  useEffect(() => setMoradaDraft(moradaOriginal), [moradaOriginal]);
  const moradaAlterada = useMemo(
    () => JSON.stringify(moradaDraft) !== JSON.stringify(moradaOriginal),
    [moradaDraft, moradaOriginal],
  );

  const gravarMorada = async () => {
    if (moradaDraft.linha1.trim() === "") {
      toast.error(t("hr.campos.linha1"));
      return;
    }
    const erro = await onGuardarMorada({
      linha1: moradaDraft.linha1.trim(),
      linha2: ouNull(moradaDraft.linha2),
      codigo_postal: ouNull(moradaDraft.codigo_postal),
      localidade: ouNull(moradaDraft.localidade),
      distrito: ouNull(moradaDraft.distrito),
      pais: (ouNull(moradaDraft.pais) ?? "PT").toUpperCase(),
    });
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.sucesso.guardado"));
  };

  // -- Bloco 5: contacto de emergencia -------------------------------------
  const emergenciaOriginal = useMemo(
    () => ({
      nome: emergencia?.nome ?? "",
      relacao: emergencia?.relacao ?? "",
      telefone: emergencia?.telefone ?? "",
      telefone_alternativo: emergencia?.telefone_alternativo ?? "",
      email: emergencia?.email ?? "",
    }),
    [emergencia],
  );
  const [emergenciaDraft, setEmergenciaDraft] = useState(emergenciaOriginal);
  useEffect(() => setEmergenciaDraft(emergenciaOriginal), [emergenciaOriginal]);
  const emergenciaAlterada = useMemo(
    () => JSON.stringify(emergenciaDraft) !== JSON.stringify(emergenciaOriginal),
    [emergenciaDraft, emergenciaOriginal],
  );

  const gravarEmergencia = async () => {
    if (emergenciaDraft.nome.trim() === "" || emergenciaDraft.telefone.trim() === "") {
      toast.error(t("hr.pessoais.emergencia"));
      return;
    }
    const erro = await onGuardarEmergencia({
      nome: emergenciaDraft.nome.trim(),
      relacao: ouNull(emergenciaDraft.relacao),
      telefone: emergenciaDraft.telefone.trim(),
      telefone_alternativo: ouNull(emergenciaDraft.telefone_alternativo),
      email: ouNull(emergenciaDraft.email),
    });
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.sucesso.guardado"));
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {permissoes.pessoaisView && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4 text-muted-foreground" />
              {t("hr.pessoais.geral")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="hr-nascimento">{t("employees.form.birthDate")}</Label>
                <Input
                  id="hr-nascimento"
                  type="date"
                  value={geral.data_nascimento}
                  disabled={!permissoes.pessoaisEdit}
                  onChange={(e) => setGeral({ ...geral, data_nascimento: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hr-genero">{t("hr.campos.genero")}</Label>
                <Select
                  value={geral.genero}
                  disabled={!permissoes.pessoaisEdit}
                  onValueChange={(v) => setGeral({ ...geral, genero: v })}
                >
                  <SelectTrigger id="hr-genero">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_ESCOLHA}>{t("hr.campos.semValor")}</SelectItem>
                    {GENEROS.map((genero) => (
                      <SelectItem key={genero} value={genero}>
                        {t(`hr.genero.${genero}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hr-nacionalidade">{t("hr.campos.nacionalidade")}</Label>
                {/* A mesma fonte e o mesmo componente do pais da morada: para
                    a base ambos sao duas letras maiusculas. */}
                <CountrySelect
                  id="hr-nacionalidade"
                  value={geral.nacionalidade}
                  disabled={!permissoes.pessoaisEdit}
                  onChange={(codigo) => setGeral({ ...geral, nacionalidade: codigo })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hr-telefone-pessoal">{t("hr.campos.telefonePessoal")}</Label>
                <Input
                  id="hr-telefone-pessoal"
                  value={geral.telefone_pessoal}
                  disabled={!permissoes.pessoaisEdit}
                  onChange={(e) => setGeral({ ...geral, telefone_pessoal: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hr-email-comunicacoes">{t("hr.campos.emailComunicacoes")}</Label>
                <Input
                  id="hr-email-comunicacoes"
                  type="email"
                  value={geral.email_comunicacoes}
                  disabled={!permissoes.pessoaisEdit}
                  onChange={(e) => setGeral({ ...geral, email_comunicacoes: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="hr-ocultar-aniversario"
                checked={geral.ocultar_aniversario}
                disabled={!permissoes.pessoaisEdit}
                onCheckedChange={(v) => setGeral({ ...geral, ocultar_aniversario: v === true })}
              />
              <Label htmlFor="hr-ocultar-aniversario" className="font-normal">
                {t("hr.campos.ocultarAniversario")}
              </Label>
            </div>

            <AccoesBloco
              visivel={permissoes.pessoaisEdit && geralAlterado}
              saving={saving}
              onGravar={gravarGeral}
              onCancelar={() => setGeral(geralOriginal)}
            />
          </CardContent>
        </Card>
      )}

      {permissoes.identificacaoView && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <IdCard className="h-4 w-4 text-muted-foreground" />
              {t("hr.pessoais.documento")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="hr-tipo-documento">{t("hr.campos.tipoDocumento")}</Label>
                <Select
                  value={ident.tipo_documento}
                  disabled={!permissoes.identificacaoEdit}
                  onValueChange={(v) => setIdent({ ...ident, tipo_documento: v })}
                >
                  <SelectTrigger id="hr-tipo-documento">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_ESCOLHA}>{t("hr.campos.semValor")}</SelectItem>
                    {TIPOS_DOCUMENTO.map((tipo) => (
                      <SelectItem key={tipo} value={tipo}>
                        {t(`hr.tipoDocumento.${tipo}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hr-numero-documento">{t("hr.campos.numeroDocumento")}</Label>
                <Input
                  id="hr-numero-documento"
                  value={ident.numero_documento}
                  disabled={!permissoes.identificacaoEdit}
                  onChange={(e) => setIdent({ ...ident, numero_documento: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hr-validade-documento">{t("hr.campos.validadeDocumento")}</Label>
                <Input
                  id="hr-validade-documento"
                  type="date"
                  value={ident.validade_documento}
                  disabled={!permissoes.identificacaoEdit}
                  onChange={(e) => setIdent({ ...ident, validade_documento: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hr-nif">{t("hr.campos.nif")}</Label>
                <Input
                  id="hr-nif"
                  inputMode="numeric"
                  maxLength={9}
                  value={ident.nif}
                  disabled={!permissoes.identificacaoEdit}
                  onChange={(e) => setIdent({ ...ident, nif: e.target.value })}
                />
              </div>
            </div>

            <PessoaNissField
              ultimos4={identificacao?.niss_ultimos4 ?? null}
              podeRevelar={permissoes.identificacaoReveal}
              onRevelar={onRevelarNiss}
            />

            {permissoes.identificacaoEdit && (
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="hr-niss-novo">{t("hr.campos.niss")}</Label>
                  <Input
                    id="hr-niss-novo"
                    inputMode="numeric"
                    maxLength={11}
                    placeholder="00000000000"
                    value={nissNovo}
                    onChange={(e) => setNissNovo(e.target.value)}
                  />
                </div>
                <Button size="sm" onClick={gravarNiss} disabled={saving || nissNovo.trim().length !== 11}>
                  {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  {t("employees.form.update")}
                </Button>
              </div>
            )}

            <AccoesBloco
              visivel={permissoes.identificacaoEdit && identAlterado}
              saving={saving}
              onGravar={gravarIdent}
              onCancelar={() => setIdent(idOriginal)}
            />
          </CardContent>
        </Card>
      )}

      {permissoes.moradaView && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              {t("hr.pessoais.morada")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="hr-linha1">{t("hr.campos.linha1")}</Label>
              <Input
                id="hr-linha1"
                value={moradaDraft.linha1}
                disabled={!permissoes.moradaEdit}
                onChange={(e) => setMoradaDraft({ ...moradaDraft, linha1: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hr-linha2">{t("hr.campos.linha2")}</Label>
              <Input
                id="hr-linha2"
                value={moradaDraft.linha2}
                disabled={!permissoes.moradaEdit}
                onChange={(e) => setMoradaDraft({ ...moradaDraft, linha2: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="hr-codigo-postal">{t("employees.form.postalCode")}</Label>
                <Input
                  id="hr-codigo-postal"
                  value={moradaDraft.codigo_postal}
                  disabled={!permissoes.moradaEdit}
                  onChange={(e) => setMoradaDraft({ ...moradaDraft, codigo_postal: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hr-localidade">{t("hr.campos.localidade")}</Label>
                <Input
                  id="hr-localidade"
                  value={moradaDraft.localidade}
                  disabled={!permissoes.moradaEdit}
                  onChange={(e) => setMoradaDraft({ ...moradaDraft, localidade: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hr-distrito">{t("employees.form.district")}</Label>
                <Input
                  id="hr-distrito"
                  value={moradaDraft.distrito}
                  disabled={!permissoes.moradaEdit}
                  onChange={(e) => setMoradaDraft({ ...moradaDraft, distrito: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hr-pais">{t("employees.form.country")}</Label>
                <CountrySelect
                  id="hr-pais"
                  value={moradaDraft.pais}
                  disabled={!permissoes.moradaEdit}
                  onChange={(codigo) => setMoradaDraft({ ...moradaDraft, pais: codigo })}
                />
              </div>
            </div>
            <AccoesBloco
              visivel={permissoes.moradaEdit && moradaAlterada}
              saving={saving}
              onGravar={gravarMorada}
              onCancelar={() => setMoradaDraft(moradaOriginal)}
            />
          </CardContent>
        </Card>
      )}

      {permissoes.saudeView && (
        <PessoaSaudeCard
          saude={saude}
          podeEditar={permissoes.saudeEdit}
          saving={saving}
          onGuardar={onGuardarSaude}
        />
      )}

      {permissoes.emergenciaView && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Phone className="h-4 w-4 text-muted-foreground" />
              {t("hr.pessoais.emergencia")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="hr-emergencia-nome">{t("employees.form.emergencyContactName")}</Label>
                <Input
                  id="hr-emergencia-nome"
                  value={emergenciaDraft.nome}
                  disabled={!permissoes.emergenciaEdit}
                  onChange={(e) => setEmergenciaDraft({ ...emergenciaDraft, nome: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hr-emergencia-relacao">{t("hr.campos.relacao")}</Label>
                <Input
                  id="hr-emergencia-relacao"
                  value={emergenciaDraft.relacao}
                  disabled={!permissoes.emergenciaEdit}
                  onChange={(e) => setEmergenciaDraft({ ...emergenciaDraft, relacao: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hr-emergencia-telefone">
                  {t("employees.form.emergencyContactPhone")}
                </Label>
                <Input
                  id="hr-emergencia-telefone"
                  value={emergenciaDraft.telefone}
                  disabled={!permissoes.emergenciaEdit}
                  onChange={(e) =>
                    setEmergenciaDraft({ ...emergenciaDraft, telefone: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hr-emergencia-alternativo">
                  {t("hr.campos.telefoneAlternativo")}
                </Label>
                <Input
                  id="hr-emergencia-alternativo"
                  value={emergenciaDraft.telefone_alternativo}
                  disabled={!permissoes.emergenciaEdit}
                  onChange={(e) =>
                    setEmergenciaDraft({ ...emergenciaDraft, telefone_alternativo: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="hr-emergencia-email">{t("employees.form.email")}</Label>
                <Input
                  id="hr-emergencia-email"
                  type="email"
                  value={emergenciaDraft.email}
                  disabled={!permissoes.emergenciaEdit}
                  onChange={(e) => setEmergenciaDraft({ ...emergenciaDraft, email: e.target.value })}
                />
              </div>
            </div>
            <AccoesBloco
              visivel={permissoes.emergenciaEdit && emergenciaAlterada}
              saving={saving}
              onGravar={gravarEmergencia}
              onCancelar={() => setEmergenciaDraft(emergenciaOriginal)}
            />
          </CardContent>
        </Card>
      )}

      {permissoes.bancariosView && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              {t("hr.pessoais.bancarios")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PessoaContaBancariaField
              bancarios={bancarios}
              podeEditar={permissoes.bancariosEdit}
              saving={saving}
              onDefinir={onDefinirConta}
            />
          </CardContent>
        </Card>
      )}

      {permissoes.pessoaisView && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              {t("hr.pessoais.recibo")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="hr-estado-civil">{t("hr.campos.estadoCivil")}</Label>
                <Select
                  value={geral.estado_civil}
                  disabled={!permissoes.pessoaisEdit}
                  onValueChange={(v) => setGeral({ ...geral, estado_civil: v })}
                >
                  <SelectTrigger id="hr-estado-civil">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_ESCOLHA}>{t("hr.campos.semValor")}</SelectItem>
                    {ESTADOS_CIVIS.map((estado) => (
                      <SelectItem key={estado} value={estado}>
                        {t(`hr.estadoCivil.${estado}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hr-dependentes">{t("hr.campos.dependentes")}</Label>
                <Input
                  id="hr-dependentes"
                  type="number"
                  min={0}
                  max={30}
                  value={geral.dependentes}
                  disabled={!permissoes.pessoaisEdit}
                  onChange={(e) => setGeral({ ...geral, dependentes: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hr-irs">{t("hr.campos.irs")}</Label>
                <Input
                  id="hr-irs"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={geral.irs}
                  disabled={!permissoes.pessoaisEdit}
                  onChange={(e) => setGeral({ ...geral, irs: e.target.value })}
                />
              </div>
            </div>
            <AccoesBloco
              visivel={permissoes.pessoaisEdit && geralAlterado}
              saving={saving}
              onGravar={gravarGeral}
              onCancelar={() => setGeral(geralOriginal)}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
