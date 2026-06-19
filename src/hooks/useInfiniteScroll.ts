import { useEffect, useRef, useCallback } from 'react';

interface UseInfiniteScrollOptions {
  onLoadMore: () => void;
  hasMore: boolean;
  isLoading: boolean;
  threshold?: number;
}

export function useInfiniteScroll({
  onLoadMore,
  hasMore,
  isLoading,
  threshold = 300
}: UseInfiniteScrollOptions) {
  const onLoadMoreRef = useRef(onLoadMore);
  const hasMoreRef = useRef(hasMore);
  const isLoadingRef = useRef(isLoading);
  const scrollParentRef = useRef<HTMLElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const loadLockRef = useRef(false);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { onLoadMoreRef.current = onLoadMore; }, [onLoadMore]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => {
    isLoadingRef.current = isLoading;
    if (!isLoading) {
      loadLockRef.current = false;
    }
  }, [isLoading]);

  const triggerLoadMore = useCallback(() => {
    if (!hasMoreRef.current || isLoadingRef.current || loadLockRef.current) return;

    loadLockRef.current = true;
    if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    lockTimerRef.current = setTimeout(() => {
      if (!isLoadingRef.current) {
        loadLockRef.current = false;
      }
    }, 250);

    onLoadMoreRef.current();
  }, []);

  // Re-check on state changes (e.g. after loading completes)
  // Only re-check if we have a REAL scroll parent (not document.documentElement fallback)
  useEffect(() => {
    if (!scrollParentRef.current || !hasMore || isLoading) return;
    // Skip re-check for document.documentElement — it causes false positives
    if (scrollParentRef.current === document.documentElement) return;
    const sp = scrollParentRef.current;
    const { scrollTop, scrollHeight, clientHeight } = sp;
    if (scrollHeight - scrollTop - clientHeight < threshold) {
      triggerLoadMore();
    }
  }, [hasMore, isLoading, threshold, triggerLoadMore]);

  const loadMoreRef = useCallback((node: HTMLDivElement | null) => {
    // Cleanup previous
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
      scrollParentRef.current = null;
    }

    if (!node) return;

    // Find scrollable ancestor
    const findScrollParent = (el: HTMLElement): HTMLElement | null => {
      let parent = el.parentElement;
      while (parent) {
        const { overflow, overflowY } = getComputedStyle(parent);
        if (/auto|scroll/.test(overflow) || /auto|scroll/.test(overflowY)) {
          return parent;
        }
        parent = parent.parentElement;
      }
      return null;
    };

    const scrollParent = findScrollParent(node);

    const checkScroll = () => {
      if (!hasMoreRef.current || isLoadingRef.current) return;
      
      if (scrollParent) {
        const { scrollTop, scrollHeight, clientHeight } = scrollParent;
        if (scrollHeight - scrollTop - clientHeight < threshold) {
          triggerLoadMore();
        }
      } else {
        // Fallback: use document scroll
        const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
        if (scrollHeight - scrollTop - clientHeight < threshold) {
          triggerLoadMore();
        }
      }
    };

    const target = scrollParent || window;
    scrollParentRef.current = scrollParent || document.documentElement;
    
    target.addEventListener('scroll', checkScroll, { passive: true });
    
    // Initial check after a short delay to ensure layout is complete
    const timer = setTimeout(checkScroll, 100);

    cleanupRef.current = () => {
      target.removeEventListener('scroll', checkScroll);
      clearTimeout(timer);
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    };
  }, [threshold, triggerLoadMore]);

  return { loadMoreRef };
}
