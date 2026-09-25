import { useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { Loader2, Plus } from "lucide-react";
import {
  addEntityDeliveryAddress,
  EMPTY_DELIVERY_ADDRESS_INPUT,
  type AddDeliveryAddressResult,
  type DeliveryAddressInput,
} from "@/lib/addresses/entityDeliveryAddresses";

interface DeliveryAddressFormProps {
  entityId: string;
  // Prefixo dos ids dos campos (o formulário aparece na ficha do cliente e na
  // encomenda; os ids têm de ser únicos na página).
  idPrefix: string;
  disabled?: boolean;
  onAdded: (result: AddDeliveryAddressResult, input: DeliveryAddressInput) => void | Promise<void>;
  onCancel?: () => void;
}

/**
 * Formulário curto para acrescentar uma morada de entrega a um cliente
 * (rpc_add_entity_delivery_address). Grava logo, sem depender de outro botão.
 * Não usa <form>: na ficha do cliente fica dentro do formulário de edição, e um
 * Enter aqui não pode submeter a ficha — por isso o Enter é tratado à parte.
 */
export const DeliveryAddressForm = ({ entityId, idPrefix, disabled, onAdded, onCancel }: DeliveryAddressFormProps) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [values, setValues] = useState<DeliveryAddressInput>(EMPTY_DELIVERY_ADDRESS_INPUT);
  const [saving, setSaving] = useState(false);

  const setField = (field: keyof DeliveryAddressInput, value: string) =>
    setValues((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    if (saving || disabled) return;
    if (!values.street.trim() || !values.postal_code.trim() || !values.city.trim()) {
      toast({
        title: t('deliveryAddresses.validation.requiredTitle'),
        description: t('deliveryAddresses.validation.requiredDesc'),
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const result = await addEntityDeliveryAddress(entityId, values);
      if (result?.already_existed) {
        toast({ title: t('deliveryAddresses.toast.alreadyExists') });
      } else {
        toast({ title: t('deliveryAddresses.toast.added') });
      }
      const submitted = values;
      setValues(EMPTY_DELIVERY_ADDRESS_INPUT);
      await onAdded(result, submitted);
    } catch (error: any) {
      // As mensagens da RPC já vêm em português (RAISE EXCEPTION).
      toast({ title: t('deliveryAddresses.toast.addError'), description: error?.message, variant: "destructive" });
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
  const field = (name: keyof DeliveryAddressInput, label: string, extra?: { placeholder?: string; required?: boolean }) => (
    <div className="space-y-1">
      <Label htmlFor={`${idPrefix}_${name}`} className="text-xs">
        {label}{extra?.required ? ' *' : ''}
      </Label>
      <Input
        id={`${idPrefix}_${name}`}
        value={values[name]}
        onChange={(e) => setField(name, e.target.value)}
        placeholder={extra?.placeholder}
        disabled={busy}
      />
    </div>
  );

  return (
    <div className="space-y-3" onKeyDown={handleKeyDown}>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="sm:col-span-3">{field('street', t('deliveryAddresses.fields.street'), { required: true })}</div>
        {field('number', t('deliveryAddresses.fields.number'))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {field('floor', t('deliveryAddresses.fields.floor'), { placeholder: '3º' })}
        {field('unit', t('deliveryAddresses.fields.unit'), { placeholder: 'Esq' })}
        {field('postal_code', t('deliveryAddresses.fields.postalCode'), { placeholder: '1000-001', required: true })}
        {field('city', t('deliveryAddresses.fields.city'), { required: true })}
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={saving}>
            {t('deliveryAddresses.cancel')}
          </Button>
        )}
        <Button type="button" size="sm" onClick={() => void handleSubmit()} disabled={busy}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
          {saving ? t('deliveryAddresses.submitting') : t('deliveryAddresses.submit')}
        </Button>
      </div>
    </div>
  );
};
