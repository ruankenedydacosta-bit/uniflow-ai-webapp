import { useSession } from '../../app/SessionContext.jsx';
import { UniVoiceInputProviderRuntime } from './UniVoiceInputProviderRuntime.js';

export { UniVoiceInputProviderRuntime } from './UniVoiceInputProviderRuntime.js';

export function UniVoiceInputProvider({ children }) {
  const { profile, workspace } = useSession();
  return (
    <UniVoiceInputProviderRuntime
      profileId={profile?.uni_personality_profile ?? 'balanced'}
      workspaceId={workspace?.id}
    >
      {children}
    </UniVoiceInputProviderRuntime>
  );
}
