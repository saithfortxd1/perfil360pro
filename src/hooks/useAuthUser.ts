import { useEffect, useState } from 'react';

import { observeSession } from '@/services/firebase/auth';
import type { AuthState } from '@/types';

/**
 * Estado de sesión con tres estados explícitos. Nunca lanza: si Firebase no está
 * configurado devuelve `unconfigured` para que la UI pueda explicarlo.
 */
export function useAuthUser(): AuthState {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  useEffect(() => {
    let active = true;

    const subscription = observeSession((user) => {
      if (active) setState({ status: 'ready', user });
    });

    if (!subscription.ok) {
      setState({ status: 'unconfigured', user: null });
      return undefined;
    }

    return () => {
      active = false;
      subscription.value();
    };
  }, []);

  return state;
}
