import type { LifeArea } from './areas.js';

/**
 * Which life area a chat question is about, from keywords — English plus
 * romanised and native-script Hindi and Bengali (the app's biggest
 * languages), and a few words from the others. Null when nothing matches;
 * callers treat that as 'overall'. Cheap and deterministic, so it runs on
 * every message without an extra model call.
 */
const AREA_PATTERNS: Array<[LifeArea, RegExp]> = [
  [
    'career',
    /\b(career|job|jobs|work|office|promotion|boss|profession|employ\w*|naukri\w*|nokri\w*|chakri\w*|kaaj\w*|kaam|salary hike|interview|resign\w*)\b|नौकरी|करियर|पदोन्नति|চাকরি|কর্মজীবন|কাজ|வேலை|ఉద్యోగ|નોકરી/i,
  ],
  [
    'relationships',
    /\b(marriage|marry|married|wedding|spouse|husband|wife|partner|love|relationship|boyfriend|girlfriend|shaadi\w*|shadi\w*|vivah\w*|biye\w*|bie|prem\w*|pyaar|pyar)\b|शादी|विवाह|प्रेम|रिश्ते|বিয়ে|বিবাহ|প্রেম|সম্পর্ক|திருமண|పెళ్లి|લગ્ન/i,
  ],
  [
    'money',
    /\b(money|finance|financial|wealth|income|salary|loan|debt|invest\w*|stock|savings|paisa|paise|dhan|taka\w*|rich)\b|पैसा|धन|आय|कर्ज|টাকা|অর্থ|ধন|ঋণ|பணம்|డబ్బు|પૈસા/i,
  ],
  [
    'health',
    /\b(health|illness|ill|sick|disease|surgery|hospital|pain|anxiety|stress|sehat|swasthya|shorir|sharir)\b|स्वास्थ्य|सेहत|बीमारी|স্বাস্থ্য|অসুখ|ஆரோக்கிய|ఆరోగ్య|આરોગ્ય/i,
  ],
  [
    'education',
    /\b(study|studies|exam|exams|education|college|university|degree|school|result|padhai|porashona\w*|pariksha\w*)\b|पढ़ाई|परीक्षा|शिक्षा|পড়াশোনা|পরীক্ষা|শিক্ষা|படிப்பு|చదువు|અભ્યાસ/i,
  ],
  [
    'business',
    /\b(business|startup|company|shop|venture|entrepreneur\w*|launch|vyapar\w*|byabsa\w*|byabosa\w*|dhandha)\b|व्यापार|व्यवसाय|धंधा|ব্যবসা|வணிக|వ్యాపార|વ્યવસાય|ધંધો/i,
  ],
  [
    'relocation',
    /\b(abroad|foreign|relocat\w*|move to|settle|visa|immigra\w*|videsh\w*|bidesh\w*|overseas)\b|विदेश|बिदेश|বিদেশ|வெளிநாடு|విదేశ|વિદેશ/i,
  ],
  [
    'family',
    /\b(family|mother|father|parents|child|children|son|daughter|baby|home|house|property|parivar|poribar\w*|maa|baba)\b|परिवार|माता|पिता|संतान|घर|পরিবার|মা|বাবা|সন্তান|বাড়ি|குடும்ப|కుటుంబ|પરિવાર/i,
  ],
];

export function classifyQuestionArea(text: string): LifeArea | null {
  for (const [area, re] of AREA_PATTERNS) if (re.test(text)) return area;
  return null;
}
