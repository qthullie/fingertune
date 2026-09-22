/**
 * Translations, in two languages, with no dependency.
 *
 * The game is a portfolio piece shown to French and English speakers alike, and
 * a half-translated interface reads as unfinished faster than an untranslated
 * one. So every string a player can see lives here, and nowhere else.
 *
 * Three things this deliberately is not:
 *
 * - It is not a translation framework. There is no plural engine, no ICU
 *   syntax, no lazy-loaded bundle. Two languages and ~90 strings fit in one
 *   file that ships in the same chunk as the code that reads it.
 * - It is not stringly-typed. `en` is the schema: `fr` is declared as
 *   `Record<MessageKey, string>`, so forgetting a French string is a build
 *   error rather than an English word appearing mid-sentence in production.
 * - It is not a global mutable read. Components subscribe through `useT`, so
 *   switching language repaints the screen instead of waiting for the next
 *   unrelated render.
 *
 * Markup inside a string is limited to `*bold*`, rendered by `<Rich>`. Anything
 * that needs more structure (keyboard hints, links) is assembled in JSX from
 * several keys, because a translator should never have to keep a tag balanced.
 */

import { useMemo, useSyncExternalStore } from 'react';

export type Lang = 'en' | 'fr';

export const LANGS: ReadonlyArray<Lang> = ['en', 'fr'];

const STORAGE_KEY = 'fingertune.lang';

/* ------------------------------------------------------------------ english -- */

const en = {
  'lang.label': 'Language',
  'lang.en': 'EN',
  'lang.fr': 'FR',

  /* -- start screen -- */
  'start.tagline':
    'A rhythm game played by *pinching*. Circles appear with an approach ring closing in on them: pinch thumb and index the moment the ring meets the target.',
  'start.maps.label': 'Beatmap',
  'start.phases.label': 'Starting difficulty',
  'start.card.meta': '{bpm} BPM · {notes} notes',
  'start.card.twoHands': 'two hands',
  'start.card.best': 'Best {score}',
  'start.card.never': 'Never played',
  'start.phaseNote': 'Starting at *{phase}* — scores from a partial run are still saved.',
  'start.best.label': 'Best score',
  'start.best.detail': '{accuracy} % · {combo}x combo',
  'start.tip.sit':
    'Sit ~60–100 cm from the webcam, one hand clearly visible, palm to the camera.',
  'start.tip.hit': 'A hit is going from *fingers apart* to *fingers pinched* on the target.',
  'start.tip.slider':
    '*Sliders*: pinch the head, then *keep pinching* and drag along the track, following the ball in the direction of the arrows, all the way to the end.',
  'start.tip.pause':
    'Lose your hand and the run *pauses itself* — bring it back and it carries on.',
  'start.tip.privacy':
    '*Privacy mode* hides the webcam image and leaves only the skeleton — good for streaming, or for playing in a room you would rather not show.',
  'privacy.label': 'Hide the webcam image',
  'privacy.hint':
    'The hand is still tracked — only the picture is hidden. Toggle it any time with V.',
  'start.play': 'Allow webcam / Play',
  'start.loading': 'Loading…',
  'start.recalibrate': 'Recalibrate my pinch',

  /* -- keyboard hints, assembled in JSX around <kbd> -- */
  'key.pause': 'pause',
  'key.replay': 'replay',
  'key.metronome': 'metronome',
  'key.skeleton': 'skeleton',
  'key.video': 'privacy mode',
  'key.gauge': 'gauge',
  'key.playfield': 'playfield',
  'key.debug': 'debug',
  'key.menu': 'menu',
  'key.resume': 'resume',
  'key.resumeNow': 'resume now',
  'key.restart': 'restart',

  /* -- loading status -- */
  'status.idle': 'Hand-tracking model not loaded yet (~7 MB on first run).',
  'status.runtime': 'Loading the vision runtime…',
  'status.model': 'Loading the hand model…',
  'status.camera': 'Waiting for webcam permission…',
  'status.ready': 'Ready.',

  /* -- calibration -- */
  'calib.title': 'Calibrating',
  'calib.body':
    'Open your hand wide, then pinch thumb and index together. *Three times*, slowly, in front of the camera.',
  'calib.ratio': 'Pinch ratio {ratio}',
  'calib.waiting': 'Waiting for a hand…',
  'calib.skip': 'Skip — use the defaults',
  'calib.failed.title': 'Could not read a pinch',
  'calib.failed.body':
    'Your hand needs to be fully visible, and to actually open and close. The default thresholds are still in place and the game is playable — you can try again or just go.',
  'calib.failed.play': 'Play anyway',

  /* -- pause -- */
  'pause.title': 'Paused',
  'pause.title.auto': 'Hand lost',
  'pause.body': 'The run resumes a beat before it stopped, so you get time to read the screen.',
  'pause.body.auto.1': 'Bring your hand back into view and the run picks up where it left off.',
  'pause.body.auto.2': 'Nothing was judged while it was gone.',
  'pause.resume': 'Resume',
  'pause.restart': 'Restart the run',
  'pause.quit': 'Back to menu',

  /* -- end of run -- */
  'end.title.challenge': 'Challenge beaten!',
  'end.title.record': 'New record!',
  'end.title.done': 'Run complete',
  'end.accuracy': '{accuracy} % accuracy',
  'end.maxCombo': 'Max combo {combo}x',
  'end.challenge.beaten': 'Challenge was {score} — beaten by {delta}.',
  'end.challenge.short': 'Challenge was {score} — {delta} short.',
  'end.previous': 'Previous best: {score}',
  'end.first': 'First score saved.',
  'end.best': 'Best: {score} ({accuracy} %)',
  'end.replay': 'Play again',
  'end.share': 'Copy result + challenge link',
  'end.share.ok': 'Copied — send it to someone',
  'end.share.failed': 'Could not copy — select the URL manually',
  'end.changeMap': 'Change beatmap',
  'end.tip': 'Tip: press R to restart without coming back here.',
  'end.share.line1': 'Fingertune — {map}',
  'end.share.line2': '{score} pts · {accuracy}% · {combo}x combo',
  'end.share.line3': 'Beat it: {url}',

  /* -- HUD -- */
  'hud.noHand': 'No hand detected — show your hand to the camera',
  'hud.phase': 'Phase {index}/{count}',
  'hud.countdown': 'Get your hand ready…',
  'hud.early': '(early)',
  'hud.late': '(late)',
  'hud.target.best': 'Your best',
  'hud.target.challenge': 'Challenge',
  'hud.privacy': 'Privacy mode — webcam hidden',

  /* -- bring your own chart -- */
  'chart.summary': 'Import a beatmap (osu! or StepMania)',
  'chart.choose': 'Choose an .osz, .osu, .sm or .zip',
  'chart.loading': 'Reading the chart…',
  'chart.loaded': 'Loaded {label} — {notes} notes. Pick it in the list above.',
  'chart.noAudio':
    'No audio in the file: the chart asks for {file}. Add it with the music panel below.',
  'chart.failed': 'Could not read that file.',
  'chart.caveat':
    'Converted, not emulated: osu! spinners are dropped and curved sliders are walked as straight segments; StepMania lanes become columns and the height is added by the importer. Nothing is uploaded — the archive is read in this tab.',

  /* -- music picker -- */
  'music.summary': 'Play over your own music',
  'music.choose': 'Choose an audio file',
  'music.back': 'Back to the generated track',
  'music.tap': 'Tap tempo',
  'music.bpm': 'BPM',
  'music.keepTapping': 'Keep tapping…',
  'music.caveat':
    'The notes keep the beatmap’s own grid. Matching the BPM lines the spacing up with your track, but the first downbeat is not detected — if the track does not start on one, everything will sit at a constant offset. Your file never leaves this machine.',

  /* -- online board -- */
  'board.title': 'Online board',
  'board.name': 'Your name',
  'board.placeholder': 'anon',
  'board.submit': 'Post my score',
  'board.sending': 'Sending…',
  'board.submitted': 'Posted. The board keeps your best run on this chart.',
  'board.taken': 'That name belongs to another player. Pick another.',
  'board.you': '(you)',
  'board.identity':
    'Your name is reserved for you, in this browser. Changing it renames all your scores.',
  'board.empty': 'Nobody has posted a score on this chart yet. Be first.',
  'board.offline': 'The board is unreachable. Your local best is still saved.',
  'board.timeout': 'The board did not answer in time. Your local best is still saved.',
  'board.rejected': 'The board refused that score.',
  'board.unverified':
    'Scores are not verified: the game runs entirely in your browser, so anything it sends is something someone could type. Treat this as a wall to sign, not a ranking.',

  /* -- errors -- */
  'error.title': 'Something went wrong',
  'error.retry': 'Try again',
  'error.noMediaDevices':
    'This browser does not expose the webcam. Serve the page over https:// or from localhost — a file opened over file:// is blocked by most browsers.',
  'error.modelLoadFailed':
    'Could not load the hand-tracking model. Check your connection and try again (the model is ~7 MB on first launch). If you are offline, run `npm run fetch:model` to host it yourself.',
  'error.notAllowed':
    'Webcam access was denied. Allow the camera from the icon in the address bar, then try again.',
  'error.notFound': 'No webcam found. Plug a camera in and try again.',
  'error.notReadable':
    'The webcam is already in use by another application (Zoom, Teams, OBS…). Close it and try again.',
  'error.startupFailed': 'Startup failed.',

  /* -- unsupported device -- */
  'mobile.title': 'Come back on a computer',
  'mobile.body':
    'Fingertune tracks your hand from the webcam and needs both hands free, a keyboard and a screen you are not holding. On a phone there is nowhere to put the camera that also lets you play.',
  'mobile.why': 'It is not broken — it is a game for a desk.',
  'mobile.copy': 'Copy the link for later',
  'mobile.copied': 'Copied — open it on your computer',
  'mobile.copyFailed': 'Could not copy — the URL is in the address bar',
  'mobile.anyway': 'Try anyway on this device',
  'mobile.source': 'See the source on GitHub',

  /* -- beatmap titles -- */
  'map.demo.title': 'Demo — Three phases',
  'map.drift.title': 'Drift',
  'map.duet.title': 'Duet',
  'map.pulse.title': 'Pulse',

  /* -- phases -- */
  'phase.easy.name': 'Phase 1 — Easy',
  'phase.easy.hint': 'Very slow, big targets, very forgiving timing. Pinch as the ring closes.',
  'phase.medium.name': 'Phase 2 — Medium',
  'phase.medium.hint': 'Faster, and the targets spread out. Keep your hand up.',
  'phase.hard.name': 'Phase 3 — Hard',
  'phase.hard.hint': 'Short ring, tight windows, no room to drift.',
  'phase.glide.name': 'Glide',
  'phase.glide.hint': 'Pinch the head, hold, follow the ball.',
  'phase.curve.name': 'Curve',
  'phase.curve.hint': 'The path bends now. Stay on the ball, not ahead of it.',
  'phase.weave.name': 'Weave',
  'phase.weave.hint': 'Longer holds, less recovery.',
  'phase.mirror.name': 'Mirror',
  'phase.mirror.hint': 'Both hands, together. Left side is your left hand.',
  'phase.alternate.name': 'Alternate',
  'phase.alternate.hint': 'Hands take turns. Keep the waiting one open.',
  'phase.independent.name': 'Independent',
  'phase.independent.hint': 'One hand holds, the other taps.',
  'phase.warmup.name': 'Warm-up',
  'phase.warmup.hint': 'One note every four beats. Find the rhythm.',
  'phase.drive.name': 'Drive',
  'phase.drive.hint': 'Every two beats now, side to side.',
  'phase.sprint.name': 'Sprint',
  'phase.sprint.hint': 'Bursts of four. Breathe between them.',
} as const;

export type MessageKey = keyof typeof en;

/* ------------------------------------------------------------------- french -- */

const fr: Record<MessageKey, string> = {
  'lang.label': 'Langue',
  'lang.en': 'EN',
  'lang.fr': 'FR',

  'start.tagline':
    'Un jeu de rythme qui se joue en *pinçant*. Des cercles apparaissent, un anneau se referme dessus : pincez le pouce et l’index à l’instant où l’anneau touche la cible.',
  'start.maps.label': 'Beatmap',
  'start.phases.label': 'Difficulté de départ',
  'start.card.meta': '{bpm} BPM · {notes} notes',
  'start.card.twoHands': 'deux mains',
  'start.card.best': 'Record {score}',
  'start.card.never': 'Jamais joué',
  'start.phaseNote':
    'Départ en *{phase}* — le score d’une partie partielle est enregistré quand même.',
  'start.best.label': 'Meilleur score',
  'start.best.detail': '{accuracy} % · combo {combo}x',
  'start.tip.sit':
    'Placez-vous à ~60–100 cm de la webcam, une main bien visible, paume vers la caméra.',
  'start.tip.hit':
    'Un hit, c’est passer de *doigts écartés* à *doigts pincés* sur la cible.',
  'start.tip.slider':
    '*Sliders* : pincez la tête, puis *gardez le pincement* et suivez la piste, en suivant la bille dans le sens des flèches, jusqu’au bout.',
  'start.tip.pause':
    'Si la main sort du champ, la partie *se met en pause* — ramenez-la et elle repart.',
  'start.tip.privacy':
    'Le *mode confidentialité* masque l’image de la webcam et ne laisse que le squelette — pratique en stream, ou pour jouer dans une pièce que vous préférez ne pas montrer.',
  'privacy.label': 'Masquer l’image de la webcam',
  'privacy.hint':
    'La main reste suivie — seule l’image est masquée. Touche V pour basculer en jeu.',
  'start.play': 'Autoriser la webcam / Jouer',
  'start.loading': 'Chargement…',
  'start.recalibrate': 'Recalibrer mon pincement',

  'key.pause': 'pause',
  'key.replay': 'rejouer',
  'key.metronome': 'métronome',
  'key.skeleton': 'squelette',
  'key.video': 'mode confidentialité',
  'key.gauge': 'jauge',
  'key.playfield': 'aire de jeu',
  'key.debug': 'debug',
  'key.menu': 'menu',
  'key.resume': 'reprendre',
  'key.resumeNow': 'reprendre tout de suite',
  'key.restart': 'recommencer',

  'status.idle': 'Modèle de suivi de main pas encore chargé (~7 Mo au premier lancement).',
  'status.runtime': 'Chargement du moteur de vision…',
  'status.model': 'Chargement du modèle de main…',
  'status.camera': 'En attente de l’autorisation webcam…',
  'status.ready': 'Prêt.',

  'calib.title': 'Calibrage',
  'calib.body':
    'Ouvrez grand la main, puis pincez le pouce et l’index. *Trois fois*, lentement, devant la caméra.',
  'calib.ratio': 'Ratio de pincement {ratio}',
  'calib.waiting': 'En attente d’une main…',
  'calib.skip': 'Passer — garder les valeurs par défaut',
  'calib.failed.title': 'Pincement illisible',
  'calib.failed.body':
    'La main doit être entièrement visible, et vraiment s’ouvrir et se fermer. Les seuils par défaut restent en place et le jeu est jouable — vous pouvez réessayer ou simplement continuer.',
  'calib.failed.play': 'Jouer quand même',

  'pause.title': 'Pause',
  'pause.title.auto': 'Main perdue',
  'pause.body':
    'La partie reprend un temps avant l’arrêt, pour vous laisser le temps de relire l’écran.',
  'pause.body.auto.1': 'Remettez la main dans le champ et la partie reprend où elle s’est arrêtée.',
  'pause.body.auto.2': 'Rien n’a été jugé pendant son absence.',
  'pause.resume': 'Reprendre',
  'pause.restart': 'Recommencer la partie',
  'pause.quit': 'Retour au menu',

  'end.title.challenge': 'Défi relevé !',
  'end.title.record': 'Nouveau record !',
  'end.title.done': 'Partie terminée',
  'end.accuracy': '{accuracy} % de précision',
  'end.maxCombo': 'Combo max {combo}x',
  'end.challenge.beaten': 'Le défi était à {score} — battu de {delta}.',
  'end.challenge.short': 'Le défi était à {score} — il manquait {delta}.',
  'end.previous': 'Ancien record : {score}',
  'end.first': 'Premier score enregistré.',
  'end.best': 'Record : {score} ({accuracy} %)',
  'end.replay': 'Rejouer',
  'end.share': 'Copier le résultat + le lien de défi',
  'end.share.ok': 'Copié — envoyez-le à quelqu’un',
  'end.share.failed': 'Copie impossible — sélectionnez l’URL à la main',
  'end.changeMap': 'Changer de beatmap',
  'end.tip': 'Astuce : appuyez sur R pour recommencer sans repasser par ici.',
  'end.share.line1': 'Fingertune — {map}',
  'end.share.line2': '{score} pts · {accuracy} % · combo {combo}x',
  'end.share.line3': 'À vous de battre ça : {url}',

  'hud.noHand': 'Aucune main détectée — montrez votre main à la caméra',
  'hud.phase': 'Phase {index}/{count}',
  'hud.countdown': 'Préparez votre main…',
  'hud.early': '(en avance)',
  'hud.late': '(en retard)',
  'hud.target.best': 'Votre record',
  'hud.target.challenge': 'Défi',
  'hud.privacy': 'Mode confidentialité — webcam masquée',

  'chart.summary': 'Importer une beatmap (osu! ou StepMania)',
  'chart.choose': 'Choisir un .osz, .osu, .sm ou .zip',
  'chart.loading': 'Lecture de la carte…',
  'chart.loaded': '{label} chargé — {notes} notes. Sélectionnez-la dans la liste ci-dessus.',
  'chart.noAudio':
    'Pas d’audio dans le fichier : la carte demande {file}. Ajoutez-le avec le panneau musique ci-dessous.',
  'chart.failed': 'Impossible de lire ce fichier.',
  'chart.caveat':
    'Converti, pas émulé : les spinners osu! sont ignorés et les sliders courbes sont parcourus en segments droits ; les colonnes StepMania deviennent des colonnes à l’écran et la hauteur est ajoutée par l’import. Rien n’est envoyé — l’archive est lue dans cet onglet.',

  'music.summary': 'Jouer sur votre propre musique',
  'music.choose': 'Choisir un fichier audio',
  'music.back': 'Revenir à la piste générée',
  'music.tap': 'Taper le tempo',
  'music.bpm': 'BPM',
  'music.keepTapping': 'Continuez à taper…',
  'music.caveat':
    'Les notes gardent la grille de la beatmap. Régler le BPM aligne l’espacement sur votre piste, mais le premier temps n’est pas détecté — si la piste ne commence pas dessus, tout sera décalé d’une valeur constante. Votre fichier ne quitte jamais cette machine.',

  'board.title': 'Classement en ligne',
  'board.name': 'Votre nom',
  'board.placeholder': 'anon',
  'board.submit': 'Publier mon score',
  'board.sending': 'Envoi…',
  'board.submitted': 'Publié. Le classement garde votre meilleure partie sur cette carte.',
  'board.taken': 'Ce nom appartient à un autre joueur. Choisissez-en un autre.',
  'board.you': '(vous)',
  'board.identity':
    'Votre nom vous est réservé, dans ce navigateur. Le changer renomme tous vos scores.',
  'board.empty': 'Personne n’a encore publié de score sur cette carte. À vous.',
  'board.offline': 'Classement injoignable. Votre record local reste enregistré.',
  'board.timeout': 'Le classement n’a pas répondu à temps. Votre record local reste enregistré.',
  'board.rejected': 'Le classement a refusé ce score.',
  'board.unverified':
    'Les scores ne sont pas vérifiés : le jeu tourne entièrement dans votre navigateur, donc tout ce qu’il envoie est quelque chose qu’on pourrait taper. À prendre comme un mur où l’on signe, pas comme un classement.',

  'error.title': 'Quelque chose a échoué',
  'error.retry': 'Réessayer',
  'error.noMediaDevices':
    'Ce navigateur n’expose pas la webcam. Servez la page en https:// ou depuis localhost — un fichier ouvert en file:// est bloqué par la plupart des navigateurs.',
  'error.modelLoadFailed':
    'Impossible de charger le modèle de suivi de main. Vérifiez votre connexion et réessayez (le modèle fait ~7 Mo au premier lancement). Hors ligne, lancez `npm run fetch:model` pour l’héberger vous-même.',
  'error.notAllowed':
    'L’accès à la webcam a été refusé. Autorisez la caméra depuis l’icône de la barre d’adresse, puis réessayez.',
  'error.notFound': 'Aucune webcam trouvée. Branchez une caméra et réessayez.',
  'error.notReadable':
    'La webcam est déjà utilisée par une autre application (Zoom, Teams, OBS…). Fermez-la et réessayez.',
  'error.startupFailed': 'Le démarrage a échoué.',

  'mobile.title': 'Revenez sur ordinateur',
  'mobile.body':
    'Fingertune suit votre main à la webcam : il faut les deux mains libres, un clavier et un écran que vous ne tenez pas. Sur téléphone, il n’y a nulle part où poser la caméra qui permette aussi de jouer.',
  'mobile.why': 'Ce n’est pas cassé — c’est un jeu de bureau.',
  'mobile.copy': 'Copier le lien pour plus tard',
  'mobile.copied': 'Copié — ouvrez-le sur votre ordinateur',
  'mobile.copyFailed': 'Copie impossible — l’URL est dans la barre d’adresse',
  'mobile.anyway': 'Essayer quand même sur cet appareil',
  'mobile.source': 'Voir le code sur GitHub',

  'map.demo.title': 'Démo — Trois phases',
  'map.drift.title': 'Drift',
  'map.duet.title': 'Duet',
  'map.pulse.title': 'Pulse',

  'phase.easy.name': 'Phase 1 — Facile',
  'phase.easy.hint':
    'Très lent, grandes cibles, timing très permissif. Pincez quand l’anneau se referme.',
  'phase.medium.name': 'Phase 2 — Moyen',
  'phase.medium.hint': 'Plus rapide, et les cibles s’écartent. Gardez la main levée.',
  'phase.hard.name': 'Phase 3 — Difficile',
  'phase.hard.hint': 'Anneau court, fenêtres serrées, aucune marge.',
  'phase.glide.name': 'Glide',
  'phase.glide.hint': 'Pincez la tête, tenez, suivez la bille.',
  'phase.curve.name': 'Curve',
  'phase.curve.hint': 'Le tracé s’incurve. Restez sur la bille, pas devant elle.',
  'phase.weave.name': 'Weave',
  'phase.weave.hint': 'Maintiens plus longs, moins de récupération.',
  'phase.mirror.name': 'Mirror',
  'phase.mirror.hint': 'Les deux mains, ensemble. Le côté gauche, c’est votre main gauche.',
  'phase.alternate.name': 'Alternate',
  'phase.alternate.hint': 'Les mains alternent. Gardez ouverte celle qui attend.',
  'phase.independent.name': 'Independent',
  'phase.independent.hint': 'Une main tient, l’autre tape.',
  'phase.warmup.name': 'Warm-up',
  'phase.warmup.hint': 'Une note toutes les quatre pulsations. Trouvez le rythme.',
  'phase.drive.name': 'Drive',
  'phase.drive.hint': 'Toutes les deux pulsations maintenant, de gauche à droite.',
  'phase.sprint.name': 'Sprint',
  'phase.sprint.hint': 'Rafales de quatre. Respirez entre deux.',
};

const DICTIONARIES: Record<Lang, Record<MessageKey, string>> = { en, fr };

/* -------------------------------------------------------------------- store -- */

function isLang(value: string | null): value is Lang {
  return value === 'en' || value === 'fr';
}

/**
 * A stored choice always wins: someone who switched to English on a French
 * machine did it on purpose, and overriding that on the next visit would make
 * the toggle look broken.
 */
function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    // Private mode, disabled storage: fall through to the browser's own setting.
  }
  const preferred = [navigator.language, ...(navigator.languages ?? [])];
  return preferred.some((tag) => tag?.toLowerCase().startsWith('fr')) ? 'fr' : 'en';
}

let current: Lang = detectLang();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = (): Lang => current;

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Not being able to remember the choice is not a reason to refuse it.
  }
  document.documentElement.lang = lang;
  emit();
}

/** Applies the detected language to <html lang> before the first paint. */
export function initLang(): void {
  document.documentElement.lang = current;
}

/* ---------------------------------------------------------------- lookup ----- */

export type Vars = Readonly<Record<string, string | number>>;

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = vars[name];
    return value === undefined ? whole : String(value);
  });
}

export function translate(lang: Lang, key: MessageKey, vars?: Vars): string {
  return interpolate(DICTIONARIES[lang][key], vars);
}

/**
 * Beatmap and phase labels live in the beatmap files, which are data rather
 * than UI. Rather than thread a key through every one of them, their id is
 * looked up here and the literal is used when there is no translation — a new
 * beatmap therefore ships in its author's words instead of crashing.
 */
export function translateOr(lang: Lang, key: string, fallback: string): string {
  const dictionary = DICTIONARIES[lang] as Record<string, string | undefined>;
  return dictionary[key] ?? fallback;
}

/* ------------------------------------------------------------------- hooks --- */

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export interface Translator {
  (key: MessageKey, vars?: Vars): string;
  /** Current language, for `toLocaleString` and for `<html lang>`. */
  lang: Lang;
  /** Translation by raw id, falling back to a literal (beatmaps, phases). */
  or: (key: string, fallback: string) => string;
  /** Locale-aware number, so 12345 reads 12 345 in French and 12,345 in English. */
  n: (value: number) => string;
}

export function useT(): Translator {
  const lang = useLang();
  return useMemo(
    () =>
      Object.assign((key: MessageKey, vars?: Vars): string => translate(lang, key, vars), {
        lang,
        or: (key: string, fallback: string): string => translateOr(lang, key, fallback),
        n: (value: number): string => value.toLocaleString(lang),
      }),
    [lang],
  );
}
