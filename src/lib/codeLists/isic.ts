import type { CodeListEntry } from './codeList'

/**
 * Industrial classification: ISIC Rev. 4 at Oman's 6-digit national level, the activity of the
 * business issuing the invoice (IBR-081-OM). Chosen once in Settings › Company; the backend
 * copies it onto every line at submission, so the invoice form never asks for it.
 *
 * A placeholder subset of about ninety activities: the 4-digit ISIC class followed by Oman's
 * two-digit sub-activity (10 for the class itself, 20 and 30 for the splits the list makes).
 *
 * TODO(backend): replace with `GET /v1/code-lists/isic?q=restaurant` (searched by activity name,
 * English and Arabic names) and store the choice on `GET/PUT /v1/settings/company` as
 * `industrialClassification { code, name }`; see docs/backend-guides/INCOME.md §C7.
 */
export type IsicActivity = CodeListEntry

const a = (code: string, en: string, ar: string): IsicActivity => ({ code, en, ar })

export const ISIC_ACTIVITIES: IsicActivity[] = [
  // Agriculture and fishing
  a(
    '011310',
    'Growing of vegetables, melons, roots and tubers',
    'زراعة الخضروات والبطيخ والجذور والدرنات',
  ),
  a('012210', 'Growing of dates and tropical fruits', 'زراعة التمور والفواكه الاستوائية'),
  a('014110', 'Raising of cattle', 'تربية الأبقار'),
  a('014410', 'Raising of sheep and goats', 'تربية الأغنام والماعز'),
  a('014610', 'Raising of poultry', 'تربية الدواجن'),
  a('031110', 'Marine fishing', 'الصيد البحري'),
  // Oil and gas
  a('061010', 'Extraction of crude petroleum', 'استخراج النفط الخام'),
  a('062010', 'Extraction of natural gas', 'استخراج الغاز الطبيعي'),
  // Manufacturing of food and drink
  a('101010', 'Processing and preserving of meat', 'تجهيز وحفظ اللحوم'),
  a('102010', 'Processing and preserving of fish', 'تجهيز وحفظ الأسماك'),
  a('103010', 'Processing and preserving of fruit and vegetables', 'تجهيز وحفظ الفواكه والخضروات'),
  a('103020', 'Packing and processing of dates', 'تعبئة وتجهيز التمور'),
  a(
    '104010',
    'Manufacture of vegetable and animal oils and fats',
    'صناعة الزيوت والدهون النباتية والحيوانية',
  ),
  a('105010', 'Manufacture of dairy products', 'صناعة منتجات الألبان'),
  a('106110', 'Manufacture of grain mill products', 'صناعة منتجات طحن الحبوب'),
  a('107110', 'Manufacture of bakery products', 'صناعة منتجات المخابز'),
  a('107210', 'Manufacture of sugar', 'صناعة السكر'),
  a(
    '107310',
    'Manufacture of cocoa, chocolate and sugar confectionery',
    'صناعة الكاكاو والشوكولاتة والحلويات السكرية',
  ),
  a('107910', 'Roasting and processing of coffee', 'تحميص البن ومعالجته'),
  a('107920', 'Processing of tea and herbal blends', 'تجهيز الشاي والخلطات العشبية'),
  a('107930', 'Manufacture of spices, sauces and condiments', 'صناعة التوابل والصلصات والبهارات'),
  a(
    '110410',
    'Manufacture of soft drinks and bottled water',
    'صناعة المشروبات الغازية والمياه المعبأة',
  ),
  // Other manufacturing
  a('141010', 'Manufacture of wearing apparel', 'صناعة الملابس'),
  a('170110', 'Manufacture of paper and paperboard', 'صناعة الورق والورق المقوى'),
  a('181110', 'Printing', 'الطباعة'),
  a('192010', 'Manufacture of refined petroleum products', 'صناعة المنتجات النفطية المكررة'),
  a('202210', 'Manufacture of paints and varnishes', 'صناعة الدهانات والورنيش'),
  a('222010', 'Manufacture of plastics products', 'صناعة منتجات اللدائن'),
  a('239410', 'Manufacture of cement', 'صناعة الأسمنت'),
  a('251110', 'Manufacture of structural metal products', 'صناعة المنتجات المعدنية الإنشائية'),
  a('263010', 'Manufacture of communication equipment', 'صناعة معدات الاتصالات'),
  a('310010', 'Manufacture of furniture', 'صناعة الأثاث'),
  a('331210', 'Repair of machinery', 'إصلاح الآلات'),
  // Construction
  a('410010', 'Construction of buildings', 'تشييد المباني'),
  a('421010', 'Construction of roads and railways', 'إنشاء الطرق والسكك الحديدية'),
  a('432110', 'Electrical installation', 'التركيبات الكهربائية'),
  a(
    '432210',
    'Plumbing, heat and air-conditioning installation',
    'تركيبات السباكة والتدفئة وتكييف الهواء',
  ),
  a('433010', 'Building completion and finishing', 'إكمال المباني وتشطيبها'),
  // Motor trade
  a('451010', 'Sale of motor vehicles', 'بيع المركبات ذات المحركات'),
  a('452010', 'Maintenance and repair of motor vehicles', 'صيانة وإصلاح المركبات ذات المحركات'),
  a('453010', 'Sale of motor vehicle parts and accessories', 'بيع قطع غيار المركبات ولوازمها'),
  // Wholesale
  a('461010', 'Wholesale on a fee or contract basis', 'تجارة الجملة مقابل رسم أو على أساس عقد'),
  a('463010', 'Wholesale of food and beverages', 'تجارة الجملة في الأغذية والمشروبات'),
  a('463020', 'Wholesale of coffee, tea and spices', 'تجارة الجملة في البن والشاي والتوابل'),
  a('463030', 'Wholesale of dates', 'تجارة الجملة في التمور'),
  a('464110', 'Wholesale of textiles and clothing', 'تجارة الجملة في المنسوجات والملابس'),
  a('464910', 'Wholesale of household goods, other', 'تجارة الجملة في السلع المنزلية الأخرى'),
  a('465110', 'Wholesale of computers and software', 'تجارة الجملة في الحواسيب والبرمجيات'),
  a(
    '465210',
    'Wholesale of electronic and telecommunications equipment',
    'تجارة الجملة في المعدات الإلكترونية ومعدات الاتصالات',
  ),
  a(
    '466110',
    'Wholesale of fuels and related products',
    'تجارة الجملة في الوقود والمنتجات ذات الصلة',
  ),
  a(
    '466310',
    'Wholesale of construction materials and hardware',
    'تجارة الجملة في مواد البناء والأدوات المعدنية',
  ),
  a(
    '466910',
    'Wholesale of machinery and equipment, other',
    'تجارة الجملة في الآلات والمعدات الأخرى',
  ),
  a('469010', 'Non-specialized wholesale trade', 'تجارة الجملة غير المتخصصة'),
  // Retail
  a(
    '471110',
    'Retail sale in supermarkets and grocery stores',
    'البيع بالتجزئة في المتاجر الكبرى ومحلات البقالة',
  ),
  a(
    '471910',
    'Retail sale in non-specialized stores, other',
    'البيع بالتجزئة في المتاجر غير المتخصصة الأخرى',
  ),
  a(
    '472110',
    'Retail sale of food in specialized stores',
    'البيع بالتجزئة للأغذية في المتاجر المتخصصة',
  ),
  a('472120', 'Retail sale of coffee, tea and spices', 'البيع بالتجزئة للبن والشاي والتوابل'),
  a('472210', 'Retail sale of beverages', 'البيع بالتجزئة للمشروبات'),
  a('473010', 'Retail sale of automotive fuel', 'البيع بالتجزئة لوقود المركبات'),
  a('474110', 'Retail sale of computers and software', 'البيع بالتجزئة للحواسيب والبرمجيات'),
  a(
    '474210',
    'Retail sale of audio and video equipment',
    'البيع بالتجزئة للمعدات السمعية والبصرية',
  ),
  a('475110', 'Retail sale of textiles', 'البيع بالتجزئة للمنسوجات'),
  a('475910', 'Retail sale of furniture and lighting', 'البيع بالتجزئة للأثاث والإضاءة'),
  a('476110', 'Retail sale of books and stationery', 'البيع بالتجزئة للكتب والقرطاسية'),
  a('477110', 'Retail sale of clothing and footwear', 'البيع بالتجزئة للملابس والأحذية'),
  a(
    '477210',
    'Retail sale of pharmaceutical and cosmetic goods',
    'البيع بالتجزئة للمستحضرات الصيدلانية ومستحضرات التجميل',
  ),
  a('477310', 'Retail sale of new goods, other', 'البيع بالتجزئة للسلع الجديدة الأخرى'),
  a('479110', 'Retail sale via internet', 'البيع بالتجزئة عبر الإنترنت'),
  // Transport and storage
  a('492210', 'Passenger land transport, other', 'النقل البري للركاب، غيره'),
  a('492310', 'Freight transport by road', 'نقل البضائع براً'),
  a('501210', 'Sea and coastal freight transport', 'النقل البحري والساحلي للبضائع'),
  a('521010', 'Warehousing and storage', 'التخزين والمستودعات'),
  a('522410', 'Cargo handling', 'مناولة البضائع'),
  a('532010', 'Courier activities', 'أنشطة البريد السريع'),
  // Hospitality and food service
  a('551010', 'Hotels and short-term accommodation', 'الفنادق والإقامة قصيرة الأجل'),
  a('561010', 'Restaurants and cafés', 'المطاعم والمقاهي'),
  a('561020', 'Coffee shops and kiosks', 'محلات القهوة والأكشاك'),
  a('561030', 'Mobile food service', 'خدمات الطعام المتنقلة'),
  a('562110', 'Event catering', 'خدمات تموين المناسبات'),
  a('562910', 'Food service activities, other', 'أنشطة خدمات الطعام الأخرى'),
  a('563010', 'Beverage serving activities', 'أنشطة تقديم المشروبات'),
  // Information and technology
  a('582010', 'Software publishing', 'نشر البرمجيات'),
  a('611010', 'Wired telecommunications', 'الاتصالات السلكية'),
  a('620110', 'Computer programming', 'البرمجة الحاسوبية'),
  a(
    '620210',
    'IT consultancy and facilities management',
    'استشارات تقنية المعلومات وإدارة المرافق الحاسوبية',
  ),
  a('620910', 'Information technology services, other', 'خدمات تقنية المعلومات الأخرى'),
  a(
    '631110',
    'Data processing, hosting and related activities',
    'معالجة البيانات والاستضافة والأنشطة ذات الصلة',
  ),
  a('631210', 'Web portals', 'بوابات الإنترنت'),
  // Finance, insurance and property
  a('662210', 'Insurance agents and brokers', 'وكلاء ووسطاء التأمين'),
  a(
    '681010',
    'Real estate activities with own or leased property',
    'الأنشطة العقارية في الممتلكات المملوكة أو المستأجرة',
  ),
  a(
    '682010',
    'Real estate activities on a fee or contract basis',
    'الأنشطة العقارية مقابل رسم أو على أساس عقد',
  ),
  // Professional services
  a('691010', 'Legal activities', 'الأنشطة القانونية'),
  a(
    '692010',
    'Accounting, bookkeeping and auditing; tax consultancy',
    'المحاسبة ومسك الدفاتر ومراجعة الحسابات؛ الاستشارات الضريبية',
  ),
  a('702010', 'Management consultancy', 'الاستشارات الإدارية'),
  a('711010', 'Architectural and engineering activities', 'الأنشطة المعمارية والهندسية'),
  a('712010', 'Technical testing and analysis', 'الاختبارات والتحاليل الفنية'),
  a('731010', 'Advertising', 'الإعلان'),
  a('732010', 'Market research and opinion polling', 'أبحاث السوق واستطلاعات الرأي'),
  a('741010', 'Specialized design activities', 'أنشطة التصميم المتخصصة'),
  a('742010', 'Photographic activities', 'أنشطة التصوير الفوتوغرافي'),
  // Administrative and support services
  a('771010', 'Renting of motor vehicles', 'تأجير المركبات ذات المحركات'),
  a('773010', 'Renting of machinery and equipment, other', 'تأجير الآلات والمعدات الأخرى'),
  a('781010', 'Employment placement agencies', 'وكالات التوظيف'),
  a('791110', 'Travel agency activities', 'أنشطة وكالات السفر'),
  a('791210', 'Tour operator activities', 'أنشطة منظمي الرحلات السياحية'),
  a('801010', 'Private security activities', 'أنشطة الأمن الخاص'),
  a('812110', 'General cleaning of buildings', 'التنظيف العام للمباني'),
  a('821110', 'Combined office administrative services', 'الخدمات الإدارية المكتبية المجمعة'),
  a('823010', 'Organization of conventions and trade shows', 'تنظيم المؤتمرات والمعارض التجارية'),
  a('829210', 'Packaging activities', 'أنشطة التعبئة والتغليف'),
  // Education and health
  a('851010', 'Pre-primary and primary education', 'التعليم قبل الابتدائي والابتدائي'),
  a('852110', 'General secondary education', 'التعليم الثانوي العام'),
  a('853010', 'Higher education', 'التعليم العالي'),
  a('854910', 'Training centres and other education', 'مراكز التدريب والتعليم الآخر'),
  a('861010', 'Hospital activities', 'أنشطة المستشفيات'),
  a('862010', 'Medical and dental practice', 'ممارسة الطب وطب الأسنان'),
  a('869010', 'Human health activities, other', 'أنشطة صحة الإنسان الأخرى'),
  // Recreation and personal services
  a('931110', 'Operation of sports facilities', 'تشغيل المرافق الرياضية'),
  a('932110', 'Amusement and theme parks', 'مدن الملاهي والمنتزهات الترفيهية'),
  a('951110', 'Repair of computers and peripheral equipment', 'إصلاح الحواسيب والمعدات الملحقة'),
  a('960210', 'Hairdressing and beauty treatment', 'تصفيف الشعر والعناية بالجمال'),
  a('960910', 'Personal service activities, other', 'أنشطة الخدمات الشخصية الأخرى'),
]
