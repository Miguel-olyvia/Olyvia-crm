// A aba "Retribuição e bancário" do painel "Nova pessoa": o salário base (que vem do cargo, só para ler), o subsídio de
// alimentação (valor e modo) e os duodécimos, que são do RH e obrigatórios; e a conta bancária (IBAN mascarado, titular, banco,
// agência, BIC) com o comprovativo de IBAN em anexo.
import { CampoTexto } from "@/components/hr/form/Campos";
import { useCargos } from "@/hooks/useCargos";
import { chaveDoRotuloDaConta, mascaraDaConta, normalizarConta } from "@/lib/hr/conta";
import { FORMATOS_CONTA } from "@/types/hr";
import { periodoDoCargoEm } from "@/lib/hr/cargosPeriodos";
import { dataDeHoje } from "@/lib/hr/novaPessoaDatas";
import { useTranslation } from "@/hooks/useTranslation";
import { AnexosNova } from "./AnexosNova";
import { CampoS, CampoT, GRELHA, LinhaCampo } from "./camposNova";
import { useNova } from "./contextoNova";
import { opcoes } from "./opcoesNova";
import { SeccaoNova } from "./SeccaoNova";

function Retribuicao() {
  const { t } = useTranslation();
  const { valores } = useNova();
  const { periodos } = useCargos();
  // O salario base e o do cargo na data em que o contrato comeca (so leitura: o valor vem do cargo, nunca se escreve aqui).
  const data = valores.contrato.data_inicio.trim() || valores.laborais.data_admissao.trim() || dataDeHoje();
  const periodo = valores.laborais.cargo_id === "" ? null : periodoDoCargoEm(periodos, valores.laborais.cargo_id, data);
  const euros = (n: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);
  return (
    <SeccaoNova titulo={t("rhNova.sec.retribuicao")}>
      <div className={GRELHA}>
        <LinhaCampo id="hr-novo-salario-base">
          <CampoTexto
            id="hr-novo-salario-base" label={t("hr.retribuicaoCartao.valor")} onChange={() => undefined} disabled
            valor={periodo ? euros(periodo.salario_base) : ""} placeholder={t("rhNova.h.salarioSemCargo")}
            ajuda={t("rhNova.h.salarioDoCargo")}
          />
        </LinhaCampo>
        <LinhaCampo id="hr-novo-periodicidade">
          <CampoTexto
            id="hr-novo-periodicidade" label={t("hr.contrato.periodicidade")} onChange={() => undefined} disabled
            valor={periodo ? t(`hr.periodicidade.${periodo.periodicidade}`) : ""}
          />
        </LinhaCampo>
        <CampoT
          g="contrato" k="subsidio" id="hr-novo-subsidio" codigo="subsidio_alimentacao" tipo="text"
          rotulo={t("hr.retribuicaoCartao.subsidioAlimentacao")} ajuda={t("hr.admissao.subsidioZeroConta")}
        />
        <CampoS
          g="contrato" k="subsidio_modo" id="hr-novo-subsidio-modo" rotulo={t("hr.retribuicaoCartao.subsidioAlimentacaoModo")}
          opcoes={opcoes(t, "rhNova.modo", ["dinheiro", "cartao"])} vazio={t("rhNova.semIndicacao")}
        />
        <CampoS
          g="contrato" k="duodecimos_pct" id="hr-novo-duodecimos" codigo="duodecimos" rotulo={t("hr.contrato.duodecimos")}
          opcoes={opcoes(t, "rhNova.duodecimos", ["0", "50", "100"])} ajuda={t("hr.admissao.duodecimosOmissao")}
        />
      </div>
    </SeccaoNova>
  );
}

function Conta() {
  const { t } = useTranslation();
  const { valores } = useNova();
  const p = valores.pessoais;
  const numero = normalizarConta(p.conta_numero);
  const mascara = numero.length >= 4 ? mascaraDaConta(p.conta_formato, numero.slice(-4), p.conta_formato === "iban" ? numero.slice(0, 2) : null) : null;
  return (
    <SeccaoNova titulo={t("hr.pessoais.bancarios")} convite="conta">
      <div className={GRELHA}>
        <CampoS g="pessoais" k="conta_formato" id="hr-novo-conta-formato" rotulo={t("hr.campos.formatoConta")} opcoes={opcoes(t, "hr.formatoConta", FORMATOS_CONTA)} />
        <CampoT
          g="pessoais" k="conta_numero" id="hr-novo-conta-numero" codigo="conta_numero" rotulo={t(chaveDoRotuloDaConta(p.conta_formato))}
          placeholder={p.conta_formato === "iban" ? "PT50 0000 0000 0000 0000 0000 0" : undefined}
          ajuda={mascara ? t("rhNova.h.contaMascara", { mascara }) : t("rhNova.h.contaCofre")}
        />
        <CampoT g="pessoais" k="conta_titular" id="hr-novo-conta-titular" codigo="conta_titular" rotulo={t("hr.campos.titularConta")} />
        <CampoT g="pessoais" k="conta_banco" id="hr-novo-conta-banco" codigo="conta_banco" rotulo={t("hr.campos.banco")} />
        <CampoT g="extra" k="conta_agencia" id="hr-novo-conta-agencia" rotulo={t("hr.campos.agencia")} />
        <CampoT g="pessoais" k="conta_bic" id="hr-novo-conta-bic" codigo="conta_bic" rotulo={t("hr.campos.swift")} ajuda={t("hr.campos.bicAjuda")} />
      </div>
      <AnexosNova tipos={["comprovativo_iban"]} />
    </SeccaoNova>
  );
}

export function AbaRetribuicao() {
  return (
    <div className="space-y-4">
      <Retribuicao />
      <Conta />
    </div>
  );
}
