const NAVIGATION_EVENT = 'context-tools:navigation';

export interface NavigationWatcher {
  dispose(): void;
}

export function createNavigationWatcher(onNavigate: () => void): NavigationWatcher {
  let lastPath = window.location.pathname;

  const emitIfChanged = (): void => {
    if (window.location.pathname === lastPath) {
      return;
    }

    lastPath = window.location.pathname;
    onNavigate();
  };

  const onDomNavigation = (): void => {
    emitIfChanged();
  };

  window.addEventListener('popstate', onDomNavigation);
  window.addEventListener('hashchange', onDomNavigation);
  window.addEventListener('turbo:load', onDomNavigation as EventListener);
  window.addEventListener('turbo:render', onDomNavigation as EventListener);
  window.addEventListener(NAVIGATION_EVENT, onDomNavigation);

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function pushState(...args) {
    const result = originalPushState.apply(this, args);
    window.dispatchEvent(new Event(NAVIGATION_EVENT));
    return result;
  };

  history.replaceState = function replaceState(...args) {
    const result = originalReplaceState.apply(this, args);
    window.dispatchEvent(new Event(NAVIGATION_EVENT));
    return result;
  };

  return {
    dispose() {
      window.removeEventListener('popstate', onDomNavigation);
      window.removeEventListener('hashchange', onDomNavigation);
      window.removeEventListener('turbo:load', onDomNavigation as EventListener);
      window.removeEventListener('turbo:render', onDomNavigation as EventListener);
      window.removeEventListener(NAVIGATION_EVENT, onDomNavigation);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    },
  };
}
