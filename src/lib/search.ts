/**
 * Advanced search utility for catalog items (electrical domain).
 * 
 * Features:
 * - Tokenized multi-word search with intelligent ranking
 * - Russian morphological normalization (stemming-like)
 * - Stop words filtering (prepositions, conjunctions)
 * - Number extraction and matching (e.g. "2.5" matches "0,5-2,5 мм²")
 * - Trigram fuzzy matching for typo tolerance
 * - Synonym/alias expansion for electrical terms
 * - Category name matching
 * - Relevance scoring (name match > description match, exact > partial)
 * - Safe regex escaping for highlight function
 */

/**
 * Russian stop words — prepositions, conjunctions, particles.
 * These are filtered out from search queries because they carry no semantic meaning
 * and often cause false negatives.
 */
const STOP_WORDS = new Set([
  'с', 'в', 'на', 'по', 'и', 'к', 'о', 'у', 'за', 'из', 'от',
  'до', 'для', 'без', 'под', 'над', 'при', 'через', 'а', 'но',
  'или', 'не', 'же', 'бы', 'ли', 'уже', 'ещё', 'так', 'как',
  'что', 'это', 'то', 'все', 'он', 'она', 'они', 'мы', 'вы',
]);

/**
 * Common Russian suffixes for basic stemming normalization.
 */
const RU_SUFFIXES = [
  'ого', 'ому', 'ыми', 'ими', 'ость', 'ости', 'остью',
  'ами', 'ями',
  'ая',  'ее',  'ие',  'ий',  'им',  'их',  'ую',  'юю',
  'ое',  'ые',  'ый',  'ым',  'их',
  'ов',  'ев',  'ей',  'ий',  'ый',  'ой',
  'ам',  'ям',  'ах',  'ях',  'ом',  'ем',
  'а',   'е',   'и',   'о',   'у',   'ы',  'ю',  'ь',
];

/**
 * Known synonym/alias mappings for common ELECTRICAL terms.
 * Maps a normalized stem to alternative forms that should also match.
 */
const SYNONYMS: Record<string, string[]> = {
  'кабел':   ['кабеля', 'кабелю', 'кабелем', 'кабели'],
  'провод':  ['провода', 'проводу', 'проводом', 'проводы'],
  'розетк':  ['розетки', 'розетку', 'розеткой', 'розетка'],
  'выключ':  ['выключатель', 'выключателя', 'выключателю', 'выключатели', 'выключателем'],
  'переклю': ['переключатель', 'переключателя', 'переключатели'],
  'щит':     ['щита', 'щиту', 'щитом', 'щиты', 'щиток', 'щитка'],
  'бокс':    ['бокса', 'боксу', 'боксом', 'боксы'],
  'авр':     ['авра', 'авру', 'авром'],
  'узо':     ['узо', 'устройство защитного отключения'],
  'счёт':    ['счетчик', 'счетчика', 'счетчику', 'счетчики'],
  'дифав':   ['дифавтомат', 'дифавтомата', 'дифавтоматы'],
  'автом':   ['автомат', 'автомата', 'автомату', 'автоматы', 'автоматом'],
  'контак':  ['контактор', 'контактора', 'контакторы', 'контактором', 'пускатель', 'магнитный'],
  'рубиль':  ['рубильника', 'рубильнику', 'рубильником', 'рубильники'],
  'транс':   ['трансформатор', 'трансформатора', 'трансформаторы'],
  'реле':    ['реле', 'релею'],
  'диммер':  ['диммера', 'диммеру', 'диммеры', 'светорегулятор'],
  'светиль': ['светильника', 'светильнику', 'светильники', 'светильником'],
  'люстр':   ['люстра', 'люстры', 'люстру', 'люстрой'],
  'бра':     ['бра', 'бры'],
  'штроб':   ['штроба', 'штробы', 'штробу', 'штробой', 'штробление'],
  'гофр':    ['гофра', 'гофры', 'гофру', 'гофрой', 'гофрированная'],
  'труб':    ['труба', 'трубы', 'трубу', 'трубой'],
  'лотк':    ['лотка', 'лотку', 'лотком', 'лотки'],
  'канал':   ['канала', 'каналу', 'каналом', 'каналы'],
  'гильз':   ['гильза', 'гильзы', 'гильзу', 'гильзой', 'гильзование'],
  'зазем':   ['заземление', 'заземления', 'заземлением', 'заземлитель', 'контур'],
  'короб':   ['коробка', 'коробки', 'коробку', 'коробкой'],
  'распая':  ['распаячная', 'распаячной', 'распаячных'],
  'расключ': ['расключение', 'расключения', 'расключением'],
  'подроз':  ['подрозетник', 'подрозетника', 'подрозетники'],
  'вилк':    ['вилка', 'вилки', 'вилку', 'вилкой'],
  'опресс':  ['опрессовка', 'опрессовки', 'опрессовкой', 'пайка'],
  'сип':     ['сипа', 'сипу', 'сипом'],
  'ретро':   ['ретро', 'ретро-'],
  'слабот':  ['слаботочная', 'слаботочные', 'слаботочных', 'интернет', 'тв', 'телевидение', 'видеонаблюдение'],
  'прожект': ['прожектор', 'прожектора', 'прожекторы', 'кобра'],
  'вентил':  ['вентилятор', 'вентилятора', 'вентиляторы'],
  'стабил':  ['стабилизатор', 'стабилизатора', 'стабилизаторы'],
  'кроншт':  ['кронштейн', 'кронштейна', 'кронштейны'],
  'маркир':  ['маркировка', 'маркировки', 'маркировкой'],
  'шин':     ['шина', 'шины', 'шину', 'шиной', 'шинопровод'],
  'предохра': ['предохранитель', 'предохранителя', 'предохранители'],
  'сервопр': ['сервопривод', 'сервопривода', 'сервоприводы'],
  'термор':  ['терморегулятор', 'терморегулятора', 'терморегуляторы', 'термостат', 'реостат'],
  'акваст':  ['аквасторож', 'аквасторожа'],
  'частот':  ['частотник', 'частотника', 'частотники', 'преобразователь'],
  'лента':   ['ленты', 'ленту', 'светодиодная', 'led', 'rgb'],
  'счет':    ['счётчик', 'счетчик', 'электрический'],
  'огран':   ['ограничитель', 'ом', 'мощности'],
  'неиспр':  ['неисправность', 'поиск', 'скрытой', 'проводки', 'диагностика'],
  'проект':  ['проект-схема', 'схема', 'монтажа', 'электропроводки', 'чертеж'],
  'смет':    ['смета', 'сметная', 'стоимость', 'расчет'],
  'фаз':     ['фаза', 'фазный', 'фазное', 'реле контроля фаз', 'ркф', 'ркн'],
  'лунк':    ['лунка', 'лунки', 'высверливание', 'вырез'],
  'ниш':     ['ниша', 'ниши', 'выборка'],
  'магистр': ['магистраль', 'магистрали'],
  'фасад':   ['фасадный', 'фасада', 'крепёж'],
  'крюк':    ['крюка', 'крюку', 'крюком'],
  'точе':    ['точечный', 'точечные', 'точечного'],
  'трек':    ['трековый', 'трековая', 'трековые', 'рейка'],
  'армстр':  ['армстронг', 'armstrong'],
  'фотор':   ['фотореле', 'фото реле'],
};

/**
 * Normalize a Russian word by stripping common suffixes.
 */
function stemWord(word: string): string {
  let result = word.toLowerCase();
  
  for (const suffix of RU_SUFFIXES) {
    if (result.endsWith(suffix) && result.length - suffix.length >= 3) {
      result = result.slice(0, -suffix.length);
      break;
    }
  }
  
  return result;
}

/**
 * Extract all numbers from a string.
 * Handles both comma and dot as decimal separators.
 * E.g. "0,5-2,5 мм²" → [0.5, 2.5], "16 мм²" → [16]
 */
function extractNumbers(text: string): number[] {
  // First try integer numbers
  const intMatches = text.match(/\d+/g);
  if (!intMatches) return [];
  return intMatches.map(Number);
}

/**
 * Generate character trigrams from a word for fuzzy matching.
 */
function getTrigrams(word: string): string[] {
  if (word.length < 3) return [word];
  const trigrams: string[] = [];
  for (let i = 0; i <= word.length - 3; i++) {
    trigrams.push(word.slice(i, i + 3));
  }
  return trigrams;
}

/**
 * Calculate trigram similarity between two strings (0 to 1).
 */
function trigramSimilarity(a: string, b: string): number {
  const triA = new Set(getTrigrams(a));
  const triB = new Set(getTrigrams(b));
  
  if (triA.size === 0 && triB.size === 0) return 0;
  
  let intersection = 0;
  for (const t of triA) {
    if (triB.has(t)) intersection++;
  }
  
  const union = triA.size + triB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Tokenize a search query into individual search tokens.
 * Handles stop words removal, number extraction, stemming.
 */
export function tokenizeQuery(query: string): {
  stems: string[];
  numbers: number[];
  rawTokens: string[];
} {
  const trimmed = query.toLowerCase().trim();
  if (!trimmed) return { stems: [], numbers: [], rawTokens: [] };

  const rawTokens = trimmed.split(/\s+/).filter(Boolean);
  const stems: string[] = [];
  const numbers: number[] = [];
  const seenStems = new Set<string>();

  for (const token of rawTokens) {
    if (STOP_WORDS.has(token)) continue;

    const nums = token.match(/\d+/g);
    if (nums) {
      numbers.push(...nums.map(Number));
    }

    const wordPart = token.replace(/[0-9øØ°№.,]/g, '').trim();
    if (wordPart.length >= 2) {
      const stem = stemWord(wordPart);
      if (!seenStems.has(stem)) {
        stems.push(stem);
        seenStems.add(stem);
      }
    }
  }

  return { stems, numbers, rawTokens };
}

/**
 * Check if a single stem matches any part of the text.
 * Uses direct match, stemming, synonyms, and fuzzy trigram matching.
 */
function stemMatchesText(stem: string, text: string): boolean {
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes(stem)) return true;
  
  const textWords = lowerText.split(/[\s\-/()Ø°.,;:]+/).filter(Boolean);
  for (const word of textWords) {
    const wordStem = stemWord(word);
    if (wordStem.startsWith(stem) || stem.startsWith(wordStem)) {
      return true;
    }
    if (stem.length >= 4 && wordStem.length >= 4) {
      const similarity = trigramSimilarity(stem, wordStem);
      if (similarity >= 0.6) return true;
    }
  }
  
  for (const [key, aliases] of Object.entries(SYNONYMS)) {
    const keyMatches = stem === key || stem.startsWith(key) || key.startsWith(stem);
    if (keyMatches) {
      if (lowerText.includes(key)) return true;
      for (const alias of aliases) {
        if (lowerText.includes(alias)) return true;
      }
    }
    for (const alias of aliases) {
      const aliasStem = stemWord(alias);
      if (stem === aliasStem || stem.startsWith(aliasStem) || aliasStem.startsWith(stem)) {
        if (lowerText.includes(key)) return true;
        for (const a of aliases) {
          if (lowerText.includes(a)) return true;
        }
      }
    }
  }

  if (stem.length >= 4) {
    for (const word of textWords) {
      if (word.length >= 4) {
        const similarity = trigramSimilarity(stem, word);
        if (similarity >= 0.55) return true;
      }
    }
  }

  return false;
}

/**
 * Check if a number appears in the text.
 */
function numberMatchesText(num: number, text: string): boolean {
  const textNumbers = extractNumbers(text);
  if (textNumbers.includes(num)) return true;
  
  const numStr = String(num);
  if (text.toLowerCase().includes(numStr)) return true;
  
  return false;
}

/**
 * Calculate match score for a catalog item against tokenized query.
 */
export function matchItem(
  item: { n: string; d: string; catId?: string },
  tokens: { stems: string[]; numbers: number[]; rawTokens: string[] },
  categoryName?: string
): number {
  const { stems, numbers, rawTokens } = tokens;
  
  if (stems.length === 0 && numbers.length === 0) return 1;

  const nameLower = item.n.toLowerCase();
  const descLower = item.d.toLowerCase();
  const catLower = categoryName ? categoryName.toLowerCase() : '';
  
  let nameScore = 0;
  let descScore = 0;
  let nameMatches = 0;
  let descMatches = 0;

  for (const stem of stems) {
    if (stemMatchesText(stem, item.n)) {
      nameMatches++;
      for (const raw of rawTokens) {
        if (nameLower.includes(raw)) {
          nameScore += 2;
        }
      }
      nameScore += 3;
    } else if (stemMatchesText(stem, item.d)) {
      descMatches++;
      descScore += 1;
    } else if (catLower && stemMatchesText(stem, catLower)) {
      descMatches++;
      descScore += 0.5;
    }
  }

  for (const num of numbers) {
    if (numberMatchesText(num, item.n)) {
      nameMatches++;
      nameScore += 4;
    } else if (numberMatchesText(num, item.d)) {
      descMatches++;
      descScore += 2;
    }
  }

  const totalStemsAndNumbers = stems.length + numbers.length;
  const totalMatches = nameMatches + descMatches;
  
  if (totalMatches === 0) return 0;
  
  const matchRatio = totalMatches / totalStemsAndNumbers;
  
  if (matchRatio < 0.3) return 0;

  const baseScore = nameScore * 2 + descScore;
  
  if (matchRatio >= 1.0) {
    return baseScore * 1.5;
  }
  
  return baseScore * matchRatio;
}

/**
 * Escape special regex characters in a string for safe use in RegExp constructor.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get highlight tokens from a search query.
 */
export function getHighlightTokens(query: string): string[] {
  if (!query || query.length < 2) return [];
  
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(t => t.length >= 1);
  const result: string[] = [];
  
  for (const token of tokens) {
    if (STOP_WORDS.has(token)) continue;
    result.push(token);
    const nums = token.match(/\d+/g);
    if (nums) {
      for (const num of nums) {
        if (num.length >= 1 && !result.includes(num)) {
          result.push(num);
        }
      }
    }
  }
  
  return result;
}

/**
 * Build a safe regex pattern from highlight tokens.
 */
export function buildHighlightPattern(tokens: string[]): string | null {
  if (tokens.length === 0) return null;
  const escapedTokens = tokens.map(t => escapeRegex(t));
  return escapedTokens.join('|');
}
