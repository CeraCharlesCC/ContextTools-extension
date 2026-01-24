import type { MessagingPort, MessageHandler, MessageSender } from '@application/ports';

declare const browser: typeof chrome;

/**
 * Firefox Messaging Adapter
 * Implements MessagingPort using browser.runtime (Promise-based)
 */
export class FirefoxMessagingAdapter implements MessagingPort {
  async sendMessage<T, R>(message: T): Promise<R> {
    return browser.runtime.sendMessage(message) as Promise<R>;
  }

  addListener<T, R>(handler: MessageHandler<T, R>): void {
    const wrappedHandler = (
      message: T,
      sender: chrome.runtime.MessageSender
    ): Promise<R> | R => {
      const mappedSender: MessageSender = {
        tabId: sender.tab?.id,
        frameId: sender.frameId,
        url: sender.url,
      };

      return handler(message, mappedSender);
    };

    browser.runtime.onMessage.addListener(wrappedHandler);
    // Store reference for removal
    (handler as unknown as { __firefoxWrapper: typeof wrappedHandler }).__firefoxWrapper = wrappedHandler;
  }

  removeListener<T, R>(handler: MessageHandler<T, R>): void {
    const wrapper = (handler as unknown as { __firefoxWrapper: Parameters<typeof browser.runtime.onMessage.removeListener>[0] }).__firefoxWrapper;
    if (wrapper) {
      browser.runtime.onMessage.removeListener(wrapper);
    }
  }
}
