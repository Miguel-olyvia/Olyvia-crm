import { useEffect, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { Loader2, Plus, Save } from "lucide-react";
import { CamposMorada } from "@/components/addresses/CamposMorada";
import { FichaTecnicaCampos } from "@/components/addresses/FichaTecnicaCampos";
import {
  addEntityDeliveryAddress,
  updateEntityDeliveryAddress,
  EMPTY_DELIVERY_ADDRESS_INPUT,
  type AddDeliveryAddressResult,
  type DeliveryAddressInput,
  type EntityDeliveryAddress,
  type UpdateDeliveryAddressResult,
} from "@/lib/addresses/entityDeliveryAddresses";
import {
  FICHA_TECNICA_VALORES_VAZIOS,
  valoresDaFichaTecnica,
  type FichaTecnicaValores,
} from "@/lib/addresses/fichaTecnicaEdificio";
import {
  limparErrosAlterados,
  normalizarMorada,
  primeiroErroMorada,
  validarFichaTecnica,
  validarMorada,
  type ErrosFichaTecnica,
  type ErrosMorada,
  type MoradaCampos,
} from "@/lib/addresses/validarMorada";

export interface DeliveryAddressFormProps {
  entityId: string;
  // Prefixo dos ids dos campos (o formulário aparece na ficha do cliente e na
  // encomenda; os ids têm de ser únicos na página).
  idPrefix: string;
  disabled?: boolean;
  /** Modo edição: a morada a editar (grava com rpc_update_entity_delivery_address). */
  existente?: EntityDeliveryAddress;
  /** Modo criação: chamado depois de gravar. */
  onAdded?: (result: AddDeliveryAddressResult, input: DeliveryAddressInput) => void | Promise<void>;
  /** Modo edição: chamado depois de gravar. */
  onSaved?: (result: UpdateDeliveryAddressResult, input: DeliveryAddressInput) => void | Promise<void>;
  onCancel?: () => void;
}

const moradaDe = (e: EntityDeliveryAddress | undefined): MoradaCampos =>
  e
    ? {
        street: e.street ?? "",
        number: e.number ?? "",
        floor: e.floor ?? "",
        unit: e.unit ?? "",
        postal_code: e.postal_code ?? "",
        city: e.city ?? "",
      }
    : { ...EMPTY_DELIVERY_ADDRESS_INPUT };

/**
 * Formulário de uma morada de entrega: acrescentar (rpc_add_entity_delivery_address)
 * ou, com `existente`, editar (rpc_update_entity_delivery_address). Grava logo,
 * sem depender de outro botão. Inclui a "Ficha do local" (secções colapsáveis
 * Exterior e Interior; abre-se a que já tiver dados). Os campos e a validação são os partilhados (CamposMorada +
 * validarMorada / validarFichaTecnica), os mesmos da morada principal.
 * Não usa <form>: na ficha do cliente fica dentro do formulário de edição, e um
 * Enter aqui não pode submeter a ficha — por isso o Enter é tratado à parte.
 */
export const DeliveryAddressForm = ({
  entityId, idPrefix, disabled, existente, onAdded, onSaved, onCancel,
}: DeliveryAddressFormProps) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const editing = !!existente;
  const [values, setValues] = useState<MoradaCampos>(() => moradaDe(existente));
  const [ficha, setFicha] = useState<FichaTecnicaValores>(() => valoresDaFichaTecnica(existente?.ficha_tecnica));
  const [errors, setErrors] = useState<ErrosMorada>({});
  const [fichaErrors, setFichaErrors] = useState<ErrosFichaTecnica>({});
  const [saving, setSaving] = useState(false);

  // Outra morada para editar → recomeça com os dados dela.
  const existenteId = existente?.entity_address_id;
  useEffect(() => {
    setValues(moradaDe(existente));
    setFicha(valoresDaFichaTecnica(existente?.ficha_tecnica));
    setErrors({});
    setFichaErrors({});
    // Só quando muda a morada (não a cada render do pai).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existenteId]);

  const handleChange = (next: MoradaCampos) => {
    setErrors((prev) => limparErrosAlterados(prev, values, next));
    if (next.floor !== values.floor && fichaErrors.piso) {
      setFichaErrors(({ piso: _piso, ...rest }) => rest);
    }
    setValues(next);
  };

  const handleFichaChange = (next: FichaTecnicaValores) => {
    setFichaErrors((prev) => {
      const rest = { ...prev };
      for (const k of Object.keys(prev) as (keyof ErrosFichaTecnica)[]) {
        if (k === "piso" ? next.n_andares !== ficha.n_andares : next[k] !== ficha[k]) delete rest[k];
      }
      return rest;
    });
    setFicha(next);
  };

  const handleSubmit = async () => {
    if (saving || disabled) return;
    const validation = validarMorada(values, { obrigatoria: true });
    const fichaValidation = validarFichaTecnica(ficha, values.floor);
    setErrors(validation.erros);
    setFichaErrors(fichaValidation.erros);
    if (!validation.valido) {
      const missingRequired = !values.street.trim() || !values.postal_code.trim() || !values.city.trim();
      toast({
        title: t('deliveryAddresses.validation.requiredTitle'),
        description: missingRequired
          ? t('deliveryAddresses.validation.requiredDesc')
          : primeiroErroMorada(validation.erros),
        variant: "destructive",
      });
      return;
    }
    if (!fichaValidation.valido) {
      toast({
        title: t('deliveryAddresses.validation.buildingTitle'),
        description: Object.values(fichaValidation.erros)[0],
        variant: "destructive",
      });
      return;
    }
    const submitted: DeliveryAddressInput = { ...normalizarMorada(values), ficha_tecnica: fichaValidation.ficha };
    setSaving(true);
    try {
      if (existente) {
        const result = await updateEntityDeliveryAddress(existente.entity_address_id, submitted);
        toast({ title: t('deliveryAddresses.toast.updated') });
        await onSaved?.(result, submitted);
      } else {
        const result = await addEntityDeliveryAddress(entityId, submitted);
        if (result?.already_existed) {
          toast({ title: t('deliveryAddresses.toast.alreadyExists') });
        } else {
          toast({ title: t('deliveryAddresses.toast.added') });
        }
        setValues({ ...EMPTY_DELIVERY_ADDRESS_INPUT });
        setFicha({ ...FICHA_TECNICA_VALORES_VAZIOS });
        await onAdded?.(result, submitted);
      }
    } catch (error: any) {
      // As mensagens da RPC já vêm em português (RAISE EXCEPTION).
      toast({
        title: editing ? t('deliveryAddresses.toast.updateError') : t('deliveryAddresses.toast.addError'),
        description: error?.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const busy = saving || !!disabled;
  // O erro "piso acima dos andares" aparece também no campo Andar.
  const moradaErros: ErrosMorada = fichaErrors.piso && !errors.floor ? { ...errors, floor: fichaErrors.piso } : errors;

  return (
    <div className="space-y-3" onKeyDown={handleKeyDown}>
      <CamposMorada valor={values} onChange={handleChange} erros={moradaErros} idPrefix={idPrefix} disabled={busy} />
      <FichaTecnicaCampos
        valor={ficha}
        onChange={handleFichaChange}
        erros={fichaErrors}
        idPrefix={`${idPrefix}_ficha`}
        disabled={busy}
      />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={saving}>
            {t('deliveryAddresses.cancel')}
          </Button>
        )}
        <Button type="button" size="sm" onClick={() => void handleSubmit()} disabled={busy}>
          {saving
            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            : editing ? <Save className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
          {editing
            ? (saving ? t('deliveryAddresses.saving') : t('deliveryAddresses.save'))
            : (saving ? t('deliveryAddresses.submitting') : t('deliveryAddresses.submit'))}
        </Button>
      </div>
    </div>
  );
};
