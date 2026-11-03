// Fotos dos artigos do catálogo do fornecedor (só leitura): miniatura, faixa de miniaturas
// e visualizador simples das até 4 fotos. Usado no portal do fornecedor e no CRM.
// As URLs públicas montam-se no cliente a partir de image_paths (catalogImages.ts).
import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { catalogImageUrls } from "@/lib/supplierPortal/catalogImages";

type WithImages = { image_paths?: string[] | null };

/** Imagem com recurso ao marcador quando o URL falha. */
function PhotoImg({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  if (broken) return <PhotoPlaceholder className={className} />;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn("object-cover", className)}
      onError={() => setBroken(true)}
    />
  );
}

export function PhotoPlaceholder({ className }: { className?: string }) {
  return (
    <span
      className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)}
      data-testid="catalog-photo-placeholder"
      aria-hidden="true"
    >
      <ImageIcon className="h-4 w-4" />
    </span>
  );
}

interface CatalogThumbProps {
  item: WithImages;
  /** Nome do artigo (alt e aria-label). */
  name: string;
  /** Lado em px (largura = altura). */
  size?: number;
  /** Clicar abre as fotos; ausente = só imagem. Sem fotos nunca é botão. */
  onOpen?: () => void;
  className?: string;
}

/** Miniatura da foto principal (1.ª) do artigo, com marcador quando não há fotos. */
export function CatalogThumb({ item, name, size = 40, onOpen, className }: CatalogThumbProps) {
  const urls = catalogImageUrls(item);
  const main = urls[0] ?? null;
  const box = cn("shrink-0 overflow-hidden rounded-md border", className);
  const style = { width: size, height: size };
  if (!main) {
    return (
      <span className={box} style={style} title="Sem foto">
        <PhotoPlaceholder className="h-full w-full" />
      </span>
    );
  }
  const img = <PhotoImg src={main} alt={name} className="h-full w-full" />;
  if (!onOpen) {
    return (
      <span className={box} style={style}>
        {img}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={urls.length > 1 ? `Ver as ${urls.length} fotos de ${name}` : `Ver a foto de ${name}`}
      className={cn(box, "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2")}
      style={{ ...style, minWidth: 24, minHeight: 24 }}
    >
      {img}
    </button>
  );
}

/** Faixa de miniaturas (todas as fotos) — para os diálogos do CRM. Sem fotos: nada. */
export function CatalogPhotoStrip({ item, name, size = 64 }: { item: WithImages; name: string; size?: number }) {
  const urls = catalogImageUrls(item);
  if (urls.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label={`Fotos de ${name}`}>
      {urls.map((u, i) => (
        <li key={u} className="relative overflow-hidden rounded-md border" style={{ width: size, height: size }}>
          <PhotoImg src={u} alt={i === 0 ? `${name} (foto principal)` : `${name} (foto ${i + 1})`} className="h-full w-full" />
          {i === 0 && urls.length > 1 && (
            <span className="absolute bottom-0 left-0 right-0 bg-background/80 text-[10px] text-center leading-4">Principal</span>
          )}
        </li>
      ))}
    </ul>
  );
}

interface CatalogPhotosViewerProps {
  /** null = fechado. */
  item: (WithImages & { name: string }) | null;
  onClose: () => void;
}

/** Visualizador simples: a foto escolhida em grande e as miniaturas por baixo. */
export function CatalogPhotosViewer({ item, onClose }: CatalogPhotosViewerProps) {
  const urls = item ? catalogImageUrls(item) : [];
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [item]);
  const current = urls[Math.min(index, Math.max(0, urls.length - 1))] ?? null;
  const name = item?.name ?? "";

  return (
    <Dialog open={!!item} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="break-words pr-6">{name}</DialogTitle>
          <DialogDescription>
            {urls.length === 0 ? "Este artigo não tem fotos." : urls.length === 1 ? "1 foto" : `${urls.length} fotos · a 1.ª é a principal`}
          </DialogDescription>
        </DialogHeader>
        {current && (
          <div className="space-y-3">
            <div className="flex items-center justify-center rounded-md border bg-muted/30">
              <PhotoImg
                key={current}
                src={current}
                alt={index === 0 ? `${name} (foto principal)` : `${name} (foto ${index + 1})`}
                className="max-h-[60vh] w-auto max-w-full object-contain"
              />
            </div>
            {urls.length > 1 && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Escolher a foto">
                {urls.map((u, i) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`Mostrar a foto ${i + 1}${i === 0 ? " (principal)" : ""}`}
                    aria-pressed={i === index}
                    className={cn(
                      "h-16 w-16 overflow-hidden rounded-md border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      i === index ? "border-primary" : "border-transparent",
                    )}
                  >
                    <PhotoImg src={u} alt="" className="h-full w-full" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
