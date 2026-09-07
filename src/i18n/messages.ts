/**
 * Les dictionnaires de l'application, une entrée par locale et TOUTES DE MÊME
 * FORME : `createI18n` dérive le type des clés du dictionnaire de repli, et le
 * compilateur refuse ensuite `t('cle.qui.nexiste.pas')`.
 *
 * Deux locales seulement ici. En ajouter une se fait en copiant `fr` et en
 * traduisant : la forme, elle, est vérifiée à la compilation.
 *
 * CE FICHIER NE CONTIENT PAS LES LIBELLÉS DES COMPOSANTS DU SOCLE (« Fermer »,
 * « Réessayer », « Retour »…). Ils vivent dans `react/labels`, en sept langues,
 * et `I18nProvider` pose `LabelsProvider` avec la locale courante tout seul.
 * Les redéclarer ici, c'est le travail que sept apps ont fait dans huit
 * fichiers-pont d'environ quatre cents lignes, avant que le socle ne porte les
 * traductions.
 */
/**
 * PAS DE `as const` ICI, et c'est délibéré. Il figerait chaque chaîne
 * française comme son PROPRE type littéral, et le dictionnaire anglais devrait
 * alors contenir… les mêmes mots français. La forme est ce qui doit
 * correspondre, pas le contenu.
 */
const fr = {
  app: {
    name: 'Mister Settle',
    tagline: 'Le squelette de la famille, prêt à cloner.',
  },
  nav: {
    home: 'Accueil',
    settings: 'Réglages',
    account: 'Compte',
    about: 'À propos',
  },
  home: {
    title: 'Notes',
    loading: 'Chargement des notes',
    empty: 'Aucune note pour le moment.',
    emptyHint: 'La première note montrera la persistance versionnée.',
    add: 'Ajouter',
    field: 'Nouvelle note',
    placeholder: 'Ce que je ne veux pas oublier',
    remove: 'Supprimer',
    removeConfirm: 'Supprimer cette note ?',
    removeBody: 'Elle ne sera pas récupérable.',
    count: {
      one: '{count} note',
      other: '{count} notes',
    },
  },
  settings: {
    title: 'Réglages',
    appearance: 'Apparence',
    language: 'Langue',
    data: 'Données',
    export: 'Exporter mes notes',
    import: 'Importer mes notes',
    importConfirm: 'Remplacer les notes actuelles ?',
    importBody:
      'Le fichier remplacera tout ce qui est sur cet appareil. Exportez d’abord si vous voulez garder l’état actuel.',
    imported: {
      one: '{count} note importée.',
      other: '{count} notes importées.',
    },
    importFailed: 'Fichier refusé : {error}',
    reset: 'Tout effacer',
    resetConfirm: 'Effacer toutes les notes ?',
    resetBody: 'Cette action est définitive.',
    backend: 'Source de données',
    backendLocal: 'Cet appareil seulement',
  },
  account: {
    title: 'Compte',
    localMode: 'Mode local',
    localModeBody:
      "Aucun backend n'est configuré : tout reste sur cet appareil. L'écran est là quand même — un écran masqué par une condition finit par diverger de celui qui s'affiche.",
    signOut: 'Se déconnecter',
    admin: 'Administration',
    linkIntro:
      'Un lien à usage unique arrive dans votre boîte : aucun mot de passe à retenir, ni à voler.',
    linkSentTitle: 'Lien envoyé',
    linkSentBody:
      "Un lien vient d'être envoyé à {email}. Ouvrez-le depuis cet appareil : il vous ramènera ici, connecté·e. Il n'est valable qu'une fois.",
    linkAgain: 'Recevoir un autre lien',
    usePassword: 'Se connecter avec un mot de passe',
    useLink: 'Recevoir un lien plutôt',
  },

  about: {
    title: 'À propos',
    what: "Ce dépôt est le point de départ des applications de la famille. Il n'a pas de métier : il a le cadre.",
    version: 'Version',
  },
};

const en: typeof fr = {
  app: {
    name: 'Mister Settle',
    tagline: 'The family skeleton, ready to clone.',
  },
  nav: {
    home: 'Home',
    settings: 'Settings',
    account: 'Account',
    about: 'About',
  },
  home: {
    title: 'Notes',
    loading: 'Loading notes',
    empty: 'No notes yet.',
    emptyHint: 'The first note will show versioned persistence at work.',
    add: 'Add',
    field: 'New note',
    placeholder: "What I don't want to forget",
    remove: 'Delete',
    removeConfirm: 'Delete this note?',
    removeBody: 'It cannot be recovered.',
    count: {
      one: '{count} note',
      other: '{count} notes',
    },
  },
  settings: {
    title: 'Settings',
    appearance: 'Appearance',
    language: 'Language',
    data: 'Data',
    export: 'Export my notes',
    import: 'Import my notes',
    importConfirm: 'Replace the current notes?',
    importBody:
      'The file will replace everything on this device. Export first if you want to keep the current state.',
    imported: {
      one: '{count} note imported.',
      other: '{count} notes imported.',
    },
    importFailed: 'File rejected: {error}',
    reset: 'Erase everything',
    resetConfirm: 'Erase all notes?',
    resetBody: 'This cannot be undone.',
    backend: 'Data source',
    backendLocal: 'This device only',
  },
  account: {
    title: 'Account',
    localMode: 'Local mode',
    localModeBody:
      'No backend is configured: everything stays on this device. The screen is still here — a screen hidden behind a condition drifts away from the one that shows.',
    signOut: 'Sign out',
    admin: 'Admin',
    linkIntro:
      'A one-time link lands in your inbox: no password to remember, none to steal.',
    linkSentTitle: 'Link sent',
    linkSentBody:
      'A link was just sent to {email}. Open it from this device: it brings you back here, signed in. It only works once.',
    linkAgain: 'Send another link',
    usePassword: 'Sign in with a password',
    useLink: 'Send me a link instead',
  },

  about: {
    title: 'About',
    what: 'This repository is the starting point for the family applications. It has no domain: it has the frame.',
    version: 'Version',
  },
};

export const messages = { fr, en };
export type Messages = typeof fr;
