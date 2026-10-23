/**
 * Period-reading push copy (daily / weekly / monthly / yearly) for the eight languages the server had no
 * copy for: Kannada, Spanish, French, German, Portuguese, Italian, Russian and Japanese. The seven older
 * languages stay in modules/cron/broadcast-copy.ts; this file only adds. Used when `lang.pushAll` is on.
 *
 * Same meaning as the English text, written for a lock screen: short title, one-sentence body.
 */

import type { ExtraPushLang } from '../push-lang.js';

export interface ExtraPushCopy {
  title: string;
  body: string;
}

/** Index 0 = Sunday ... 6 = Saturday, the same rotation as the English hooks. */
export const EXTRA_DAILY: Record<ExtraPushLang, ExtraPushCopy[]> = {
  kn: [
    {
      title: '🌅 ಬ್ರಹ್ಮಾಂಡ ನಿಮ್ಮನ್ನು ಸ್ವಾಗತಿಸುತ್ತದೆ',
      body: 'ಇಂದು ಅಪರೂಪದ ಗ್ರಹ ಸಂಯೋಗ ರೂಪುಗೊಳ್ಳುತ್ತಿದೆ. ನಿಮ್ಮ ವೈದಿಕ ಓದಿನಲ್ಲಿ ಅದರ ಕೀಲಿ ಇದೆ — ಅವಕಾಶ ಕಳೆದುಹೋಗುವ ಮೊದಲು ತೆರೆಯಿರಿ.',
    },
    {
      title: '🌙 ಚಂದ್ರನಿಗೆ ನಿಮಗಾಗಿ ಸಂದೇಶವಿದೆ',
      body: 'ಇಂದು ಚಂದ್ರ ರಾಶಿ ಬದಲಿಸುತ್ತಿದ್ದಾನೆ, ಇದು ನಿಮಗೆ ವೈಯಕ್ತಿಕ. ಇಂದಿನ ಶಕ್ತಿ ನಿಮ್ಮ ಜಾತಕದ ಮೇಲೆ ಹೇಗೆ ಬೀಳುತ್ತದೆ ಎಂದು ನೋಡಲು ಟ್ಯಾಪ್ ಮಾಡಿ.',
    },
    {
      title: '🔥 ಮಂಗಳ ನಿಮ್ಮ ಮುಂದಿನ ನಡೆಯನ್ನು ಗಮನಿಸುತ್ತಿದ್ದಾನೆ',
      body: 'ಧೈರ್ಯದ ನಿರ್ಧಾರಗಳು ಫಲ ನೀಡುತ್ತವೆ — ಆದರೆ ಯಾವ ಹೋರಾಟ ಆರಿಸಬೇಕೆಂದು ತಿಳಿದಿರಬೇಕು. ಇಂದಿನ ಕಾಸ್ಮಿಕ್ ಅನುಕೂಲವನ್ನು ನಿಮ್ಮ ಓದು ತಿಳಿಸುತ್ತದೆ.',
    },
    {
      title: '✨ ಬುಧ ಮಾತನಾಡುತ್ತಿದ್ದಾನೆ — ನೀವು ಕೇಳುತ್ತಿದ್ದೀರಾ?',
      body: 'ಇಂದು ಮಾತು, ವ್ಯವಹಾರ ಮತ್ತು ನಿರ್ಧಾರಗಳಿಗೆ ಹೆಚ್ಚಿನ ತೂಕ. ನಕ್ಷತ್ರಗಳು ಏನು ಹೇಳುತ್ತವೆ ಎಂದು ತಿಳಿಯದೆ ದಿನ ಆರಂಭಿಸಬೇಡಿ.',
    },
    {
      title: '🪐 ಇಂದು ಗುರು ಒಂದು ಬಾಗಿಲು ತೆರೆಯುತ್ತಾನೆ',
      body: 'ವಿಸ್ತರಣೆಯ ಶಕ್ತಿ ಗಾಳಿಯಲ್ಲಿದೆ. ಗರಿಷ್ಠ ಹರಿವಿಗಾಗಿ ನಿಮ್ಮ ಶಕ್ತಿಯನ್ನು ಎಲ್ಲಿ ಹರಿಸಬೇಕೆಂದು ನಿಮ್ಮ ವೈದಿಕ ಜಾತಕ ತೋರಿಸುತ್ತದೆ.',
    },
    {
      title: '💫 ನಿಮ್ಮ ಕಾಸ್ಮಿಕ್ ಮುನ್ಸೂಚನೆ ಬಂದಿದೆ',
      body: 'ಶುಕ್ರ ಈ ದಿನವನ್ನು ಆಶೀರ್ವದಿಸುತ್ತಾನೆ — ಆದರೆ ಯಾರಿಗೆ? ಪ್ರೀತಿ, ಸಂಪತ್ತು ಅಥವಾ ವೃತ್ತಿಯಲ್ಲಿ ಇಂದು ಅದೃಷ್ಟ ನಗುತ್ತದೆಯೇ ಎಂದು ತಿಳಿಯಲು ಟ್ಯಾಪ್ ಮಾಡಿ.',
    },
    {
      title: '🔮 ನಕ್ಷತ್ರಗಳು ನಿಮಗಾಗಿ ಮಾತನಾಡಿವೆ',
      body: 'ಶನಿವಾರದ ಆಕಾಶದಲ್ಲಿ ಒಂದು ಗುಪ್ತ ತಿರುವಿದೆ. ದಿನ ಆರಂಭವಾಗುವ ಮೊದಲು ನಿಮ್ಮ ವೈಯಕ್ತಿಕ ಅರೋಹ ಜಾತಕವನ್ನು ಓದಿ.',
    },
  ],
  es: [
    {
      title: '🌅 El cosmos te saluda',
      body: 'Hoy se forma una alineación planetaria poco común. Tu lectura védica tiene la clave: ábrela antes de que pase la oportunidad.',
    },
    {
      title: '🌙 La Luna tiene un mensaje para ti',
      body: 'Hoy la Luna cambia de signo y te afecta de forma personal. Toca para ver cómo cae la energía de hoy en tu carta.',
    },
    {
      title: '🔥 Marte observa tu próximo paso',
      body: 'Las decisiones audaces dan fruto, pero solo si sabes qué batallas elegir. Tu lectura muestra la ventaja cósmica de hoy.',
    },
    {
      title: '✨ Mercurio habla: ¿estás escuchando?',
      body: 'Hoy las palabras, los tratos y las decisiones pesan más. No empieces el día sin saber lo que dicen los astros.',
    },
    {
      title: '🪐 Júpiter abre hoy una puerta',
      body: 'La expansión está en el aire. Tu horóscopo védico muestra dónde dirigir tu energía para que fluya al máximo.',
    },
    {
      title: '💫 Tu pronóstico cósmico ya está aquí',
      body: 'Venus bendice el día, pero ¿a quién? Toca para ver si la fortuna te sonríe hoy en el amor, el dinero o el trabajo.',
    },
    {
      title: '🔮 Los astros han hablado por ti',
      body: 'El cielo del sábado esconde un giro inesperado. Lee tu horóscopo personal de Aroha antes de que empiece el día.',
    },
  ],
  fr: [
    {
      title: '🌅 Le cosmos vous salue',
      body: "Un alignement planétaire rare marque cette journée. Votre lecture védique en détient la clé : ouvrez-la avant que l'occasion ne passe.",
    },
    {
      title: '🌙 La Lune a un message pour vous',
      body: "La Lune change de signe aujourd'hui, et cela vous concerne. Touchez pour voir comment l'énergie du jour tombe sur votre thème.",
    },
    {
      title: '🔥 Mars observe votre prochain pas',
      body: "Les choix audacieux paient, à condition de savoir quels combats mener. Votre lecture révèle l'atout cosmique du jour.",
    },
    {
      title: '✨ Mercure parle : écoutez-vous ?',
      body: "Les mots, les accords et les décisions pèsent plus lourd aujourd'hui. Ne commencez pas la journée sans savoir ce que disent les astres.",
    },
    {
      title: "🪐 Jupiter ouvre une porte aujourd'hui",
      body: "L'expansion est dans l'air. Votre horoscope védique montre où diriger votre énergie pour qu'elle circule au mieux.",
    },
    {
      title: '💫 Vos prévisions cosmiques sont arrivées',
      body: "Vénus bénit la journée, mais pour qui ? Touchez pour voir si la chance vous sourit aujourd'hui en amour, en argent ou au travail.",
    },
    {
      title: '🔮 Les astres ont parlé pour vous',
      body: 'Le ciel du samedi cache un rebondissement. Lisez votre horoscope Aroha personnalisé avant que la journée ne se déroule.',
    },
  ],
  de: [
    {
      title: '🌅 Der Kosmos grüßt dich',
      body: 'Heute entsteht eine seltene Planetenstellung. Deine vedische Deutung hält den Schlüssel bereit – öffne sie, bevor die Gelegenheit vorbei ist.',
    },
    {
      title: '🌙 Der Mond hat eine Nachricht für dich',
      body: 'Der Mond wechselt heute das Zeichen, und das betrifft dich persönlich. Tippe, um zu sehen, wie die Energie des Tages dein Horoskop trifft.',
    },
    {
      title: '🔥 Mars beobachtet deinen nächsten Schritt',
      body: 'Mutige Entscheidungen zahlen sich aus – aber nur, wenn du weißt, welche Kämpfe sich lohnen. Deine Deutung zeigt den kosmischen Vorteil von heute.',
    },
    {
      title: '✨ Merkur spricht – hörst du zu?',
      body: 'Worte, Abmachungen und Entscheidungen haben heute mehr Gewicht. Starte nicht in den Tag, ohne zu wissen, was die Sterne sagen.',
    },
    {
      title: '🪐 Jupiter öffnet heute eine Tür',
      body: 'Wachstum liegt in der Luft. Dein vedisches Horoskop zeigt, wohin du deine Energie lenken solltest, damit sie bestmöglich fließt.',
    },
    {
      title: '💫 Deine kosmische Vorhersage ist da',
      body: 'Venus segnet den Tag – aber für wen? Tippe, um zu sehen, ob das Glück dir heute in Liebe, Geld oder Beruf zulächelt.',
    },
    {
      title: '🔮 Die Sterne haben für dich gesprochen',
      body: 'Der Himmel des Samstags birgt eine versteckte Wendung. Lies dein persönliches Aroha-Horoskop, bevor der Tag beginnt.',
    },
  ],
  pt: [
    {
      title: '🌅 O cosmos te cumprimenta',
      body: 'Hoje se forma um alinhamento planetário raro. Sua leitura védica guarda a chave — abra antes que a oportunidade passe.',
    },
    {
      title: '🌙 A Lua tem uma mensagem para você',
      body: 'Hoje a Lua muda de signo e isso é pessoal. Toque para ver como a energia de hoje cai no seu mapa.',
    },
    {
      title: '🔥 Marte observa seu próximo passo',
      body: 'Escolhas ousadas compensam, mas só se você souber que batalhas escolher. Sua leitura mostra a vantagem cósmica de hoje.',
    },
    {
      title: '✨ Mercúrio fala — você está ouvindo?',
      body: 'Palavras, acordos e decisões pesam mais hoje. Não comece o dia sem saber o que dizem os astros.',
    },
    {
      title: '🪐 Júpiter abre uma porta hoje',
      body: 'A expansão está no ar. Seu horóscopo védico mostra onde direcionar sua energia para fluir ao máximo.',
    },
    {
      title: '💫 Sua previsão cósmica chegou',
      body: 'Vênus abençoa o dia — mas para quem? Toque para ver se a sorte sorri hoje para seu amor, dinheiro ou carreira.',
    },
    {
      title: '🔮 Os astros falaram por você',
      body: 'O céu de sábado traz uma reviravolta escondida. Leia seu horóscopo pessoal da Aroha antes de o dia começar.',
    },
  ],
  it: [
    {
      title: '🌅 Il cosmo ti saluta',
      body: "Oggi si forma un raro allineamento planetario. La tua lettura vedica ne custodisce la chiave: aprila prima che l'occasione passi.",
    },
    {
      title: '🌙 La Luna ha un messaggio per te',
      body: "Oggi la Luna cambia segno e la cosa ti riguarda da vicino. Tocca per vedere come l'energia del giorno cade sul tuo tema.",
    },
    {
      title: '🔥 Marte osserva la tua prossima mossa',
      body: 'Le scelte audaci pagano, ma solo se sai quali battaglie scegliere. La tua lettura mostra il vantaggio cosmico di oggi.',
    },
    {
      title: '✨ Mercurio parla: stai ascoltando?',
      body: 'Parole, accordi e decisioni oggi pesano di più. Non iniziare la giornata senza sapere cosa dicono le stelle.',
    },
    {
      title: '🪐 Oggi Giove apre una porta',
      body: "L'espansione è nell'aria. Il tuo oroscopo vedico mostra dove dirigere la tua energia per farla scorrere al meglio.",
    },
    {
      title: '💫 Le tue previsioni cosmiche sono arrivate',
      body: 'Venere benedice la giornata, ma chi? Tocca per scoprire se la fortuna ti sorride oggi in amore, denaro o lavoro.',
    },
    {
      title: '🔮 Le stelle hanno parlato per te',
      body: 'Il cielo di sabato nasconde una svolta. Leggi il tuo oroscopo Aroha personale prima che la giornata si apra.',
    },
  ],
  ru: [
    {
      title: '🌅 Космос приветствует вас',
      body: 'Сегодня складывается редкое расположение планет. Ключ к нему — в вашем ведическом прогнозе. Откройте его, пока не упущена возможность.',
    },
    {
      title: '🌙 У Луны есть для вас послание',
      body: 'Сегодня Луна меняет знак, и это касается лично вас. Нажмите, чтобы увидеть, как энергия дня ложится на вашу карту.',
    },
    {
      title: '🔥 Марс следит за вашим следующим шагом',
      body: 'Смелые решения окупаются, но только если знать, какие битвы выбирать. Ваш прогноз покажет космическое преимущество этого дня.',
    },
    {
      title: '✨ Меркурий говорит — вы слушаете?',
      body: 'Слова, сделки и решения сегодня весят больше. Не начинайте день, не узнав, что говорят звёзды.',
    },
    {
      title: '🪐 Сегодня Юпитер открывает дверь',
      body: 'В воздухе — расширение. Ваш ведический гороскоп покажет, куда направить энергию, чтобы она текла свободнее всего.',
    },
    {
      title: '💫 Ваш космический прогноз готов',
      body: 'Венера благословляет день — но кого? Нажмите, чтобы узнать, улыбнётся ли вам удача сегодня в любви, деньгах или работе.',
    },
    {
      title: '🔮 Звёзды сказали своё слово о вас',
      body: 'В субботнем небе спрятан неожиданный поворот. Прочитайте свой личный гороскоп Aroha, пока день не начался.',
    },
  ],
  ja: [
    {
      title: '🌅 宇宙があなたに挨拶しています',
      body: '今日はめずらしい惑星配置が生まれます。ヴェーダ式リーディングにそのカギがあります。機会が過ぎる前に開いてみましょう。',
    },
    {
      title: '🌙 月からあなたへのメッセージです',
      body: '今日、月がサインを移動します。それはあなた自身に関わることです。タップして、今日のエネルギーがあなたのチャートにどう届くか見てみましょう。',
    },
    {
      title: '🔥 火星があなたの次の一手を見ています',
      body: '大胆な選択は報われますが、選ぶべき戦いを知ってこそです。リーディングが今日の宇宙の追い風を教えてくれます。',
    },
    {
      title: '✨ 水星が語っています。聞いていますか？',
      body: '今日は言葉も取引も決断も、いつもより重みがあります。星が何と言っているかを知ってから一日を始めましょう。',
    },
    {
      title: '🪐 今日、木星が扉を開きます',
      body: '拡大のエネルギーが漂っています。ヴェーダ式ホロスコープが、力をどこに向ければ最もよく流れるかを示します。',
    },
    {
      title: '💫 あなたの宇宙の予報が届きました',
      body: '金星が今日を祝福しますが、誰にでしょう？恋愛、お金、仕事のどこで運が微笑むか、タップして確かめましょう。',
    },
    {
      title: '🔮 星があなたのために語りました',
      body: '土曜の空には隠れた展開があります。一日が始まる前に、あなた専用のArohaホロスコープを読んでおきましょう。',
    },
  ],
};

export type ExtraPeriod = 'weekly' | 'monthly' | 'yearly';

export const EXTRA_PERIODIC: Record<ExtraPeriod, Record<ExtraPushLang, ExtraPushCopy>> = {
  weekly: {
    kn: {
      title: '📅 ನಿಮ್ಮ ಮುಂದಿನ ವಾರ ನಕ್ಷತ್ರಗಳಲ್ಲಿ ಬರೆಯಲ್ಪಟ್ಟಿದೆ',
      body: 'ನಿಮಗಾಗಿ ಇಡೀ ವಾರದ ಕಾಸ್ಮಿಕ್ ಬದಲಾವಣೆಗಳು ನಿಗದಿಯಾಗಿವೆ. ಬರುವ ಮೊದಲೇ ಏನಾಗಲಿದೆ ಎಂದು ತಿಳಿಯಿರಿ — ಈಗಲೇ ನಿಮ್ಮ ವಾರದ ವೈದಿಕ ಓದನ್ನು ತೆರೆಯಿರಿ.',
    },
    es: {
      title: '📅 Tu semana está escrita en las estrellas',
      body: 'Te espera una semana entera de cambios cósmicos. Mira lo que viene antes de que llegue: abre ahora tu lectura védica semanal.',
    },
    fr: {
      title: '📅 Votre semaine est écrite dans les étoiles',
      body: 'Une semaine entière de changements cosmiques vous attend. Découvrez ce qui vient avant son arrivée : ouvrez dès maintenant votre lecture védique hebdomadaire.',
    },
    de: {
      title: '📅 Deine Woche steht in den Sternen',
      body: 'Eine ganze Woche kosmischer Veränderungen liegt vor dir. Sieh, was kommt, bevor es da ist – öffne jetzt deine vedische Wochendeutung.',
    },
    pt: {
      title: '📅 Sua semana está escrita nas estrelas',
      body: 'Uma semana inteira de mudanças cósmicas está mapeada para você. Veja o que vem antes de chegar — abra agora sua leitura védica semanal.',
    },
    it: {
      title: '📅 La tua settimana è scritta nelle stelle',
      body: "Ti aspetta un'intera settimana di cambiamenti cosmici. Scopri cosa arriva prima che arrivi: apri ora la tua lettura vedica settimanale.",
    },
    ru: {
      title: '📅 Ваша неделя написана в звёздах',
      body: 'Для вас расписана целая неделя космических перемен. Узнайте, что вас ждёт, ещё до того, как это наступит, — откройте недельный ведический прогноз.',
    },
    ja: {
      title: '📅 今週は星に書かれています',
      body: '一週間分の宇宙の動きがあなたのために描かれています。訪れる前に確かめましょう。今すぐ週間ヴェーダ式リーディングを開いてください。',
    },
  },
  monthly: {
    kn: {
      title: '🌕 ಹೊಸ ಚಂದ್ರ ಮಾಸ ಆರಂಭವಾಗುತ್ತಿದೆ',
      body: 'ಹೊಸ ಗ್ರಹ ಪ್ರವಾಹಗಳು ಮುಂದಿನ ವಾರಗಳ ಸ್ವರ ನಿಗದಿಪಡಿಸುತ್ತಿವೆ. ನಿಮ್ಮ ವೈಯಕ್ತಿಕ ಮಾಸಿಕ ಜಾತಕ ಸಿದ್ಧವಾಗಿದೆ — ಈ ತಿಂಗಳು ನಿಮಗಾಗಿ ಏನಿದೆ ಎಂದು ನೋಡಿ.',
    },
    es: {
      title: '🌕 Comienza un nuevo mes lunar',
      body: 'Nuevas corrientes planetarias marcan el tono de las próximas semanas. Tu horóscopo mensual personal está listo: descubre qué te trae este mes.',
    },
    fr: {
      title: '🌕 Un nouveau mois lunaire commence',
      body: 'De nouveaux courants planétaires donnent le ton des semaines à venir. Votre horoscope mensuel personnalisé est prêt : découvrez ce que ce mois vous réserve.',
    },
    de: {
      title: '🌕 Ein neuer Mondmonat beginnt',
      body: 'Neue planetare Strömungen geben den Ton für die kommenden Wochen an. Dein persönliches Monatshoroskop ist bereit – sieh, was dieser Monat für dich bereithält.',
    },
    pt: {
      title: '🌕 Começa um novo mês lunar',
      body: 'Novas correntes planetárias definem o tom das próximas semanas. Seu horóscopo mensal personalizado está pronto — veja o que este mês reserva para você.',
    },
    it: {
      title: '🌕 Inizia un nuovo mese lunare',
      body: 'Nuove correnti planetarie danno il tono alle prossime settimane. Il tuo oroscopo mensile personale è pronto: scopri cosa ti riserva questo mese.',
    },
    ru: {
      title: '🌕 Начинается новый лунный месяц',
      body: 'Новые планетные течения задают тон ближайшим неделям. Ваш личный гороскоп на месяц готов — узнайте, что этот месяц приготовил для вас.',
    },
    ja: {
      title: '🌕 新しい月の周期が始まります',
      body: '新しい惑星の流れが、これからの数週間の空気をつくります。あなた専用の月間ホロスコープができました。今月が運んでくるものを見てみましょう。',
    },
  },
  yearly: {
    kn: {
      title: '🎆 ನಿಮ್ಮ ಮುಂಬರುವ ವರ್ಷ ನಕ್ಷತ್ರಗಳಲ್ಲಿ ಬರೆಯಲ್ಪಟ್ಟಿದೆ',
      body: 'ಕಾಸ್ಮಿಕ್ ಸಾಧ್ಯತೆಗಳ ಹೊಚ್ಚ ಹೊಸ ವರ್ಷ ಆರಂಭವಾಗುತ್ತಿದೆ. ಪ್ರಮುಖ ಗೋಚಾರಗಳು ಮತ್ತು ತಿರುವುಗಳೊಂದಿಗೆ ನಿಮ್ಮ ಪೂರ್ಣ ವೈಯಕ್ತಿಕ ವಾರ್ಷಿಕ ಮುನ್ಸೂಚನೆ ಓದಲು ಸಿದ್ಧ.',
    },
    es: {
      title: '🎆 Tu año, escrito en las estrellas',
      body: 'Empieza un año nuevo lleno de posibilidades cósmicas. Tu pronóstico anual personal, con los tránsitos clave y los puntos de giro, está listo para leer.',
    },
    fr: {
      title: '🎆 Votre année, écrite dans les étoiles',
      body: "Une toute nouvelle année de possibilités cosmiques commence. Vos prévisions annuelles personnalisées, avec les transits clés et les tournants, sont prêtes à lire.",
    },
    de: {
      title: '🎆 Dein Jahr, in den Sternen geschrieben',
      body: 'Ein ganz neues Jahr voller kosmischer Möglichkeiten beginnt. Deine persönliche Jahresvorhersage – mit den wichtigsten Transiten und Wendepunkten – liegt zum Lesen bereit.',
    },
    pt: {
      title: '🎆 Seu ano, escrito nas estrelas',
      body: 'Começa um ano novinho em folha, cheio de possibilidades cósmicas. Sua previsão anual personalizada, com os trânsitos principais e os pontos de virada, está pronta para ler.',
    },
    it: {
      title: '🎆 Il tuo anno, scritto nelle stelle',
      body: 'Comincia un anno nuovo di possibilità cosmiche. Le tue previsioni annuali personali, con i transiti chiave e i punti di svolta, sono pronte da leggere.',
    },
    ru: {
      title: '🎆 Ваш год, написанный в звёздах',
      body: 'Начинается совершенно новый год космических возможностей. Ваш личный годовой прогноз — с ключевыми транзитами и переломными моментами — готов к чтению.',
    },
    ja: {
      title: '🎆 あなたの一年は星に書かれています',
      body: '宇宙の可能性に満ちた新しい一年が始まります。主なトランジットや転機を含む、あなた専用の年間予報を読む準備ができました。',
    },
  },
};
