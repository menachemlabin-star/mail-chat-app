export type ConversationType = 'private' | 'group';

export interface Message {
  id: string;
  conversationId: string;
  senderEmail: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export interface Conversation {
  id: string;
  type: ConversationType;
  name: string;
  members: string[];
  createdAt: number;
  lastReadAt: number;
}

export interface Session {
  id: string;
  email: string;
  displayName: string;
}

export type ActionResult = { ok: true } | { ok: false; error: string };
