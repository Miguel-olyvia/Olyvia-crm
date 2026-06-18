import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus } from "lucide-react";
import { EditableLabel } from "./EditableLabel";
import type { CBlock } from "./hooks/useConfigTemplate";

interface Props {
  blocks: CBlock[];
  selectedBlockId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (label: string) => Promise<void>;
  onUpdate: (id: string, patch: { label?: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function BlocksEditor({ blocks, selectedBlockId, onSelect, onAdd, onUpdate, onDelete }: Props) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Secções do produto</CardTitle>
        <CardDescription>
          Cada secção agrupa escolhas relacionadas (ex: "Estrutura", "Porta", "Acabamentos").
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder='Nome da secção (ex: "Estrutura")'
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Button
            size="sm"
            disabled={!label.trim() || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onAdd(label.trim());
                setLabel("");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="border rounded-md divide-y">
          {blocks.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              Ainda não criou secções.
              <br />
              <span className="text-xs">Comece por adicionar uma acima.</span>
            </div>
          ) : (
            blocks.map((b) => (
              <div
                key={b.id}
                className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-accent/50 ${
                  selectedBlockId === b.id ? "bg-accent" : ""
                }`}
                onClick={() => onSelect(b.id)}
                title="Clique no nome para editar; clique na linha para gerir as escolhas"
              >
                <div className="text-sm font-medium flex-1 min-w-0">
                  <EditableLabel
                    value={b.label}
                    onSave={(next) => onUpdate(b.id, { label: next })}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(b.id);
                  }}
                  title="Remover secção"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
