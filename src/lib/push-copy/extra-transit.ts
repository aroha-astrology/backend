/**
 * Transit-alert and fact-nudge fallback copy for the eight languages the server had no copy for. The planet
 * and sign names are keyed by the engine's English names, like PLANET_NAMES / SIGN_NAMES in
 * modules/cron/transit-copy-fallback.ts; the templates use the same {planet} {sign} {date} placeholders.
 * Used when `lang.pushAll` is on.
 */

import type { ExtraPushLang } from '../push-lang.js';

export const EXTRA_PLANET_NAMES: Record<ExtraPushLang, Record<string, string>> = {
  kn: { Sun: 'ಸೂರ್ಯ', Mercury: 'ಬುಧ', Venus: 'ಶುಕ್ರ', Mars: 'ಮಂಗಳ', Jupiter: 'ಗುರು', Saturn: 'ಶನಿ', Rahu: 'ರಾಹು', Ketu: 'ಕೇತು' },
  es: { Sun: 'el Sol', Mercury: 'Mercurio', Venus: 'Venus', Mars: 'Marte', Jupiter: 'Júpiter', Saturn: 'Saturno', Rahu: 'Rahu', Ketu: 'Ketu' },
  fr: { Sun: 'le Soleil', Mercury: 'Mercure', Venus: 'Vénus', Mars: 'Mars', Jupiter: 'Jupiter', Saturn: 'Saturne', Rahu: 'Rahu', Ketu: 'Ketu' },
  de: { Sun: 'die Sonne', Mercury: 'Merkur', Venus: 'Venus', Mars: 'Mars', Jupiter: 'Jupiter', Saturn: 'Saturn', Rahu: 'Rahu', Ketu: 'Ketu' },
  pt: { Sun: 'o Sol', Mercury: 'Mercúrio', Venus: 'Vênus', Mars: 'Marte', Jupiter: 'Júpiter', Saturn: 'Saturno', Rahu: 'Rahu', Ketu: 'Ketu' },
  it: { Sun: 'il Sole', Mercury: 'Mercurio', Venus: 'Venere', Mars: 'Marte', Jupiter: 'Giove', Saturn: 'Saturno', Rahu: 'Rahu', Ketu: 'Ketu' },
  ru: { Sun: 'Солнце', Mercury: 'Меркурий', Venus: 'Венера', Mars: 'Марс', Jupiter: 'Юпитер', Saturn: 'Сатурн', Rahu: 'Раху', Ketu: 'Кету' },
  ja: { Sun: '太陽', Mercury: '水星', Venus: '金星', Mars: '火星', Jupiter: '木星', Saturn: '土星', Rahu: 'ラーフ', Ketu: 'ケートゥ' },
};

export const EXTRA_SIGN_NAMES: Record<ExtraPushLang, Record<string, string>> = {
  kn: { Aries: 'ಮೇಷ', Taurus: 'ವೃಷಭ', Gemini: 'ಮಿಥುನ', Cancer: 'ಕರ್ಕಾಟಕ', Leo: 'ಸಿಂಹ', Virgo: 'ಕನ್ಯಾ', Libra: 'ತುಲಾ', Scorpio: 'ವೃಶ್ಚಿಕ', Sagittarius: 'ಧನು', Capricorn: 'ಮಕರ', Aquarius: 'ಕುಂಭ', Pisces: 'ಮೀನ' },
  es: { Aries: 'Aries', Taurus: 'Tauro', Gemini: 'Géminis', Cancer: 'Cáncer', Leo: 'Leo', Virgo: 'Virgo', Libra: 'Libra', Scorpio: 'Escorpio', Sagittarius: 'Sagitario', Capricorn: 'Capricornio', Aquarius: 'Acuario', Pisces: 'Piscis' },
  fr: { Aries: 'Bélier', Taurus: 'Taureau', Gemini: 'Gémeaux', Cancer: 'Cancer', Leo: 'Lion', Virgo: 'Vierge', Libra: 'Balance', Scorpio: 'Scorpion', Sagittarius: 'Sagittaire', Capricorn: 'Capricorne', Aquarius: 'Verseau', Pisces: 'Poissons' },
  de: { Aries: 'Widder', Taurus: 'Stier', Gemini: 'Zwillinge', Cancer: 'Krebs', Leo: 'Löwe', Virgo: 'Jungfrau', Libra: 'Waage', Scorpio: 'Skorpion', Sagittarius: 'Schütze', Capricorn: 'Steinbock', Aquarius: 'Wassermann', Pisces: 'Fische' },
  pt: { Aries: 'Áries', Taurus: 'Touro', Gemini: 'Gêmeos', Cancer: 'Câncer', Leo: 'Leão', Virgo: 'Virgem', Libra: 'Libra', Scorpio: 'Escorpião', Sagittarius: 'Sagitário', Capricorn: 'Capricórnio', Aquarius: 'Aquário', Pisces: 'Peixes' },
  it: { Aries: 'Ariete', Taurus: 'Toro', Gemini: 'Gemelli', Cancer: 'Cancro', Leo: 'Leone', Virgo: 'Vergine', Libra: 'Bilancia', Scorpio: 'Scorpione', Sagittarius: 'Sagittario', Capricorn: 'Capricorno', Aquarius: 'Acquario', Pisces: 'Pesci' },
  ru: { Aries: 'Овен', Taurus: 'Телец', Gemini: 'Близнецы', Cancer: 'Рак', Leo: 'Лев', Virgo: 'Дева', Libra: 'Весы', Scorpio: 'Скорпион', Sagittarius: 'Стрелец', Capricorn: 'Козерог', Aquarius: 'Водолей', Pisces: 'Рыбы' },
  ja: { Aries: '牡羊座', Taurus: '牡牛座', Gemini: '双子座', Cancer: '蟹座', Leo: '獅子座', Virgo: '乙女座', Libra: '天秤座', Scorpio: '蠍座', Sagittarius: '射手座', Capricorn: '山羊座', Aquarius: '水瓶座', Pisces: '魚座' },
};

export interface ExtraTemplate {
  title: string;
  body: string;
}

export type ExtraTransitKind = 'ingress' | 'retrograde' | 'direct';

export const EXTRA_TRANSIT_TEMPLATES: Record<ExtraTransitKind, Record<ExtraPushLang, ExtraTemplate>> = {
  ingress: {
    kn: { title: '🪐 2 ದಿನಗಳಲ್ಲಿ {planet} ರಾಶಿ ಬದಲಿಸುತ್ತದೆ', body: '{date} ರಂದು {planet} {sign} ರಾಶಿಗೆ ಪ್ರವೇಶಿಸುತ್ತದೆ. ಇದು ನಿಮ್ಮ ಜಾತಕದ ಯಾವ ಭಾವದ ಮೇಲೆ ಬೀಳುತ್ತದೆ ಎಂದು ನೋಡಿ.' },
    es: { title: '🪐 {planet} cambia de signo en 2 días', body: '{planet} entra en {sign} el {date}. Abre Aroha para ver en qué parte de tu carta cae.' },
    fr: { title: '🪐 {planet} change de signe dans 2 jours', body: '{planet} entre en {sign} le {date}. Ouvrez Aroha pour voir sur quelle partie de votre thème il tombe.' },
    de: { title: '🪐 {planet} wechselt in 2 Tagen das Zeichen', body: '{planet} tritt am {date} in {sign} ein. Öffne Aroha, um zu sehen, auf welchen Bereich deines Horoskops das fällt.' },
    pt: { title: '🪐 {planet} muda de signo em 2 dias', body: '{planet} entra em {sign} em {date}. Abra a Aroha para ver em que parte do seu mapa isso cai.' },
    it: { title: '🪐 {planet} cambia segno tra 2 giorni', body: '{planet} entra in {sign} il {date}. Apri Aroha per vedere su quale parte del tuo tema cade.' },
    ru: { title: '🪐 Через 2 дня {planet} меняет знак', body: '{date} {planet} входит в знак {sign}. Откройте Aroha, чтобы увидеть, на какую часть вашей карты это падает.' },
    ja: { title: '🪐 2日後に{planet}がサインを移ります', body: '{date}に{planet}が{sign}に入ります。あなたのチャートのどの部分に当たるか、Arohaで確かめましょう。' },
  },
  retrograde: {
    kn: { title: '↩️ 2 ದಿನಗಳಲ್ಲಿ {planet} ವಕ್ರಿಯಾಗುತ್ತದೆ', body: '{date} ರಂದು {planet} {sign} ರಾಶಿಯಲ್ಲಿ ವಕ್ರಿಯಾಗುತ್ತದೆ. ಈಗ ಯಾವುದನ್ನು ಮುಂದೂಡಬೇಕು ಎಂದು ನೋಡಿ.' },
    es: { title: '↩️ {planet} se vuelve retrógrado en 2 días', body: '{planet} inicia su retrogradación en {sign} el {date}. Abre Aroha para ver qué conviene aplazar.' },
    fr: { title: '↩️ {planet} devient rétrograde dans 2 jours', body: '{planet} devient rétrograde en {sign} le {date}. Ouvrez Aroha pour voir ce qu’il vaut mieux repousser.' },
    de: { title: '↩️ {planet} wird in 2 Tagen rückläufig', body: '{planet} wird am {date} in {sign} rückläufig. Öffne Aroha, um zu sehen, was du aufschieben solltest.' },
    pt: { title: '↩️ {planet} fica retrógrado em 2 dias', body: '{planet} fica retrógrado em {sign} em {date}. Abra a Aroha para ver o que convém adiar.' },
    it: { title: '↩️ {planet} diventa retrogrado tra 2 giorni', body: '{planet} diventa retrogrado in {sign} il {date}. Apri Aroha per vedere cosa conviene rimandare.' },
    ru: { title: '↩️ Через 2 дня {planet} становится ретроградным', body: '{date} {planet} становится ретроградным в знаке {sign}. Откройте Aroha, чтобы увидеть, что лучше отложить.' },
    ja: { title: '↩️ 2日後に{planet}が逆行に入ります', body: '{date}に{planet}が{sign}で逆行します。今は何を見送るのがよいか、Arohaで確かめましょう。' },
  },
  direct: {
    kn: { title: '▶️ 2 ದಿನಗಳಲ್ಲಿ {planet} ಮಾರ್ಗಿಯಾಗುತ್ತದೆ', body: '{date} ರಂದು {planet} {sign} ರಾಶಿಯಲ್ಲಿ ಮಾರ್ಗಿಯಾಗುತ್ತದೆ. ಯಾವುದು ಮತ್ತೆ ಚಲಿಸಲು ಆರಂಭಿಸುತ್ತದೆ ಎಂದು ನೋಡಿ.' },
    es: { title: '▶️ {planet} vuelve a directo en 2 días', body: '{planet} vuelve a directo en {sign} el {date}. Abre Aroha para ver qué vuelve a ponerse en marcha.' },
    fr: { title: '▶️ {planet} redevient direct dans 2 jours', body: '{planet} redevient direct en {sign} le {date}. Ouvrez Aroha pour voir ce qui se remet en mouvement.' },
    de: { title: '▶️ {planet} wird in 2 Tagen wieder rechtläufig', body: '{planet} wird am {date} in {sign} wieder rechtläufig. Öffne Aroha, um zu sehen, was wieder in Bewegung kommt.' },
    pt: { title: '▶️ {planet} volta a direto em 2 dias', body: '{planet} volta a direto em {sign} em {date}. Abra a Aroha para ver o que volta a andar.' },
    it: { title: '▶️ {planet} torna diretto tra 2 giorni', body: '{planet} torna diretto in {sign} il {date}. Apri Aroha per vedere cosa torna a muoversi.' },
    ru: { title: '▶️ Через 2 дня {planet} становится прямым', body: '{date} {planet} становится прямым в знаке {sign}. Откройте Aroha, чтобы увидеть, что снова сдвинется с места.' },
    ja: { title: '▶️ 2日後に{planet}が順行に戻ります', body: '{date}に{planet}が{sign}で順行に戻ります。何が再び動き出すか、Arohaで確かめましょう。' },
  },
};

export type ExtraNudgeTier = 'window' | 'followup';

export const EXTRA_NUDGE_FALLBACK: Record<ExtraPushLang, Record<ExtraNudgeTier, ExtraTemplate>> = {
  kn: {
    window: { title: 'ನಿಮ್ಮ ಕಾಲಾವಧಿ ಹತ್ತಿರವಾಗುತ್ತಿದೆ', body: 'ನಿಮಗೆ ಹೇಳಲಾದ ಒಂದು ಕಾಲಾವಧಿ ಶೀಘ್ರದಲ್ಲೇ ಬರುತ್ತಿದೆ. ಪರಿಶೀಲಿಸಲು Aroha ತೆರೆಯಿರಿ.' },
    followup: { title: 'ನಿಲ್ಲಿಸಿದ ಜಾಗದಿಂದ ಮುಂದುವರಿಸಿ', body: 'Aroha ಗೆ ನಿಮಗಾಗಿ ಒಂದು ಚಿಕ್ಕ ಪ್ರಶ್ನೆ ಇದೆ. ಮುಂದುವರಿಸಲು ಟ್ಯಾಪ್ ಮಾಡಿ.' },
  },
  es: {
    window: { title: 'Tu ventana de tiempo se acerca', body: 'Se acerca un período del que te hablamos. Abre Aroha para revisarlo.' },
    followup: { title: 'Retoma donde lo dejaste', body: 'Aroha tiene una pregunta rápida para ti. Toca para continuar.' },
  },
  fr: {
    window: { title: 'Votre période approche', body: 'Une période dont on vous a parlé approche. Ouvrez Aroha pour la revoir.' },
    followup: { title: 'Reprenez là où vous vous étiez arrêté', body: 'Aroha a une petite question pour vous. Touchez pour continuer.' },
  },
  de: {
    window: { title: 'Dein Zeitfenster rückt näher', body: 'Ein Zeitraum, von dem wir dir erzählt haben, steht bevor. Öffne Aroha, um ihn anzusehen.' },
    followup: { title: 'Mach da weiter, wo du aufgehört hast', body: 'Aroha hat eine kurze Frage an dich. Tippe, um fortzufahren.' },
  },
  pt: {
    window: { title: 'Sua janela de tempo está chegando', body: 'Um período sobre o qual falamos com você está chegando. Abra a Aroha para rever.' },
    followup: { title: 'Continue de onde parou', body: 'A Aroha tem uma pergunta rápida para você. Toque para continuar.' },
  },
  it: {
    window: { title: 'La tua finestra di tempo si avvicina', body: 'Si avvicina un periodo di cui ti avevamo parlato. Apri Aroha per rivederlo.' },
    followup: { title: 'Riprendi da dove avevi lasciato', body: 'Aroha ha una domanda veloce per te. Tocca per continuare.' },
  },
  ru: {
    window: { title: 'Ваше окно времени приближается', body: 'Приближается период, о котором вам говорили. Откройте Aroha, чтобы посмотреть.' },
    followup: { title: 'Продолжите с того же места', body: 'У Aroha есть к вам короткий вопрос. Нажмите, чтобы продолжить.' },
  },
  ja: {
    window: { title: 'お知らせしていた時期が近づいています', body: 'お伝えしていた時期がまもなく来ます。Arohaを開いて確認しましょう。' },
    followup: { title: '前回の続きからどうぞ', body: 'Arohaからあなたに短い質問があります。タップして続けましょう。' },
  },
};
