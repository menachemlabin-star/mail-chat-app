import { AuthScreen } from './components/AuthScreen';
import { Dashboard } from './components/Dashboard';
import { useMailChat } from './hooks/useMailChat';

export default function App() {
  const chat = useMailChat();

  if (!chat.session) {
    return (
      <div className="app-shell">
        <AuthScreen
          onLogin={chat.login}
          onRegister={chat.register}
          onMagicLink={chat.magicLink}
        />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Dashboard
        session={chat.session}
        tab={chat.tab}
        setTab={chat.setTab}
        conversations={chat.filteredConversations}
        activeId={chat.activeId}
        setActiveId={chat.setActiveId}
        activeConversation={chat.activeConversation}
        activeMessages={chat.activeMessages}
        onlineEmails={chat.onlineEmails}
        peerEmail={chat.peerEmail}
        onLogout={chat.logout}
        onStartPrivate={chat.startPrivateChat}
        onCreateGroup={chat.createGroup}
        onSend={chat.sendMessage}
      />
    </div>
  );
}
