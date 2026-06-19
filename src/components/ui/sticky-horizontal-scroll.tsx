import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Wraps content that overflows horizontally and renders a scrollbar that is
 * fixed to the bottom of the viewport, aligned with the wrapped content, and
 * visible only while the content is on-screen. The actual content stays in
 * normal flow (no internal vertical scroll).
 */
export function StickyHorizontalScroll({ children, className }: { children: ReactNode; className?: string }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const proxyRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const [needsScroll, setNeedsScroll] = useState(false);
  const [rect, setRect] = useState<{ left: number; width: number; visible: boolean }>({
    left: 0,
    width: 0,
    visible: false,
  });
  const syncing = useRef(false);

  // Track inner scroll dimensions
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const update = () => {
      const sw = el.scrollWidth;
      const cw = el.clientWidth;
      setContentWidth(sw);
      setNeedsScroll(sw > cw + 1);
    };
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true, subtree: true, attributes: true });
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  // Track viewport position of the content to fix the scrollbar at the bottom
  // of the viewport but aligned horizontally and only while the table is visible.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const update = () => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      // Visible when the table intersects the viewport AND its bottom is below the proxy area
      const visible = r.top < vh - 14 && r.bottom > 0;
      setRect({ left: r.left, width: r.width, visible });
    };
    update();

    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      ro.disconnect();
    };
  }, []);

  const onContentScroll = () => {
    if (syncing.current) return;
    syncing.current = true;
    if (proxyRef.current && contentRef.current) {
      proxyRef.current.scrollLeft = contentRef.current.scrollLeft;
    }
    syncing.current = false;
  };

  const onProxyScroll = () => {
    if (syncing.current) return;
    syncing.current = true;
    if (proxyRef.current && contentRef.current) {
      contentRef.current.scrollLeft = proxyRef.current.scrollLeft;
    }
    syncing.current = false;
  };

  return (
    <div className={className}>
      <div ref={contentRef} className="overflow-x-auto" onScroll={onContentScroll}>
        {children}
      </div>
      {needsScroll && (
        <div
          ref={proxyRef}
          onScroll={onProxyScroll}
          className="overflow-x-auto bg-background/90 backdrop-blur-sm border-t shadow-[0_-2px_8px_-4px_rgba(0,0,0,0.1)]"
          style={{
            position: "fixed",
            bottom: 0,
            left: rect.left,
            width: rect.width,
            height: 14,
            zIndex: 40,
            visibility: rect.visible ? "visible" : "hidden",
            pointerEvents: rect.visible ? "auto" : "none",
          }}
          aria-hidden
        >
          <div style={{ width: contentWidth, height: 1 }} />
        </div>
      )}
    </div>
  );
}
