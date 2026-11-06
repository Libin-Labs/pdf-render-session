import { createPdfRenderSession, type PdfPageRenderer } from '@lp-labs/pdf-render-session';

const renderer: PdfPageRenderer<string> = async (request) => `page-${request.page}`;
const session = createPdfRenderSession(renderer, { maxCacheEntries: 2 });
const closed: boolean = session.stats().closed;
void closed;
