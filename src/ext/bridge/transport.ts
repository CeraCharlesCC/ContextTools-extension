export interface RuntimeMessageSender {
  tabId?: number;
  frameId?: number;
  url?: string;
}

export type RuntimeMessageHandler<TMessage, TResponse> = (
  message: TMessage,
  sender: RuntimeMessageSender,
) => Promise<TResponse> | TResponse;

export function runtimeSendMessage<TMessage, TResponse>(message: TMessage): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: TResponse) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

export function addRuntimeMessageListener<TMessage, TResponse>(
  handler: RuntimeMessageHandler<TMessage, TResponse>,
): Parameters<typeof chrome.runtime.onMessage.addListener>[0] {
  const wrapped = (
    message: TMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: TResponse) => void,
  ): boolean => {
    const mappedSender: RuntimeMessageSender = {
      tabId: sender.tab?.id,
      frameId: sender.frameId,
      url: sender.url,
    };

    Promise.resolve(handler(message, mappedSender))
      .then((response) => {
        sendResponse(response);
      })
      .catch((error: unknown) => {
        const fallbackResponse = {
          ok: false,
          error: {
            message: error instanceof Error ? error.message : 'Unhandled runtime message error.',
          },
        } as TResponse;
        sendResponse(fallbackResponse);
      });

    return true;
  };

  chrome.runtime.onMessage.addListener(wrapped);
  return wrapped;
}
