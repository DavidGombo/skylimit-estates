declare module "html2pdf.js" {
  interface Html2PdfWorker {
    set(opt: Record<string, unknown>): Html2PdfWorker;
    from(element: HTMLElement | string): Html2PdfWorker;
    save(): Promise<void>;
    toPdf(): Html2PdfWorker;
    get(type: string): Promise<unknown>;
    outputPdf(type?: string): Promise<unknown>;
  }
  function html2pdf(): Html2PdfWorker;
  export default html2pdf;
}
