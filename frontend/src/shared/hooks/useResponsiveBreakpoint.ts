'use client';

import { useCallback, useEffect, useState } from 'react';

export interface ResponsiveBreakpoint {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  width: number;
}

const BREAKPOINT_MOBILE = 768;
const BREAKPOINT_TABLET = 1024;

function computeBreakpoint(width: number): Pick<ResponsiveBreakpoint, 'isMobile' | 'isTablet' | 'isDesktop'> {
  return {
    isMobile: width < BREAKPOINT_MOBILE,
    isTablet: width >= BREAKPOINT_MOBILE && width < BREAKPOINT_TABLET,
    isDesktop: width >= BREAKPOINT_TABLET,
  };
}

/**
 * Shared responsive breakpoint hook.
 * Provides `isMobile` (width < 768), `isTablet` (768 <= width < 1024),
 * `isDesktop` (width >= 1024), and the current `width`.
 */
export function useResponsiveBreakpoint(): ResponsiveBreakpoint {
  const [width, setWidth] = useState<number>(
    typeof window !== 'undefined' ? window.innerWidth : BREAKPOINT_TABLET,
  );

  const handleResize = useCallback(() => {
    setWidth(window.innerWidth);
  }, []);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  return { width, ...computeBreakpoint(width) };
}
