/** Traduction des erreurs techniques en messages clairs pour le joueur. */

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
          "Ce navigateur n'expose pas la webcam. Sers la page en https:// ou depuis " +
          'localhost (un fichier ouvert en file:// est bloque par la plupart des navigateurs).',
        detail,
      };
    }
    if (err.code === 'MODEL_LOAD_FAILED') {
      return {
        message:
          'Impossible de charger le modele de hand tracking. Verifie ta connexion, ' +
          "puis relance (le modele fait ~7 Mo au premier lancement). Si tu es hors ligne, " +
          'lance `npm run fetch:model` pour l\'heberger toi-meme.',
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
          "Acces a la webcam refuse. Autorise la camera depuis l'icone dans la barre " +
          "d'adresse, puis reessaie.",
        detail,
      };
    case 'NotFoundError':
    case 'OverconstrainedError':
      return { message: 'Aucune webcam detectee. Branche une camera puis reessaie.', detail };
    case 'NotReadableError':
      return {
        message:
          'La webcam est deja utilisee par une autre application (Zoom, Teams, OBS…). ' +
          'Ferme-la puis reessaie.',
        detail,
      };
    default:
      return { message: 'Echec du demarrage.', detail };
  }
}
