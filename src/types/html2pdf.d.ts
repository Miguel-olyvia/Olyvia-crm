declare module "html2pdf.js" {
  type Html2PdfChain = {
    set: (options: Record<string, unknown>) => Html2PdfChain;
    from: (source: HTMLElement | string) => Html2PdfChain;
    save: () => Promise<void>;
  };

  const html2pdf: () => Html2PdfChain;

  export default html2pdf;
}