/**
 * ISIC Rev.4 divisions, the line classification a full tax invoice carries (BTOM-033, IBR-081-OM).
 *
 * The composer searches these by name (client, 25 Sep 2026: no raw code field). The backend is to
 * serve the full class list as a lookup (`erpCodeLists`: "HS and ISIC are lookups, not lists");
 * until it does, the 88 divisions are enough to name what a line is.
 */
export type Classification = { code: string; en: string; ar: string }

const d = (code: string, en: string, ar: string): Classification => ({ code, en, ar })

export const ISIC_DIVISIONS: Classification[] = [
  d(
    '01',
    'Crop and animal production, hunting and related service activities',
    'زراعة المحاصيل والإنتاج الحيواني والصيد والأنشطة المرتبطة بها',
  ),
  d('02', 'Forestry and logging', 'الحراجة وقطع الأشجار'),
  d('03', 'Fishing and aquaculture', 'صيد الأسماك وتربية الأحياء المائية'),
  d('05', 'Mining of coal and lignite', 'تعدين الفحم والليغنيت'),
  d('06', 'Extraction of crude petroleum and natural gas', 'استخراج النفط الخام والغاز الطبيعي'),
  d('07', 'Mining of metal ores', 'تعدين ركازات الفلزات'),
  d('08', 'Other mining and quarrying', 'أنشطة التعدين واستغلال المحاجر الأخرى'),
  d('09', 'Mining support service activities', 'أنشطة الخدمات الداعمة للتعدين'),
  d('10', 'Manufacture of food products', 'صناعة المنتجات الغذائية'),
  d('11', 'Manufacture of beverages', 'صناعة المشروبات'),
  d('12', 'Manufacture of tobacco products', 'صناعة منتجات التبغ'),
  d('13', 'Manufacture of textiles', 'صناعة المنسوجات'),
  d('14', 'Manufacture of wearing apparel', 'صناعة الملابس'),
  d('15', 'Manufacture of leather and related products', 'صناعة الجلود والمنتجات ذات الصلة'),
  d(
    '16',
    'Manufacture of wood and of products of wood and cork, except furniture',
    'صناعة الخشب ومنتجات الخشب والفلين، عدا الأثاث',
  ),
  d('17', 'Manufacture of paper and paper products', 'صناعة الورق ومنتجات الورق'),
  d('18', 'Printing and reproduction of recorded media', 'الطباعة واستنساخ وسائط الإعلام المسجلة'),
  d(
    '19',
    'Manufacture of coke and refined petroleum products',
    'صناعة فحم الكوك والمنتجات النفطية المكررة',
  ),
  d(
    '20',
    'Manufacture of chemicals and chemical products',
    'صناعة المواد الكيميائية والمنتجات الكيميائية',
  ),
  d(
    '21',
    'Manufacture of pharmaceuticals, medicinal chemical and botanical products',
    'صناعة المستحضرات الصيدلانية والكيميائية الطبية والنباتية',
  ),
  d('22', 'Manufacture of rubber and plastics products', 'صناعة منتجات المطاط واللدائن'),
  d(
    '23',
    'Manufacture of other non-metallic mineral products',
    'صناعة منتجات المعادن اللافلزية الأخرى',
  ),
  d('24', 'Manufacture of basic metals', 'صناعة الفلزات القاعدية'),
  d(
    '25',
    'Manufacture of fabricated metal products, except machinery and equipment',
    'صناعة منتجات المعادن المشكّلة، عدا الآلات والمعدات',
  ),
  d(
    '26',
    'Manufacture of computer, electronic and optical products',
    'صناعة الحواسيب والمنتجات الإلكترونية والبصرية',
  ),
  d('27', 'Manufacture of electrical equipment', 'صناعة المعدات الكهربائية'),
  d(
    '28',
    'Manufacture of machinery and equipment n.e.c.',
    'صناعة الآلات والمعدات غير المصنفة في موضع آخر',
  ),
  d(
    '29',
    'Manufacture of motor vehicles, trailers and semi-trailers',
    'صناعة المركبات ذات المحركات والمقطورات ونصف المقطورات',
  ),
  d('30', 'Manufacture of other transport equipment', 'صناعة معدات النقل الأخرى'),
  d('31', 'Manufacture of furniture', 'صناعة الأثاث'),
  d('32', 'Other manufacturing', 'الصناعات التحويلية الأخرى'),
  d('33', 'Repair and installation of machinery and equipment', 'إصلاح وتركيب الآلات والمعدات'),
  d(
    '35',
    'Electricity, gas, steam and air conditioning supply',
    'إمدادات الكهرباء والغاز والبخار وتكييف الهواء',
  ),
  d('36', 'Water collection, treatment and supply', 'تجميع المياه ومعالجتها وتوزيعها'),
  d('37', 'Sewerage', 'الصرف الصحي'),
  d(
    '38',
    'Waste collection, treatment and disposal activities; materials recovery',
    'جمع النفايات ومعالجتها والتخلص منها؛ استرجاع المواد',
  ),
  d(
    '39',
    'Remediation activities and other waste management services',
    'أنشطة المعالجة وخدمات إدارة النفايات الأخرى',
  ),
  d('41', 'Construction of buildings', 'تشييد المباني'),
  d('42', 'Civil engineering', 'الهندسة المدنية'),
  d('43', 'Specialized construction activities', 'أنشطة التشييد المتخصصة'),
  d(
    '45',
    'Wholesale and retail trade and repair of motor vehicles and motorcycles',
    'تجارة الجملة والتجزئة وإصلاح المركبات ذات المحركات والدراجات النارية',
  ),
  d(
    '46',
    'Wholesale trade, except of motor vehicles and motorcycles',
    'تجارة الجملة، عدا المركبات ذات المحركات والدراجات النارية',
  ),
  d(
    '47',
    'Retail trade, except of motor vehicles and motorcycles',
    'تجارة التجزئة، عدا المركبات ذات المحركات والدراجات النارية',
  ),
  d('49', 'Land transport and transport via pipelines', 'النقل البري والنقل عبر الأنابيب'),
  d('50', 'Water transport', 'النقل المائي'),
  d('51', 'Air transport', 'النقل الجوي'),
  d('52', 'Warehousing and support activities for transportation', 'التخزين وأنشطة الدعم للنقل'),
  d('53', 'Postal and courier activities', 'أنشطة البريد ونقل الطرود'),
  d('55', 'Accommodation', 'الإقامة'),
  d('56', 'Food and beverage service activities', 'أنشطة خدمات الأطعمة والمشروبات'),
  d('58', 'Publishing activities', 'أنشطة النشر'),
  d(
    '59',
    'Motion picture, video and television programme production, sound recording and music publishing',
    'إنتاج الأفلام والفيديو والبرامج التلفزيونية والتسجيلات الصوتية ونشر الموسيقى',
  ),
  d('60', 'Programming and broadcasting activities', 'أنشطة البرمجة والبث'),
  d('61', 'Telecommunications', 'الاتصالات'),
  d(
    '62',
    'Computer programming, consultancy and related activities',
    'برمجة الحاسوب والاستشارات والأنشطة المتصلة بها',
  ),
  d('63', 'Information service activities', 'أنشطة خدمات المعلومات'),
  d(
    '64',
    'Financial service activities, except insurance and pension funding',
    'أنشطة الخدمات المالية، عدا التأمين وتمويل المعاشات',
  ),
  d(
    '65',
    'Insurance, reinsurance and pension funding, except compulsory social security',
    'التأمين وإعادة التأمين وتمويل المعاشات، عدا الضمان الاجتماعي الإلزامي',
  ),
  d(
    '66',
    'Activities auxiliary to financial service and insurance activities',
    'الأنشطة المساعدة للخدمات المالية وأنشطة التأمين',
  ),
  d('68', 'Real estate activities', 'الأنشطة العقارية'),
  d('69', 'Legal and accounting activities', 'الأنشطة القانونية والمحاسبية'),
  d(
    '70',
    'Activities of head offices; management consultancy activities',
    'أنشطة المكاتب الرئيسية؛ أنشطة الاستشارات الإدارية',
  ),
  d(
    '71',
    'Architectural and engineering activities; technical testing and analysis',
    'الأنشطة المعمارية والهندسية؛ الاختبارات والتحليلات التقنية',
  ),
  d('72', 'Scientific research and development', 'البحث والتطوير العلمي'),
  d('73', 'Advertising and market research', 'الإعلان وبحوث السوق'),
  d(
    '74',
    'Other professional, scientific and technical activities',
    'الأنشطة المهنية والعلمية والتقنية الأخرى',
  ),
  d('75', 'Veterinary activities', 'الأنشطة البيطرية'),
  d('77', 'Rental and leasing activities', 'أنشطة التأجير والإيجار'),
  d('78', 'Employment activities', 'أنشطة التوظيف'),
  d(
    '79',
    'Travel agency, tour operator, reservation service and related activities',
    'وكالات السفر ومنظمو الرحلات وخدمات الحجز والأنشطة المتصلة بها',
  ),
  d('80', 'Security and investigation activities', 'أنشطة الأمن والتحقيق'),
  d('81', 'Services to buildings and landscape activities', 'خدمات المباني وأنشطة تنسيق المواقع'),
  d(
    '82',
    'Office administrative, office support and other business support activities',
    'الأنشطة الإدارية للمكاتب والدعم المكتبي وأنشطة دعم الأعمال الأخرى',
  ),
  d(
    '84',
    'Public administration and defence; compulsory social security',
    'الإدارة العامة والدفاع؛ الضمان الاجتماعي الإلزامي',
  ),
  d('85', 'Education', 'التعليم'),
  d('86', 'Human health activities', 'أنشطة صحة الإنسان'),
  d('87', 'Residential care activities', 'أنشطة الرعاية مع الإقامة'),
  d('88', 'Social work activities without accommodation', 'أنشطة العمل الاجتماعي دون إقامة'),
  d('90', 'Creative, arts and entertainment activities', 'الأنشطة الإبداعية والفنون والترفيه'),
  d(
    '91',
    'Libraries, archives, museums and other cultural activities',
    'المكتبات والمحفوظات والمتاحف والأنشطة الثقافية الأخرى',
  ),
  d('92', 'Gambling and betting activities', 'أنشطة القمار والمراهنات'),
  d(
    '93',
    'Sports activities and amusement and recreation activities',
    'الأنشطة الرياضية وأنشطة التسلية والترفيه',
  ),
  d('94', 'Activities of membership organizations', 'أنشطة المنظمات ذات العضوية'),
  d(
    '95',
    'Repair of computers and personal and household goods',
    'إصلاح الحواسيب والسلع الشخصية والمنزلية',
  ),
  d('96', 'Other personal service activities', 'أنشطة الخدمات الشخصية الأخرى'),
  d(
    '97',
    'Activities of households as employers of domestic personnel',
    'أنشطة الأسر المعيشية بوصفها أرباب عمل لأفراد الخدمة المنزلية',
  ),
  d(
    '98',
    'Undifferentiated goods- and services-producing activities of private households for own use',
    'أنشطة الأسر المعيشية الخاصة غير المميزة في إنتاج السلع والخدمات لاستعمالها الخاص',
  ),
  d(
    '99',
    'Activities of extraterritorial organizations and bodies',
    'أنشطة المنظمات والهيئات غير الإقليمية',
  ),
]
