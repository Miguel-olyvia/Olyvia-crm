import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';

const STORAGE_KEY = 'sidebar-submenu-closed';

interface SidebarContextType {
  isSubmenuOpen: boolean;
  openSectionId: string | null;
  setOpenSectionId: (id: string | null) => void;
  closeSubmenu: () => void;
  isManuallyClosedRef: React.MutableRefObject<boolean>;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarExpandProvider({ children }: { children: ReactNode }) {
  const [openSectionId, setOpenSectionIdState] = useState<string | null>(null);
  const isManuallyClosedRef = React.useRef<boolean>(false);

  const setOpenSectionId = useCallback((id: string | null) => {
    if (id === null) {
      isManuallyClosedRef.current = true;
    } else {
      isManuallyClosedRef.current = false;
    }
    setOpenSectionIdState(id);
  }, []);

  const closeSubmenu = useCallback(() => {
    isManuallyClosedRef.current = true;
    setOpenSectionIdState(null);
  }, []);

  const isSubmenuOpen = openSectionId !== null;

  // Memoized so consumers of useSidebarExpand() only see a new context value
  // when one of these actually changes, instead of on every
  // SidebarExpandProvider render.
  const value = useMemo(
    () => ({
      isSubmenuOpen,
      openSectionId,
      setOpenSectionId,
      closeSubmenu,
      isManuallyClosedRef,
    }),
    [isSubmenuOpen, openSectionId, setOpenSectionId, closeSubmenu],
  );

  return (
    <SidebarContext.Provider value={value}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebarExpand() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error('useSidebarExpand must be used within a SidebarExpandProvider');
  }
  return context;
}
