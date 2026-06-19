import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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

  const setOpenSectionId = (id: string | null) => {
    if (id === null) {
      isManuallyClosedRef.current = true;
    } else {
      isManuallyClosedRef.current = false;
    }
    setOpenSectionIdState(id);
  };

  const closeSubmenu = () => {
    isManuallyClosedRef.current = true;
    setOpenSectionIdState(null);
  };

  const isSubmenuOpen = openSectionId !== null;

  return (
    <SidebarContext.Provider value={{ 
      isSubmenuOpen, 
      openSectionId, 
      setOpenSectionId, 
      closeSubmenu,
      isManuallyClosedRef 
    }}>
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
