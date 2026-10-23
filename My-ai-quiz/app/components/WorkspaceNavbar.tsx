'use client';

import { useMemo } from 'react';
import { Navbar } from '@shared/components/Navbar';
import { getWorkspaceToken, getWorkspaceUrl } from '../lib/workspace';
import { useWorkspace } from '../lib/useWorkspace';

/**
 * The shared SIET Space navbar (shared/components/Navbar.tsx) with this app's
 * session: who is signed in and their points come from useWorkspace, so the
 * balance follows each generation, and the links go back to the SIET Space this
 * app was opened from.
 */
export function WorkspaceNavbar() {
  const { me } = useWorkspace();
  const user = useMemo(() => (me ? { ...me.user, points_exempt: me.exempt } : null), [me]);
  return (
    <Navbar
      user={user}
      pointsBalance={me?.balance}
      token={getWorkspaceToken()}
      communityUrl={`${getWorkspaceUrl()}/community`}
    />
  );
}
