import { createContext, useContext } from 'react';
import type { MaxCardinality, MinCardinality } from './model/types';

export type Lang = 'en' | 'et';

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'et', label: 'Eesti' },
];

const LANG_KEY = 'erd-modeler:lang';

/** Saved choice, else the browser language, else English. */
export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'et') return saved;
  } catch {
    /* ignore */
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('et') ? 'et' : 'en';
}

export function saveLang(lang: Lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* ignore */
  }
}

export type CardKey = '1-one' | '0-one' | '1-many' | '0-many';
export const cardKey = (min: MinCardinality, max: MaxCardinality) => `${min}-${max}` as CardKey;

/** Validation issue codes; the message text comes from the dictionary. */
export type IssueCode =
  | 'entityNoName'
  | 'entityDuplicate'
  | 'entityNoAttributes'
  | 'entityNoPk'
  | 'attrNoName'
  | 'attrDuplicate'
  | 'attrNoType'
  | 'manyToMany'
  | 'oneToOneMandatory'
  | 'recursiveCardinality';

export type IssueParams = { entity?: string; attr?: string; a?: string; b?: string };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/*
 * Estonian terms:
 * olem, atribuut, seos, primaarvõti (PK), välisvõti (FK), andmetüüp, vaikimisi väärtus,
 * mitu-mitmene seos, seos-tüüpi olem, rekursiivne seos, kardinaalsus "null, üks või mitu" etc.
 */
const en = {
  appName: 'ERD Designer',
  modelName: 'Model name',
  addEntity: '+ Entity',
  addEntityTitle: 'Add entity (or double-click the canvas)',
  undo: 'Undo (Ctrl+Z)',
  redo: 'Redo (Ctrl+Shift+Z)',
  new: 'New',
  newConfirm: 'Start a new empty model? Unsaved changes stay in undo history only.',
  open: 'Open…',
  openTitle: 'Open a .json model file',
  openFailed: (file: string, err: string) => `Could not open ${file}: ${err}`,
  save: 'Save',
  saveTitle: 'Save as .json file (Ctrl+S)',
  export: 'Export ▾',
  exportSql: 'SQL (DDL)…',
  exportPng: 'PNG image',
  exportSvg: 'SVG image',
  exportJson: 'Model file (.json)',
  types: 'Types',
  theme: { system: '◐ Auto', light: '☀ Light', dark: '☾ Dark' },
  themeTitle: 'Theme: auto (follows system), light or dark',
  language: 'Language',
  showChecks: 'Show checks',
  errors: (n: number) => plural(n, 'error', 'errors'),
  warnings: (n: number) => plural(n, 'warning', 'warnings'),
  noIssues: 'No issues',
  example: 'Example',
  exampleConfirm: 'Replace the current model with the example?',
  emptyHint1: 'Double-click anywhere to add an entity,',
  emptyHint2a: 'or ',
  emptyHint2link: 'load the example',
  emptyHint2b: '.',
  newModelName: 'Untitled model',
  defaultEntityName: 'Entity',
  defaultAttributeName: 'attribute',

  // overview
  model: 'Model',
  counts: (e: number, r: number) => `${plural(e, 'entity', 'entities')} · ${plural(r, 'relationship', 'relationships')}`,
  checks: 'Checks',
  noProblems: 'No problems found.',
  howTo: 'How to',
  help: [
    ['Add an entity:', 'toolbar button or double-click the canvas.'],
    ['Add a relationship:', 'hover an entity and drag one of the blue dots on its sides onto another entity (or onto itself for a self-reference).'],
    ['Edit:', 'click an entity or a line; its properties appear here.'],
    ['Foreign keys', 'are added automatically on the “many” side. Identifying relationships (solid line) make them part of the primary key; non-identifying ones are dashed.'],
    ['Delete:', 'select and press Delete. Shift-drag to select several.'],
    ['Shortcuts:', 'Ctrl+Z undo, Ctrl+Shift+Z / Ctrl+Y redo, Ctrl+S save.'],
    ['Data types', 'can be SQL types or plain words like int, string, datetime, bool; SQL export maps them to the chosen database.'],
  ] as [string, string][],

  // entity editor
  entity: 'Entity',
  delete: 'Delete',
  name: 'Name',
  description: 'Description',
  descriptionPlaceholder: 'Optional; exported as a table comment',
  colour: 'Colour',
  defaultColour: 'Default',
  attributes: 'Attributes',
  colName: 'Name',
  colType: 'Type',
  colPkTitle: 'Primary key',
  colNnTitle: 'NOT NULL (mandatory)',
  colUqTitle: 'Unique',
  namePlaceholder: 'name',
  typePlaceholder: 'type',
  fkTypeTitle: 'Foreign key type follows the referenced primary key',
  fkPkTitle: 'Set by the relationship (identifying = part of PK)',
  fkNnTitle: 'Set by the relationship (mandatory parent = NOT NULL)',
  more: 'More',
  defaultValue: 'Default',
  defaultPlaceholder: "e.g. 0, 'text', CURRENT_TIMESTAMP",
  comment: 'Comment',
  up: '↑ Up',
  down: '↓ Down',
  remove: 'Remove',
  fkRemoveNote: 'Foreign key columns are removed by deleting their relationship.',
  addAttribute: '+ Add attribute',

  // relationship editor
  relationship: 'Relationship',
  relName: 'Name (verb)',
  relNamePlaceholder: 'e.g. places, contains',
  endA: 'From',
  endB: 'To',
  unnamed: '(unnamed)',
  dragToConnect: 'Drag to another entity to connect',
  swapEnds: '⇅ Swap ends',
  swapEndsTitle: 'Swap the two ends',
  cards: {
    '1-one': 'Exactly one  ||',
    '0-one': 'Zero or one  o|',
    '1-many': 'One or many  |<',
    '0-many': 'Zero or many  o<',
  } as Record<CardKey, string>,
  phrases: {
    '1-one': 'exactly one',
    '0-one': 'zero or one',
    '1-many': 'one or many',
    '0-many': 'zero or many',
  } as Record<CardKey, string>,
  relatedTo: 'is related to',
  m2mText: 'A many-to-many relationship can’t be stored with a single foreign key. Replace it with a junction table.',
  m2mButton: 'Convert to junction table',
  identifying: (child: string): [string, string, string] => ['Identifying (foreign key is part of ', child, '’s primary key)'],
  fkGoesInto: (child: string, parent: string): [string, string, string] => ['Foreign key goes into ', child, ` and references ${parent}.`],

  // SQL dialog
  sqlTitle: 'SQL export',
  database: 'Database',
  dropTables: 'Include DROP TABLE',
  copy: 'Copy',
  copied: 'Copied ✓',
  downloadSql: 'Download .sql',
  close: 'Close',

  // validation
  issues: {
    entityNoName: () => 'Entity has no name',
    entityDuplicate: (p: IssueParams) => `Duplicate entity name "${p.entity}"`,
    entityNoAttributes: (p: IssueParams) => `${p.entity} has no attributes`,
    entityNoPk: (p: IssueParams) => `${p.entity} has no primary key`,
    attrNoName: (p: IssueParams) => `${p.entity}: attribute without a name`,
    attrDuplicate: (p: IssueParams) => `${p.entity}: duplicate attribute "${p.attr}"`,
    attrNoType: (p: IssueParams) => `${p.entity}.${p.attr}: no data type`,
    manyToMany: (p: IssueParams) => `Many-to-many ${p.a} – ${p.b} needs a junction table`,
    oneToOneMandatory: (p: IssueParams) => `${p.a} – ${p.b}: mandatory on both ends; consider making one side optional`,
    recursiveCardinality: (p: IssueParams) => `Recursive relationship on ${p.entity} should be "zero or one – zero or many"`,
  } as Record<IssueCode, (p: IssueParams) => string>,
};

export type Dict = typeof en;

const et: Dict = {
  appName: 'ERD Designer',
  modelName: 'Mudeli nimi',
  addEntity: '+ Olem',
  addEntityTitle: 'Lisa olem (või topeltklõpsa lõuendil)',
  undo: 'Võta tagasi (Ctrl+Z)',
  redo: 'Tee uuesti (Ctrl+Shift+Z)',
  new: 'Uus',
  newConfirm: 'Alustada uue tühja mudeliga? Salvestamata muudatused jäävad alles ainult tagasivõtmise ajalukku.',
  open: 'Ava…',
  openTitle: 'Ava .json mudelifail',
  openFailed: (file, err) => `Faili ${file} ei õnnestunud avada: ${err}`,
  save: 'Salvesta',
  saveTitle: 'Salvesta .json failina (Ctrl+S)',
  export: 'Ekspordi ▾',
  exportSql: 'SQL (DDL)…',
  exportPng: 'PNG pilt',
  exportSvg: 'SVG pilt',
  exportJson: 'Mudeli fail (.json)',
  types: 'Andmetüübid',
  theme: { system: '◐ Auto', light: '☀ Hele', dark: '☾ Tume' },
  themeTitle: 'Teema: auto (süsteemi järgi), hele või tume',
  language: 'Keel',
  showChecks: 'Näita kontrolle',
  errors: (n) => plural(n, 'viga', 'viga'),
  warnings: (n) => plural(n, 'hoiatus', 'hoiatust'),
  noIssues: 'Probleeme pole',
  example: 'Näide',
  exampleConfirm: 'Asendada praegune mudel näitega?',
  emptyHint1: 'Olemi lisamiseks topeltklõpsa lõuendil',
  emptyHint2a: 'või ',
  emptyHint2link: 'laadi näide',
  emptyHint2b: '.',
  newModelName: 'Nimetu mudel',
  defaultEntityName: 'Olem',
  defaultAttributeName: 'atribuut',

  model: 'Mudel',
  counts: (e, r) => `${plural(e, 'olem', 'olemit')} · ${plural(r, 'seos', 'seost')}`,
  checks: 'Kontrollid',
  noProblems: 'Probleeme ei leitud.',
  howTo: 'Kasutamine',
  help: [
    ['Olemi lisamine:', 'tööriistariba nupp või topeltklõps lõuendil.'],
    ['Seose lisamine:', 'vii hiir olemi kohale ja lohista selle küljel olev sinine punkt teisele olemile (rekursiivse seose jaoks samale olemile).'],
    ['Muutmine:', 'klõpsa olemil või seosel; selle omadused kuvatakse siin.'],
    ['Välisvõtmed', 'lisatakse automaatselt seose „mitu” poolsesse olemisse. Identifitseeriv seos (pidev joon) teeb välisvõtme primaarvõtme osaks; mitteidentifitseeriv seos on katkendjoonega.'],
    ['Kustutamine:', 'vali ja vajuta Delete. Mitme valimiseks lohista Shift-klahvi all hoides.'],
    ['Kiirklahvid:', 'Ctrl+Z võta tagasi, Ctrl+Shift+Z / Ctrl+Y tee uuesti, Ctrl+S salvesta.'],
    ['Andmetüübiks', 'sobivad SQL-tüübid või lihtsad sõnad nagu int, string, datetime, bool; SQL-eksport teisendab need valitud andmebaasisüsteemi jaoks.'],
  ],

  entity: 'Olem',
  delete: 'Kustuta',
  name: 'Nimi',
  description: 'Kirjeldus (semantika)',
  descriptionPlaceholder: 'Valikuline; eksporditakse tabeli kommentaarina',
  colour: 'Värv',
  defaultColour: 'Vaikimisi',
  attributes: 'Atribuudid',
  colName: 'Nimi',
  colType: 'Andmetüüp',
  colPkTitle: 'Primaarvõti',
  colNnTitle: 'NOT NULL (kohustuslik)',
  colUqTitle: 'Unikaalne',
  namePlaceholder: 'nimi',
  typePlaceholder: 'andmetüüp',
  fkTypeTitle: 'Välisvõtme andmetüüp tuleb viidatavast primaarvõtmest',
  fkPkTitle: 'Määrab seos (identifitseeriv seos = osa primaarvõtmest)',
  fkNnTitle: 'Määrab seos (kohustuslik seos = NOT NULL)',
  more: 'Rohkem',
  defaultValue: 'Vaikimisi väärtus',
  defaultPlaceholder: "nt 0, 'tekst', CURRENT_TIMESTAMP",
  comment: 'Kommentaar',
  up: '↑ Üles',
  down: '↓ Alla',
  remove: 'Eemalda',
  fkRemoveNote: 'Välisvõtme atribuut eemaldatakse koos seosega.',
  addAttribute: '+ Lisa atribuut',

  relationship: 'Seos',
  relName: 'Nimi (tegusõna)',
  relNamePlaceholder: 'nt esitab, sisaldab',
  endA: 'Esimene olem',
  endB: 'Teine olem',
  unnamed: '(nimetu)',
  dragToConnect: 'Lohista teisele olemile, et luua seos',
  swapEnds: '⇅ Vaheta otsad',
  swapEndsTitle: 'Vaheta seose otsad',
  cards: {
    '1-one': 'Üks  ||',
    '0-one': 'Null või üks  o|',
    '1-many': 'Üks või mitu  |<',
    '0-many': 'Null, üks või mitu  o<',
  },
  phrases: {
    '1-one': 'üks',
    '0-one': 'null või üks',
    '1-many': 'üks või mitu',
    '0-many': 'null, üks või mitu',
  },
  relatedTo: 'seotud',
  m2mText:
    'Mitu-mitmest seost ei saa andmebaasis ühe välisvõtmega realiseerida. Asenda see uue olemiga (seos-tüüpi olem), mis on seotud mõlema olemiga.',
  m2mButton: 'Asenda seos-tüüpi olemiga',
  identifying: (child) => ['Identifitseeriv (välisvõti on olemi ', child, ' primaarvõtme osa)'],
  fkGoesInto: (child, parent) => ['Välisvõti lisatakse olemisse ', child, ` ja see viitab olemile ${parent}.`],

  sqlTitle: 'SQL eksport',
  database: 'Andmebaasisüsteem',
  dropTables: 'Lisa DROP TABLE',
  copy: 'Kopeeri',
  copied: 'Kopeeritud ✓',
  downloadSql: 'Laadi alla .sql',
  close: 'Sulge',

  issues: {
    entityNoName: () => 'Olemil puudub nimi',
    entityDuplicate: (p) => `Korduv olemi nimi „${p.entity}”`,
    entityNoAttributes: (p) => `Olemil ${p.entity} pole atribuute`,
    entityNoPk: (p) => `Olemil ${p.entity} puudub primaarvõti`,
    attrNoName: (p) => `${p.entity}: nimeta atribuut`,
    attrDuplicate: (p) => `${p.entity}: korduv atribuut „${p.attr}”`,
    attrNoType: (p) => `${p.entity}.${p.attr}: andmetüüp puudub`,
    manyToMany: (p) => `Mitu-mitmene seos ${p.a} – ${p.b} tuleb asendada seos-tüüpi olemiga`,
    oneToOneMandatory: (p) =>
      `${p.a} – ${p.b}: üks-ühene seos on mõlemas otsas kohustuslik; sellist seost kasutatakse vaid tehnilistel kaalutlustel`,
    recursiveCardinality: (p) => `Rekursiivne seos olemil ${p.entity} peab olema „null või üks – null, üks või mitu”`,
  },
};

export const DICTS: Record<Lang, Dict> = { en, et };

export const I18nContext = createContext<{ lang: Lang; t: Dict }>({ lang: 'en', t: en });
export const useI18n = () => useContext(I18nContext);
