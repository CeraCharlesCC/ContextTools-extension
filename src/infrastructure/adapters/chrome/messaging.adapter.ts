import type { MessagingPort, MessageHandler, MessageSender } from '@application/ports';

/**
 * Chrome Messaging Adapter
 * Implements MessagingPort using chrome.runtime
 */
export class ChromeMessagingAdapter implements MessagingPort {
  async sendMessage<T, R>(message: T): Promise<R> {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        resolve(response);
      });
    });
  }

  addListener<T, R>(handler: MessageHandler<T, R>): void {
    const wrappedHandler = (
      message: T,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: R) => void
    ): boolean => {
      const mappedSender: MessageSender = {
        tabId: sender.tab?.id,
        frameId: sender.frameId,
        url: sender.url,
      };

      const result = handler(message, mappedSender);

      if (result instanceof Promise) {
        result.then(sendResponse);
        return true; // Keep channel open for async response
      }

      sendResponse(result);
      return false;
    };

    chrome.runtime.onMessage.addListener(wrappedHandler);
    // Store reference for removal
    (handler as unknown as { __chromeWrapper: typeof wrappedHandler }).__chromeWrapper = wrappedHandler;
  }

  removeListener<T, R>(handler: MessageHandler<T, R>): void {
    const wrapper = (handler as unknown as { __chromeWrapper: Parameters<typeof chrome.runtime.onMessage.removeListener>[0] }).__chromeWrapper;
    if (wrapper) {
      chrome.runtime.onMessage.removeListener(wrapper);
    }
  }
}
