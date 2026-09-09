/**
 * Criacao de pessoa: so o nucleo obrigatorio.
 *
 * Primeiro nome e apelido sao os unicos campos que a base exige (NOT NULL e
 * CHECK de nao-vazio). Os outros quatro estao aqui porque sao os que quem
 * cria a ficha ja tem a mao no momento em que a cria. Tudo o resto -- morada,
 * NISS, contacto de emergencia, vinculo, retribuicao -- edita-se depois na
 * ficha, com a permissao propria de cada bloco.
 *
 * A organizacao NAO e escolha do formulario: vem da organizacao activa.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";

const SEM_ESCOLHA = "__sem_escolha__";

interface PessoaFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizacoes: Array<{ id: string; name: string }>;
  onCriar: (dados: {
    primeiro_nome: string;
    apelido: string;
    email_trabalho?: string | null;
    cargo?: string | null;
    data_admissao?: string | null;
    entidade_legal_org_id?: string | null;
  }) => Promise<string>;
  /** Chamado com o id da pessoa criada, para o ecra a abrir. */
  onCriada?: (pessoaId: string) => void;
}

export function PessoaFormDialog({
  open,
  onOpenChange,
  organizacoes,
  onCriar,
  onCriada,
}: PessoaFormDialogProps) {
  const { t } = useTranslation();
  const [primeiroNome, setPrimeiroNome] = useState("");
  const [apelido, setApelido] = useState("");
  const [emailTrabalho, setEmailTrabalho] = useState("");
  const [cargo, setCargo] = useState("");
  const [dataAdmissao, setDataAdmissao] = useState("");
  const [entidadeLegal, setEntidadeLegal] = useState(SEM_ESCOLHA);
  const [aCriar, setACriar] = useState(false);

  const limpar = () => {
    setPrimeiroNome("");
    setApelido("");
    setEmailTrabalho("");
    setCargo("");
    setDataAdmissao("");
    setEntidadeLegal(SEM_ESCOLHA);
  };

  const criar = async () => {
    if (primeiroNome.trim() === "" || apelido.trim() === "") {
      toast.error(t("hr.form.obrigatorios"));
      return;
    }
    setACriar(true);
    try {
      const id = await onCriar({
        primeiro_nome: primeiroNome,
        apelido,
        email_trabalho: emailTrabalho.trim() || null,
        cargo: cargo.trim() || null,
        data_admissao: dataAdmissao.trim() || null,
        entidade_legal_org_id: entidadeLegal === SEM_ESCOLHA ? null : entidadeLegal,
      });
      toast.success(t("hr.sucesso.criada"));
      limpar();
      onOpenChange(false);
      onCriada?.(id);
    } catch (e) {
      toast.error(await getFriendlyErrorMessage(e, t("hr.erros.guardar")));
    } finally {
      setACriar(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("hr.pessoas.new")}</DialogTitle>
          <DialogDescription>{t("hr.form.criarDescricao")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="hr-novo-primeiro-nome">{t("employees.form.firstName")}</Label>
            <Input
              id="hr-novo-primeiro-nome"
              value={primeiroNome}
              onChange={(e) => setPrimeiroNome(e.target.value)}
              placeholder={t("employees.form.firstNamePlaceholder")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hr-novo-apelido">{t("employees.form.lastName")}</Label>
            <Input
              id="hr-novo-apelido"
              value={apelido}
              onChange={(e) => setApelido(e.target.value)}
              placeholder={t("employees.form.lastNamePlaceholder")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hr-novo-email">{t("hr.laborais.emailTrabalho")}</Label>
            <Input
              id="hr-novo-email"
              type="email"
              value={emailTrabalho}
              onChange={(e) => setEmailTrabalho(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hr-novo-cargo">{t("hr.columns.cargo")}</Label>
            <Input id="hr-novo-cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hr-novo-admissao">{t("hr.columns.contratacao")}</Label>
            <Input
              id="hr-novo-admissao"
              type="date"
              value={dataAdmissao}
              onChange={(e) => setDataAdmissao(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hr-novo-entidade-legal">{t("hr.detalhes.entidadeLegal")}</Label>
            <Select value={entidadeLegal} onValueChange={setEntidadeLegal}>
              <SelectTrigger id="hr-novo-entidade-legal">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_ESCOLHA}>{t("hr.campos.semValor")}</SelectItem>
                {organizacoes.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={aCriar}>
            {t("employees.form.cancel")}
          </Button>
          <Button onClick={criar} disabled={aCriar}>
            {aCriar && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {t("employees.form.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
