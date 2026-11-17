import type {
  ALSubjectKey,
  SyllabusMasteryStatus,
  SyllabusSubtopicProgress,
} from '../types';

export interface SyllabusSubtopicSeed {
  id: string;
  title: string;
}

export interface SyllabusUnitSeed {
  id: string;
  subject: ALSubjectKey;
  title: string;
  subtopics: SyllabusSubtopicSeed[];
}

export const SYLLABUS_SUBJECT_SINHALA: Record<ALSubjectKey, string> = {
  physics: 'භෞතික විද්යාව',
  combined: 'සංයුක්ත ගණිතය',
  ict: 'තොරතුරු හා සන්නිවේදන තාක්ෂණය',
};

export const SYLLABUS_STATUS_META: Record<
  SyllabusMasteryStatus,
  {
    sinhalaLabel: string;
    englishLabel: string;
    weight: number;
    textClass: string;
    bgClass: string;
    dotColor: string;
  }
> = {
  not_started: {
    sinhalaLabel: 'ආරම්භ කර නැත',
    englishLabel: 'Not Started',
    weight: 0,
    textClass: 'text-slate-500 dark:text-slate-400',
    bgClass:
      'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300',
    dotColor: '#64748b',
  },
  learning: {
    sinhalaLabel: 'ඉගෙන ගනිමින්',
    englishLabel: 'Learning',
    weight: 0.35,
    textClass: 'text-blue-600 dark:text-blue-400',
    bgClass:
      'border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300',
    dotColor: '#2563EB',
  },
  needs_revision: {
    sinhalaLabel: 'නැවත බැලිය යුතුයි',
    englishLabel: 'Needs Revision',
    weight: 0.65,
    textClass: 'text-amber-600 dark:text-amber-400',
    bgClass:
      'border-amber-300 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300',
    dotColor: '#D97706',
  },
  mastered: {
    sinhalaLabel: 'හොඳටම පුළුවන්',
    englishLabel: 'Mastered',
    weight: 1,
    textClass: 'text-emerald-600 dark:text-emerald-400',
    bgClass:
      'border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/35 text-emerald-700 dark:text-emerald-300',
    dotColor: '#059669',
  },
};

export const SYLLABUS_STATUS_ORDER: SyllabusMasteryStatus[] = [
  'not_started',
  'learning',
  'needs_revision',
  'mastered',
];

function makeUnit(
  id: string,
  subject: ALSubjectKey,
  title: string,
  items: string[]
): SyllabusUnitSeed {
  return {
    id,
    subject,
    title,
    subtopics: items.map((itemTitle, idx) => ({
      id: `${id}-s${idx + 1}`,
      title: itemTitle,
    })),
  };
}

export const SYLLABUS_UNITS_TREE: SyllabusUnitSeed[] = [
  // ==========================================
  // Subject 1: Physics (භෞතික විද්යාව)
  // ==========================================
  makeUnit('phy-u1', 'physics', '1. මිනුම් (Measurement)', [
    'භෞතික රාශි හා SI ඒකක',
    'මාන හා මාන විශ්ලේෂණය',
    'මිනුම් උපකරණ (වර්නියර්/මයික්රොමීටර/ගෝලමානය/චල අන්වීක්ෂය)',
    'දෝෂ හා ප්රතිශත දෝෂ',
    'දෛශික හා අදිශ',
  ]),
  makeUnit('phy-u2', 'physics', '2. යාන්ත්ර විද්යාව (Mechanics)', [
    'රේඛීය චලිතය හා චලිත ප්රස්තාර',
    'ප්රක්ෂිප්ත (Projectiles)',
    'සාපේක්ෂ චලිතය',
    'නිව්ටන්ගේ චලිත නියම හා ගම්යතාව',
    'ඝර්ෂණය (Friction)',
    'බල සමතුලිතතාව',
    'කාර්යය ශක්තිය හා ක්ෂමතාව',
    'භ්රමණ චලිතය හා වෘත්ත චලිතය',
    'ද්රවස්ථිතිය (Hydrostatics)',
    'තරල ගති විද්යාව (බර්නූලි නියමය)',
  ]),
  makeUnit('phy-u3', 'physics', '3. දෝලන හා තරංග (Oscillations & Waves)', [
    'සරල අනුවර්තී චලිතය (SHM)',
    'තරංග චලිතය හා ගුණ',
    'ධ්වනි තරංග හා ඩොප්ලර් ආචරණය',
    'ඇදි තන්තු හා වායු කඳන්වල කම්පන',
    'ප්රකාශ විද්යාව (ප්රිස්ම/කාච/ප්රකාශ උපකරණ)',
    'විද්යුත් චුම්බක තරංග',
  ]),
  makeUnit('phy-u4', 'physics', '4. තාප භෞතික විද්යාව (Thermal Physics)', [
    'උෂ්ණත්වමිතිය',
    'ඝන හා ද්රව ප්රසාරණය',
    'වායු නියම හා චාලක අණුක වාදය',
    'තාපමිතිය හා විශිෂ්ට තාප ධාරිතාව',
    'අවස්ථා විපර්යාස ගුප්ත තාපය හා ආර්ද්රතාව',
    'තාප සංක්රාමණය',
    'තාප ගති විද්යාව (පළමු නියමය)',
  ]),
  makeUnit('phy-u5', 'physics', '5. ගුරුත්වාකර්ෂණ ක්ෂේත්ර (Gravitational Field)', [
    'නිව්ටන්ගේ සර්වත්ර ගුරුත්වාකර්ෂණ නියමය',
    'ක්ෂේත්ර තීව්රතාව හා විභවය',
    'ග්රහලෝක චන්ද්රිකා චලිතය හා වියෝග ප්රවේගය',
  ]),
  makeUnit('phy-u6', 'physics', '6. ස්ථිති විද්යුත් ක්ෂේත්ර (Electrostatic Field)', [
    'කූලෝම් නියමය හා ක්ෂේත්ර තීව්රතාව',
    'ගවුස් ප්රමේයය',
    'විද්යුත් විභවය',
    'ධාරිත්රක (Capacitors)',
  ]),
  makeUnit('phy-u7', 'physics', '7. චුම්බක ක්ෂේත්ර (Magnetic Field)', [
    'චුම්බක ස්රාව ඝනත්වය හා බයෝ-සවාට් නියමය',
    'සන්නායක මත චුම්බක බලය',
    'චලිත දඟර ගැල්වනෝමීටරය හා මෝටරය',
    'විද්යුත් චුම්බක ප්රේරණය (ෆැරඩේ/ලෙන්ස්/පරිණාමක)',
  ]),
  makeUnit('phy-u8', 'physics', '8. ධාරා විද්යුතය (Current Electricity)', [
    'ධාරාව ප්රතිරෝධය හා ඕම්ගේ නියමය',
    'කර්චොෆ් නියම',
    'විභවමානය හා වීට්ස්ටන් සේතුව',
    'විද්යුත් ශක්තිය හා ක්ෂමතාව',
  ]),
  makeUnit('phy-u9', 'physics', '9. ඉලෙක්ට්රොනික විද්යාව (Electronics)', [
    'අර්ධ සන්නායක හා P-N දියෝඩ',
    'ට්රාන්සිස්ටර (BJT)',
    'කාරකාත්මක වර්ධක (Op-Amp)',
    'තර්ක ද්වාර (Logic Gates)',
  ]),
  makeUnit(
    'phy-u10',
    'physics',
    '10. පදාර්ථයේ යාන්ත්රික ගුණ (Mechanical Properties of Matter)',
    [
      'ප්රත්යස්ථතාව (හූක්ගේ නියමය/යං මාපාංකය)',
      'දුස්ස්රාවිතාව (ස්ටෝක්ස්/පොයිසෙල්)',
      'පෘෂ්ඨික ආතතිය',
    ]
  ),
  makeUnit('phy-u11', 'physics', '11. පදාර්ථය හා විකිරණය (Matter & Radiation)', [
    'තාප විකිරණය',
    'ප්රකාශ විද්යුත් ආචරණය',
    'X-කිරණ',
    'ඩි බ්රෝග්ලි තරංග ආයාමය',
    'විකිරණශීලතාව හා න්යෂ්ටික භෞතික විද්යාව',
  ]),

  // ==========================================
  // Subject 2: Combined (සංයුක්ත ගණිතය)
  // ==========================================
  makeUnit('cmb-u1', 'combined', 'ශුද්ධ: තාත්වික සංඛ්යා හා බහුපද ශ්රිත', [
    'අසමානතා හා මාපාංක',
    'බහුපද ශ්රිත (ශේෂ/සාධක ප්රමේයය)',
    'වර්ගජ සමීකරණ',
    'භාගික භාග (Partial Fractions)',
    'ප්රස්තාර හා ශ්රිත',
  ]),
  makeUnit('cmb-u2', 'combined', 'ශුද්ධ: සංකරණ, ද්විපද හා ශ්රේණි', [
    'සංකරණ හා සංයෝජන',
    'ද්විපද ප්රසාරණය',
    'ගණිත අභ්යුහනය (Mathematical Induction)',
    'සමාන්තර හා ගුණෝත්තර ශ්රේණි',
  ]),
  makeUnit('cmb-u3', 'combined', 'ශුද්ධ: ත්රිකෝණමිතිය (Trigonometry)', [
    'ත්රිකෝණමිතික සර්වසාම්ය',
    'සාධාරණ විසඳුම්',
    'ප්රතිලෝම ත්රිකෝණමිතික ශ්රිත',
    'ත්රිකෝණ විසඳීම',
  ]),
  makeUnit(
    'cmb-u4',
    'combined',
    'ශුද්ධ: සීමාව හා අවකලනය (Limits & Differentiation)',
    [
      'සීමාව (Limits)',
      'ප්රථම මූලධර්ම හා අවකලන නීති',
      'උපරිම හා අවම',
      'වක්ර ඇඳීම (Curve Sketching)',
    ]
  ),
  makeUnit('cmb-u5', 'combined', 'ශුද්ධ: අනුකලනය (Integration)', [
    'ආදේශ ක්රමය',
    'කොටස් වශයෙන් අනුකලනය',
    'භාගික භාග අනුකලනය',
    'නිශ්චිත අනුකලනය (වර්ගඵලය හා පරිමාව)',
  ]),
  makeUnit('cmb-u6', 'combined', 'ශුද්ධ: ඛණ්ඩාංක ජ්යාමිතිය (Coordinate Geometry)', [
    'සරල රේඛාව (Straight Line)',
    'වෘත්තය (Circle)',
  ]),
  makeUnit('cmb-u7', 'combined', 'ශුද්ධ: දෛශික, සංකීර්ණ සංඛ්යා හා න්යාස', [
    'දෛශික (තිත් හා කතිර ගුණිතය)',
    'සංකීර්ණ සංඛ්යා (ආගන්ඩ් සටහන/ඩි මෝවර් ප්රමේයය)',
    'න්යාස හා නිශ්චායක',
  ]),
  makeUnit('cmb-u8', 'combined', 'ව්යවහාරික: චාලක විද්යාව (Kinematics)', [
    'සරල රේඛීය චලිතය හා ප්රස්තාර',
    'ප්රක්ෂිප්ත (Projectiles)',
    'සාපේක්ෂ ප්රවේගය (Relative Velocity)',
  ]),
  makeUnit('cmb-u9', 'combined', 'ව්යවහාරික: ගති විද්යාව (Dynamics)', [
    'නිව්ටන්ගේ චලිත නියම',
    'ආවේගය හා ගැටුම් (Collisions)',
    'කාර්යය ශක්තිය හා ක්ෂමතාව',
    'වෘත්ත චලිතය',
    'සරල අනුවර්තී චලිතය (SHM)',
  ]),
  makeUnit('cmb-u10', 'combined', 'ව්යවහාරික: ස්ථිති විද්යාව (Statics)', [
    'බල සමතුලිතතාව හා ලැමීගේ ප්රමේයය',
    'ඝූර්ණ (Moments)',
    'ඝර්ෂණය (Friction)',
    'දඬු සැකිලි (Frameworks)',
    'ගුරුත්ව කේන්ද්රය',
  ]),
  makeUnit('cmb-u11', 'combined', 'ව්යවහාරික: සම්භාවිතාව හා සංඛ්යානය', [
    'සම්භාවිතාව හා බේස් ප්රමේයය',
    'සංඛ්යානය (මධ්යන්යය/විචලතාව/සම්මත අපගමනය)',
  ]),

  // ==========================================
  // Subject 3: ICT (තොරතුරු හා සන්නිවේදන තාක්ෂණය)
  // ==========================================
  makeUnit('ict-u1', 'ict', '1. ICT මූලික සංකල්ප', [
    'දත්ත හා තොරතුරු',
    'දත්ත සැකසුම් චක්රය',
    'Cloud Computing',
  ]),
  makeUnit('ict-u2', 'ict', '2. පරිගණක නිර්මිතය', [
    'පරිගණක පරම්පරා',
    'Von Neumann නිර්මිතය',
    'මතක ධූරාවලිය (Registers/Cache/RAM)',
  ]),
  makeUnit('ict-u3', 'ict', '3. දත්ත නිරූපණය', [
    'සංඛ්යා පද්ධති (Binary/Octal/Hex)',
    "දෙකේ අනුපූරකය (2's Complement)",
    'ASCII හා Unicode',
  ]),
  makeUnit('ict-u4', 'ict', '4. තර්ක ද්වාර හා බූලියානු වීජ ගණිතය', [
    'සත්යතා වගු',
    'K-Maps',
    'Adders හා Flip-Flops',
  ]),
  makeUnit('ict-u5', 'ict', '5. මෙහෙයුම් පද්ධති (OS)', [
    'ක්රියාවලි කළමනාකරණය (Process States/PCB)',
    'මතක කළමනාකරණය (Paging/Virtual Memory)',
    'ගොනු පද්ධති',
  ]),
  makeUnit('ict-u6', 'ict', '6. දත්ත සන්නිවේදනය හා ජාලකරණය', [
    'OSI හා TCP/IP ආකෘති',
    'IP ලිපිනකරණය (Subnetting)',
    'ජාල උපාංග',
    'DNS/DHCP හා ජාල ආරක්ෂාව',
  ]),
  makeUnit('ict-u7', 'ict', '7. පද්ධති විශ්ලේෂණය හා පිරිසැලසුම්කරණය (SDLC)', [
    'SDLC ආකෘති (Waterfall/Agile)',
    'DFD සටහන්',
    'පද්ධති පරීක්ෂාව',
  ]),
  makeUnit('ict-u8', 'ict', '8. දත්ත සමුදා කළමනාකරණය (DBMS)', [
    'ER සටහන්',
    'ප්රමතකරණය (1NF/2NF/3NF)',
    'SQL විධාන',
  ]),
  makeUnit('ict-u9', 'ict', '9. ක්රමලේඛනය (Python)', [
    'ගැලීම් සටහන් හා ව්යාජ කේත',
    'Python දත්ත ව්යුහ (Lists/Tuples/Dictionaries)',
    'ශ්රිත හා ගොනු හැසිරවීම',
  ]),
  makeUnit('ict-u10', 'ict', '10. වෙබ් අඩවි සංවර්ධනය', [
    'HTML',
    'CSS',
    'JavaScript',
    'PHP හා MySQL',
  ]),
  makeUnit('ict-u11', 'ict', '11–13. IoT, E-Commerce හා නව ප්රවණතා', [
    'IoT සංවේදක හා ක්රියාකාරක',
    'E-Commerce (B2B/B2C/Payment Gateways)',
    'AI / Blockchain / Quantum Computing',
  ]),
];

export interface ResolvedSubtopicItem {
  id: string;
  unitId: string;
  subject: ALSubjectKey;
  title: string;
  isCustom: boolean;
  status: SyllabusMasteryStatus;
  confidence: 1 | 2 | 3 | 4 | 5;
  revisionCount: number;
  lastRevisedAt?: string;
  note?: string;
  updatedAt?: string;
}

export function getMergedUnitSubtopics(
  unit: SyllabusUnitSeed,
  progressMap: Record<string, SyllabusSubtopicProgress>
): ResolvedSubtopicItem[] {
  const seeded: ResolvedSubtopicItem[] = unit.subtopics.map((seed) => {
    const saved = progressMap[seed.id];
    return {
      id: seed.id,
      unitId: unit.id,
      subject: unit.subject,
      title: seed.title,
      isCustom: false,
      status: saved?.status || 'not_started',
      confidence: saved?.confidence || 1,
      revisionCount: saved?.revisionCount || 0,
      lastRevisedAt: saved?.lastRevisedAt,
      note: saved?.note,
      updatedAt: saved?.updatedAt,
    };
  });

  const custom: ResolvedSubtopicItem[] = Object.values(progressMap)
    .filter(
      (entry) => entry.isCustom && !entry.deleted && entry.unitId === unit.id
    )
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((entry) => ({
      id: entry.id,
      unitId: entry.unitId,
      subject: entry.subject,
      title: entry.title,
      isCustom: true,
      status: entry.status || 'not_started',
      confidence: entry.confidence || 1,
      revisionCount: entry.revisionCount || 0,
      lastRevisedAt: entry.lastRevisedAt,
      note: entry.note,
      updatedAt: entry.updatedAt,
    }));

  return [...seeded, ...custom];
}

export interface SyllabusProgressSummary {
  total: number;
  mastered: number;
  needsRevision: number;
  learning: number;
  notStarted: number;
  totalRevisions: number;
  masteryPct: number;
}

export function computeSubtopicsSummary(
  items: ResolvedSubtopicItem[]
): SyllabusProgressSummary {
  let mastered = 0;
  let needsRevision = 0;
  let learning = 0;
  let notStarted = 0;
  let totalRevisions = 0;
  let weightedSum = 0;

  for (const item of items) {
    totalRevisions += item.revisionCount;
    weightedSum += SYLLABUS_STATUS_META[item.status].weight;
    if (item.status === 'mastered') mastered += 1;
    else if (item.status === 'needs_revision') needsRevision += 1;
    else if (item.status === 'learning') learning += 1;
    else notStarted += 1;
  }

  const total = items.length;
  const masteryPct = total > 0 ? Math.round((weightedSum / total) * 100) : 0;

  return {
    total,
    mastered,
    needsRevision,
    learning,
    notStarted,
    totalRevisions,
    masteryPct,
  };
}

export function computeSubjectSyllabusSummary(
  subject: ALSubjectKey,
  progressMap: Record<string, SyllabusSubtopicProgress>
): SyllabusProgressSummary {
  const units = SYLLABUS_UNITS_TREE.filter((u) => u.subject === subject);
  const allItems = units.flatMap((u) => getMergedUnitSubtopics(u, progressMap));
  return computeSubtopicsSummary(allItems);
}

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export function isDueForReview(lastRevisedAt?: string): boolean {
  if (!lastRevisedAt) return false;
  const ts = new Date(lastRevisedAt).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts > FOURTEEN_DAYS_MS;
}

export function formatLastRevisedShort(iso?: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
