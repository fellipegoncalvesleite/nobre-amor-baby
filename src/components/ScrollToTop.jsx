import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Scrolls the window to the top whenever the route changes.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    // Scroll to top whenever the route path changes
    if (pathname) window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
