import { useEffect, useState } from 'react';

/** Tiny hash router – works on any static host without server rewrites. Routes: #/<feature>/<sub…> */

function parse(): string[] {
  return window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
}

export function useRoute(): string[] {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => {
      setRoute(parse());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function navigate(...segments: string[]): void {
  window.location.hash = '/' + segments.map(encodeURIComponent).join('/');
}

export function href(...segments: string[]): string {
  return '#/' + segments.map(encodeURIComponent).join('/');
}
