import { AuthScreen } from './components/AuthScreen';
import { Dashboard } from './components/Dashboard';
import { useMailChat } from './hooks/useMailChat';

export default function App() {
  const chat = useMailChat();

  if (chat.authLoading) {
    return (
      <div className="app-shell auth-page">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div className="brand" style={{ justifyContent: 'center' }}>
            <h1 className="brand-name">צ׳אט כנסת הגדולה</h1>
          </div>
          <p className="auth-tagline">מתחבר…</p>
        </div>
      </div>
    );
  }

  if (!chat.session || chat.passwordRecovery) {
    return (
      <div className="app-shell">
        <AuthScreen
          onLogin={chat.login}
          onRegister={chat.register}
          onResetPassword={chat.resetPassword}
          onUpdatePassword={chat.updatePassword}
          forceReset={chat.passwordRecovery}
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
        updates={chat.updates}
        activeId={chat.activeId}
        setActiveId={chat.setActiveId}
        activeConversation={chat.activeConversation}
        activeMessages={chat.activeMessages}
        onlineEmails={chat.onlineEmails}
        peerEmail={chat.peerEmail}
        dataLoading={chat.dataLoading}
        error={chat.error}
        onLogout={chat.logout}
        onStartPrivate={chat.startPrivateChat}
        onCreateGroup={chat.createGroup}
        onSend={chat.sendMessage}
        onDeleteConversation={chat.deleteConversation}
      />
    </div>
  );
}
