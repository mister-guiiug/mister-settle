/**
 * Les dictionnaires de l'application, une entrée par locale et TOUTES DE MÊME
 * FORME : `createI18n` dérive le type des clés du dictionnaire de repli, et le
 * compilateur refuse ensuite `t('cle.qui.nexiste.pas')`.
 *
 * CE FICHIER NE CONTIENT PAS LES LIBELLÉS DES COMPOSANTS DU SOCLE (« Fermer »,
 * « Réessayer », « Retour »…). Ils vivent dans `react/labels`, en sept langues,
 * et `I18nProvider` pose `LabelsProvider` avec la locale courante tout seul.
 *
 * LE MOT « REGROUPEMENT » N'EST QU'ICI (ADR 0012) : le modèle dit
 * `participant_groups`, et changer le mot ne change rien d'autre.
 *
 * PAS DE `as const` : il figerait chaque chaîne française comme son propre
 * type littéral. La forme est ce qui doit correspondre, pas le contenu.
 */
const fr = {
  app: {
    name: 'Mister Settle',
    tagline: 'Qui a payé, qui doit combien — sans toucher à l’argent.',
  },
  nav: {
    home: 'Espaces',
    settings: 'Réglages',
    account: 'Compte',
    about: 'À propos',
    dashboard: 'Tableau de bord',
    expenses: 'Dépenses',
    balances: 'Soldes',
    people: 'Personnes',
    settle: 'Régler',
    more: 'Plus',
    spaceSettings: 'Réglages de l’espace',
  },
  errors: {
    conflict:
      'Quelqu’un a modifié ceci entre-temps. Rechargez, puis refaites votre geste.',
    forbidden: 'Vous n’avez pas le droit de faire cela ici.',
    'not-found': 'Introuvable — peut-être supprimé.',
    invalid: 'Saisie refusée : {detail}',
    gone: 'Ce lien n’est plus valable.',
    'local-mode':
      'Ce geste demande un compte : ici, tout reste sur cet appareil.',
    network: 'Pas de réseau. Réessayez quand la connexion revient.',
    unknown: 'Une erreur est survenue : {detail}',
  },
  spaces: {
    title: 'Mes espaces',
    loading: 'Chargement des espaces',
    empty: 'Aucun espace pour le moment.',
    emptyHint:
      'Un espace regroupe des personnes et leurs dépenses : un voyage, une colocation, une famille.',
    create: 'Créer un espace',
    archived: 'Espaces archivés',
    open: 'Ouvrir {name}',
    role: {
      owner: 'Propriétaire',
      admin: 'Administration',
      contributor: 'Contribution',
      reader: 'Lecture',
    },
    count: {
      one: '{count} espace',
      other: '{count} espaces',
    },
  },
  newSpace: {
    title: 'Nouvel espace',
    name: 'Nom',
    namePlaceholder: 'Vacances en Bretagne',
    description: 'Description',
    descriptionPlaceholder: 'Facultatif',
    currency: 'Devise',
    icon: 'Icône',
    iconHint: 'Un emoji, ou rien.',
    color: 'Couleur',
    meName: 'Mon nom dans cet espace',
    meNameHint: 'C’est ainsi que les autres vous verront.',
    submit: 'Créer l’espace',
    nameRequired: 'Le nom est obligatoire.',
  },
  space: {
    loading: 'Chargement de l’espace',
    notFound: 'Cet espace n’existe pas, ou vous n’y avez plus accès.',
    backToSpaces: 'Retour aux espaces',
    archivedBanner:
      'Cet espace est archivé : il se consulte, il ne se modifie plus.',
    people: {
      one: '{count} personne',
      other: '{count} personnes',
    },
    expenses: {
      one: '{count} dépense validée',
      other: '{count} dépenses validées',
    },
    drafts: {
      one: '{count} brouillon',
      other: '{count} brouillons',
    },
    myBalance: 'Mon solde',
    myBalanceHint: 'Positif : on vous doit. Négatif : vous devez.',
    noMe: 'Vous n’êtes rattaché·e à aucune personne de cet espace.',
    total: 'Total des dépenses',
    comingSoon: 'Bientôt',
  },
  people: {
    title: 'Personnes',
    loading: 'Chargement des personnes',
    empty: 'Aucune personne pour le moment.',
    emptyHint:
      'Une personne existe sans compte : ajoutez tout le monde, les comptes se rattacheront plus tard.',
    add: 'Ajouter une personne',
    edit: 'Modifier {name}',
    name: 'Nom affiché',
    nameHint: 'Tel qu’il apparaîtra dans les dépenses.',
    nameRequired: 'Un nom est nécessaire.',
    initials: 'Initiales',
    initialsHint: 'Trois signes au plus ; vides, elles se déduisent du nom.',
    color: 'Couleur',
    create: 'Ajouter',
    save: 'Enregistrer',
    me: 'Moi',
    linked: 'Compte rattaché',
    linkMe: 'C’est moi',
    unlinkMe: 'Ce n’est plus moi',
    moveUp: 'Monter {name}',
    moveDown: 'Descendre {name}',
    archive: 'Archiver {name}',
    unarchive: 'Réactiver {name}',
    archived: 'Personnes archivées',
    archivedHint:
      'Retirées des sélections à venir ; leur historique et leurs soldes restent.',
    adminOnly: 'Seule l’administration ajoute ou modifie les personnes.',
    count: {
      one: '{count} personne',
      other: '{count} personnes',
    },
    tabs: {
      label: 'Personnes ou regroupements',
      people: 'Personnes',
      groups: 'Regroupements',
    },
  },
  groups: {
    title: 'Regroupements',
    empty: 'Aucun regroupement.',
    emptyHint:
      'Un regroupement est un raccourci de sélection — « la famille », « les enfants » — jamais une unité de compte : les montants vont toujours aux personnes.',
    add: 'Créer un regroupement',
    edit: 'Modifier {name}',
    name: 'Nom',
    nameRequired: 'Un nom est nécessaire.',
    color: 'Couleur',
    members: 'Membres',
    membersHint: 'Les personnes réellement retenues, sans doublon.',
    create: 'Créer',
    save: 'Enregistrer',
    remove: 'Supprimer {name}',
    removeConfirm: 'Supprimer « {name} » ?',
    removeBody:
      'Les personnes et les dépenses ne changent pas : la composition figée vit sur chaque dépense validée.',
    archive: 'Archiver {name}',
    unarchive: 'Réactiver {name}',
    archived: 'Regroupements archivés',
    noMembers: 'Aucun membre',
    memberCount: {
      one: '{count} membre',
      other: '{count} membres',
    },
    adminOnly: 'Seule l’administration crée ou modifie les regroupements.',
  },
  errorDetail: {
    'duplicate-name': 'Ce nom est déjà pris dans cet espace.',
    'participant-linked': 'Cette personne est déjà rattachée à un compte.',
    'foreign-member': 'Un membre n’appartient pas à cet espace.',
  },
  spaceSettings: {
    title: 'Réglages de l’espace',
    identity: 'Identité',
    save: 'Enregistrer',
    saved: 'Réglages enregistrés.',
    archive: 'Archiver l’espace',
    unarchive: 'Réactiver l’espace',
    archiveBody:
      'Un espace archivé reste consultable avec tout son historique ; plus personne n’y écrit.',
    danger: 'Zone dangereuse',
    remove: 'Supprimer l’espace',
    removeConfirm: 'Supprimer « {name} » ?',
    removeBody:
      'Les personnes, les dépenses et l’historique disparaissent définitivement. Exportez d’abord si vous voulez les garder.',
    ownerOnly: 'Réservé au propriétaire de l’espace.',
    adminOnly: 'Réservé aux administrateurs de l’espace.',
  },
  settings: {
    title: 'Réglages',
    appearance: 'Apparence',
    language: 'Langue',
    data: 'Données de cet appareil',
    dataHint:
      'Sans compte, tout vit ici. Un fichier exporté se relit sur un autre appareil.',
    export: 'Exporter mes données',
    import: 'Importer mes données',
    importConfirm: 'Remplacer les données actuelles ?',
    importBody:
      'Le fichier remplacera tout ce qui est sur cet appareil. Exportez d’abord si vous voulez garder l’état actuel.',
    imported: 'Données importées.',
    importFailed: 'Fichier refusé : {error}',
    reset: 'Tout effacer',
    resetConfirm: 'Effacer toutes les données de cet appareil ?',
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
    danger: {
      title: 'Zone dangereuse',
      body: 'Effacer votre compte et ce qui n’appartient qu’à lui. Les espaces partagés gardent vos dépenses, sous votre nom de personne.',
      action: 'Supprimer mon compte',
      confirmLabel: 'Retapez votre adresse pour confirmer',
      confirmHint: 'L’adresse du compte est {email}.',
      confirm: 'Supprimer définitivement',
      cancel: 'Annuler',
      mismatch: 'L’adresse saisie ne correspond pas : rien n’a été supprimé.',
      failed: 'La suppression a échoué : {error}',
    },
  },
  about: {
    title: 'À propos',
    what: 'Mister Settle répartit les dépenses d’un groupe — voyage, colocation, famille — et calcule qui doit quoi à qui. Les remboursements se font en dehors de l’application : elle ne manipule jamais d’argent.',
    version: 'Version',
  },
};

const en: typeof fr = {
  app: {
    name: 'Mister Settle',
    tagline: 'Who paid, who owes what — without touching the money.',
  },
  nav: {
    home: 'Spaces',
    settings: 'Settings',
    account: 'Account',
    about: 'About',
    dashboard: 'Dashboard',
    expenses: 'Expenses',
    balances: 'Balances',
    people: 'People',
    settle: 'Settle up',
    more: 'More',
    spaceSettings: 'Space settings',
  },
  errors: {
    conflict:
      'Someone changed this in the meantime. Reload, then redo your change.',
    forbidden: 'You are not allowed to do that here.',
    'not-found': 'Not found — maybe deleted.',
    invalid: 'Rejected input: {detail}',
    gone: 'This link is no longer valid.',
    'local-mode':
      'This needs an account: here, everything stays on this device.',
    network: 'No network. Try again once the connection is back.',
    unknown: 'Something went wrong: {detail}',
  },
  spaces: {
    title: 'My spaces',
    loading: 'Loading spaces',
    empty: 'No space yet.',
    emptyHint:
      'A space gathers people and their expenses: a trip, a flat share, a family.',
    create: 'Create a space',
    archived: 'Archived spaces',
    open: 'Open {name}',
    role: {
      owner: 'Owner',
      admin: 'Admin',
      contributor: 'Contributor',
      reader: 'Reader',
    },
    count: {
      one: '{count} space',
      other: '{count} spaces',
    },
  },
  newSpace: {
    title: 'New space',
    name: 'Name',
    namePlaceholder: 'Holidays in Brittany',
    description: 'Description',
    descriptionPlaceholder: 'Optional',
    currency: 'Currency',
    icon: 'Icon',
    iconHint: 'An emoji, or nothing.',
    color: 'Colour',
    meName: 'My name in this space',
    meNameHint: 'This is how others will see you.',
    submit: 'Create the space',
    nameRequired: 'The name is required.',
  },
  space: {
    loading: 'Loading the space',
    notFound: 'This space does not exist, or you no longer have access to it.',
    backToSpaces: 'Back to spaces',
    archivedBanner: 'This space is archived: it can be read, not changed.',
    people: {
      one: '{count} person',
      other: '{count} people',
    },
    expenses: {
      one: '{count} validated expense',
      other: '{count} validated expenses',
    },
    drafts: {
      one: '{count} draft',
      other: '{count} drafts',
    },
    myBalance: 'My balance',
    myBalanceHint: 'Positive: you are owed. Negative: you owe.',
    noMe: 'You are not linked to any person in this space.',
    total: 'Total expenses',
    comingSoon: 'Coming soon',
  },
  people: {
    title: 'People',
    loading: 'Loading people',
    empty: 'No one yet.',
    emptyHint:
      'A person exists without an account: add everyone now, accounts can be linked later.',
    add: 'Add a person',
    edit: 'Edit {name}',
    name: 'Display name',
    nameHint: 'As it will appear in expenses.',
    nameRequired: 'A name is required.',
    initials: 'Initials',
    initialsHint:
      'Up to three characters; left empty, they come from the name.',
    color: 'Colour',
    create: 'Add',
    save: 'Save',
    me: 'Me',
    linked: 'Linked account',
    linkMe: 'This is me',
    unlinkMe: 'Not me anymore',
    moveUp: 'Move {name} up',
    moveDown: 'Move {name} down',
    archive: 'Archive {name}',
    unarchive: 'Restore {name}',
    archived: 'Archived people',
    archivedHint:
      'Removed from future selections; their history and balances remain.',
    adminOnly: 'Only administrators add or edit people.',
    count: {
      one: '{count} person',
      other: '{count} people',
    },
    tabs: {
      label: 'People or groups',
      people: 'People',
      groups: 'Groups',
    },
  },
  groups: {
    title: 'Groups',
    empty: 'No group yet.',
    emptyHint:
      'A group is a selection shortcut — “the family”, “the kids” — never an accounting unit: amounts always go to people.',
    add: 'Create a group',
    edit: 'Edit {name}',
    name: 'Name',
    nameRequired: 'A name is required.',
    color: 'Colour',
    members: 'Members',
    membersHint: 'The people actually selected, without duplicates.',
    create: 'Create',
    save: 'Save',
    remove: 'Delete {name}',
    removeConfirm: 'Delete “{name}”?',
    removeBody:
      'People and expenses do not change: the frozen composition lives on each validated expense.',
    archive: 'Archive {name}',
    unarchive: 'Restore {name}',
    archived: 'Archived groups',
    noMembers: 'No member',
    memberCount: {
      one: '{count} member',
      other: '{count} members',
    },
    adminOnly: 'Only administrators create or edit groups.',
  },
  errorDetail: {
    'duplicate-name': 'This name is already taken in this space.',
    'participant-linked': 'This person is already linked to an account.',
    'foreign-member': 'A member does not belong to this space.',
  },
  spaceSettings: {
    title: 'Space settings',
    identity: 'Identity',
    save: 'Save',
    saved: 'Settings saved.',
    archive: 'Archive the space',
    unarchive: 'Reactivate the space',
    archiveBody:
      'An archived space stays readable with its whole history; nobody writes to it any more.',
    danger: 'Danger zone',
    remove: 'Delete the space',
    removeConfirm: 'Delete “{name}”?',
    removeBody:
      'People, expenses and history disappear for good. Export first if you want to keep them.',
    ownerOnly: 'Owner of the space only.',
    adminOnly: 'Admins of the space only.',
  },
  settings: {
    title: 'Settings',
    appearance: 'Appearance',
    language: 'Language',
    data: 'Data on this device',
    dataHint:
      'Without an account, everything lives here. An exported file can be read on another device.',
    export: 'Export my data',
    import: 'Import my data',
    importConfirm: 'Replace the current data?',
    importBody:
      'The file will replace everything on this device. Export first if you want to keep the current state.',
    imported: 'Data imported.',
    importFailed: 'File rejected: {error}',
    reset: 'Erase everything',
    resetConfirm: 'Erase all data on this device?',
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
    danger: {
      title: 'Danger zone',
      body: 'Erase your account and what belongs to it alone. Shared spaces keep your expenses, under your person’s name.',
      action: 'Delete my account',
      confirmLabel: 'Type your address again to confirm',
      confirmHint: 'The account address is {email}.',
      confirm: 'Delete permanently',
      cancel: 'Cancel',
      mismatch: 'The address does not match: nothing was deleted.',
      failed: 'Deletion failed: {error}',
    },
  },
  about: {
    title: 'About',
    what: 'Mister Settle splits a group’s expenses — a trip, a flat share, a family — and works out who owes what to whom. Repayments happen outside the app: it never handles money.',
    version: 'Version',
  },
};

export const messages = { fr, en };
export type Messages = typeof fr;
