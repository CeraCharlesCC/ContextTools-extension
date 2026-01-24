/**
 * Port: Messaging Interface
 * Browser-agnostic interface for extension messaging
 */
export interface MessageSender {
  tabId?: number;
  frameId?: number;
  url?: string;
}

export type MessageHandler<T = unknown, R = unknown> = (
  message: T,
  sender: MessageSender
) => Promise<R> | R;

export interface MessagingPort {
  sendMessage<T, R>(message: T): Promise<R>;
  addListener<T, R>(handler: MessageHandler<T, R>): void;
  removeListener<T, R>(handler: MessageHandler<T, R>): void;
}
