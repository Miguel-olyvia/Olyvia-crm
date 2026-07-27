import { useState } from "react";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useConfigTemplate } from "./hooks/useConfigTemplate";
import { TemplateVersionsPanel } from "./TemplateVersionsPanel";
import { BlocksEditor } from "./BlocksEditor";
import { SlotsEditor } from "./SlotsEditor";
import { SlotOptionsEditor } from "./SlotOptionsEditor";
import { RulesEditor } from "./RulesEditor";
import { ConfigPreviewPanel } from "./ConfigPreviewPanel";
import { InteractivePreview } from "./InteractivePreview";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string | null;
  productName: string;
  productSku: string | null;
  organizationId: string | null;
}

// Validates a new configurator block before it is persisted.
const blockSchema = z.object({
  label: z.string().trim().min(1, "O nome do bloco é obrigatório").max(150, "O nome deve ter menos de 150 caracteres"),
});

// Validates a new configurator slot before it is persisted.
const slotSchema = z.object({
  slot_key: z.string().trim().min(1, "A chave do slot é obrigatória").max(100, "A chave deve ter menos de 100 caracteres").regex(/^[a-zA-Z0-9_]+$/, "A chave só pode conter letras, números e underscore"),
  label: z.string().trim().min(1, "O nome do slot é obrigatório").max(150, "O nome deve ter menos de 150 caracteres"),
  slot_type: z.string().trim().min(1, "O tipo de slot é obrigatório"),
});

// Validates a new configurator slot option before it is persisted.
const optionSchema = z.object({
  label: z.string().trim().min(1, "O nome da opção é obrigatório").max(150, "O nome deve ter menos de 150 caracteres"),
});

export function ConfiguratorEditorDialog({
  open,
  onOpenChange,
  productId,
  productName,
  productSku,
  organizationId,
}: Props) {
  const cfg = useConfigTemplate(open ? productId : null, open ? organizationId : null);
  const { toast } = useToast();
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [tab, setTab] = useState("versions");

  // Validated wrappers around the raw mutation callbacks — block the mutation
  // and surface a toast instead of persisting invalid block/slot/option data.
  const handleAddBlock = async (label: string) => {
    const validation = blockSchema.safeParse({ label });
    if (!validation.success) {
      toast({ title: "Erro de validação", description: validation.error.errors[0].message, variant: "destructive" });
      return;
    }
    await cfg.addBlock(label);
  };

  const handleAddSlot: typeof cfg.addSlot = async (blockId, payload) => {
    const validation = slotSchema.safeParse({ slot_key: payload.slot_key, label: payload.label, slot_type: payload.slot_type });
    if (!validation.success) {
      toast({ title: "Erro de validação", description: validation.error.errors[0].message, variant: "destructive" });
      return;
    }
    await cfg.addSlot(blockId, payload);
  };

  const handleAddOption: typeof cfg.addOption = async (slotId, payload) => {
    const validation = optionSchema.safeParse({ label: payload.label });
    if (!validation.success) {
      toast({ title: "Erro de validação", description: validation.error.errors[0].message, variant: "destructive" });
      return;
    }
    await cfg.addOption(slotId, payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>Configurar produto</DialogTitle>
          <DialogDescription>
            <strong>{productName}</strong>
            {productSku ? ` · ${productSku}` : ""} — modo de teste isolado.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6">
            <TabsList>
              <TabsTrigger value="versions">Versões</TabsTrigger>
              <TabsTrigger value="structure" disabled={!cfg.selectedTemplate}>
                Estrutura
              </TabsTrigger>
              <TabsTrigger value="rules" disabled={!cfg.selectedTemplate}>
                Regras
              </TabsTrigger>
              <TabsTrigger value="preview" disabled={!cfg.selectedTemplate}>
                Pré-visualização
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
            <TabsContent value="versions" className="mt-0">
              <TemplateVersionsPanel
                versions={cfg.versions}
                activeTemplate={cfg.activeTemplate}
                selectedTemplate={cfg.selectedTemplate}
                selectedVersionId={cfg.selectedVersionId}
                onSelectVersion={cfg.selectVersion}
                onCreateFirst={cfg.createFirstVersion}
                onDuplicate={cfg.duplicateVersion}
                productId={productId}
                organizationId={organizationId}
              />
            </TabsContent>

            <TabsContent value="structure" className="mt-0">
              {cfg.selectedTemplate ? (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <BlocksEditor
                    blocks={cfg.blocks}
                    selectedBlockId={selectedBlockId}
                    onSelect={(id) => {
                      setSelectedBlockId(id);
                      setSelectedSlotId(null);
                    }}
                    onAdd={handleAddBlock}
                    onUpdate={cfg.updateBlock}
                    onDelete={cfg.deleteBlock}
                  />
                  <SlotsEditor
                    blockId={selectedBlockId}
                    slots={cfg.slots}
                    options={cfg.options}
                    selectedSlotId={selectedSlotId}
                    onSelect={setSelectedSlotId}
                    onAdd={handleAddSlot}
                    onUpdate={cfg.updateSlot}
                    onDelete={cfg.deleteSlot}
                    organizationId={organizationId}
                  />
                  <SlotOptionsEditor
                    slot={cfg.slots.find((s) => s.id === selectedSlotId) ?? null}
                    options={cfg.options}
                    organizationId={organizationId}
                    productId={cfg.selectedTemplate?.product_id ?? null}
                    onAdd={handleAddOption}
                    onUpdate={cfg.updateOption}
                    onDelete={cfg.deleteOption}
                  />
                </div>
              ) : (
                <EmptyHint />
              )}
            </TabsContent>

            <TabsContent value="rules" className="mt-0">
              {cfg.selectedTemplate ? (
                <RulesEditor
                  rules={cfg.rules}
                  slots={cfg.slots}
                  blocks={cfg.blocks}
                  options={cfg.options}
                  onAdd={cfg.addRule}
                  onDelete={cfg.deleteRule}
                />
              ) : (
                <EmptyHint />
              )}
            </TabsContent>

            <TabsContent value="preview" className="mt-0">
              {cfg.selectedTemplate ? (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <ConfigPreviewPanel
                    blocks={cfg.blocks}
                    slots={cfg.slots}
                    options={cfg.options}
                  />
                  <InteractivePreview
                    productId={productId}
                    organizationId={organizationId}
                    templateId={cfg.selectedTemplate.id}
                    isInactiveVersion={
                      !!cfg.activeTemplate &&
                      cfg.selectedTemplate.id !== cfg.activeTemplate.id
                    }
                  />
                </div>
              ) : (
                <EmptyHint />
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function EmptyHint() {
  return (
    <Card className="border-dashed">
      <CardContent className="p-8 text-center text-sm text-muted-foreground">
        Comece por criar uma versão no separador <strong>Versões</strong>.
      </CardContent>
    </Card>
  );
}
