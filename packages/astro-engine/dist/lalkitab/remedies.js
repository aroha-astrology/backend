"use strict";
// =============================================================================
// Lal Kitab Remedies & Totke
// =============================================================================
// 108 combinations (9 planets x 12 houses) with practical remedies and totke
// sourced from traditional Lal Kitab remedy texts.
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLalKitabRemedies = getLalKitabRemedies;
/**
 * Generate a lookup key for planet + house combination.
 */
function key(planet, house) {
    return `${planet}_${house}`;
}
const REMEDY_DATABASE = {
    // =========================================================================
    // SUN in houses 1-12
    // =========================================================================
    [key('Sun', 1)]: {
        remedies: [
            'Keep water beside your bed at night and pour it on a plant in the morning',
            'Wear a copper ring on the ring finger',
            'Offer wheat and jaggery to a cow on Sundays',
        ],
        totke: [
            'Keep a solid piece of copper in your pocket',
            'Throw a copper coin in flowing water on Sundays',
            'Apply saffron tilak on the forehead every morning',
            'Keep a red handkerchief in your pocket',
        ],
    },
    [key('Sun', 2)]: {
        remedies: [
            'Keep a square piece of copper near your cash box',
            'Offer water to a Peepal tree daily',
            'Do not accept free items or charity from others',
        ],
        totke: [
            'Store wheat or jaggery in a copper vessel at home',
            'Feed monkeys on Sundays',
            'Place a copper sun idol at the entrance of the house',
            'Wear a ruby or garnet ring after energizing on a Sunday',
        ],
    },
    [key('Sun', 3)]: {
        remedies: [
            'Serve your father and maintain good relations with government officials',
            'Donate red clothes on Sundays',
            'Offer almonds at a temple',
        ],
        totke: [
            'Keep saffron in a copper container at home',
            'Feed jaggery to ants every morning',
            'Wear gold on the body',
            'Apply tilak of raw milk mixed with saffron',
        ],
    },
    [key('Sun', 4)]: {
        remedies: [
            'Offer wheat to a temple on Sundays',
            'Keep your character impeccable; avoid lies and deceit',
            'Serve your parents selflessly',
        ],
        totke: [
            'Place copper nails on the four corners of your bed',
            'Feed dough balls to fish on Sundays',
            'Do not keep a broken mirror at home',
            'Keep a small piece of gold in a red cloth at home',
        ],
    },
    [key('Sun', 5)]: {
        remedies: [
            'Do not accept anything free; pay full price always',
            'Donate almonds and coconuts at a temple',
            'Respect teachers and elders',
        ],
        totke: [
            'Feed cows with jaggery and wheat on Sundays',
            'Apply saffron tilak before stepping out',
            'Keep a copper plate under your pillow',
            'Offer water mixed with jaggery to the Sun at sunrise',
        ],
    },
    [key('Sun', 6)]: {
        remedies: [
            'Keep a dark room or store in your house',
            'Feed dogs with bread',
            'Donate jaggery and wheat to the poor',
        ],
        totke: [
            'Store almonds in a copper container',
            'Throw copper coins into flowing water every Sunday',
            'Wear a copper bangle on the right wrist',
            'Keep a red bulb burning at the main entrance at night',
        ],
    },
    [key('Sun', 7)]: {
        remedies: [
            'Marry after the age of 24',
            'Do not consume non-veg food or alcohol',
            'Offer jaggery and gram at a Hanuman temple on Tuesdays',
        ],
        totke: [
            'Keep a copper vessel filled with honey at home',
            'Feed jaggery-coated bread to a cow daily',
            'Wear a copper ring on the ring finger',
            'Place a copper plate with wheat grains in the sun every Sunday',
        ],
    },
    [key('Sun', 8)]: {
        remedies: [
            'Do not live in a house facing south',
            'Offer coconut in flowing water',
            'Donate red or copper items on Sundays',
        ],
        totke: [
            'Keep almonds beside your bed and distribute them in the morning',
            'Float wheat grains in flowing water on Sundays',
            'Keep a small piece of gold in your wallet',
            'Apply a paste of saffron and sandalwood on the forehead on Sundays',
        ],
    },
    [key('Sun', 9)]: {
        remedies: [
            'Serve your father; never disrespect him',
            'Donate wheat, saffron, and red flowers at a temple',
            'Keep fasts on Sundays',
        ],
        totke: [
            'Offer water to the Sun through a copper vessel every morning',
            'Keep a copper plate in your prayer room',
            'Feed jaggery to monkeys on Sundays',
            'Place a red cloth under your mattress',
        ],
    },
    [key('Sun', 10)]: {
        remedies: [
            'Install a copper sun symbol at your workplace',
            'Do not consume alcohol or tobacco',
            'Feed and respect your father',
        ],
        totke: [
            'Keep a copper coin from the day of your birth in your wallet',
            'Offer Arghya (water) to the Sun every morning',
            'Keep saffron in a red cloth in your pocket',
            'Donate ghee to a temple on Sundays',
        ],
    },
    [key('Sun', 11)]: {
        remedies: [
            'Keep a vessel of water near your bed at night',
            'Do not be greedy; help the poor',
            'Offer wheat at a temple every Sunday',
        ],
        totke: [
            'Feed chapati with jaggery to cows daily',
            'Keep copper utensils at home',
            'Wear a gold chain or pendant',
            'Distribute almonds among children on Sundays',
        ],
    },
    [key('Sun', 12)]: {
        remedies: [
            'Do not deal with items related to Mars (red items, weapons)',
            'Offer wheat and jaggery to cows',
            'Keep a copper piece in your pocket always',
        ],
        totke: [
            'Throw almonds in flowing water on Sundays',
            'Apply saffron tilak daily',
            'Feed fish with wheat dough balls',
            'Keep a copper water pot at the entrance of the house',
        ],
    },
    // =========================================================================
    // MOON in houses 1-12
    // =========================================================================
    [key('Moon', 1)]: {
        remedies: [
            'Keep a silver piece in your pocket',
            'Drink water from a silver glass',
            'Respect your mother and elderly women',
        ],
        totke: [
            'Keep rainwater stored in a silver vessel at home',
            'Offer milk to a Shiva Linga on Mondays',
            'Wear a pearl ring on the little finger',
            'Keep a white handkerchief in your pocket',
        ],
    },
    [key('Moon', 2)]: {
        remedies: [
            'Keep a silver square piece in the cash box',
            'Offer milk and rice to a temple on Mondays',
            'Never carry or deal with milk at night',
        ],
        totke: [
            'Place silver items in your foundation/locker',
            'Offer white flowers to running water on Mondays',
            'Keep a glass of water beside your bed every night',
            'Wear a silver chain or bracelet',
        ],
    },
    [key('Moon', 3)]: {
        remedies: [
            'Offer milk to the roots of a Banyan tree',
            'Do not keep a well or water tank in the south direction',
            'Respect sisters and aunts',
        ],
        totke: [
            'Keep a silver needle in your collar on Mondays',
            'Donate white cloth to poor women on Mondays',
            'Keep fresh milk in a silver glass at home',
            'Float rice in flowing water on Mondays',
        ],
    },
    [key('Moon', 4)]: {
        remedies: [
            'Keep silver ornaments at home',
            'Serve your mother and elderly women',
            'Keep a square piece of silver in a white cloth',
        ],
        totke: [
            'Offer white sweets to children on Mondays',
            'Keep a glass of milk on the roof at night and pour it on a plant in the morning',
            'Wear a pearl set in silver',
            'Donate rice on Mondays',
        ],
    },
    [key('Moon', 5)]: {
        remedies: [
            'Do not deal in milk-related businesses',
            'Keep your temperament calm and avoid anger',
            'Offer rice to a temple on Mondays',
        ],
        totke: [
            'Bury a silver piece in the foundation of your house',
            'Keep a white cloth under your mattress',
            'Feed white food to Brahmins on Mondays',
            'Donate white sweets to orphans',
        ],
    },
    [key('Moon', 6)]: {
        remedies: [
            'Keep a silver ball in your pocket',
            'Do not keep rain water stored on the roof',
            'Install a hand pump or water source at your home',
        ],
        totke: [
            'Offer milk to stray dogs',
            'Keep a silver coin received from your mother',
            'Donate white cloth on Mondays',
            'Float almonds in milk in a river on Mondays',
        ],
    },
    [key('Moon', 7)]: {
        remedies: [
            'Keep a silver idol of Goddess Durga at home',
            'Offer milk and water at a Shiva temple on Mondays',
            'Avoid construction work on Mondays',
        ],
        totke: [
            'Wear a pearl ring set in silver',
            'Keep a glass of water near the head of your bed',
            'Feed white pigeons on Mondays',
            'Donate silver items to married women',
        ],
    },
    [key('Moon', 8)]: {
        remedies: [
            'Keep a square silver piece under your pillow',
            'Do not deal in or accept free milk',
            'Offer coconut water to a Shiva Linga',
        ],
        totke: [
            'Keep a silver ring received from your mother',
            'Float rice and silver in flowing water on Mondays',
            'Burn camphor at home every evening',
            'Keep a glass of milk beside your bed and pour it at the root of a plant in the morning',
        ],
    },
    [key('Moon', 9)]: {
        remedies: [
            'Respect your mother and grandmother',
            'Keep a silver idol at the place of worship',
            'Offer water at a temple every Monday',
        ],
        totke: [
            'Place a silver coin in your wallet on a Monday',
            'Offer curd rice at a temple on Mondays',
            'Keep rice in a silver vessel at home',
            'Donate white blankets to the elderly on Mondays',
        ],
    },
    [key('Moon', 10)]: {
        remedies: [
            'Keep rain water in a silver container',
            'Help your mother in all matters',
            'Offer milk to the poor on Mondays',
        ],
        totke: [
            'Wear a silver bangle on the left wrist',
            'Keep a white cloth tied with rice at the place of worship',
            'Offer milk mixed with water at a Peepal tree root on Mondays',
            'Feed kheer (rice pudding) to Brahmins on Mondays',
        ],
    },
    [key('Moon', 11)]: {
        remedies: [
            'Keep silver items at home',
            'Offer milk to a snake idol or Shiva temple on Mondays',
            'Help poor women',
        ],
        totke: [
            'Store milk in a silver vessel before sleeping',
            'Keep a silver coin always in your cash box',
            'Donate white items on Mondays',
            'Float rice in flowing water on every Purnima (full moon)',
        ],
    },
    [key('Moon', 12)]: {
        remedies: [
            'Bury silver at the threshold of your house',
            'Never sell milk or milk products',
            'Donate white clothes to widows on Mondays',
        ],
        totke: [
            'Place a silver cup of water at the head of your bed every night',
            'Offer rice and white flowers at a temple on Mondays',
            'Keep a silver piece received from your mother in your wallet',
            'Feed milk to cats on Mondays',
        ],
    },
    // =========================================================================
    // MARS in houses 1-12
    // =========================================================================
    [key('Mars', 1)]: {
        remedies: [
            'Keep a deer skin at home',
            'Do not sell ancestral property',
            'Feed sweet chapatis to dogs',
        ],
        totke: [
            'Keep a piece of red sandal wood in your pocket',
            'Donate red lentils on Tuesdays',
            'Keep a knife or iron item under your pillow',
            'Offer sweet chapati to a monkey on Tuesdays',
        ],
    },
    [key('Mars', 2)]: {
        remedies: [
            'Keep a deer skin at home or workplace',
            'Eat meals in the kitchen; do not eat in the bedroom',
            'Feed sweet bread to dogs',
        ],
        totke: [
            'Keep red lentils tied in a red cloth in the kitchen',
            'Float red flowers in flowing water on Tuesdays',
            'Apply a tilak of red sandal paste',
            'Keep an iron nail in your pocket',
        ],
    },
    [key('Mars', 3)]: {
        remedies: [
            'Donate sweets on Tuesdays',
            'Keep ivory or faux ivory at home',
            'Respect your siblings and neighbors',
        ],
        totke: [
            'Feed a monkey with sweet bread on Tuesdays',
            'Wear a copper ring on the ring finger',
            'Keep a piece of red sandal wood in the pocket',
            'Donate masoor dal on Tuesdays',
        ],
    },
    [key('Mars', 4)]: {
        remedies: [
            'Keep ivory or a white item near the bed',
            'Offer sweet food at a Hanuman temple on Tuesdays',
            'Do not buy property in your name before age 28',
        ],
        totke: [
            'Float red lentils and jaggery in flowing water on Tuesdays',
            'Place a copper piece under the foundation of the house',
            'Apply a red tilak before leaving home',
            'Keep honey in a brass container at home',
        ],
    },
    [key('Mars', 5)]: {
        remedies: [
            'Donate sweet bread and lentils on Tuesdays',
            'Apply saffron tilak on the forehead',
            'Feed monkeys on Tuesdays',
        ],
        totke: [
            'Offer pomegranate at a Hanuman temple on Tuesdays',
            'Keep a red handkerchief in the pocket',
            'Donate red lentils to a temple every Tuesday',
            'Keep honey in a red container at home',
            'Wear a coral ring set in copper',
        ],
    },
    [key('Mars', 6)]: {
        remedies: [
            'Keep a pet dog at home',
            'Feed sweet chapatis to stray dogs',
            'Donate honey on Tuesdays',
        ],
        totke: [
            'Keep a red thread tied on the right wrist',
            'Apply a tilak of honey mixed with saffron',
            'Keep a piece of iron at the entrance of the house',
            'Float honey in flowing water on Tuesdays',
        ],
    },
    [key('Mars', 7)]: {
        remedies: [
            'Donate red lentils on Tuesdays',
            'Keep a solid silver square piece at home',
            'Offer sweet food to poor people on Tuesdays',
        ],
        totke: [
            'Wash with water mixed with a pinch of red sandalwood',
            'Keep a deer skin at the place of worship',
            'Feed red lentils to birds on Tuesdays',
            'Float sweet bread in flowing water on Tuesdays',
        ],
    },
    [key('Mars', 8)]: {
        remedies: [
            'Keep a deer skin at the place of worship',
            'Float sweet bread in flowing water on Tuesdays',
            'Do not deal in red-colored items as business',
        ],
        totke: [
            'Keep honey in the kitchen always',
            'Donate red cloth to workers on Tuesdays',
            'Feed stray dogs sweet food on Tuesdays',
            'Keep an iron bangle or nail in your pocket',
        ],
    },
    [key('Mars', 9)]: {
        remedies: [
            'Feed sweet chapatis to dogs',
            'Keep honey in a brass or copper vessel at home',
            'Never mistreat animals',
        ],
        totke: [
            'Offer red flowers at a Hanuman temple on Tuesdays',
            'Keep a red handkerchief or cloth with you',
            'Donate iron items to laborers',
            'Apply red sandal paste tilak on Tuesdays',
        ],
    },
    [key('Mars', 10)]: {
        remedies: [
            'Keep a pet dog or feed stray dogs regularly',
            'Do not deal in red-colored stones or corals as trade',
            'Donate sweet food at a temple on Tuesdays',
        ],
        totke: [
            'Float red lentils in a river on Tuesdays',
            'Keep red sandalwood in a red cloth at home',
            'Offer honey at a Hanuman temple',
            'Wear a copper bangle on the right wrist',
        ],
    },
    [key('Mars', 11)]: {
        remedies: [
            'Keep a deer skin at home',
            'Do not keep a red stone in the house unless prescribed',
            'Offer sweet chapati to monkeys on Tuesdays',
        ],
        totke: [
            'Keep a copper nail in a red cloth in the locker',
            'Donate masoor dal to the poor on Tuesdays',
            'Feed stray dogs on a regular basis',
            'Keep red lentils in a copper vessel at home',
        ],
    },
    [key('Mars', 12)]: {
        remedies: [
            'Feed sweet chapatis to dogs daily',
            'Keep honey in a red or copper container at home',
            'Donate blood once a year',
        ],
        totke: [
            'Throw red lentils into flowing water on Tuesdays',
            'Keep an iron item under the bed',
            'Offer red flowers at a Durga temple on Tuesdays',
            'Keep deer skin near the place of worship',
        ],
    },
    // =========================================================================
    // MERCURY in houses 1-12
    // =========================================================================
    [key('Mercury', 1)]: {
        remedies: [
            'Do not keep birds in cages at home',
            'Wash new clothes before wearing them',
            'Keep a piece of copper with you',
        ],
        totke: [
            'Keep a green cloth with you on Wednesdays',
            'Feed green grass to cows on Wednesdays',
            'Wear an emerald ring set in gold on the little finger',
            'Float green moong dal in flowing water on Wednesdays',
        ],
    },
    [key('Mercury', 2)]: {
        remedies: [
            'Keep ivory at home',
            'Do not keep birds in cages',
            'Donate green vegetables on Wednesdays',
        ],
        totke: [
            'Bury a bronze vessel filled with moong dal in the foundation',
            'Feed green grass to cows',
            'Keep a green handkerchief in the pocket',
            'Offer green items at a temple on Wednesdays',
        ],
    },
    [key('Mercury', 3)]: {
        remedies: [
            'Donate educational books to children',
            'Keep a green-colored plant in the north direction',
            'Wash new clothes before wearing them',
        ],
        totke: [
            'Feed green vegetables to poor children on Wednesdays',
            'Wear a green thread on the wrist on Wednesdays',
            'Keep a bronze statue of Ganesha at home',
            'Float green lentils in a river on Wednesdays',
        ],
    },
    [key('Mercury', 4)]: {
        remedies: [
            'Respect your aunts (Bua) and sisters',
            'Do not keep a pet parrot',
            'Keep nose clean; do not develop nasal issues',
        ],
        totke: [
            'Donate green bangles to girls on Wednesdays',
            'Keep a bronze bowl in the kitchen',
            'Apply green paste tilak on Wednesdays',
            'Offer green lentils at a Ganesha temple',
        ],
    },
    [key('Mercury', 5)]: {
        remedies: [
            'Feed cows with green grass on Wednesdays',
            'Donate educational items to students',
            'Keep a bronze piece in the pocket',
        ],
        totke: [
            'Wear a gold ring on the little finger',
            'Bury a copper coin in a green cloth at the foundation',
            'Offer a green coconut at a Ganesha temple on Wednesdays',
            'Keep fennel seeds in a green cloth in the wallet',
        ],
    },
    [key('Mercury', 6)]: {
        remedies: [
            'Do not keep dogs as pets',
            'Donate green items on Wednesdays',
            'Keep a clean nose; wash face frequently',
        ],
        totke: [
            'Float green items in flowing water on Wednesdays',
            'Wear a stainless steel ring on the little finger',
            'Feed goats with green fodder',
            'Keep green moong dal at the place of worship',
        ],
    },
    [key('Mercury', 7)]: {
        remedies: [
            'Do not keep pets that are green (parrots, etc.)',
            'Respect your spouse and in-laws',
            'Donate green vegetables and pulses on Wednesdays',
        ],
        totke: [
            'Apply a paste of green cardamom on the forehead',
            'Keep a bronze statue at home',
            'Float green lentils in a river on Wednesdays',
            'Wear an emerald set in gold',
            'Keep a copper coin in a green cloth',
        ],
    },
    [key('Mercury', 8)]: {
        remedies: [
            'Keep a square bronze piece in the pocket',
            'Donate green pulses on Wednesdays',
            'Do not get a new house constructed on Wednesdays',
        ],
        totke: [
            'Feed green grass to a cow on Wednesdays',
            'Keep a stainless steel glass for drinking water',
            'Float moong dal in flowing water',
            'Keep green things at the place of worship',
        ],
    },
    [key('Mercury', 9)]: {
        remedies: [
            'Keep a bronze or copper piece in the wallet',
            'Respect your Guru and teachers',
            'Donate green items at a temple on Wednesdays',
        ],
        totke: [
            'Keep a bronze Ganesha idol at the study desk',
            'Feed green vegetables to the poor',
            'Wear a green thread on the wrist on Wednesdays',
            'Keep fennel seeds in a green cloth in your pocket',
        ],
    },
    [key('Mercury', 10)]: {
        remedies: [
            'Do not start new ventures on Wednesdays without prayer',
            'Donate educational materials',
            'Feed cows green grass daily',
        ],
        totke: [
            'Keep an emerald or green stone at the workplace',
            'Float green lentils in flowing water on Wednesdays',
            'Keep a bronze vessel filled with water in the north direction',
            'Apply green paste on the forehead on Wednesdays',
        ],
    },
    [key('Mercury', 11)]: {
        remedies: [
            'Help daughters and sisters in their education',
            'Keep a green plant in the north direction of the house',
            'Donate green items on Wednesdays',
        ],
        totke: [
            'Float green coconut in flowing water on Wednesdays',
            'Wear a green thread on the wrist',
            'Keep moong dal in a green cloth at the place of worship',
            'Feed green leaves to a goat',
        ],
    },
    [key('Mercury', 12)]: {
        remedies: [
            'Keep a green handkerchief in the pocket at all times',
            'Do not keep caged birds',
            'Donate stationery to students',
        ],
        totke: [
            'Feed green vegetables to a cow on Wednesdays',
            'Float green items in flowing water',
            'Bury a bronze coin in the house foundation',
            'Wear green clothes on Wednesdays',
        ],
    },
    // =========================================================================
    // JUPITER in houses 1-12
    // =========================================================================
    [key('Jupiter', 1)]: {
        remedies: [
            'Apply saffron or turmeric tilak on the forehead daily',
            'Offer prayers at a temple every Thursday',
            'Serve saints and teachers',
        ],
        totke: [
            'Keep a piece of gold in a yellow cloth at home',
            'Offer yellow sweets at a Vishnu temple on Thursdays',
            'Feed bananas to the poor on Thursdays',
            'Wear a yellow sapphire ring set in gold',
        ],
    },
    [key('Jupiter', 2)]: {
        remedies: [
            'Keep gold at home always',
            'Apply saffron tilak every morning',
            'Respect your Guru and elders',
        ],
        totke: [
            'Keep turmeric in a yellow cloth at the place of worship',
            'Offer yellow flowers at a temple on Thursdays',
            'Feed yellow lentils (chana dal) to cows on Thursdays',
            'Keep a square piece of gold in the wallet',
        ],
    },
    [key('Jupiter', 3)]: {
        remedies: [
            'Serve your elders and in-laws',
            'Do not cut a Peepal tree',
            'Offer turmeric at a temple on Thursdays',
        ],
        totke: [
            'Keep a gold piece in a yellow cloth in the locker',
            'Feed chana dal to cows on Thursdays',
            'Wear yellow on Thursdays',
            'Apply turmeric paste on the forehead on Thursdays',
        ],
    },
    [key('Jupiter', 4)]: {
        remedies: [
            'Wear gold on the body always',
            'Do not cut Peepal or Banyan trees',
            'Respect your parents and teachers',
        ],
        totke: [
            'Offer turmeric and yellow flowers at a Vishnu temple on Thursdays',
            'Keep a yellow sapphire in a yellow cloth at home',
            'Feed yellow rice to Brahmins on Thursdays',
            'Donate yellow cloth to poor Brahmins',
        ],
    },
    [key('Jupiter', 5)]: {
        remedies: [
            'Apply saffron tilak on the navel area',
            'Serve your Guru and attend spiritual discourses',
            'Donate educational items to students',
        ],
        totke: [
            'Keep a gold piece in a yellow cloth at the prayer room',
            'Offer yellow laddoos at a temple on Thursdays',
            'Feed bananas to Brahmins on Thursdays',
            'Wear a topaz ring on the index finger',
        ],
    },
    [key('Jupiter', 6)]: {
        remedies: [
            'Offer turmeric and yellow flowers at a Vishnu temple',
            'Feed cows on Thursdays',
            'Maintain good moral character',
        ],
        totke: [
            'Keep a piece of gold in the nose (gold nose stud) or on the person',
            'Float yellow items in flowing water on Thursdays',
            'Donate chana dal to the poor on Thursdays',
            'Wear a yellow thread on the wrist on Thursdays',
        ],
    },
    [key('Jupiter', 7)]: {
        remedies: [
            'Apply saffron tilak on the forehead daily',
            'Wear a gold chain or ring',
            'Respect your wife and all women',
        ],
        totke: [
            'Offer yellow flowers at a Vishnu temple on Thursdays',
            'Feed chana dal to cows on Thursdays',
            'Keep turmeric in a yellow cloth at the prayer room',
            'Donate yellow fruits on Thursdays',
        ],
    },
    [key('Jupiter', 8)]: {
        remedies: [
            'Keep a piece of gold at home',
            'Do not consume non-veg on Thursdays',
            'Offer turmeric to a Peepal tree on Thursdays',
        ],
        totke: [
            'Float turmeric and yellow flowers in flowing water on Thursdays',
            'Apply saffron paste on the forehead',
            'Keep a gold coin in the prayer room',
            'Donate yellow lentils at a temple on Thursdays',
        ],
    },
    [key('Jupiter', 9)]: {
        remedies: [
            'Serve teachers, saints, and Brahmins',
            'Donate gold to a temple',
            'Apply turmeric tilak daily',
        ],
        totke: [
            'Keep a Peepal leaf in your wallet',
            'Offer yellow sweets to children on Thursdays',
            'Feed yellow rice to birds on Thursdays',
            'Wear gold jewelry always',
        ],
    },
    [key('Jupiter', 10)]: {
        remedies: [
            'Respect your father and offer prayers at a Vishnu temple',
            'Keep gold at the workplace',
            'Do not be greedy or selfish',
        ],
        totke: [
            'Keep a piece of gold in a yellow cloth at the office',
            'Offer turmeric at a Peepal tree on Thursdays',
            'Feed Brahmins on Thursdays',
            'Wear a yellow sapphire on the index finger',
        ],
    },
    [key('Jupiter', 11)]: {
        remedies: [
            'Keep gold at home',
            'Serve and feed Brahmins on Thursdays',
            'Maintain a truthful character',
        ],
        totke: [
            'Offer yellow flowers to Lord Vishnu on Thursdays',
            'Feed chana dal to a cow on Thursdays',
            'Keep a yellow cloth at the prayer room',
            'Donate yellow fruits to the poor on Thursdays',
        ],
    },
    [key('Jupiter', 12)]: {
        remedies: [
            'Wear a gold ring or chain',
            'Apply saffron tilak on the forehead every morning',
            'Offer water at a Peepal tree on Thursdays',
        ],
        totke: [
            'Keep saffron in a yellow cloth at the prayer room',
            'Donate turmeric and yellow lentils on Thursdays',
            'Float yellow flowers in a river on Thursdays',
            'Feed banana and yellow sweets to the poor on Thursdays',
        ],
    },
    // =========================================================================
    // VENUS in houses 1-12
    // =========================================================================
    [key('Venus', 1)]: {
        remedies: [
            'Donate white items on Fridays',
            'Respect your wife and all women',
            'Keep silver and white items at home',
        ],
        totke: [
            'Offer white flowers at a Lakshmi temple on Fridays',
            'Keep a diamond or opal in a white cloth',
            'Feed a white cow with cotton seeds on Fridays',
            'Wear a silver ring on the middle finger',
        ],
    },
    [key('Venus', 2)]: {
        remedies: [
            'Keep a silver piece in the cash box',
            'Do not marry before age 25',
            'Offer white sweets at a Lakshmi temple on Fridays',
        ],
        totke: [
            'Keep rice in a silver container at home',
            'Donate white clothes to married women on Fridays',
            'Wear white clothes on Fridays',
            'Float white flowers in flowing water on Fridays',
        ],
    },
    [key('Venus', 3)]: {
        remedies: [
            'Keep white items at home',
            'Donate white items on Fridays',
            'Respect your spouse and sisters',
        ],
        totke: [
            'Offer camphor at a Lakshmi temple on Fridays',
            'Wear a silver bangle on the left wrist',
            'Feed white rice to birds on Fridays',
            'Keep a diamond or white stone in a silver container',
        ],
    },
    [key('Venus', 4)]: {
        remedies: [
            'Keep white items and silver at home',
            'Offer milk and rice at a temple on Fridays',
            'Respect your mother and wife equally',
        ],
        totke: [
            'Float white flowers and rice in a river on Fridays',
            'Keep a white cloth under the mattress',
            'Wear a diamond ring set in silver or platinum',
            'Donate white sweets to married women on Fridays',
        ],
    },
    [key('Venus', 5)]: {
        remedies: [
            'Donate white items on Fridays',
            'Keep a diamond or opal with you',
            'Serve married women and respect them',
        ],
        totke: [
            'Feed rice and white sesame to birds on Fridays',
            'Offer white flowers at a Durga temple on Fridays',
            'Keep camphor at the prayer room',
            'Wear white on Fridays',
        ],
    },
    [key('Venus', 6)]: {
        remedies: [
            'Donate white clothes to the poor on Fridays',
            'Keep silver at home',
            'Respect your wife; never insult women',
        ],
        totke: [
            'Float white flowers in running water on Fridays',
            'Keep rice and camphor in a silver box at home',
            'Offer white sweets at a temple on Fridays',
            'Feed a white cow on Fridays',
        ],
    },
    [key('Venus', 7)]: {
        remedies: [
            'Donate white clothes and sweets to married women',
            'Keep a diamond or white sapphire with you',
            'Respect your wife and maintain marital harmony',
        ],
        totke: [
            'Offer white flowers and rice at a Lakshmi temple on Fridays',
            'Wear a diamond ring set in platinum',
            'Keep a silver idol of Lakshmi at home',
            'Feed white food to Brahmins on Fridays',
        ],
    },
    [key('Venus', 8)]: {
        remedies: [
            'Keep a silver piece under the pillow',
            'Do not consume alcohol',
            'Donate white items on Fridays',
        ],
        totke: [
            'Float white flowers in a river on Fridays',
            'Keep camphor at the prayer room and burn it every Friday',
            'Wear a silver chain or bracelet',
            'Offer white rice and milk to a Shiva temple on Fridays',
        ],
    },
    [key('Venus', 9)]: {
        remedies: [
            'Keep white sandalwood at home',
            'Offer white flowers at a temple on Fridays',
            'Respect your Guru and wife',
        ],
        totke: [
            'Wear a diamond or white sapphire in silver',
            'Float rice in flowing water on Fridays',
            'Keep a silver piece in a white cloth at home',
            'Feed white sweets to poor girls on Fridays',
        ],
    },
    [key('Venus', 10)]: {
        remedies: [
            'Keep a silver statue of Lakshmi at the workplace',
            'Donate white clothes on Fridays',
            'Do not be unfaithful to your spouse',
        ],
        totke: [
            'Feed a white cow on Fridays',
            'Keep a diamond or opal in a white cloth at the office',
            'Offer white flowers and camphor at a temple',
            'Wear white or cream colors on Fridays',
        ],
    },
    [key('Venus', 11)]: {
        remedies: [
            'Donate white items to married women on Fridays',
            'Keep silver jewelry at home',
            'Respect all women',
        ],
        totke: [
            'Offer white flowers and sweets at a Lakshmi temple on Fridays',
            'Keep a silver coin in the wallet',
            'Float rice and white flowers in flowing water on Fridays',
            'Keep white sandalwood at the prayer room',
        ],
    },
    [key('Venus', 12)]: {
        remedies: [
            'Keep white sandalwood or camphor at the prayer room',
            'Donate white items to poor women on Fridays',
            'Avoid immoral behavior',
        ],
        totke: [
            'Offer white flowers in flowing water on Fridays',
            'Keep a silver piece under the mattress',
            'Wear a silver ring on the middle finger',
            'Feed white rice to birds on Fridays',
        ],
    },
    // =========================================================================
    // SATURN in houses 1-12
    // =========================================================================
    [key('Saturn', 1)]: {
        remedies: [
            'Do not drink alcohol or consume non-veg on Saturdays',
            'Feed the poor on Saturdays',
            'Keep an iron item in the pocket',
        ],
        totke: [
            'Offer mustard oil at a Hanuman temple on Saturdays',
            'Keep a black horseshoe at the main entrance',
            'Feed crows on Saturdays',
            'Donate black sesame seeds on Saturdays',
        ],
    },
    [key('Saturn', 2)]: {
        remedies: [
            'Keep a dark room or storage in the house',
            'Do not lie; maintain truthfulness',
            'Feed crows and dogs on Saturdays',
        ],
        totke: [
            'Keep a piece of iron in the wallet',
            'Offer black sesame seeds at a Shani temple on Saturdays',
            'Float black items in flowing water on Saturdays',
            'Donate blankets to the poor in winter',
        ],
    },
    [key('Saturn', 3)]: {
        remedies: [
            'Keep an iron item with you always',
            'Do not consume alcohol',
            'Help laborers and the poor on Saturdays',
        ],
        totke: [
            'Keep black lentils (urad dal) in an iron bowl at home',
            'Offer mustard oil at a temple on Saturdays',
            'Wear an iron ring on the middle finger of the right hand',
            'Feed ants with sugar on Saturdays',
        ],
    },
    [key('Saturn', 4)]: {
        remedies: [
            'Offer milk to a snake idol or Shiva temple',
            'Feed crows on Saturdays',
            'Keep an iron nail in your pocket',
        ],
        totke: [
            'Bury an iron piece at the four corners of your house',
            'Float black lentils in flowing water on Saturdays',
            'Donate black cloth to the poor on Saturdays',
            'Keep a dark-colored stone under the bed',
        ],
    },
    [key('Saturn', 5)]: {
        remedies: [
            'Feed monkeys on Saturdays',
            'Keep an iron piece at the place of worship',
            'Offer mustard oil at a Shani temple on Saturdays',
        ],
        totke: [
            'Donate black blankets to the poor on Saturdays',
            'Feed crows with sweet food on Saturdays',
            'Float black sesame in a river on Saturdays',
            'Wear a blue sapphire or iron ring after consultation',
        ],
    },
    [key('Saturn', 6)]: {
        remedies: [
            'Keep a black dog at home or feed stray dogs',
            'Offer mustard oil at a temple on Saturdays',
            'Do not fight legal cases unnecessarily',
        ],
        totke: [
            'Keep iron items at the main entrance of the house',
            'Donate black lentils on Saturdays',
            'Float a coconut in flowing water on Saturdays',
            'Feed ants with flour mixed with sugar on Saturdays',
        ],
    },
    [key('Saturn', 7)]: {
        remedies: [
            'Do not marry in haste',
            'Feed crows and dogs on Saturdays',
            'Keep an iron item under the bed',
        ],
        totke: [
            'Offer mustard oil at a Hanuman temple on Saturdays',
            'Keep black sesame in an iron bowl at home',
            'Float black items in flowing water on Saturdays',
            'Donate blankets and warm clothes to the poor',
        ],
    },
    [key('Saturn', 8)]: {
        remedies: [
            'Keep an iron square piece in the pocket',
            'Feed fish in a pond on Saturdays',
            'Do not accept iron items as gifts',
        ],
        totke: [
            'Float coconut in a river on Saturdays',
            'Offer mustard oil at a temple on Saturdays',
            'Keep black lentils in a black cloth at the prayer room',
            'Feed crows before eating your own meals on Saturdays',
        ],
    },
    [key('Saturn', 9)]: {
        remedies: [
            'Respect elders and serve the poor',
            'Donate iron items on Saturdays',
            'Keep an iron ring on the body always',
        ],
        totke: [
            'Offer black sesame at a temple on Saturdays',
            'Feed crows with cooked rice on Saturdays',
            'Float iron nails in a river on Saturdays',
            'Donate black cloth to workers on Saturdays',
        ],
    },
    [key('Saturn', 10)]: {
        remedies: [
            'Offer mustard oil at a Hanuman temple on Saturdays',
            'Keep an iron piece at the workplace',
            'Help laborers and workers',
        ],
        totke: [
            'Feed crows before eating your meal on Saturdays',
            'Donate black blankets and shoes to the needy on Saturdays',
            'Keep a blue sapphire at the workplace if suitable',
            'Float black sesame seeds in a river on Saturdays',
        ],
    },
    [key('Saturn', 11)]: {
        remedies: [
            'Keep a piece of iron in the pocket',
            'Feed crows and dogs on Saturdays',
            'Do not consume alcohol on Saturdays',
        ],
        totke: [
            'Offer mustard oil at a Shani temple on Saturdays',
            'Keep an iron key chain',
            'Donate black lentils to the poor on Saturdays',
            'Float black items in a river on Saturdays',
        ],
    },
    [key('Saturn', 12)]: {
        remedies: [
            'Feed crows and dogs daily',
            'Keep an iron ring or bangle',
            'Donate shoes and blankets to the poor on Saturdays',
        ],
        totke: [
            'Offer mustard oil at a Shani temple on Saturdays',
            'Float a coconut wrapped in black cloth in flowing water on Saturdays',
            'Keep a piece of iron under the pillow',
            'Feed black lentils cooked with oil to the poor on Saturdays',
        ],
    },
    // =========================================================================
    // RAHU in houses 1-12
    // =========================================================================
    [key('Rahu', 1)]: {
        remedies: [
            'Keep a piece of silver with you',
            'Float coconut or charcoal in flowing water',
            'Wear a silver ring on the index finger',
        ],
        totke: [
            'Keep a silver ball in your pocket',
            'Offer coconut at a Durga temple on Saturdays',
            'Float black and white sesame seeds in a river',
            'Keep raw coal in the house',
        ],
    },
    [key('Rahu', 2)]: {
        remedies: [
            'Keep ivory or elephant tusk (faux) at home',
            'Do not keep electrical equipment in the bedroom',
            'Float coconut in flowing water on Saturdays',
        ],
        totke: [
            'Keep a lead piece in a blue cloth in the locker',
            'Donate radish and barley on Saturdays',
            'Feed birds with mixed grains on Saturdays',
            'Keep a silver piece in the wallet',
        ],
    },
    [key('Rahu', 3)]: {
        remedies: [
            'Keep a piece of silver in the pocket',
            'Donate items related to Rahu (coconut, lead) on Saturdays',
            'Do not keep electronics in the south-west direction',
        ],
        totke: [
            'Float barley in flowing water on Saturdays',
            'Keep raw coal in the house',
            'Feed birds on the roof of the house',
            'Keep a silver chain or bangle',
        ],
    },
    [key('Rahu', 4)]: {
        remedies: [
            'Keep silver and ivory at home',
            'Float coconut in flowing water',
            'Do not live in a south-facing house',
        ],
        totke: [
            'Offer coconut at a Bhairav temple on Saturdays',
            'Keep a piece of lead in a blue cloth at home',
            'Feed fish in a pond',
            'Float charcoal in flowing water on Saturdays',
        ],
    },
    [key('Rahu', 5)]: {
        remedies: [
            'Keep a silver elephant at home',
            'Donate barley on Saturdays',
            'Float coconut in a river',
        ],
        totke: [
            'Keep an elephant figurine at the study desk',
            'Float 4 coconuts in flowing water on Saturdays',
            'Feed birds daily',
            'Keep raw coal and barley at home',
        ],
    },
    [key('Rahu', 6)]: {
        remedies: [
            'Keep a black dog at home or feed stray dogs',
            'Float coconut in flowing water on Saturdays',
            'Donate lead items on Saturdays',
        ],
        totke: [
            'Keep a coin made of lead in the pocket',
            'Offer coconut and blue flowers at a temple',
            'Feed birds with barley on the roof',
            'Keep a piece of silver in a blue cloth',
        ],
    },
    [key('Rahu', 7)]: {
        remedies: [
            'Do not marry in haste or before proper age',
            'Float coconut in a river',
            'Keep silver at home and on the body',
        ],
        totke: [
            'Offer coconut at a Durga temple on Saturdays',
            'Keep barley in a blue cloth at home',
            'Float black and white sesame seeds in flowing water',
            'Keep a lead piece in the wallet',
        ],
    },
    [key('Rahu', 8)]: {
        remedies: [
            'Keep a square piece of silver under the pillow',
            'Float coconut in a river on Saturdays',
            'Do not accept electrical items as gifts',
        ],
        totke: [
            'Keep raw coal under the bed',
            'Donate barley and coconut on Saturdays',
            'Feed stray dogs on Saturdays',
            'Float lead wrapped in blue cloth in a river on Saturdays',
        ],
    },
    [key('Rahu', 9)]: {
        remedies: [
            'Float barley in flowing water on Saturdays',
            'Keep a silver piece in the wallet',
            'Respect your father and elders',
        ],
        totke: [
            'Offer coconut at a Bhairav temple on Saturdays',
            'Keep raw coal and barley at the prayer room',
            'Feed birds with barley on the roof',
            'Wear a silver chain always',
        ],
    },
    [key('Rahu', 10)]: {
        remedies: [
            'Keep a silver piece at the workplace',
            'Float coconut in flowing water on Saturdays',
            'Do not be dishonest in professional life',
        ],
        totke: [
            'Offer coconut to a Bhairav temple on Saturdays',
            'Keep raw coal in the office drawer',
            'Donate barley on Saturdays',
            'Feed crows and birds on the office roof',
        ],
    },
    [key('Rahu', 11)]: {
        remedies: [
            'Keep a silver ball in the pocket',
            'Feed stray dogs on Saturdays',
            'Float coconut in a river on Saturdays',
        ],
        totke: [
            'Keep barley and raw coal at home',
            'Offer coconut and lead at a temple on Saturdays',
            'Feed birds with mixed grains daily',
            'Wear a silver ring on the index finger',
        ],
    },
    [key('Rahu', 12)]: {
        remedies: [
            'Keep a silver piece under the pillow',
            'Float coconut in flowing water on Saturdays',
            'Donate items to a Bhairav temple',
        ],
        totke: [
            'Keep raw coal in the bedroom',
            'Offer coconut at a Durga temple on Saturdays',
            'Feed fish in a pond',
            'Keep a lead piece wrapped in blue cloth at the prayer room',
        ],
    },
    // =========================================================================
    // KETU in houses 1-12
    // =========================================================================
    [key('Ketu', 1)]: {
        remedies: [
            'Keep a silver piece with saffron in your pocket',
            'Offer prayers at a Ganesha temple on Tuesdays',
            'Feed stray dogs daily',
        ],
        totke: [
            'Keep a two-colored blanket (black and white) at home',
            'Offer flag (Dhwaja) at a temple',
            'Keep a piece of saffron in the wallet',
            'Float bananas in a river',
        ],
    },
    [key('Ketu', 2)]: {
        remedies: [
            'Apply saffron tilak on the forehead',
            'Keep a pet dog',
            'Donate a two-colored blanket to a temple',
        ],
        totke: [
            'Keep a piece of saffron in a red cloth in the wallet',
            'Feed stray dogs with bread on Tuesdays',
            'Offer bananas at a Ganesha temple',
            'Keep gold and silver together at home',
        ],
    },
    [key('Ketu', 3)]: {
        remedies: [
            'Keep a pet dog at home',
            'Feed stray dogs with sweet bread',
            'Donate saffron-colored items on Tuesdays',
        ],
        totke: [
            'Keep a two-toned stone at the prayer room',
            'Offer a flag at a temple on Tuesdays',
            'Feed bananas to monkeys',
            'Keep a piece of cat-eye stone wrapped in cloth',
        ],
    },
    [key('Ketu', 4)]: {
        remedies: [
            'Keep a dog at home',
            'Offer milk and saffron at a Ganesha temple',
            'Do not harm stray dogs',
        ],
        totke: [
            'Keep a two-colored blanket at home',
            'Float bananas in flowing water',
            'Keep a piece of gold with saffron at the prayer room',
            'Feed stray dogs daily',
        ],
    },
    [key('Ketu', 5)]: {
        remedies: [
            'Donate a two-colored blanket to a temple',
            'Keep a pet dog',
            'Offer bananas at a Ganesha temple on Tuesdays',
        ],
        totke: [
            'Keep saffron in a yellow cloth at the prayer room',
            'Feed dogs with sweet bread on Tuesdays',
            'Float bananas and saffron in flowing water',
            'Keep a cat-eye stone at home',
        ],
    },
    [key('Ketu', 6)]: {
        remedies: [
            'Keep a dog at home',
            'Donate a brown or two-toned blanket',
            'Feed stray dogs regularly',
        ],
        totke: [
            'Offer a flag at a temple on Tuesdays',
            'Keep saffron in a cloth at the prayer room',
            'Float bananas in a river',
            'Wear a cat-eye ring in silver on the middle finger',
        ],
    },
    [key('Ketu', 7)]: {
        remedies: [
            'Feed stray dogs daily',
            'Donate brown and white items at a temple',
            'Offer prayers at a Ganesha temple',
        ],
        totke: [
            'Keep a two-colored blanket at home',
            'Float bananas in flowing water on Tuesdays',
            'Keep a piece of saffron in the wallet',
            'Feed a dog before eating your own meals',
        ],
    },
    [key('Ketu', 8)]: {
        remedies: [
            'Keep a dog at home or feed stray dogs',
            'Donate a two-toned blanket to a beggar',
            'Offer saffron at a Ganesha temple',
        ],
        totke: [
            'Float bananas in flowing water on Tuesdays',
            'Keep gold and silver together in a cloth at home',
            'Feed stray dogs sweet food',
            'Wear a cat-eye stone ring in silver',
        ],
    },
    [key('Ketu', 9)]: {
        remedies: [
            'Feed stray dogs daily',
            'Donate blankets of two colors to the needy',
            'Offer prayers at a Ganesha temple on Tuesdays',
        ],
        totke: [
            'Keep saffron in a brown cloth at home',
            'Float bananas in a river on Tuesdays',
            'Keep a silver and gold piece together',
            'Feed a dog before eating your own food',
        ],
    },
    [key('Ketu', 10)]: {
        remedies: [
            'Keep a dog at home or feed stray dogs',
            'Offer a flag at a temple',
            'Donate saffron and brown items on Tuesdays',
        ],
        totke: [
            'Keep a two-colored blanket at the workplace',
            'Float bananas and saffron in a river',
            'Feed dogs with sweet food on Tuesdays',
            'Keep a cat-eye stone at the office',
        ],
    },
    [key('Ketu', 11)]: {
        remedies: [
            'Feed stray dogs regularly',
            'Donate a two-colored blanket to a temple',
            'Offer saffron at a Ganesha temple',
        ],
        totke: [
            'Keep a brown and white cloth at home',
            'Float bananas in flowing water',
            'Feed dogs before eating your own food',
            'Keep saffron in a small cloth in the pocket',
        ],
    },
    [key('Ketu', 12)]: {
        remedies: [
            'Keep a pet dog',
            'Donate two-colored blankets to the needy',
            'Offer saffron and bananas at a Ganesha temple',
        ],
        totke: [
            'Feed stray dogs daily with sweet food',
            'Float bananas in a river on Tuesdays',
            'Keep gold and silver together in a red cloth at the prayer room',
            'Wear a cat-eye stone in silver on the little finger',
        ],
    },
};
/**
 * Get Lal Kitab remedies and totke for a planet in a specific house.
 *
 * Returns remedies (general corrective actions) and totke (specific practical
 * rituals) for each of the 108 planet-house combinations.
 */
function getLalKitabRemedies(planet, house) {
    if (house < 1 || house > 12) {
        return { remedies: [], totke: [] };
    }
    const k = key(planet, house);
    const data = REMEDY_DATABASE[k];
    if (!data) {
        return { remedies: [], totke: [] };
    }
    return {
        remedies: [...data.remedies],
        totke: [...data.totke],
    };
}
//# sourceMappingURL=remedies.js.map