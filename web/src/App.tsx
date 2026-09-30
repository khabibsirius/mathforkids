import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { session } from './api/client';
import Login from './screens/Login';
import ParentDashboard from './screens/ParentDashboard';
import Play from './screens/Play';
import ProfilePicker from './screens/ProfilePicker';
import TopicPicker from './screens/TopicPicker';
import Trophies from './screens/Trophies';

/**
 * Three states, one at a time:
 *
 *   no parent token   -> sign in
 *   parent, no child  -> pick who is playing
 *   child chosen      -> play
 *
 * One decision per screen. A child never sees the sign-in form and a parent
 * never has to explain which button is theirs.
 */
export default function App() {
  const [tick, setTick] = useState(0);
  const navigate = useNavigate();

  // Session state lives outside React (it is also read by the api client), so
  // screens call this after changing it.
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const onStorage = (): void => refresh();
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refresh]);

  const hasParent = session.hasParent;
  const hasChild = session.hasChild;

  const signOut = useCallback((): void => {
    session.signOut();
    refresh();
    navigate('/');
  }, [navigate, refresh]);

  const leaveChild = useCallback((): void => {
    session.leaveChild();
    refresh();
    navigate('/');
  }, [navigate, refresh]);

  return (
    <Routes key={tick}>
      <Route
        path="/"
        element={
          !hasParent ? (
            <Login onSignedIn={refresh} />
          ) : !hasChild ? (
            <ProfilePicker onChosen={refresh} onSignOut={signOut} />
          ) : (
            <TopicPicker onLeave={leaveChild} />
          )
        }
      />
      <Route
        path="/play/:topic"
        element={hasChild ? <Play /> : <Navigate to="/" replace />}
      />
      <Route
        path="/trophies"
        element={hasChild ? <Trophies onLeave={leaveChild} /> : <Navigate to="/" replace />}
      />
      <Route
        path="/parent"
        element={hasParent ? <ParentDashboard onSignOut={signOut} /> : <Navigate to="/" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
