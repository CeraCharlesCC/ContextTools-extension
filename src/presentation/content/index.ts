/**
 * Content Script
 * Runs in the context of web pages
 */
import { getBrowserAdapters } from '@infrastructure/adapters';

const adapters = getBrowserAdapters();

// Message handler for content script
adapters.messaging.addListener(async (message: { type: string; payload?: unknown }) => {
  switch (message.type) {
    case 'PING':
      return { type: 'PONG', timestamp: Date.now() };

    case 'GET_PAGE_INFO':
      return {
        title: document.title,
        url: window.location.href,
        hostname: window.location.hostname,
      };

    default:
      return null;
  }
});

// Initialize content script
console.log('Context Tools Extension: Content script loaded');
