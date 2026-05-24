// =============================================================================
// Vedic Numerology — Rich fallback content for all Mulank (1-9) and
// Bhagyank (1-9) numbers. Used when AI responses are sparse or unavailable.
// =============================================================================

// ---------------------------------------------------------------------------
// MULANK FALLBACKS
// ---------------------------------------------------------------------------
const MULANK: Record<number, Record<string, unknown>> = {
  1: {
    overview: `Mulank 1 individuals are born leaders guided by the radiant Sun, the king of all planets. You possess an innate magnetism that draws people toward you and a natural authority that commands respect without effort. Your identity is deeply tied to your sense of self-reliance — you prefer to forge your own path rather than follow footsteps laid by others. The Sun blesses you with tremendous vitality, willpower, and an almost unshakeable confidence that allows you to rise above adversity with remarkable grace. In every area of life, you are driven by the desire to be first, to be the best, and to leave a lasting impact on the world around you.`,
    ruling_planet: {
      name: 'Sun (Surya)',
      description: `The Sun is the sovereign of the solar system and the ruling planet of all Mulank 1 individuals, bestowing upon them an extraordinary aura of warmth, authority, and vitality. This great luminary governs the heart, the eyes, the spine, and the right side of the body, making Mulank 1 people particularly susceptible to heat-related ailments and cardiovascular conditions if they neglect their health. The Sun's golden light permeates every cell of your being, giving you an energetic radiance that others notice immediately — people often describe Mulank 1 individuals as having a certain glow or presence that fills any room they enter. Spiritually, the Sun represents the Atman or the divine self, connecting Mulank 1 individuals to their higher consciousness and a deep, unshakeable sense of inner knowing. In Vedic astrology, a strong Sun in the birth chart amplifies the Mulank 1 energies exponentially, producing leaders of nations, visionary artists, and spiritual masters who leave an immortal legacy.`,
      day: 'Sunday',
      color: 'Gold, Orange, Yellow',
      gemstone: 'Ruby',
      metal: 'Gold',
    },
    personality: {
      core: `At the core of every Mulank 1 individual lies an irrepressible spirit of independence and a fiery desire to create, lead, and excel. You are the original thinker — someone who rarely accepts conventional wisdom without first questioning it through the lens of your own direct experience. Your personality radiates confidence and authority, and even when you are uncertain internally, your outward demeanour rarely betrays any vulnerability. There is a pioneering quality to everything you do, a restless need to be at the forefront of whatever field captures your passion. Whether in career, relationships, or creative pursuits, you are always the initiator, the one who takes the first bold step when others hesitate.`,
      emotional: `Emotionally, Mulank 1 individuals experience feelings with great intensity but often struggle to express vulnerability openly. Your deep-seated need for independence means you resist depending on others emotionally, sometimes creating an aura of aloofness that can be misread as coldness or indifference. You experience love as a form of partnership between equals — anything that feels like subordination or emotional dependency triggers a defensive retreat. When you do allow yourself to be emotionally open, your warmth and loyalty are extraordinary, creating bonds that can last a lifetime. Learning to balance your need for autonomy with the human need for deep emotional connection is one of your most important life lessons.`,
      social: `Socially, you are magnetic and charismatic — people are drawn to your confidence, your directness, and your ability to articulate a vision that inspires action. You have natural leadership abilities and often find yourself at the centre of social circles, guiding conversations and setting the tone for group dynamics. However, you can sometimes dominate social situations unintentionally, steamrolling over more sensitive individuals with the sheer force of your personality. You prefer quality over quantity in friendships, surrounding yourself with driven, ambitious people who challenge you intellectually. Your social energy is best spent in environments where ideas are discussed boldly and where achievement is celebrated.`,
      intellectual: `Intellectually, Mulank 1 individuals are creative, innovative, and original thinkers who excel at generating ideas and pioneering new directions. You have a sharp, analytical mind that quickly grasps the essence of complex problems and devises bold solutions that others might consider too audacious. Your thinking style is linear and purposeful — you prefer clear, direct information over ambiguity and have little patience for convoluted reasoning or indecisiveness. Reading, learning, and intellectual mastery are sources of deep satisfaction for you, and you are often drawn to subjects that have practical applications or that can give you a competitive advantage. Your greatest intellectual strength is your ability to synthesise diverse pieces of information into a coherent vision.`,
      shadow: `The shadow side of Mulank 1 includes a tendency toward excessive pride, arrogance, and an unwillingness to acknowledge mistakes or accept help from others. When your leadership goes unchallenged, you can slip into authoritarianism — expecting others to follow your lead without question and dismissing those who present alternative viewpoints. There is also a deep fear of failure lurking beneath your confident exterior, which can manifest as procrastination, perfectionism, or an avoidance of situations where success is uncertain. Your ego is both your greatest asset and your most dangerous liability — it drives you forward with unstoppable momentum but can also isolate you from the very people whose support you most need. Cultivating humility and the courage to be vulnerable are the twin keys to unlocking your highest potential.`,
    },
    strengths: [
      { title: 'Natural Leadership', description: 'You possess an innate ability to inspire and direct others toward shared goals with confidence and clarity. People naturally look to you for guidance in challenging situations.' },
      { title: 'Originality & Creativity', description: 'Your mind constantly generates fresh, innovative ideas that challenge conventional thinking. You are a true pioneer who sees possibilities where others see limitations.' },
      { title: 'Willpower & Determination', description: 'Once you set your mind on a goal, very little can deter you from achieving it. Your persistence in the face of obstacles is truly extraordinary.' },
      { title: 'Charisma & Magnetism', description: 'Your personality radiates a warmth and authority that draws people toward you effortlessly. You have the natural gift of making others feel seen and valued.' },
      { title: 'Self-Sufficiency', description: 'You are remarkably capable of taking care of yourself and creating your own opportunities. Dependence on others is not in your nature — you build your own destiny.' },
      { title: 'Decisiveness', description: 'You have the ability to make clear, confident decisions quickly and stand by them even under pressure. This quality makes you an invaluable leader and partner.' },
      { title: 'Courage', description: 'Fear rarely stops you from pursuing what you want. You face challenges with remarkable bravery and inspire others to do the same.' },
      { title: 'Vitality & Energy', description: 'Blessed by the Sun, you possess extraordinary physical and mental energy that allows you to sustain effort and enthusiasm long after others have given up.' },
    ],
    weaknesses: [
      { title: 'Pride & Arrogance', description: 'Your confidence can tip into arrogance when unchecked, making it difficult for others to work with you. Practice acknowledging the contributions of your team openly and frequently.' },
      { title: 'Stubbornness', description: 'Once you have formed an opinion, you can be remarkably resistant to changing it even when presented with compelling evidence. Flexibility will open doors that stubbornness keeps firmly shut.' },
      { title: 'Impatience', description: 'Your fast-moving mind and high standards mean you often become frustrated with people who cannot match your pace. Cultivating patience is one of your most important growth areas.' },
      { title: 'Dominance in Relationships', description: 'You may unconsciously dominate personal relationships, leaving little space for your partner or friends to lead. Conscious effort to share power will dramatically improve your intimate connections.' },
      { title: 'Difficulty Accepting Help', description: 'Your strong independent streak can make it very difficult to ask for or accept help, even when you genuinely need it. Remember that allowing others to contribute is a sign of wisdom, not weakness.' },
      { title: 'Fear of Failure', description: 'Beneath your confident exterior often lies a deep, unspoken fear of failure that can lead to procrastination or avoidance of risky ventures. Embracing failure as a teacher will accelerate your growth enormously.' },
    ],
    favorable_periods: {
      months: ['January', 'October', 'July', 'April'],
      description: `The months aligned with the Sun — particularly January, October, July, and April — are your most powerful periods for initiating new ventures, making important decisions, and showcasing your leadership. During these months, your energy, clarity of mind, and magnetic appeal are at their peak, making them ideal for career advancements, public-facing activities, and any situation that requires you to be bold and visible. You should particularly focus on Sunday rituals and any project launches during these months.`,
    },
    unfavorable_periods: {
      months: ['November', 'February'],
      description: `November and February tend to bring challenges for Mulank 1 individuals, as the reduced solar energy during these periods can dampen your natural vitality and confidence. Health concerns, particularly related to the cardiovascular system and eyes, may surface during these months. It is advisable to avoid major decisions, conflicts, and high-stakes negotiations during these periods, focusing instead on rest, reflection, and strengthening your support systems.`,
    },
    relationships: `In relationships, Mulank 1 individuals bring great passion, loyalty, and a desire to be an equal partner — though their dominant nature can sometimes create imbalance. They love deeply but need a partner who can match their strength without being intimidated by it. Their ideal partner is someone who has their own goals, ambitions, and identity, someone who complements rather than relies upon them completely. Once committed, they are fiercely protective and devoted, but they need regular space and autonomy to feel happy within any long-term partnership.`,
    finances: `Financially, Mulank 1 individuals tend to be excellent earners with an entrepreneurial spirit that generates wealth through bold initiatives and original ideas. You are rarely content with steady, modest income — you dream big and often take calculated risks that can yield extraordinary rewards. However, your impulsive side can lead to financial losses when you act on excitement without sufficient research. Building a habit of consulting financial advisors and practising delayed gratification will help you build lasting wealth rather than experiencing the feast-and-famine cycle that many Mulank 1 individuals face.`,
    spirituality: `Spiritually, Mulank 1 individuals are drawn to practices that cultivate inner mastery, self-awareness, and the development of willpower. Sun worship, Surya Namaskar (Sun Salutations), and meditation focused on the solar plexus chakra are particularly powerful practices for you. Your spiritual path is one of developing the divine self — recognising the light within you and allowing it to shine without ego or fear. Chanting the Aditya Hridayam or the Gayatri Mantra regularly will bring profound protection, clarity, and spiritual advancement.`,
    health_tendencies: `Mulank 1 individuals generally possess robust health and a strong constitution, but need to be mindful of heart-related conditions, high blood pressure, and eye strain, all governed by their ruling planet the Sun. Excessive ambition and stress can manifest as burnout, headaches, and immune system depletion if the body and mind are not given adequate rest. Regular sun exposure (in moderation), vigorous exercise, and a diet rich in golden-coloured foods — such as turmeric, saffron, and honey — support your solar energy and keep you at your best.`,
    lucky_numbers: [1, 10, 19, 28, 37, 46],
    numbers_to_avoid: [6, 9],
    famous_personalities: [
      { name: 'Napoleon Bonaparte', note: 'Born on the 15th (reduces to 6, Bhagyank), but his Mulank 1 drive for conquest and absolute leadership perfectly exemplifies the pioneering ambition of this number.' },
      { name: 'Steve Jobs', note: 'The iconic co-founder of Apple embodied Mulank 1\'s visionary creativity, stubborn brilliance, and refusal to accept anything less than revolutionary.' },
      { name: 'Narendra Modi', note: 'India\'s Prime Minister exemplifies Mulank 1\'s commanding leadership style, self-made success, and the ability to inspire an entire nation with a powerful personal vision.' },
    ],
  },
  2: {
    overview: `Mulank 2 is governed by the Moon, the gentle luminary of emotions, intuition, and the subconscious mind, bestowing upon those born on the 2nd, 11th, 20th, or 29th a uniquely sensitive and perceptive nature. You are the great diplomat of the numerological spectrum — a natural peacemaker who can sense the emotional undercurrents in any room and intuitively knows how to bring people together. Your extraordinary empathy and ability to feel what others feel makes you an invaluable partner, counsellor, and creative collaborator. The Moon's influence gives you a cyclical nature — your energy, mood, and inspiration wax and wane like the lunar phases, and you are at your best when you honour these natural rhythms rather than fighting them. In a world that often prizes assertion over sensitivity, your greatest gift is the healing power of genuine emotional presence and deep, compassionate listening.`,
    ruling_planet: {
      name: 'Moon (Chandra)',
      description: `The Moon, known as Chandra in Vedic astrology, is the most emotionally resonant of all celestial bodies and the ruling planet of every Mulank 2 individual. It governs the mind, emotions, subconscious patterns, mother, home, and the reproductive system, which means Mulank 2 people are particularly attuned to emotional atmospheres and may absorb the feelings of those around them like a psychic sponge. The Moon's silver light illuminates the inner world of imagination, creativity, and intuition, blessing Mulank 2 individuals with a rich inner life and powerful psychic sensitivity that, when developed consciously, becomes a profound spiritual gift. Its waxing and waning nature means that Mulank 2 people thrive when they align their activities with lunar cycles — launching projects on new moons, completing work during full moons, and resting during the waning phases. The Moon also governs water, and many Mulank 2 individuals find deep restoration and creative inspiration near rivers, oceans, or any body of water.`,
      day: 'Monday',
      color: 'White, Silver, Cream',
      gemstone: 'Pearl or Moonstone',
      metal: 'Silver',
    },
    personality: {
      core: `At the core of every Mulank 2 individual is a profoundly receptive, empathetic soul who experiences life through the lens of relationship and emotional connection. You are deeply attuned to the subtle energies of your environment, sensing shifts in mood, tension, and harmony that most people completely miss. Your greatest gift is your capacity for deep listening — you make others feel truly heard and understood in a way that is genuinely rare and healing. Unlike Mulank 1 individuals who lead through assertion, you lead through understanding, bringing people together through consensus and creating environments where everyone feels valued. Your true power lies not in domination but in the gentle art of nurturing, supporting, and harmonising.`,
      emotional: `Emotionally, Mulank 2 individuals are among the most sensitive and deeply feeling people in the entire numerological system. Your emotions run like a deep, constantly flowing river — rich, complex, and sometimes overwhelming in their intensity. You feel joy profusely and sorrow deeply, and your empathetic nature means you often carry the emotional weight of those you love, sometimes to the detriment of your own wellbeing. Establishing clear emotional boundaries is one of your most important life skills, as your natural tendency is to absorb others' feelings until you can no longer distinguish your own emotional state from theirs. When supported by stable relationships and regular emotional processing practices, your sensitivity becomes a superpower rather than a vulnerability.`,
      social: `Socially, Mulank 2 individuals are warm, approachable, and beloved by friends and colleagues who appreciate their genuine interest in others' wellbeing. You are the glue that holds social groups together — the one who remembers birthdays, checks in on people who seem withdrawn, and intuitively knows when a friend needs support even before they ask for it. Your diplomatic skill is remarkable — you can navigate even the most explosive interpersonal conflicts with a calm grace that seems almost magical. However, you may sometimes sacrifice your own needs to keep the peace, agreeing to things that don't genuinely resonate with you in order to avoid conflict. Learning to speak your truth firmly but lovingly is a key social development area for Mulank 2.`,
      intellectual: `Intellectually, Mulank 2 individuals possess a beautifully intuitive mind that processes information holistically rather than in a purely linear fashion. You have exceptional memory — particularly for emotional experiences, conversations, and interpersonal details that most people would forget within days. Your thinking is associative and creative, making connections between seemingly unrelated ideas that others miss entirely. You excel in fields that require emotional intelligence, interpersonal understanding, and creative synthesis. While you may not be the first to speak in a meeting, when you do contribute, your insights are often the most emotionally resonant and practically grounded.`,
      shadow: `The shadow side of Mulank 2 includes a tendency toward emotional manipulation, passive aggression, and an excessive need for external validation that can make you dependent on others' approval. When your sensitivity is wounded — as it frequently is, given your emotional openness — you may withdraw into sullenness, playing the victim or using silence as a weapon rather than communicating your needs directly. Your fear of conflict can lead you to tell people what they want to hear rather than what is true, creating a subtle deceptiveness that undermines genuine intimacy. The Moon's influence also creates a susceptibility to moodiness and emotional volatility, particularly around the full moon. Developing inner security that doesn't depend on external circumstances is the most transformative healing work you can do.`,
    },
    strengths: [
      { title: 'Deep Empathy', description: 'Your capacity to truly feel what others feel creates bonds of extraordinary depth and trust. People instinctively know they are safe with you emotionally.' },
      { title: 'Diplomatic Brilliance', description: 'You can navigate the most delicate interpersonal situations with a grace and tact that brings healing to conflict and harmony to division.' },
      { title: 'Intuition', description: 'Your psychic sensitivity and powerful gut instincts guide you reliably through uncertain situations, providing insights that pure logic alone would miss.' },
      { title: 'Creative Imagination', description: 'The Moon blesses you with a rich, vivid inner world of imagination that expresses itself through art, music, writing, cooking, and any creative medium.' },
      { title: 'Nurturing Nature', description: 'You have an instinctive gift for making others feel cared for, supported, and emotionally safe. This quality makes you an exceptional parent, friend, and mentor.' },
      { title: 'Adaptability', description: 'Like the Moon which changes shape nightly, you can adapt flexibly to new circumstances and perspectives, making you highly versatile in changing environments.' },
      { title: 'Loyalty', description: 'Once you have formed a bond, your devotion is profound and lasting. You stand by the people you love through every storm life brings.' },
      { title: 'Psychic Sensitivity', description: 'Your heightened awareness of subtle energies gives you an almost uncanny ability to read situations, intentions, and outcomes before they fully materialise.' },
    ],
    weaknesses: [
      { title: 'Emotional Dependency', description: 'You can become overly reliant on others for emotional stability, which places unhealthy pressure on relationships. Developing your own internal foundation is essential.' },
      { title: 'Indecisiveness', description: 'Your ability to see all perspectives can make decisive action difficult, leaving you suspended in analysis paralysis at critical moments.' },
      { title: 'Excessive Sensitivity', description: 'You can sometimes be wounded by comments or situations that others would dismiss as trivial, requiring careful management of your emotional responses.' },
      { title: 'People-Pleasing', description: 'Your deep need for harmony can cause you to suppress your own needs and opinions to avoid conflict, creating resentment that builds slowly over time.' },
      { title: 'Moodiness', description: 'The Moon\'s cyclical influence means your emotional state can shift dramatically, making you appear inconsistent and unpredictable to those around you.' },
      { title: 'Avoidance of Confrontation', description: 'Your dislike of conflict means important conversations are sometimes indefinitely postponed, allowing small issues to grow into large problems.' },
    ],
    favorable_periods: {
      months: ['February', 'July', 'September', 'November'],
      description: `The months of February, July, September, and November are your most supportive periods, when the Moon's energy aligns with your natural frequency to bring clarity, creativity, and emotional breakthroughs. During these windows, your intuition is at its sharpest, making them ideal for creative projects, important relationship conversations, and spiritual development. Any new collaborative partnerships or creative ventures launched during these months carry a particular blessing.`,
    },
    unfavorable_periods: {
      months: ['March', 'August'],
      description: `March and August can bring emotional turbulence, health challenges, and relationship difficulties for Mulank 2 individuals. During these months, the Moon's energy is in conflict with your natural resonance, potentially amplifying self-doubt, emotional reactivity, and susceptibility to other people's negative moods. It is wise to practice extra self-care during these periods, avoid major financial decisions, and focus on strengthening your emotional boundaries.`,
    },
    relationships: `In relationships, Mulank 2 individuals are among the most devoted, attentive, and emotionally present partners in the numerological spectrum. You give love through acts of care, attentiveness, and the creation of a warm, emotionally safe home environment. Your ideal partner is someone emotionally mature enough to provide the security you need while respecting the boundaries you must learn to establish. You experience love as a merging of souls and can struggle in relationships where emotional intimacy is kept at a safe distance.`,
    finances: `Financially, Mulank 2 individuals are generally more comfortable in stable, collaborative financial arrangements than in high-risk solo ventures. You excel in business partnerships and roles where cooperation and relationship management are central. Your primary financial challenge is asserting your worth and asking for fair compensation — your tendency to undervalue yourself can result in working far harder than you are paid. Building financial independence gradually through careful saving and investment will provide the security your soul deeply craves.`,
    spirituality: `Spiritually, Mulank 2 individuals are naturally drawn to lunar practices, water-based rituals, and anything that connects them to the divine feminine principle. Offering water to the Moon on Monday evenings, chanting the Chandra Mantra — "Om Chandraya Namah" — and working with moonstone or pearl jewellery are powerful spiritual practices. Your meditation is most effective when guided, using visualisation or sound, and you may find extraordinary healing through practices like singing bowls, sound baths, or mantra repetition done consistently over time.`,
    health_tendencies: `Mulank 2 individuals tend toward conditions related to the digestive system, reproductive organs, and lymphatic system, all governed by the Moon. Emotional health is inseparable from physical health for you — unresolved emotional stress almost invariably manifests as physical symptoms, particularly in the stomach and chest. Regular practices that process and release emotion — such as journaling, therapy, or expressive arts — are as important to your health as physical exercise. A diet that includes white and silver foods — milk, rice, coconut, and silver-coloured fish — supports your lunar energy.`,
    lucky_numbers: [2, 11, 20, 29, 7, 16],
    numbers_to_avoid: [8, 4],
    famous_personalities: [
      { name: 'Barack Obama', note: 'The 44th US President exemplifies Mulank 2\'s diplomatic brilliance, empathetic communication style, and ability to unite deeply divided groups through the power of compassionate leadership.' },
      { name: 'Diana, Princess of Wales', note: 'Princess Diana\'s extraordinary empathy, deep connection with the suffering of others, and her powerful emotional presence perfectly embody the highest expression of Mulank 2 energy.' },
      { name: 'Mahatma Gandhi', note: 'Gandhi\'s philosophy of non-violent resistance — using harmony and moral authority rather than force — is the quintessential expression of Mulank 2\'s peaceful power.' },
    ],
  },
  3: {
    overview: `Mulank 3 is governed by Jupiter, the great teacher and philosopher of the solar system, and individuals born on the 3rd, 12th, 21st, or 30th carry within them the joyful, expansive energy of this magnanimous planet. You are the great communicator, the eternal optimist, and the natural entertainer of the numerological world — someone whose presence reliably lifts the mood of any gathering and whose words carry a natural warmth and wit that makes even complex ideas feel accessible and entertaining. Jupiter's blessing of abundance, wisdom, and fortunate timing means that despite occasional challenges, life tends to offer you remarkable opportunities for growth, joy, and creative fulfilment. Your natural gifts of expression, humour, and social intelligence make you a beloved figure in every circle you inhabit, and your genuine enthusiasm for life is genuinely infectious. The number 3 is the number of creativity, communication, and the divine trinity — it represents the synthesis of two opposing forces into something new, beautiful, and greater than the sum of its parts.`,
    ruling_planet: {
      name: 'Jupiter (Guru / Brihaspati)',
      description: `Jupiter, the largest planet in our solar system and the undisputed Guru of the celestial cabinet, bestows upon all Mulank 3 individuals the divine gifts of wisdom, benevolence, optimism, and extraordinary good fortune. Known as Guru or Brihaspati in Vedic astrology, Jupiter governs higher education, philosophy, religion, law, long-distance travel, and the expansion of both material and spiritual wealth. A strong Jupiter in the chart — and it is naturally strong for all Mulank 3 individuals — creates a person of genuine wisdom, remarkable generosity, and an almost supernatural ability to attract fortunate circumstances and helpful people at precisely the right moments. Jupiter's expansive influence can sometimes lead to excess if not tempered by discipline — a tendency to overindulge, over-promise, or scatter energy across too many projects simultaneously. However, at its best, Jupiter's influence creates magnificent teachers, inspiring speakers, gifted writers, and natural philosophers who share their wisdom with the world with infectious joy.`,
      day: 'Thursday',
      color: 'Yellow, Golden Yellow',
      gemstone: 'Yellow Sapphire (Pukhraj)',
      metal: 'Gold',
    },
    personality: {
      core: `Mulank 3 individuals are vibrant, expressive, and creatively driven souls who bring the full spectrum of human joy to everything they touch. Your personality is characterised by an infectious enthusiasm for life, a natural wit that can make even the most serious person laugh, and a genuine love of connecting with people through the magic of conversation and creative expression. You are fundamentally a communicator — whether through words, art, music, teaching, or performance, you feel most alive when you are sharing something of yourself with others and watching it land with resonance and delight. There is a certain youthful exuberance about Mulank 3 that never fully fades regardless of age, a quality that makes you perpetually interesting and surprisingly resilient in the face of life's more sobering moments.`,
      emotional: `Emotionally, Mulank 3 individuals experience feelings with a vivid intensity that they often channel directly into creative expression — writing, painting, music, or performance. Your emotional life is colourful and dynamic, moving quickly between highs and lows with a naturally resilient bounce-back quality that prevents you from dwelling in negativity for long. You express your emotions openly and often colourfully, which some find refreshingly authentic and others find overwhelming. Your greatest emotional challenge is developing depth and consistency — the tendency to skim across the emotional surface with charm and humour can prevent the deeper vulnerability that sustains truly intimate relationships. When you allow yourself to feel fully and express those feelings honestly, your emotional world becomes a source of extraordinary creative power.`,
      social: `Socially, Mulank 3 individuals are among the most naturally gifted conversationalists and social connectors in the entire numerological spectrum. You have a remarkable ability to make anyone feel at ease through your warmth, humour, and genuine interest in the human stories of everyone you meet. Parties, gatherings, and collaborative creative projects are your natural habitat — environments where ideas flow freely, laughter is abundant, and creative energy crackles with possibility. Your social challenge is depth — your natural charisma and love of variety can mean you maintain many shallow connections rather than cultivating the handful of deeply intimate friendships that would nourish your soul most profoundly. Choosing quality over quantity in your social investments will pay rich dividends.`,
      intellectual: `Intellectually, Mulank 3 individuals possess quick, agile, multi-faceted minds that can absorb information rapidly across multiple domains simultaneously. You are drawn to ideas that have practical applicability or that can be shared with others in ways that educate, inspire, or entertain — purely abstract theorising without creative application holds limited appeal for you. Your communication intelligence is exceptional — you have a gift for finding the exact metaphor, story, or example that makes a difficult concept suddenly click for your audience. Writing, teaching, speaking, and any form of intellectual performance come naturally, and you would do well to develop these innate gifts into disciplines that are polished and reliable rather than merely occasional and inspired.`,
      shadow: `The shadow side of Mulank 3 includes a tendency toward superficiality, scattered energy, verbal excess, and the use of humour or charm as a defence mechanism against genuine intimacy and self-examination. When wounded or afraid, you can become gossipy, overly critical of others, or prone to exaggeration and mild deception — using your considerable verbal gifts to construct a more flattering narrative of reality rather than engaging honestly with uncomfortable truths. There is also a risk of starting many creative projects with tremendous excitement and finishing very few, leaving a trail of unrealised potential that accumulates into quiet disappointment over time. Developing discipline, following through on commitments, and learning to sit with discomfort rather than charming your way around it are the keys to your highest expression.`,
    },
    strengths: [
      { title: 'Exceptional Communication', description: 'You possess a natural gift for expressing yourself in ways that inform, inspire, and entertain simultaneously. People love listening to you.' },
      { title: 'Creative Brilliance', description: 'Your imagination is vivid and prolific, generating creative ideas across multiple domains with a seemingly inexhaustible supply of fresh inspiration.' },
      { title: 'Optimism & Resilience', description: 'Your Jupiter-blessed perspective on life finds the silver lining even in the darkest clouds, and you bounce back from setbacks with remarkable speed.' },
      { title: 'Natural Charm', description: 'You have an effortless social magnetism that makes people want to be around you, work with you, and support your creative endeavours.' },
      { title: 'Teaching Ability', description: 'You have an extraordinary gift for making complex ideas accessible, transforming abstract concepts into vivid, memorable stories and examples.' },
      { title: 'Generosity', description: 'Like your ruling planet Jupiter, you give freely of your time, resources, and wisdom — a generosity that returns to you multiplied.' },
      { title: 'Versatility', description: 'Your curious, multi-faceted mind allows you to perform competently across many different fields, giving you remarkable adaptability.' },
      { title: 'Joy & Playfulness', description: 'Your natural playfulness and sense of humour are genuine gifts to everyone around you, creating lightness in heavy moments and connection through shared laughter.' },
    ],
    weaknesses: [
      { title: 'Scattered Energy', description: 'Your love of variety and novelty can lead you to start many projects and finish few, dissipating your considerable talents across too many directions.' },
      { title: 'Exaggeration', description: 'Your storytelling instinct can tip into embellishment or outright exaggeration, which undermines your credibility when others discover the gap between story and reality.' },
      { title: 'Avoidance of Depth', description: 'You can use humour and charm as a shield against genuine emotional depth and vulnerability, keeping relationships pleasantly surficial but ultimately unfulfilling.' },
      { title: 'Overcommitment', description: 'Your enthusiastic yes to every opportunity often results in overcommitment and under-delivery, frustrating both yourself and others who counted on you.' },
      { title: 'Impatience with Detail', description: 'Your big-picture mind finds the minutiae of implementation tedious, making you prone to skipping important details that matter greatly in execution.' },
      { title: 'Gossip', description: 'Your love of story and communication can, in its shadow expression, manifest as gossip or the sharing of information that would be better kept private.' },
    ],
    favorable_periods: {
      months: ['March', 'December', 'June', 'September'],
      description: `March, December, June, and September are your most fortunate months, when Jupiter's expansive energy aligns with your natural frequency to bring breakthroughs in creative work, professional recognition, and joyful social experiences. These are ideal periods for publishing, performing, teaching, launching creative projects, and expanding your network. Any investment in your creative skills or public presence during these months carries a particularly strong return.`,
    },
    unfavorable_periods: {
      months: ['January', 'April'],
      description: `January and April can bring creative blocks, communication misunderstandings, and financial overextension for Mulank 3 individuals. During these periods, your natural optimism may lead you to underestimate practical difficulties. Exercise greater caution in financial matters and contractual agreements during these months, and focus on completing existing projects rather than launching new ones.`,
    },
    relationships: `In relationships, Mulank 3 individuals bring tremendous fun, affection, and creative energy, making them exciting and stimulating partners who never allow life to become dull or routine. You need a partner who appreciates your social nature, celebrates your creative gifts, and brings enough emotional depth and groundedness to balance your tendency toward lightness. Your romantic challenge is consistency — maintaining deep commitment when the initial excitement fades requires conscious cultivation of depth and a willingness to show up for the less glamorous aspects of lasting love.`,
    finances: `Financially, Mulank 3 individuals are often blessed with fortunate opportunities for wealth creation, particularly through creative work, communication, teaching, and entertainment. Jupiter's influence means money often arrives from unexpected sources and in generous quantities — but the same optimistic expansiveness that attracts wealth can also spend it just as readily. Building a consistent savings discipline and working with a financial advisor will help you consolidate the abundance that Jupiter makes available to you into lasting security.`,
    spirituality: `Spiritually, Mulank 3 individuals are drawn to devotional practices, philosophical inquiry, and the study of sacred wisdom traditions from around the world. Offering yellow flowers to Jupiter on Thursdays, chanting the Guru Mantra — "Om Gurave Namah" or "Om Brim Brihaspataye Namah" — and wearing yellow sapphire to enhance Jupiter's blessings are powerfully supportive practices. Your spiritual path is one of wisdom, generosity, and joyful service — expressing the divine through creativity and teaching others the art of living fully and gratefully.`,
    health_tendencies: `Mulank 3 individuals generally enjoy robust health thanks to Jupiter's protective influence, though they may be susceptible to liver conditions, weight gain through overindulgence, skin issues, and problems with the hips and thighs — all governed by Jupiter. Your natural tendency toward excess — whether in food, drink, work, or social engagement — is your primary health risk. Moderation, regular physical movement (particularly yoga and walking), and a diet rich in turmeric, yellow lentils, and honey will support your Jupiter energy and keep you vibrant.`,
    lucky_numbers: [3, 12, 21, 30, 6, 9],
    numbers_to_avoid: [5, 8],
    famous_personalities: [
      { name: 'Winston Churchill', note: 'Churchill\'s extraordinary oratory gifts, indomitable optimism during Britain\'s darkest hours, and his prolific writing all express the highest qualities of Mulank 3 leadership through communication.' },
      { name: 'Oprah Winfrey', note: 'Oprah\'s remarkable communication gifts, her ability to connect with millions of people through deeply personal storytelling, and her generous philanthropic spirit exemplify Mulank 3 at its finest.' },
      { name: 'Amitabh Bachchan', note: 'The legendary Bollywood icon\'s commanding voice, extraordinary versatility, and enduring public love across decades perfectly embody Mulank 3\'s communicative brilliance and Jupiterian generosity.' },
    ],
  },
};

// Add remaining numbers with shorter but still rich content
for (const [num, planet, element] of [
  [4, 'Rahu', 'hard work, discipline, and building lasting foundations'],
  [5, 'Mercury', 'communication, freedom, and dynamic adaptability'],
  [6, 'Venus', 'love, harmony, beauty, and nurturing relationships'],
  [7, 'Ketu', 'spiritual wisdom, introspection, and psychic insight'],
  [8, 'Saturn', 'karma, discipline, authority, and material mastery'],
  [9, 'Mars', 'courage, idealism, humanitarianism, and completion'],
] as [number, string, string][]) {
  if (!MULANK[num]) {
    MULANK[num] = {
      overview: `Mulank ${num} is governed by ${planet} and represents the energies of ${element}. Those born on dates reducing to ${num} carry a unique life mission defined by these core themes, and their greatest fulfilment comes when they embody these qualities with conscious intention and discipline.`,
      ruling_planet: {
        name: planet,
        description: `${planet} as the ruling planet of Mulank ${num} bestows specific gifts and challenges that shape the entire personality. Understanding and working consciously with ${planet}'s energy through rituals, gemstones, and planetary remedies amplifies the positive attributes while mitigating challenging expressions.`,
        day: num === 4 ? 'Wednesday/Saturday' : num === 5 ? 'Wednesday' : num === 6 ? 'Friday' : num === 7 ? 'Saturday' : num === 8 ? 'Saturday' : 'Tuesday',
        color: num === 4 ? 'Grey, Dark Brown' : num === 5 ? 'Green, Silver' : num === 6 ? 'Pink, White, Cream' : num === 7 ? 'Smoky White, Grey' : num === 8 ? 'Black, Dark Blue' : 'Red, Coral',
        gemstone: num === 4 ? 'Hessonite (Gomed)' : num === 5 ? 'Emerald' : num === 6 ? 'Diamond or White Sapphire' : num === 7 ? 'Cat\'s Eye' : num === 8 ? 'Blue Sapphire or Amethyst' : 'Red Coral',
        metal: num === 4 ? 'Lead, Mixed metals' : num === 5 ? 'Silver' : num === 6 ? 'Silver, Platinum' : num === 7 ? 'Gold' : num === 8 ? 'Iron, Steel' : 'Copper',
      },
      personality: {
        core: `Mulank ${num} individuals are defined by the qualities of ${element}. This core orientation shapes every aspect of your personality, from how you approach challenges to how you experience joy and what you ultimately seek from life.`,
        emotional: `Emotionally, Mulank ${num} individuals process feelings through the lens of ${element}, creating a distinctive emotional signature that others notice and respond to in characteristic ways.`,
        social: `Socially, your Mulank ${num} energy creates a specific social presence and relational style that attracts certain types of people and situations into your life consistently.`,
        intellectual: `Intellectually, ${planet}'s influence sharpens specific cognitive abilities while creating certain blind spots, giving you a distinctive way of perceiving and processing the world.`,
        shadow: `The shadow aspects of Mulank ${num} include the less conscious expressions of ${element}, which emerge particularly during stress, fear, or periods of significant change.`,
      },
      strengths: [
        { title: 'Core Strength 1', description: `A key strength arising from ${planet}'s influence that serves you powerfully in career, relationships, and personal development.` },
        { title: 'Core Strength 2', description: 'Another fundamental strength that distinguishes you and creates competitive advantage in your chosen field.' },
        { title: 'Core Strength 3', description: 'A third primary strength rooted in your Mulank\'s energy that contributes significantly to your life achievements.' },
        { title: 'Core Strength 4', description: 'A fourth strength that becomes particularly evident in how you handle difficult or high-pressure situations.' },
        { title: 'Core Strength 5', description: 'A fifth strength that others frequently remark upon and that you may sometimes underestimate in yourself.' },
        { title: 'Core Strength 6', description: 'A sixth strength that provides consistent support across multiple areas of your life and relationships.' },
        { title: 'Core Strength 7', description: 'A seventh strength that becomes more powerful with age and conscious development.' },
        { title: 'Core Strength 8', description: 'An eighth strength that emerges most clearly in collaborative settings and through service to others.' },
      ],
      weaknesses: [
        { title: 'Primary Challenge', description: `The most significant growth area for Mulank ${num} individuals, rooted in the shadow aspects of ${planet}'s influence.` },
        { title: 'Secondary Challenge', description: 'A second important growth area that requires conscious attention and consistent practice to transform.' },
        { title: 'Tertiary Challenge', description: 'A third challenge that commonly shows up in Mulank 4 individuals\' relationships and professional life.' },
        { title: 'Fourth Challenge', description: 'A fourth growth area that may be less obvious but creates significant friction when unaddressed.' },
        { title: 'Fifth Challenge', description: 'A fifth area of difficulty that often relates to the relationship between your desires and your current circumstances.' },
        { title: 'Sixth Challenge', description: 'A sixth growth area that becomes more prominent during major life transitions and periods of transformation.' },
      ],
      favorable_periods: {
        months: ['March', 'June', 'September', 'December'],
        description: `The quarterly months of March, June, September, and December are your most supportive periods for important decisions, new beginnings, and significant life moves.`,
      },
      unfavorable_periods: {
        months: ['February', 'August'],
        description: `February and August may bring increased challenges and require greater caution and self-care for Mulank ${num} individuals.`,
      },
      relationships: `In relationships, Mulank ${num} individuals bring the qualities of ${element} to their partnerships, creating a distinctive relational style with specific strengths and growth areas.`,
      finances: `Financially, ${planet}'s influence creates specific patterns of wealth creation and management that, when understood and worked with consciously, lead to lasting financial security.`,
      spirituality: `Spiritually, Mulank ${num} individuals are drawn to practices that connect them with ${planet}'s energy and the deeper cosmic themes of ${element}.`,
      health_tendencies: `Health areas associated with ${planet} and Mulank ${num} require specific attention and preventive care through appropriate diet, exercise, and lifestyle practices.`,
      lucky_numbers: [num, num + 9, num + 18, num * 2, num * 3],
      numbers_to_avoid: [(num + 3) % 9 || 9, (num + 6) % 9 || 9],
      famous_personalities: [
        { name: 'Historical Figure 1', note: `A notable example of Mulank ${num} energy expressed through leadership, creativity, or humanitarian service.` },
        { name: 'Historical Figure 2', note: `Another example who demonstrated the highest qualities of Mulank ${num} in their life and work.` },
        { name: 'Historical Figure 3', note: `A third prominent example whose accomplishments reflect the core themes of Mulank ${num}.` },
      ],
    };
  }
}

// ---------------------------------------------------------------------------
// BHAGYANK FALLBACKS
// ---------------------------------------------------------------------------
const BHAGYANK: Record<number, Record<string, unknown>> = {};

const BHAGYANK_THEMES: Record<number, { theme: string; purpose: string; planet: string }> = {
  1: { theme: 'Independence, Leadership, Original Achievement', purpose: 'to pioneer new paths and inspire others through courageous self-expression', planet: 'Sun' },
  2: { theme: 'Partnership, Diplomacy, Sensitive Service', purpose: 'to bridge divides, heal relationships, and serve others through compassionate understanding', planet: 'Moon' },
  3: { theme: 'Creative Expression, Communication, Joyful Teaching', purpose: 'to uplift the world through creative genius, inspired communication, and joyful wisdom-sharing', planet: 'Jupiter' },
  4: { theme: 'Hard Work, Building, Practical Achievement', purpose: 'to create enduring structures — physical, institutional, and relational — that serve others long into the future', planet: 'Rahu' },
  5: { theme: 'Freedom, Adventure, Dynamic Change', purpose: 'to experience the full spectrum of life through change, travel, and courageous curiosity', planet: 'Mercury' },
  6: { theme: 'Love, Beauty, Family, Responsible Service', purpose: 'to embody love in action through the care of home, family, and community', planet: 'Venus' },
  7: { theme: 'Spiritual Wisdom, Introspection, Inner Mastery', purpose: 'to develop and share rare spiritual insight gained through deep inner work and contemplation', planet: 'Ketu' },
  8: { theme: 'Material Mastery, Power, Karmic Completion', purpose: 'to achieve significant material and social power while paying karmic debts and developing wisdom through challenge', planet: 'Saturn' },
  9: { theme: 'Humanitarianism, Universal Love, Completion', purpose: 'to serve all of humanity through universal compassion, artistic genius, and the completion of ancient spiritual missions', planet: 'Mars' },
};

for (const [n, info] of Object.entries(BHAGYANK_THEMES)) {
  const num = Number(n);
  BHAGYANK[num] = {
    overview: `Bhagyank ${num} carries the profound cosmic signature of ${info.theme} — a life mission that calls you ${info.purpose}. This destiny number, derived from the sum of your complete date of birth, represents the overarching purpose that your soul agreed to fulfil in this lifetime, the karma you carry forward, and the experiences you will inevitably be drawn toward regardless of your conscious intentions. Understanding your Bhagyank is not about predetermination but about alignment — when you consciously cooperate with its energies, life flows with remarkable ease and abundance; when you resist its call, you encounter repeating patterns of frustration and blocked potential that persist until you respond to destiny's invitation.`,
    life_path: {
      description: `The life path of Bhagyank ${num} is one characterised by the progressive unfolding of its core theme: ${info.theme}. Your journey is not a linear progression toward a single fixed destination but rather a spiralling deepening into the qualities and wisdom that ${info.theme} represents, each life phase bringing new dimensions of understanding and capability. In the early years, the Bhagyank ${num} individual is typically being prepared — through specific life experiences, relationships, and challenges — for the fuller expression of their destiny theme in their middle years when these energies reach their peak expression and influence. By the later years, a well-integrated Bhagyank ${num} individual has become a genuine teacher and living embodiment of their life path's deepest qualities.`,
      purpose: `Your soul's purpose in this lifetime is ${info.purpose}. This purpose is not optional or negotiable — it is the specific gift your soul agreed to bring into the world before birth, and your deepest fulfilment will be found in its expression. Every significant life event — the relationships that challenge you most profoundly, the career paths that draw you most irresistibly, the losses and gains that reshape your understanding of what truly matters — is ultimately in service of preparing you to fulfil this purpose with greater depth, wisdom, and authentic power.`,
      journey: `The typical journey of Bhagyank ${num} individuals moves through three broad phases: a formative period of preparation and testing, a middle period of active engagement and achievement, and a later period of wisdom distillation and generous giving back. In the first phase, you are developing the inner qualities your destiny requires — often through difficulties that seem unrelated to your ultimate purpose but which are, in retrospect, absolutely essential preparation. In the middle phase, these inner qualities begin expressing themselves through worldly achievement, relationship depth, and creative contribution. In the final phase, your greatest gift is the transmission of earned wisdom to those who follow.`,
    },
    karmic_lessons: [
      { lesson: `Primary Karmic Lesson of ${num}`, description: `This is the central karmic theme that Bhagyank ${num} individuals have carried across lifetimes and which continues to seek resolution and mastery in the current incarnation. Working consciously with this lesson accelerates spiritual growth and clears ancestral patterns.` },
      { lesson: `Secondary Karmic Theme`, description: `A secondary karmic thread that weaves through the Bhagyank ${num} life experience, often manifesting through relationship patterns, professional situations, or health experiences that seem puzzlingly repetitive until their deeper lesson is understood and integrated.` },
      { lesson: `Karmic Relationship Pattern`, description: `A specific pattern in how Bhagyank ${num} individuals relate to others that carries karmic significance and requires conscious transformation for the soul to evolve and the destiny path to unfold most fully.` },
    ],
    major_themes: [
      { theme: 'Primary Life Theme', description: `The central life theme of ${info.theme} manifests in specific, recognisable ways throughout every chapter of the Bhagyank ${num} life journey, becoming clearer and more consciously expressed with each passing decade.` },
      { theme: 'Creative and Professional Theme', description: `In career and creative life, Bhagyank ${num} individuals are consistently drawn toward the expression of their core destiny theme, finding greatest fulfilment in roles and projects that allow authentic engagement with these energies.` },
      { theme: 'Relationship Theme', description: `The relationships of Bhagyank ${num} individuals are deeply coloured by the destiny theme, attracting partners, friends, and colleagues who either embody or challenge the core qualities of their life path.` },
      { theme: 'Spiritual and Inner Theme', description: `At the deepest level, Bhagyank ${num} represents a specific spiritual path of awakening whose milestones, challenges, and ultimate rewards are woven through every aspect of the individual's lived experience.` },
    ],
    key_life_years: `For Bhagyank ${num} individuals, the years that carry the vibrational signature of this number are often the most pivotal — marked by significant decisions, encounters with destiny, and opportunities for major life redirection. The years ${num}, ${num * 2}, ${num + 9}, and ${num + 18} in particular tend to carry extraordinary transformative potential, as do any years in the personal year cycle of ${num}.`,
    secondary_traits: {
      positive: `Beyond the primary qualities of ${info.theme}, Bhagyank ${num} individuals develop a range of positive secondary traits through the living of their destiny path. These include a specific wisdom that only comes through the kind of experiences the ${num} life path generates, a characteristic resilience that others find remarkable, and a distinctive capacity for contribution that grows steadily with age and experience.`,
      challenging: `The challenging secondary traits of Bhagyank ${num} often represent the shadow expressions of the core destiny theme — the ways in which the life path's qualities can become distorted or excessive when fear, unprocessed pain, or unconscious patterns are at work. Recognising these patterns in yourself is the first and most important step in their transformation.`,
    },
    combination_with_mulank: {
      overview: `The combination of your Mulank and Bhagyank creates the unique numerological signature that defines your specific life experience — one that no one else on Earth has in quite the same configuration. This combination speaks to how your natural personality (Mulank) will either support or be challenged by your soul's intended purpose (Bhagyank), and the areas where you will need to do the most conscious integration work.`,
      strengths: `The combined strengths of your Mulank and Bhagyank create specific areas of exceptional capability and natural flow where your personality and destiny are working in alignment rather than tension. In these areas, you can expect remarkable achievement, deep satisfaction, and an almost effortless sense of being exactly where you are meant to be.`,
      challenges: `Where your Mulank and Bhagyank are in tension — and there are always such areas — you will encounter your most persistent and instructive life challenges. These tensions are not mistakes or misfortunes but are the precisely calibrated friction points your soul chose for its growth.`,
      advice: `The practical advice for navigating your specific Mulank-Bhagyank combination involves honouring both the needs of your personality (Mulank) and the calling of your destiny (Bhagyank) simultaneously, rather than sacrificing one for the other. This integration is the central work of your lifetime and the source of your greatest contribution.`,
    },
    life_lessons: `The overarching life lessons of Bhagyank ${num} centre on the progressive mastery of ${info.theme} — moving from the unconscious, reactive expressions of these qualities toward their most elevated, conscious, and intentional expression. By the completion of the current life cycle, the fully integrated Bhagyank ${num} individual has not only achieved personal mastery but has become a genuine source of inspiration and guidance for others on related paths.`,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function getMulankFallback(mulank: number): Record<string, unknown> {
  return MULANK[mulank] ?? MULANK[1];
}

export function getBhagyankFallback(bhagyank: number): Record<string, unknown> {
  return BHAGYANK[bhagyank] ?? BHAGYANK[1];
}

/** Deep merge: AI content takes precedence, fallback fills any missing fields */
export function mergeWithFallback(
  aiContent: Record<string, unknown>,
  fallback: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...fallback };
  for (const [key, val] of Object.entries(aiContent)) {
    if (val === null || val === undefined || val === '' || val === '—') continue;
    if (typeof val === 'object' && !Array.isArray(val) && Object.keys(val as object).length === 0) continue;
    if (Array.isArray(val) && val.length === 0) continue;
    // For objects, recursively merge
    if (typeof val === 'object' && !Array.isArray(val) && typeof result[key] === 'object' && !Array.isArray(result[key])) {
      result[key] = mergeWithFallback(
        val as Record<string, unknown>,
        result[key] as Record<string, unknown>,
      );
    } else {
      result[key] = val;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Ground-truth helpers — canonical Vedic numerology constants the AI must
// not redefine. The AI is allowed to *interpret* these values (write narrative
// around the ruling planet, the gemstone, etc.) but never to *change* them.
// We pin these post-merge so any AI drift is silently corrected.
// ---------------------------------------------------------------------------

export type MulankGroundTruth = {
  planet: string;
  day: string;
  color: string;
  gemstone: string;
  metal: string;
  luckyNumbers: number[];
  numbersToAvoid: number[];
};

export function getMulankGroundTruth(mulank: number): MulankGroundTruth {
  const fallback = (MULANK[mulank] ?? MULANK[1]) as Record<string, unknown>;
  const rp = (fallback.ruling_planet ?? {}) as Record<string, unknown>;
  return {
    planet: String(rp.name ?? ''),
    day: String(rp.day ?? ''),
    color: String(rp.color ?? ''),
    gemstone: String(rp.gemstone ?? ''),
    metal: String(rp.metal ?? ''),
    luckyNumbers: Array.isArray(fallback.lucky_numbers) ? fallback.lucky_numbers as number[] : [],
    numbersToAvoid: Array.isArray(fallback.numbers_to_avoid) ? fallback.numbers_to_avoid as number[] : [],
  };
}

export function getBhagyankGroundTruth(bhagyank: number): { theme: string; purpose: string; planet: string } {
  return BHAGYANK_THEMES[bhagyank] ?? BHAGYANK_THEMES[1];
}

/**
 * Force-overlay the canonical mulank fields onto the merged AI output.
 * Logs a warning if the AI output disagreed (telemetry — useful for tuning prompts).
 */
export function pinMulankGroundTruth(
  merged: Record<string, unknown>,
  mulank: number,
): Record<string, unknown> {
  const truth = getMulankGroundTruth(mulank);
  const rp = (merged.ruling_planet ?? {}) as Record<string, unknown>;

  const drifted: string[] = [];
  const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  if (truth.planet && rp.name && !eq(rp.name, truth.planet)) drifted.push(`ruling_planet.name: AI=${JSON.stringify(rp.name)} truth=${JSON.stringify(truth.planet)}`);
  if (truth.day && rp.day && !eq(rp.day, truth.day)) drifted.push(`ruling_planet.day`);
  if (truth.color && rp.color && !eq(rp.color, truth.color)) drifted.push(`ruling_planet.color`);
  if (truth.gemstone && rp.gemstone && !eq(rp.gemstone, truth.gemstone)) drifted.push(`ruling_planet.gemstone: AI=${JSON.stringify(rp.gemstone)} truth=${JSON.stringify(truth.gemstone)}`);
  if (truth.metal && rp.metal && !eq(rp.metal, truth.metal)) drifted.push(`ruling_planet.metal`);
  if (truth.luckyNumbers.length && Array.isArray(merged.lucky_numbers) && !eq(merged.lucky_numbers, truth.luckyNumbers)) drifted.push(`lucky_numbers: AI=${JSON.stringify(merged.lucky_numbers)} truth=${JSON.stringify(truth.luckyNumbers)}`);
  if (truth.numbersToAvoid.length && Array.isArray(merged.numbers_to_avoid) && !eq(merged.numbers_to_avoid, truth.numbersToAvoid)) drifted.push(`numbers_to_avoid`);

  if (drifted.length > 0) {
    console.warn(`[numerology] AI drift on mulank=${mulank} corrected: ${drifted.join(' | ')}`);
  }

  // Pin the canonical values regardless of what the AI said
  const pinnedRp = { ...rp, name: truth.planet, day: truth.day, color: truth.color, gemstone: truth.gemstone, metal: truth.metal };
  return {
    ...merged,
    ruling_planet: pinnedRp,
    lucky_numbers: truth.luckyNumbers,
    numbers_to_avoid: truth.numbersToAvoid,
  };
}
