import { useState, useRef } from "react";
import DOMPurify from "dompurify";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Upload, FileText, FileWarning, Loader2 } from "lucide-react";
import { toast } from "sonner";
import mammoth from "mammoth";
import { supabase } from "@/integrations/supabase/client";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

interface TemplateFileImportProps {
  onImport: (html: string, fileName: string, isFromPdf: boolean) => void;
}

const escapeHtml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

const isLikelyCorruptedText = (text: string) => {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length < 50) return true;

  const weirdChars = (cleaned.match(/[�□■◼◻◾◽¤¦§¨©¬®¯±²³´µ¶·¸¹º»¼½¾¿]/g) || []).length;
  const alnumChars = (cleaned.match(/[\p{L}\p{N}]/gu) || []).length;
  const weirdRatio = cleaned.length ? weirdChars / cleaned.length : 1;
  const alnumRatio = cleaned.length ? alnumChars / cleaned.length : 0;

  return weirdRatio > 0.03 || alnumRatio < 0.45;
};

async function extractTextWithPdfJs(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const paragraphs: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    let currentLine = "";

    for (const item of content.items) {
      if (!("str" in item)) continue;
      const textItem = item as any;
      const y = Math.round(textItem.transform[5]);
      const str = String(textItem.str || "");

      if (lastY !== null && Math.abs(y - lastY) > 5) {
        if (currentLine.trim()) paragraphs.push(currentLine.trim());
        currentLine = "";
      }

      currentLine += str.endsWith(" ") ? str : `${str} `;
      lastY = y;
    }

    if (currentLine.trim()) paragraphs.push(currentLine.trim());
    if (i < pdf.numPages) paragraphs.push("---PAGE_BREAK---");
  }

  const plainText = paragraphs.filter((p) => p !== "---PAGE_BREAK---").join("\n").trim();
  if (!plainText || isLikelyCorruptedText(plainText)) {
    throw new Error("PDF_TEXT_EXTRACTION_UNRELIABLE");
  }

  return paragraphs
    .map((p) => {
      if (p === "---PAGE_BREAK---") return '<br /><hr /><br />';
      return `<p>${escapeHtml(p)}</p>`;
    })
    .join("\n");
}

async function extractTextFromPdf(file: File): Promise<{ html: string; mode: "pdfjs" | "ai" }> {
  // Try AI extraction first — preserves bold, headings, lists
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const pdfBase64 = btoa(binary);

  try {
    const { data, error } = await supabase.functions.invoke("import-contract-pdf", {
      body: {
        fileName: file.name,
        pdfBase64,
      },
    });

    if (!error && data?.html) {
      return { html: data.html as string, mode: "ai" };
    }
    console.warn("AI extraction failed, falling back to PDF.js:", error || data?.error);
  } catch (err) {
    console.warn("AI extraction error, falling back to PDF.js:", err);
  }

  // Fallback: local pdfjs extraction (no formatting)
  const html = await extractTextWithPdfJs(file);
  return { html, mode: "pdfjs" };
}

export function TemplateFileImport({ onImport }: TemplateFileImportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<{ html: string; fileName: string; isPdf: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "docx" && ext !== "pdf") {
      toast.error("Formato não suportado. Use .docx ou .pdf");
      return;
    }

    setIsLoading(true);
    try {
      let html: string;
      const isPdf = ext === "pdf";

      if (ext === "docx") {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        html = result.value;
        if (result.messages.length > 0) {
          console.warn("Mammoth warnings:", result.messages);
        }
      } else {
        const result = await extractTextFromPdf(file);
        html = result.html;
        if (result.mode === "ai") {
          toast.info("PDF importado com extracção avançada para corrigir texto corrompido ou scannado.");
        }
      }

      if (!html || html.trim().length < 10) {
        toast.error("O ficheiro parece estar vazio ou não foi possível extrair conteúdo");
        return;
      }

      setPreview({ html, fileName: file.name, isPdf });
    } catch (err: any) {
      console.error("Import error:", err);
      toast.error("Erro ao ler o ficheiro: " + (err.message || "formato inválido"));
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleConfirm = () => {
    if (!preview) return;
    onImport(preview.html, preview.fileName, preview.isPdf);
    setPreview(null);
    setIsOpen(false);
  };

  return (
    <>
      <Button variant="outline" onClick={() => setIsOpen(true)} className="gap-1.5">
        <Upload className="h-4 w-4" /> Importar Ficheiro
      </Button>

      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { setPreview(null); setIsOpen(false); } else setIsOpen(true); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" /> Importar Contrato de Ficheiro
            </DialogTitle>
            <DialogDescription>
              Carregue um ficheiro Word (.docx) ou PDF (.pdf) para usar como base da minuta
            </DialogDescription>
          </DialogHeader>

          {!preview ? (
            <div className="flex-1 flex flex-col items-center justify-center py-8">
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.pdf"
                onChange={handleFileChange}
                className="hidden"
              />
              {isLoading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">A processar ficheiro...</p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-muted-foreground/30 rounded-xl p-12 w-full text-center hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer group"
                >
                  <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground group-hover:text-primary transition-colors" />
                  <p className="font-medium">Clique para seleccionar ficheiro</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Formatos suportados: <strong>.docx</strong> (Word) ou <strong>.pdf</strong>
                  </p>
                  <p className="text-xs text-muted-foreground mt-3">
                    Word: mantém formatação (bold, itálico, títulos, listas)<br />
                    PDF: extrai texto — a formatação pode necessitar de revisão
                  </p>
                </button>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 gap-3">
              {preview.isPdf && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <FileWarning className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Texto extraído do PDF — reveja a formatação. A extracção de PDFs pode não preservar a estrutura original.
                  </p>
                </div>
              )}
              <div className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" /> {preview.fileName}
              </div>
              <div
                className="flex-1 overflow-y-auto border rounded-lg p-4 prose prose-sm dark:prose-invert max-w-none bg-white dark:bg-gray-950"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(preview.html) }}
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setPreview(null); setIsOpen(false); }}>Cancelar</Button>
            {preview && (
              <>
                <Button variant="outline" onClick={() => setPreview(null)}>Escolher outro</Button>
                <Button onClick={handleConfirm}>
                  Usar este conteúdo
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
