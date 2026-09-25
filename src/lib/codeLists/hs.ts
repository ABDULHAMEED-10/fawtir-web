import type { CodeListEntry } from './codeList'

/**
 * HS codes, Oman's 12-digit national extension of the Harmonized System, for the goods line of a
 * full tax invoice (IBR-079-OM, IBR-080-OM; `cac:CommodityClassification`, listID "HS").
 *
 * A placeholder subset of about sixty items Al Bahja Coffee and its customers trade: each code is
 * the real 6-digit HS heading padded with zeros to the national twelve. "Other" (000000000000) is
 * a valid value and is always in the list, so a product nobody can classify still issues.
 *
 * TODO(backend): replace with `GET /v1/code-lists/hs?q=coffee` (searched by product name, paged,
 * English and Arabic names, "Other" always findable); see PINT_OM_LINE_CLASSIFICATION.md §7.
 */
export type HsCode = CodeListEntry

/** The "Other" fallback: a valid HS code for a product that fits no heading. */
export const OTHER_HS_CODE = '000000000000'

const hs = (heading: string, en: string, ar: string): HsCode => ({
  code: heading.padEnd(12, '0'),
  en,
  ar,
})

export const HS_CODES: HsCode[] = [
  { code: OTHER_HS_CODE, en: 'Other', ar: 'أخرى' },
  // Coffee and tea
  hs('090111', 'Coffee, not roasted, not decaffeinated', 'بن غير محمص، غير منزوع الكافيين'),
  hs('090112', 'Coffee, not roasted, decaffeinated', 'بن غير محمص، منزوع الكافيين'),
  hs('090121', 'Coffee, roasted, not decaffeinated', 'بن محمص، غير منزوع الكافيين'),
  hs('090122', 'Coffee, roasted, decaffeinated', 'بن محمص، منزوع الكافيين'),
  hs('090190', 'Coffee husks, skins and substitutes', 'قشور البن وبدائل البن'),
  hs('210111', 'Coffee extracts and instant coffee', 'خلاصات البن والقهوة سريعة التحضير'),
  hs('210112', 'Preparations with a basis of coffee extracts', 'محضرات أساسها خلاصات البن'),
  hs('090210', 'Green tea, in packings of 3 kg or less', 'شاي أخضر في عبوات لا تتجاوز 3 كجم'),
  hs('090230', 'Black tea, in packings of 3 kg or less', 'شاي أسود في عبوات لا تتجاوز 3 كجم'),
  hs('090240', 'Black tea, other', 'شاي أسود، غيره'),
  // Spices
  hs('090831', 'Cardamom, neither crushed nor ground', 'هيل، غير مجروش ولا مطحون'),
  hs('091020', 'Saffron', 'زعفران'),
  hs('091011', 'Ginger, neither crushed nor ground', 'زنجبيل، غير مجروش ولا مطحون'),
  hs('090611', 'Cinnamon (Cinnamomum zeylanicum)', 'قرفة سيلانية'),
  hs('090411', 'Pepper, neither crushed nor ground', 'فلفل، غير مجروش ولا مطحون'),
  // Dates, fruit and nuts
  hs('080410', 'Dates, fresh or dried', 'تمور طازجة أو مجففة'),
  hs('080420', 'Figs, fresh or dried', 'تين طازج أو مجفف'),
  hs('080212', 'Almonds, shelled', 'لوز مقشور'),
  hs('080251', 'Pistachios, in shell', 'فستق بقشره'),
  hs('080232', 'Walnuts, shelled', 'جوز مقشور'),
  hs('080390', 'Bananas, fresh or dried', 'موز طازج أو مجفف'),
  hs('080510', 'Oranges, fresh or dried', 'برتقال طازج أو مجفف'),
  // Sugar, chocolate and sweets
  hs('170199', 'Cane or beet sugar, refined', 'سكر قصب أو بنجر، مكرر'),
  hs('170490', 'Sugar confectionery, not containing cocoa', 'حلويات سكرية لا تحتوي على كاكاو'),
  hs('180631', 'Chocolate, filled, in blocks or bars', 'شوكولاتة محشوة في ألواح أو قضبان'),
  hs('180690', 'Chocolate and cocoa preparations, other', 'شوكولاتة ومحضرات كاكاو، غيرها'),
  hs('040900', 'Natural honey', 'عسل طبيعي'),
  // Dairy and eggs
  hs('040120', 'Milk, not concentrated, fat 1% to 6%', 'حليب غير مركز، دسم من 1% إلى 6%'),
  hs('040210', 'Milk powder, fat 1.5% or less', 'حليب مجفف، دسم لا يتجاوز 1.5%'),
  hs('040310', 'Yogurt', 'لبن زبادي'),
  hs('040510', 'Butter', 'زبدة'),
  hs('040690', 'Cheese, other', 'جبن، غيره'),
  hs('040721', 'Hen eggs in shell, fresh', 'بيض دجاج طازج بقشره'),
  // Water and beverages
  hs('220110', 'Mineral and aerated waters, unsweetened', 'مياه معدنية ومياه غازية غير محلاة'),
  hs('220190', 'Water, other, and ice', 'مياه أخرى وثلج'),
  hs('220210', 'Waters with added sugar or flavouring', 'مياه مضاف إليها سكر أو منكهات'),
  hs('220299', 'Non-alcoholic beverages, other', 'مشروبات غير كحولية، غيرها'),
  hs('200919', 'Orange juice, other', 'عصير برتقال، غيره'),
  hs('200990', 'Mixtures of fruit or vegetable juices', 'مخاليط عصائر الفواكه أو الخضر'),
  // Bakery, grains and prepared food
  hs('190590', 'Bread, pastry, cakes and biscuits, other', 'خبز ومعجنات وكعك وبسكويت، غيرها'),
  hs('190531', 'Sweet biscuits', 'بسكويت محلى'),
  hs('190120', 'Mixes and doughs for bakery products', 'مخاليط وعجائن لصنع منتجات المخابز'),
  hs('110100', 'Wheat or meslin flour', 'دقيق قمح أو دقيق مخلوط'),
  hs('100630', 'Rice, semi-milled or wholly milled', 'أرز مضروب جزئياً أو كلياً'),
  hs('150910', 'Olive oil, virgin', 'زيت زيتون بكر'),
  hs('151219', 'Sunflower or safflower oil, other', 'زيت عباد الشمس أو القرطم، غيره'),
  hs('020714', 'Chicken cuts and offal, frozen', 'قطع دجاج وأحشاء، مجمدة'),
  hs('030389', 'Fish, frozen, other', 'أسماك مجمدة، غيرها'),
  hs('160414', 'Tuna, prepared or preserved', 'تونة محضرة أو محفوظة'),
  hs('070200', 'Tomatoes, fresh or chilled', 'طماطم طازجة أو مبردة'),
  hs('070310', 'Onions and shallots, fresh', 'بصل وكراث أندلسي، طازج'),
  hs('070190', 'Potatoes, fresh, other', 'بطاطس طازجة، غيرها'),
  hs('210690', 'Food preparations, other', 'محضرات غذائية، غيرها'),
  hs('130190', 'Natural gums and resins (frankincense)', 'صموغ وراتنجات طبيعية (لبان)'),
  // Packaging and paper
  hs('392330', 'Plastic bottles, flasks and similar', 'قوارير وزجاجات وأوعية مماثلة من لدائن'),
  hs('392310', 'Plastic boxes, cases and crates', 'صناديق وأقفاص من لدائن'),
  hs('392321', 'Sacks and bags of polyethylene', 'أكياس من بولي إيثيلين'),
  hs('481910', 'Cartons and boxes of corrugated paper', 'كراتين وصناديق من ورق مموج'),
  hs('481920', 'Folding cartons of non-corrugated paper', 'كراتين قابلة للطي من ورق غير مموج'),
  hs('482369', 'Paper cups, plates and trays', 'أكواب وصحون وصواني من ورق'),
  hs('482320', 'Filter paper and paperboard', 'ورق ترشيح'),
  hs('481830', 'Tablecloths and serviettes of paper', 'مفارش مائدة ومناديل من ورق'),
  hs('481810', 'Toilet paper', 'ورق تواليت'),
  hs(
    '480256',
    'Uncoated paper, 40 to 150 g/m², in sheets',
    'ورق غير مطلي من 40 إلى 150 جم/م²، أوراق',
  ),
  hs('482010', 'Registers, notebooks and order books', 'سجلات ودفاتر ودفاتر طلبات'),
  hs('701090', 'Glass bottles and jars', 'قوارير وبرطمانات من زجاج'),
  hs('761510', 'Aluminium table and kitchen articles', 'أدوات مائدة ومطبخ من ألومنيوم'),
  // Electronics and equipment
  hs('851671', 'Coffee or tea makers, electric', 'أجهزة تحضير القهوة أو الشاي، كهربائية'),
  hs(
    '841981',
    'Machinery for making hot drinks (espresso machines)',
    'آلات تحضير المشروبات الساخنة (آلات إسبريسو)',
  ),
  hs(
    '843880',
    'Food and drink processing machinery, other',
    'آلات تجهيز الأغذية والمشروبات، غيرها',
  ),
  hs('841810', 'Combined refrigerator-freezers', 'ثلاجات ومجمدات مركبة'),
  hs('841850', 'Refrigerated display counters and cabinets', 'خزائن عرض مبردة'),
  hs('847130', 'Portable computers (laptops, tablets)', 'حواسيب محمولة'),
  hs('847150', 'Computer processing units', 'وحدات معالجة الحواسيب'),
  hs('847050', 'Cash registers', 'آلات تسجيل النقد'),
  hs('844332', 'Printers, single function', 'طابعات أحادية الوظيفة'),
  hs('851712', 'Mobile phones', 'هواتف محمولة'),
  hs('852872', 'Television receivers, colour', 'أجهزة استقبال تلفزيوني ملونة'),
  hs('850440', 'Static converters (chargers, adapters)', 'محولات ساكنة (شواحن ومحولات تيار)'),
  // Furniture and fittings
  hs('940161', 'Upholstered seats with wooden frames', 'مقاعد منجدة بهياكل خشبية'),
  hs('940171', 'Upholstered seats with metal frames', 'مقاعد منجدة بهياكل معدنية'),
  hs('940320', 'Metal furniture, other', 'أثاث معدني، غيره'),
  hs('940360', 'Wooden furniture, other', 'أثاث خشبي، غيره'),
  hs(
    '940540',
    'Electric lamps and lighting fittings, other',
    'مصابيح وتجهيزات إنارة كهربائية، غيرها',
  ),
  // Fuel
  hs('271012', 'Light petroleum oils (petrol)', 'زيوت نفطية خفيفة (بنزين)'),
  hs('271019', 'Petroleum oils, other (diesel)', 'زيوت نفطية، غيرها (ديزل)'),
  hs('271113', 'Butanes, liquefied (LPG)', 'بوتان مسال (غاز البترول المسال)'),
  hs('271112', 'Propane, liquefied', 'بروبان مسال'),
  // Building materials
  hs('252329', 'Portland cement, other', 'أسمنت بورتلاندي، غيره'),
  hs('721420', 'Reinforcing bars of iron or steel', 'قضبان تسليح من حديد أو صلب'),
  hs(
    '690721',
    'Ceramic tiles, water absorption 0.5% or less',
    'بلاط خزفي، امتصاص للماء لا يتجاوز 0.5%',
  ),
  hs('251710', 'Pebbles, gravel and crushed stone', 'حصى وحجارة مكسرة'),
  hs('250510', 'Silica sands and quartz sands', 'رمال سيليكا ورمال كوارتز'),
  hs(
    '320910',
    'Paints based on acrylic or vinyl polymers',
    'دهانات أساسها بوليمرات أكريليكية أو فينيلية',
  ),
  hs('441820', 'Doors and their frames, of wood', 'أبواب وأطرها من خشب'),
  hs('730890', 'Structures and parts of iron or steel', 'منشآت وأجزاؤها من حديد أو صلب'),
  hs('391732', 'Plastic tubes and pipes, not reinforced', 'أنابيب ومواسير من لدائن، غير مقواة'),
  hs('680299', 'Worked monumental or building stone, other', 'أحجار بناء مشغولة، غيرها'),
  // Textiles and uniforms
  hs('610910', 'T-shirts and singlets, of cotton', 'قمصان تي شيرت من قطن'),
  hs('620520', 'Men’s shirts, of cotton', 'قمصان رجالية من قطن'),
  hs('620342', 'Men’s trousers, of cotton', 'بناطيل رجالية من قطن'),
  hs('630260', 'Toilet and kitchen linen, of cotton', 'بياضات حمام ومطبخ من قطن'),
  hs(
    '630790',
    'Made-up textile articles, other (aprons, uniforms)',
    'أصناف نسيجية جاهزة، غيرها (مآزر وأزياء عمل)',
  ),
  hs('630492', 'Furnishing articles of cotton, not knitted', 'أصناف مفروشات من قطن، غير محبوكة'),
  // Cleaning and toiletries
  hs('340220', 'Washing and cleaning preparations, retail', 'محضرات غسيل وتنظيف، للبيع بالتجزئة'),
  hs('340111', 'Soap for toilet use', 'صابون للاستعمال الشخصي'),
  hs('330300', 'Perfumes and toilet waters', 'عطور ومياه تواليت'),
]

/** "0901.21" for a padded 12-digit code; the "Other" code has no heading to show. */
export function hsHeading(code: string): string | null {
  if (code === OTHER_HS_CODE || code.length < 6) return null
  return `${code.slice(0, 4)}.${code.slice(4, 6)}`
}
