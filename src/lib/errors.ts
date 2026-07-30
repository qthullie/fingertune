/** Turns technical failures into messages a player can act on. */

import { TrackingError } from './handTracking';

export interface FriendlyError {
  message: string;
  detail?: string;
}

export function explainError(err: unknown): FriendlyError {
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);

  if (err instanceof TrackingError) {
    if (err.code === 'NO_MEDIA_DEVICES') {
      return {
        message:
          'This browser does not expose the webcam. Serve the page over https:// or from ' +
          'localhost — a file opened over file:// is blocked by most browsers.',
        detail,
      };
    }
    if (err.code === 'MODEL_LOAD_FAILED') {
      return {
        message:
          'Could not load the hand-tracking model. Check your connection and try again ' +
          '(the model is ~7 MB on first launch). If you are offline, run `npm run fetch:model` ' +
          'to host it yourself.',
        detail,
      };
    }
  }

  const name = err instanceof Error ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return {
        message:
          'Webcam access was denied. Allow the camera from the icon in the address bar, ' +
          'then try again.',
        detail,
      };
    case 'NotFoundError':
    case 'OverconstrainedError':
      return { message: 'No webcam found. Plug a camera in and try again.', detail };
    case 'NotReadableError':
      return {
        message:
          'The webcam is already in use by another application (Zoom, Teams, OBS…). ' +
          'Close it and try again.',
        detail,
      };
    default:
      return { message: 'Startup failed.', detail };
  }
}
