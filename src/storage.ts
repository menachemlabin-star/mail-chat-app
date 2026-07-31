import type { Conversation, Message, Session, User } from './types';

const KEYS = {
  users: 'mailchat_users',
  session: 'mailchat_session',
  conversations: 'mailchat_conversations',
  messages: 'mailchat_messages',
} as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getUsers(): User[] {
  return read<User[]>(KEYS.users, []);
}

export function saveUser(user: User) {
  const users = getUsers().filter((u) => u.email !== user.email);
  users.push(user);
  write(KEYS.users, users);
}

export function findUser(email: string): User | undefined {
  return getUsers().find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export function getSession(): Session | null {
  return read<Session | null>(KEYS.session, null);
}

export function setSession(session: Session | null) {
  if (session) write(KEYS.session, session);
  else localStorage.removeItem(KEYS.session);
}

export function getConversations(): Conversation[] {
  return read<Conversation[]>(KEYS.conversations, []);
}

export function saveConversations(conversations: Conversation[]) {
  write(KEYS.conversations, conversations);
}

export function getMessages(): Message[] {
  return read<Message[]>(KEYS.messages, []);
}

export function saveMessages(messages: Message[]) {
  write(KEYS.messages, messages);
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function seedDemoData(currentEmail: string, displayName: string) {
  const conversations = getConversations();
  const messages = getMessages();

  const hasUserData = conversations.some((c) => c.members.includes(currentEmail));
  if (hasUserData) return { conversations, messages };

  const demoEmail = 'dana@studio.co.il';
  const teamId = uid('conv');
  const privateId = uid('conv');
  const now = Date.now();

  const demoConversations: Conversation[] = [
    {
      id: privateId,
      type: 'private',
      name: 'דנה לוי',
      members: [currentEmail, demoEmail],
      createdAt: now - 1000 * 60 * 60 * 5,
    },
    {
      id: teamId,
      type: 'group',
      name: 'צוות מוצר',
      members: [currentEmail, demoEmail, 'yonatan@mailchat.app', 'maya@design.io'],
      createdAt: now - 1000 * 60 * 60 * 24,
    },
  ];

  const demoMessages: Message[] = [
    {
      id: uid('msg'),
      conversationId: privateId,
      senderEmail: demoEmail,
      senderName: 'דנה לוי',
      text: 'היי! שמחה שהצטרפת ל-MailChat 👋',
      timestamp: now - 1000 * 60 * 42,
    },
    {
      id: uid('msg'),
      conversationId: privateId,
      senderEmail: currentEmail,
      senderName: displayName,
      text: 'תודה! הממשק נראה מעולה.',
      timestamp: now - 1000 * 60 * 38,
    },
    {
      id: uid('msg'),
      conversationId: privateId,
      senderEmail: demoEmail,
      senderName: 'דנה לוי',
      text: 'אפשר לפתוח שיחה עם כל מייל — בלי לחפש אנשי קשר.',
      timestamp: now - 1000 * 60 * 35,
    },
    {
      id: uid('msg'),
      conversationId: teamId,
      senderEmail: 'yonatan@mailchat.app',
      senderName: 'יונתן כהן',
      text: 'בוקר טוב לכולם — מי מעדכן את הסטטוס?',
      timestamp: now - 1000 * 60 * 90,
    },
    {
      id: uid('msg'),
      conversationId: teamId,
      senderEmail: 'maya@design.io',
      senderName: 'מאיה אברהם',
      text: 'אני שולחת את הטיוטה עד הצהריים.',
      timestamp: now - 1000 * 60 * 75,
    },
    {
      id: uid('msg'),
      conversationId: teamId,
      senderEmail: demoEmail,
      senderName: 'דנה לוי',
      text: `${displayName}, ברוך/ה הבא/ה לקבוצה!`,
      timestamp: now - 1000 * 60 * 20,
    },
  ];

  const nextConversations = [...conversations, ...demoConversations];
  const nextMessages = [...messages, ...demoMessages];
  saveConversations(nextConversations);
  saveMessages(nextMessages);
  return { conversations: nextConversations, messages: nextMessages };
}
