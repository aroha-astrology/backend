/**
 * Copy for the pushes and in-chat lines that are new in Sprint 4, in all 15 languages: the Baba Ji memory
 * check-in and the circle pulse. Written without gendered verbs for the speaker (the guide can be any of
 * the eight personas). No private detail ever goes on a lock screen: the push says that a check-in is
 * waiting, the fact itself is only shown inside the app.
 */

import { fillCopy, type PushLang } from '../push-lang.js';

interface Sprint4Strings {
  memTitle: string;
  memBody: string;
  memOpener: string;
  memGeneric: string;
  glowTitle: string;
  glowBody: string;
  careTitle: string;
  careBody: string;
}

const COPY: Record<PushLang, Sprint4Strings> = {
  en: {
    memTitle: 'Checking in on you',
    memBody: 'You told me about something coming up. How did it go? Your first reply is free.',
    memOpener: 'I remembered what you told me.',
    memGeneric: 'How did it go?',
    glowTitle: "{name}'s day looks bright",
    glowBody: 'A good day to reach out to {name}. Open your circle to see why.',
    careTitle: 'Go gently with {name} today',
    careBody: "Today's Moon sits a little tender between you two. Open your circle for the pulse.",
  },
  hi: {
    memTitle: 'आपका हाल जानना था',
    memBody: 'आपने कुछ आने वाले के बारे में बताया था। वह कैसा रहा? आपका पहला जवाब मुफ़्त है।',
    memOpener: 'आपने जो बताया था, वह मुझे याद है।',
    memGeneric: 'वह कैसा रहा?',
    glowTitle: '{name} का दिन उज्ज्वल दिख रहा है',
    glowBody: '{name} से बात करने का अच्छा दिन है। कारण जानने के लिए अपना सर्कल खोलें।',
    careTitle: 'आज {name} के साथ नरमी रखें',
    careBody: 'आज का चंद्रमा आप दोनों के बीच थोड़ा नाज़ुक है। पल्स देखने के लिए अपना सर्कल खोलें।',
  },
  bn: {
    memTitle: 'আপনার খবর জানতে চাই',
    memBody: 'আপনি সামনে আসা একটি বিষয়ের কথা বলেছিলেন। সেটা কেমন গেল? আপনার প্রথম উত্তর বিনামূল্যে।',
    memOpener: 'আপনি যা বলেছিলেন, আমার মনে আছে।',
    memGeneric: 'কেমন গেল?',
    glowTitle: '{name}-এর দিনটি উজ্জ্বল দেখাচ্ছে',
    glowBody: '{name}-এর সঙ্গে যোগাযোগের ভালো দিন। কারণ দেখতে আপনার সার্কেল খুলুন।',
    careTitle: 'আজ {name}-এর সঙ্গে নরম থাকুন',
    careBody: 'আজকের চাঁদ আপনাদের দুজনের মধ্যে একটু কোমল। পালস দেখতে আপনার সার্কেল খুলুন।',
  },
  mr: {
    memTitle: 'तुमची चौकशी करायची होती',
    memBody: 'तुम्ही पुढे येणाऱ्या गोष्टीबद्दल सांगितलं होतं. ते कसं गेलं? तुमचं पहिलं उत्तर मोफत आहे.',
    memOpener: 'तुम्ही जे सांगितलं होतं ते मला आठवतं.',
    memGeneric: 'ते कसं गेलं?',
    glowTitle: '{name} चा दिवस उजळ दिसतोय',
    glowBody: '{name} शी संपर्क साधण्यासाठी चांगला दिवस. कारण पाहण्यासाठी तुमचं सर्कल उघडा.',
    careTitle: 'आज {name} शी हळुवारपणे वागा',
    careBody: 'आजचा चंद्र तुम्हा दोघांमध्ये थोडा नाजूक आहे. पल्स पाहण्यासाठी तुमचं सर्कल उघडा.',
  },
  te: {
    memTitle: 'మీ యోగక్షేమాలు తెలుసుకోవాలని',
    memBody: 'రాబోయే విషయం గురించి మీరు చెప్పారు. అది ఎలా జరిగింది? మీ మొదటి సమాధానం ఉచితం.',
    memOpener: 'మీరు చెప్పింది నాకు గుర్తుంది.',
    memGeneric: 'అది ఎలా జరిగింది?',
    glowTitle: '{name} రోజు ప్రకాశవంతంగా కనిపిస్తోంది',
    glowBody: '{name}ను సంప్రదించడానికి మంచి రోజు. కారణం చూడటానికి మీ సర్కిల్ తెరవండి.',
    careTitle: 'ఈ రోజు {name}తో మృదువుగా ఉండండి',
    careBody: 'నేటి చంద్రుడు మీ ఇద్దరి మధ్య కొంచెం సున్నితంగా ఉన్నాడు. పల్స్ చూడటానికి మీ సర్కిల్ తెరవండి.',
  },
  ta: {
    memTitle: 'உங்கள் நலம் அறிய விரும்புகிறேன்',
    memBody: 'வரவிருக்கும் ஒன்றைப் பற்றிச் சொன்னீர்கள். அது எப்படி நடந்தது? உங்கள் முதல் பதில் இலவசம்.',
    memOpener: 'நீங்கள் சொன்னது எனக்கு நினைவிருக்கிறது.',
    memGeneric: 'அது எப்படி நடந்தது?',
    glowTitle: '{name} அவர்களின் நாள் பிரகாசமாகத் தெரிகிறது',
    glowBody: '{name} அவர்களைத் தொடர்பு கொள்ள நல்ல நாள். காரணம் அறிய உங்கள் வட்டத்தைத் திறக்கவும்.',
    careTitle: 'இன்று {name} உடன் மென்மையாக இருங்கள்',
    careBody: 'இன்றைய சந்திரன் உங்கள் இருவருக்கும் இடையே சற்று மென்மையாக உள்ளது. துடிப்பைக் காண உங்கள் வட்டத்தைத் திறக்கவும்.',
  },
  gu: {
    memTitle: 'તમારા ખબર-અંતર પૂછવા હતા',
    memBody: 'તમે આવનારી એક વાત કહી હતી. તે કેવી રહી? તમારો પહેલો જવાબ મફત છે.',
    memOpener: 'તમે જે કહ્યું હતું તે મને યાદ છે.',
    memGeneric: 'તે કેવું રહ્યું?',
    glowTitle: '{name}નો દિવસ ઉજ્જવળ લાગે છે',
    glowBody: '{name}નો સંપર્ક કરવા માટે સારો દિવસ. કારણ જોવા તમારું સર્કલ ખોલો.',
    careTitle: 'આજે {name} સાથે નમ્રતાથી વર્તો',
    careBody: 'આજનો ચંદ્ર તમારા બંને વચ્ચે થોડો નાજુક છે. પલ્સ જોવા તમારું સર્કલ ખોલો.',
  },
  kn: {
    memTitle: 'ನಿಮ್ಮ ಯೋಗಕ್ಷೇಮ ವಿಚಾರಿಸಬೇಕಿತ್ತು',
    memBody: 'ಬರಲಿರುವ ಒಂದು ವಿಷಯದ ಬಗ್ಗೆ ನೀವು ಹೇಳಿದ್ದಿರಿ. ಅದು ಹೇಗೆ ನಡೆಯಿತು? ನಿಮ್ಮ ಮೊದಲ ಉತ್ತರ ಉಚಿತ.',
    memOpener: 'ನೀವು ಹೇಳಿದ್ದು ನನಗೆ ನೆನಪಿದೆ.',
    memGeneric: 'ಅದು ಹೇಗೆ ನಡೆಯಿತು?',
    glowTitle: '{name} ಅವರ ದಿನ ಪ್ರಕಾಶಮಾನವಾಗಿ ಕಾಣುತ್ತಿದೆ',
    glowBody: '{name} ಅವರನ್ನು ಸಂಪರ್ಕಿಸಲು ಒಳ್ಳೆಯ ದಿನ. ಕಾರಣ ನೋಡಲು ನಿಮ್ಮ ವೃತ್ತವನ್ನು ತೆರೆಯಿರಿ.',
    careTitle: 'ಇಂದು {name} ಜೊತೆ ಮೃದುವಾಗಿರಿ',
    careBody: 'ಇಂದಿನ ಚಂದ್ರ ನಿಮ್ಮಿಬ್ಬರ ನಡುವೆ ಸ್ವಲ್ಪ ಸೂಕ್ಷ್ಮವಾಗಿದೆ. ನಾಡಿಮಿಡಿತ ನೋಡಲು ನಿಮ್ಮ ವೃತ್ತವನ್ನು ತೆರೆಯಿರಿ.',
  },
  es: {
    memTitle: 'Quería saber de ti',
    memBody: 'Me hablaste de algo que se acercaba. ¿Cómo te fue? Tu primera respuesta es gratis.',
    memOpener: 'Recordé lo que me contaste.',
    memGeneric: '¿Cómo te fue?',
    glowTitle: 'El día de {name} se ve brillante',
    glowBody: 'Buen día para escribirle a {name}. Abre tu círculo para ver por qué.',
    careTitle: 'Ve con calma con {name} hoy',
    careBody: 'La Luna de hoy está algo sensible entre ustedes dos. Abre tu círculo para ver el pulso.',
  },
  fr: {
    memTitle: 'Je prends de vos nouvelles',
    memBody: 'Vous m’aviez parlé de quelque chose à venir. Comment cela s’est-il passé ? Votre première réponse est gratuite.',
    memOpener: 'Je repense à ce que vous m’avez dit.',
    memGeneric: 'Comment cela s’est-il passé ?',
    glowTitle: 'La journée de {name} s’annonce lumineuse',
    glowBody: 'Une bonne journée pour contacter {name}. Ouvrez votre cercle pour voir pourquoi.',
    careTitle: 'Allez-y doucement avec {name} aujourd’hui',
    careBody: 'La Lune du jour est un peu sensible entre vous deux. Ouvrez votre cercle pour voir le pouls.',
  },
  de: {
    memTitle: 'Ich melde mich bei dir',
    memBody: 'Du hast mir von etwas erzählt, das bevorstand. Wie ist es gelaufen? Deine erste Antwort ist kostenlos.',
    memOpener: 'Ich habe an das gedacht, was du mir erzählt hast.',
    memGeneric: 'Wie ist es gelaufen?',
    glowTitle: 'Der Tag von {name} sieht hell aus',
    glowBody: 'Ein guter Tag, um {name} zu schreiben. Öffne deinen Kreis, um zu sehen, warum.',
    careTitle: 'Geh heute behutsam mit {name} um',
    careBody: 'Der heutige Mond liegt zwischen euch beiden etwas empfindlich. Öffne deinen Kreis für den Puls.',
  },
  pt: {
    memTitle: 'Passando para saber de você',
    memBody: 'Você me contou sobre algo que estava por vir. Como foi? Sua primeira resposta é grátis.',
    memOpener: 'Lembrei do que você me contou.',
    memGeneric: 'Como foi?',
    glowTitle: 'O dia de {name} está brilhante',
    glowBody: 'Um bom dia para falar com {name}. Abra seu círculo para ver o porquê.',
    careTitle: 'Vá com calma com {name} hoje',
    careBody: 'A Lua de hoje está um pouco sensível entre vocês dois. Abra seu círculo para ver o pulso.',
  },
  it: {
    memTitle: 'Ti scrivo per sapere come stai',
    memBody: 'Mi hai parlato di qualcosa che stava per arrivare. Com’è andata? La tua prima risposta è gratis.',
    memOpener: 'Ho ripensato a quello che mi hai detto.',
    memGeneric: 'Com’è andata?',
    glowTitle: 'La giornata di {name} sembra luminosa',
    glowBody: 'Un buon giorno per farti sentire da {name}. Apri il tuo cerchio per scoprire perché.',
    careTitle: 'Oggi vai piano con {name}',
    careBody: 'La Luna di oggi è un po’ delicata tra voi due. Apri il tuo cerchio per vedere il battito.',
  },
  ru: {
    memTitle: 'Хочу узнать, как у вас дела',
    memBody: 'Вы рассказывали о том, что должно было случиться. Как всё прошло? Ваш первый ответ бесплатный.',
    memOpener: 'Я помню то, что вы мне рассказывали.',
    memGeneric: 'Как всё прошло?',
    glowTitle: 'День у {name} выглядит светлым',
    glowBody: 'Хороший день, чтобы написать {name}. Откройте свой круг, чтобы узнать почему.',
    careTitle: 'Сегодня будьте мягче с {name}',
    careBody: 'Сегодняшняя Луна между вами немного уязвима. Откройте свой круг, чтобы увидеть пульс.',
  },
  ja: {
    memTitle: 'その後の様子はいかがですか',
    memBody: '近づいていると話してくれたこと、どうでしたか？最初の返信は無料です。',
    memOpener: 'お話しくださったことを覚えています。',
    memGeneric: 'どうでしたか？',
    glowTitle: '{name}さんの一日は明るそうです',
    glowBody: '{name}さんに連絡するのに良い日です。理由はサークルを開いて確認しましょう。',
    careTitle: '今日は{name}さんにやさしく接しましょう',
    careBody: '今日の月は、お二人の間で少し繊細です。サークルを開いて今日の様子を見てみましょう。',
  },
};

export interface PushText {
  title: string;
  body: string;
}

/** The lock-screen text of the Baba Ji memory check-in: it says a check-in is waiting, never what it is about. */
export function memoryCheckInPush(lang: PushLang): PushText {
  const c = COPY[lang] ?? COPY.en;
  return { title: c.memTitle, body: c.memBody };
}

/**
 * The first line the guide writes into the chat after a check-in push: a short opener, then the reader's own
 * follow-up question when one was stored, otherwise a plain "how did it go". Shown only inside the app.
 */
export function memoryChatLine(lang: PushLang, followUpQuestion: string | null): string {
  const c = COPY[lang] ?? COPY.en;
  const question = followUpQuestion?.trim() || c.memGeneric;
  return `${c.memOpener} ${question}`;
}

export function circlePulsePush(lang: PushLang, name: string, tone: 'glow' | 'steady' | 'quiet' | 'care'): PushText {
  const c = COPY[lang] ?? COPY.en;
  if (tone === 'glow') {
    return { title: fillCopy(c.glowTitle, { name }), body: fillCopy(c.glowBody, { name }) };
  }
  return { title: fillCopy(c.careTitle, { name }), body: fillCopy(c.careBody, { name }) };
}
