import { GitHubPageController } from './controller/GitHubPageController';
import { createNavigationWatcher } from './navigation';

const controller = new GitHubPageController();

void controller.init();

const navigationWatcher = createNavigationWatcher(() => {
  controller.onNavigation();
});

window.addEventListener('beforeunload', () => {
  navigationWatcher.dispose();
  controller.dispose();
});

console.log('Context Tools Extension: Ext content script initialized');
