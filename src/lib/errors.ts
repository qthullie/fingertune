/**
 * Turns technical failures into something a player can act on.
 *
 * It returns a message *key*, never a sentence. A denied webcam is the same
 * failure whatever language the page is in, and resolving it to English here
 * would mean a French player reading a French screen with one English
 * paragraph in the middle of it — which is exactly the moment they most need to
 * understand what to do.
 */

import { TrackingError } from './handTracking';
import type { MessageKey } from './i18n';

export interface FriendlyError {
  /** Key into the message catalogue; the UI translates it. */
  key: MessageKey;
  /** The raw error, shown verbatim under the message. Never translated. */
  detail?: string;
}

export function explainError(err: unknown): FriendlyError {
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);

  if (err instanceof TrackingError) {
    if (err.code === 'NO_MEDIA_DEVICES') return { key: 'error.noMediaDevices', detail };
    if (err.code === 'MODEL_LOAD_FAILED') return { key: 'error.modelLoadFailed', detail };
  }

  const name = err instanceof Error ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return { key: 'error.notAllowed', detail };
    case 'NotFoundError':
    case 'OverconstrainedError':
      return { key: 'error.notFound', detail };
    case 'NotReadableError':
      return { key: 'error.notReadable', detail };
    default:
      return { key: 'error.startupFailed', detail };
  }
}
