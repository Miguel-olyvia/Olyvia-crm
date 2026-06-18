import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";

interface ProductAttribute {
  id: string;
  code: string;
  label: string;
  value_type: string;
  unit?: string;
  allowed_values?: any;
}

interface AttributeValue {
  attribute_id: string;
  attribute?: ProductAttribute;
  value_text?: string;
  value_number?: number;
  value_bool?: boolean;
}

interface BulkAttributesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedProductIds: string[];
  onSuccess: () => void;
}

export function BulkAttributesDialog({
  open,
  onOpenChange,
  selectedProductIds,
  onSuccess,
}: BulkAttributesDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [availableAttributes, setAvailableAttributes] = useState<ProductAttribute[]>([]);
  const [attributeValues, setAttributeValues] = useState<AttributeValue[]>([]);
  const [newAttributeId, setNewAttributeId] = useState<string>("");

  useEffect(() => {
    if (open) {
      loadAttributes();
      setAttributeValues([]);
      setNewAttributeId("");
    }
  }, [open]);

  const loadAttributes = async () => {
    const { data } = await supabase
      .from('product_attributes')
      .select('id, code, label, value_type, unit, allowed_values')
      .order('label');
    setAvailableAttributes(data || []);
  };

  const handleAddAttribute = () => {
    if (!newAttributeId) return;

    const attribute = availableAttributes.find(a => a.id === newAttributeId);
    if (!attribute) return;

    if (attributeValues.some(av => av.attribute_id === newAttributeId)) return;

    setAttributeValues([
      ...attributeValues,
      {
        attribute_id: newAttributeId,
        attribute: attribute,
        value_text: '',
        value_number: 0,
        value_bool: false
      }
    ]);
    setNewAttributeId("");
  };

  const handleRemoveAttribute = (attributeId: string) => {
    setAttributeValues(attributeValues.filter(av => av.attribute_id !== attributeId));
  };

  const handleValueChange = (attributeId: string, field: string, value: any) => {
    setAttributeValues(attributeValues.map(av =>
      av.attribute_id === attributeId ? { ...av, [field]: value } : av
    ));
  };

  const handleSubmit = async () => {
    if (attributeValues.length === 0 || selectedProductIds.length === 0) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // For each product and each attribute, upsert the value
      for (const productId of selectedProductIds) {
        for (const av of attributeValues) {
          // Check if attribute value already exists
          const { data: existing } = await supabase
            .from('product_attribute_values')
            .select('id')
            .eq('product_id', productId)
            .eq('attribute_id', av.attribute_id)
            .single();

          if (existing) {
            // Update existing
            const { error } = await supabase
              .from('product_attribute_values')
              .update({
                value_text: av.value_text || null,
                value_number: av.value_number || null,
                value_bool: av.value_bool || null,
              })
              .eq('id', existing.id);
            if (error) throw error;
          } else {
            // Insert new
            const { error } = await supabase
              .from('product_attribute_values')
              .insert({
                product_id: productId,
                attribute_id: av.attribute_id,
                value_text: av.value_text || null,
                value_number: av.value_number || null,
                value_bool: av.value_bool || null,
              });
            if (error) throw error;
          }
        }
      }

      toast({
        title: t('bulkAttributes.success'),
        description: t('bulkAttributes.successDesc', { 
          count: selectedProductIds.length,
          attrs: attributeValues.length 
        }),
      });

      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const renderValueInput = (av: AttributeValue) => {
    const attribute = av.attribute || availableAttributes.find(a => a.id === av.attribute_id);
    if (!attribute) return null;

    switch (attribute.value_type) {
      case 'text':
      case 'string':
        return (
          <Input
            type="text"
            value={av.value_text || ''}
            onChange={(e) => handleValueChange(av.attribute_id, 'value_text', e.target.value)}
            placeholder={t('productAttributesDialog.valuePlaceholder')}
          />
        );
      case 'list':
        if (attribute.allowed_values && Array.isArray(attribute.allowed_values)) {
          return (
            <Select
              value={av.value_text || ''}
              onValueChange={(value) => handleValueChange(av.attribute_id, 'value_text', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('productAttributesDialog.selectOption')} />
              </SelectTrigger>
              <SelectContent className="bg-background z-[9999]" position="popper">
                {attribute.allowed_values.map((option: string) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        }
        return (
          <Input
            type="text"
            value={av.value_text || ''}
            onChange={(e) => handleValueChange(av.attribute_id, 'value_text', e.target.value)}
          />
        );
      case 'number':
        return (
          <div className="flex gap-2 items-center">
            <Input
              type="number"
              step="0.01"
              value={av.value_number || 0}
              onChange={(e) => handleValueChange(av.attribute_id, 'value_number', parseFloat(e.target.value) || 0)}
            />
            {attribute.unit && <span className="text-xs text-muted-foreground">{attribute.unit}</span>}
          </div>
        );
      case 'boolean':
        return (
          <div className="flex items-center gap-2">
            <Switch
              checked={av.value_bool || false}
              onCheckedChange={(checked) => handleValueChange(av.attribute_id, 'value_bool', checked)}
            />
            <span className="text-xs">
              {av.value_bool ? t('productAttributesDialog.yes') : t('productAttributesDialog.no')}
            </span>
          </div>
        );
      default:
        return null;
    }
  };

  const getAvailableAttributesForSelect = () => {
    const usedIds = attributeValues.map(av => av.attribute_id);
    return availableAttributes.filter(attr => !usedIds.includes(attr.id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('bulkAttributes.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            {t('bulkAttributes.description', { count: selectedProductIds.length })}
          </p>

          <div className="flex gap-2">
            <div className="flex-1">
              <Select value={newAttributeId} onValueChange={setNewAttributeId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('productAttributesDialog.selectAttribute')} />
                </SelectTrigger>
                <SelectContent className="bg-background z-[9999]" position="popper">
                  {getAvailableAttributesForSelect().map((attr) => (
                    <SelectItem key={attr.id} value={attr.id}>
                      {attr.label} ({attr.value_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button 
              type="button" 
              onClick={handleAddAttribute} 
              variant="outline" 
              size="sm"
              disabled={!newAttributeId || getAvailableAttributesForSelect().length === 0}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {attributeValues.length > 0 && (
            <ScrollArea className="h-[200px] pr-3">
              <div className="space-y-2">
                {attributeValues.map((av) => {
                  const attribute = av.attribute || availableAttributes.find(a => a.id === av.attribute_id);
                  return (
                    <div key={av.attribute_id} className="flex gap-2 items-center p-2 border rounded-md bg-muted/50">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{attribute?.label}</span>
                          <Badge variant="outline" className="text-xs">
                            {attribute?.value_type}
                          </Badge>
                        </div>
                        <div className="max-w-xs">
                          {renderValueInput(av)}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveAttribute(av.attribute_id)}
                        className="text-destructive hover:text-destructive h-8 w-8"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={loading || attributeValues.length === 0}>
            {loading ? t('common.processing') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
