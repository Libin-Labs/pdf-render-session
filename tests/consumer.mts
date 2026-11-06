import {
  createPdfRenderSession,
  type PdfRenderRequest,
  type PdfRenderViewport,
} from '@lp-labs/pdf-render-session';

const viewport: PdfRenderViewport = {
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  scale: 1,
};
const request: PdfRenderRequest = { page: 0, viewport };
const session = createPdfRenderSession(async (input, signal) => {
  signal.throwIfAborted();
  return input.page;
});
const rendering: Promise<number> = session.render(request);
void rendering;
