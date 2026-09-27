export type ArcadeRoute = {
  roomId?: string;
  screen?: 'studio';
  projectId?: string;
  remixId?: string;
  matchId?: string;
  challengeId?: string;
  filter?: 'top' | 'realtime' | 'action';
};

export function readRoute(search: string): ArcadeRoute {
  const query = new URLSearchParams(search);
  const projectId = query.get('create') || undefined;
  const remixId = query.get('remix') || undefined;
  const filter = query.get('filter');
  return {
    roomId: query.get('room') || undefined,
    screen: projectId || remixId || query.has('studio') ? 'studio' : undefined,
    projectId, remixId,
    matchId: query.get('match') || undefined,
    challengeId: query.get('challenge') || undefined,
    filter: filter === 'top' || filter === 'realtime' || filter === 'action' ? filter : undefined,
  };
}

export function routeURL(route: ArcadeRoute): string {
  const query = new URLSearchParams();
  if (route.roomId) query.set('room', route.roomId);
  if (route.screen === 'studio') {
    if (route.projectId) query.set('create', route.projectId);
    else if (route.remixId) query.set('remix', route.remixId);
    else query.set('studio', '1');
  }
  if (route.matchId) query.set('match', route.matchId);
  if (route.challengeId) query.set('challenge', route.challengeId);
  if (route.filter) query.set('filter', route.filter);
  return query.size ? `/?${query}` : '/';
}

type BrowserHistory = Pick<Window, 'history' | 'location' | 'addEventListener' | 'removeEventListener'>;

/** History changes describe screens only. They never start, edit or end a party. */
export function createNavigation(browser: BrowserHistory) {
  let route = readRoute(browser.location.search);
  const listeners = new Set<() => void>();
  const changed = () => {
    route = readRoute(browser.location.search);
    listeners.forEach(listener => listener());
  };
  const navigate = (next: ArcadeRoute, replace = false) => {
    const url = routeURL(next), current = `${browser.location.pathname}${browser.location.search}`;
    if (url === current) return;
    const previous = replace ? browser.history.state?.arcadePrevious : current;
    browser.history[replace ? 'replaceState' : 'pushState']({arcadePrevious: previous}, '', url);
    changed();
  };
  return {
    getSnapshot: () => route,
    subscribe(listener: () => void) {
      if (!listeners.size) browser.addEventListener('popstate', changed);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) browser.removeEventListener('popstate', changed);
      };
    },
    navigate,
    dismiss(next: ArcadeRoute) {
      // Closing a routed dialog should not add a second copy of its parent.
      if (browser.history.state?.arcadePrevious === routeURL(next)) browser.history.back();
      else navigate(next, true);
    },
  };
}
