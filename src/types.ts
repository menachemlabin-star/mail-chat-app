export type ConversationType = 'private' | 'group';

export interface User {
  email: string;
  displayName: string;
  password: string;
}

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
}

export interface Session {
  email: string;
  displayName: string;
}
