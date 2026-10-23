import { GitHubPageController } from './controller/GitHubPageController';
import { createNavigationWatcher } from './navigation';

const controller = new GitHubPageController();

void controller.init();

const navigationWatcher = createNavigationWatcher(() => {
  controller.onNavigation();
});

window.addEventListener('pagehide', (event) => {
  // A canceled beforeunload must keep the controls working. Pages retained in
  // the back/forward cache resume with the same controller and DOM listeners.
  if (event.persisted) return;
  navigationWatcher.dispose();
  controller.dispose();
});

console.log('Context Tools Extension: Ext content script initialized');
