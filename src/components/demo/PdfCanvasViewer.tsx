'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

const MAX_PACKET_PAGES = 8;
const MAX_RENDER_WIDTH = 960;
const MAX_OUTPUT_SCALE = 2;

function PdfCanvasPage({
  document,
  pageNumber,
  onRendered,
  onRenderError,
}: {
  document: PDFDocumentProxy;
  pageNumber: number;
  onRendered: (pageNumber: number) => void;
  onRenderError: () => void;
}) {
  const frameRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    function updateWidth() {
      if (!frame) return;
      const next = Math.min(MAX_RENDER_WIDTH, Math.floor(frame.clientWidth));
      setWidth((current) => Math.abs(current - next) >= 2 ? next : current);
    }

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!width) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let active = true;
    let renderTask: RenderTask | undefined;
    let pageCleanup: (() => void) | undefined;

    async function renderPage() {
      try {
        const page = await document.getPage(pageNumber);
        pageCleanup = () => page.cleanup();
        if (!active || !canvas) return;

        const natural = page.getViewport({ scale: 1 });
        const outputScale = Math.min(window.devicePixelRatio || 1, MAX_OUTPUT_SCALE);
        const cssScale = width / natural.width;
        const viewport = page.getViewport({ scale: cssScale * outputScale });
        const cssHeight = viewport.height / outputScale;

        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        canvas.style.width = `${width}px`;
        canvas.style.height = `${cssHeight}px`;

        renderTask = page.render({ canvas, viewport });
        await renderTask.promise;
        if (active) onRendered(pageNumber);
      } catch (error) {
        if (active && !(error instanceof Error && error.name === 'RenderingCancelledException')) {
          onRenderError();
        }
      }
    }

    void renderPage();
    return () => {
      active = false;
      renderTask?.cancel();
      pageCleanup?.();
    };
  }, [document, onRenderError, onRendered, pageNumber, width]);

  return (
    <figure ref={frameRef} className="pdf-page">
      <canvas ref={canvasRef} role="img" aria-label={`Filled application page ${pageNumber}`} />
      <figcaption>Page {pageNumber}</figcaption>
      <style jsx>{`
        .pdf-page { width: 100%; margin: 0; display: grid; justify-items: center; gap: 6px; }
        canvas { display: block; max-width: 100%; height: auto; background: #fff; box-shadow: 0 2px 10px rgba(32,32,31,.16); }
        figcaption { color: #68635e; font-size: .67rem; }
      `}</style>
    </figure>
  );
}

export function PdfCanvasViewer({
  url,
  expectedPageCount,
}: {
  url: string;
  expectedPageCount: number;
}) {
  const [attempt, setAttempt] = useState(0);
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [renderedPages, setRenderedPages] = useState<Set<number>>(() => new Set());
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let loadingTask: PDFDocumentLoadingTask | undefined;
    let active = true;

    async function loadDocument() {
      setDocument(undefined);
      setRenderedPages(new Set());
      setError('');
      try {
        const [pdfjs, response] = await Promise.all([
          import('pdfjs-dist'),
          fetch(url, {
            cache: 'no-store',
            credentials: 'same-origin',
            signal: controller.signal,
          }),
        ]);
        if (!response.ok || response.headers.get('content-type') !== 'application/pdf') {
          throw new Error('PDF preview unavailable');
        }

        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();
        const bytes = new Uint8Array(await response.arrayBuffer());
        loadingTask = pdfjs.getDocument({ data: bytes });
        const loadedDocument = await loadingTask.promise;
        if (
          loadedDocument.numPages < 1 ||
          loadedDocument.numPages > MAX_PACKET_PAGES ||
          loadedDocument.numPages !== expectedPageCount
        ) {
          throw new Error('PDF page count did not match the protected artifact.');
        }
        if (active) setDocument(loadedDocument);
      } catch (cause) {
        if (!active || controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'The filled PDF could not be displayed.');
      }
    }

    void loadDocument();
    return () => {
      active = false;
      controller.abort();
      void loadingTask?.destroy();
    };
  }, [attempt, expectedPageCount, url]);

  const markRendered = useCallback((pageNumber: number) => {
    setRenderedPages((current) => {
      if (current.has(pageNumber)) return current;
      const next = new Set(current);
      next.add(pageNumber);
      return next;
    });
  }, []);

  const handleRenderError = useCallback(() => {
    setError('A page could not be rendered in this browser.');
  }, []);

  if (error) {
    return (
      <div className="pdf-error" role="alert">
        <strong>The filled PDF could not be displayed.</strong>
        <span>{error} You can still open or download the protected PDF.</span>
        <button type="button" onClick={() => setAttempt((current) => current + 1)}>
          <RotateCw size={14} /> Retry preview
        </button>
        <style jsx>{`
          .pdf-error { min-height: 100%; padding: 28px; display: grid; place-content: center; justify-items: center; gap: 7px; text-align: center; background: #fff; }
          strong { font-size: .9rem; }
          span { max-width: 380px; color: #6f6b67; font-size: .76rem; line-height: 1.5; }
          button { min-height: 44px; margin-top: 5px; padding: 0 12px; display: inline-flex; align-items: center; gap: 6px; border: 1px solid #d8d4cf; border-radius: 7px; background: #fff; color: #3d3b39; font: inherit; font-size: .72rem; cursor: pointer; }
        `}</style>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="pdf-loading" role="status">
        Loading secure PDF preview…
        <style jsx>{`
          .pdf-loading { min-height: 100%; display: grid; place-items: center; background: #fff; color: #6f6b67; font-size: .8rem; }
        `}</style>
      </div>
    );
  }

  const renderedCount = renderedPages.size;
  const complete = renderedCount === document.numPages;
  const mountedPageCount = Math.min(document.numPages, renderedCount + 1);

  return (
    <div className="pdf-canvas-viewer" aria-busy={!complete}>
      {!complete ? (
        <div className="render-progress" role="status">
          Rendering page {Math.min(renderedCount + 1, document.numPages)} of {document.numPages}…
        </div>
      ) : null}
      <div className="pdf-pages">
        {Array.from({ length: mountedPageCount }, (_, index) => (
          <PdfCanvasPage
            key={index + 1}
            document={document}
            pageNumber={index + 1}
            onRendered={markRendered}
            onRenderError={handleRenderError}
          />
        ))}
      </div>
      <style jsx>{`
        .pdf-canvas-viewer { min-height: 100%; background: #d8d4cf; }
        .render-progress { position: sticky; z-index: 2; top: 8px; width: fit-content; margin: 0 auto -38px; padding: 7px 10px; border: 1px solid #d8d4cf; border-radius: 999px; background: rgba(255,255,255,.96); color: #5f5b57; box-shadow: 0 3px 12px rgba(32,32,31,.12); font-size: .7rem; }
        .pdf-pages { padding: 50px 12px 24px; display: grid; gap: 18px; }
        @media (max-width: 720px) {
          .pdf-pages { padding: 48px 8px 20px; gap: 14px; }
        }
      `}</style>
    </div>
  );
}
