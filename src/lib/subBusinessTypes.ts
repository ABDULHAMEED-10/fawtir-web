export type BusinessTypeId =
  | 'food-beverage'
  | 'retail'
  | 'beauty-wellness'
  | 'professional'
  | 'healthcare'
  | 'hospitality'
  | 'education'
  | 'automotive'

export type SubBusinessTypeOption = {
  id: string
  labelKey: string
  groupsKey: string
}

export const SUB_TYPES_BY_BUSINESS: Record<BusinessTypeId, SubBusinessTypeOption[]> = {
  'food-beverage': [
    { id: 'coffee-shop', labelKey: 'subBusinessType.options.coffeeShop', groupsKey: 'coffeeShop' },
    { id: 'restaurant', labelKey: 'subBusinessType.options.restaurant', groupsKey: 'restaurant' },
    { id: 'bakery', labelKey: 'subBusinessType.options.bakery', groupsKey: 'bakery' },
    { id: 'fast-food', labelKey: 'subBusinessType.options.fastFood', groupsKey: 'fastFood' },
    { id: 'juice-bar', labelKey: 'subBusinessType.options.juiceBar', groupsKey: 'juiceBar' },
    { id: 'dessert-shop', labelKey: 'subBusinessType.options.dessertShop', groupsKey: 'dessertShop' },
    { id: 'catering', labelKey: 'subBusinessType.options.catering', groupsKey: 'catering' },
  ],
  retail: [
    { id: 'grocery', labelKey: 'subBusinessType.options.grocery', groupsKey: 'grocery' },
    { id: 'electronics', labelKey: 'subBusinessType.options.electronics', groupsKey: 'electronics' },
    { id: 'fashion', labelKey: 'subBusinessType.options.fashion', groupsKey: 'fashion' },
    { id: 'flower-shop', labelKey: 'subBusinessType.options.flowerShop', groupsKey: 'flowerShop' },
    { id: 'gift-shop', labelKey: 'subBusinessType.options.giftShop', groupsKey: 'giftShop' },
    { id: 'bookstore', labelKey: 'subBusinessType.options.bookstore', groupsKey: 'bookstore' },
    { id: 'pet-shop', labelKey: 'subBusinessType.options.petShop', groupsKey: 'petShop' },
    { id: 'home-store', labelKey: 'subBusinessType.options.homeStore', groupsKey: 'homeStore' },
  ],
  'beauty-wellness': [
    { id: 'beauty-salon', labelKey: 'subBusinessType.options.beautySalon', groupsKey: 'beautySalon' },
    { id: 'barber-shop', labelKey: 'subBusinessType.options.barberShop', groupsKey: 'barberShop' },
    { id: 'spa', labelKey: 'subBusinessType.options.spa', groupsKey: 'spa' },
    { id: 'nail-salon', labelKey: 'subBusinessType.options.nailSalon', groupsKey: 'nailSalon' },
    { id: 'massage-center', labelKey: 'subBusinessType.options.massageCenter', groupsKey: 'massageCenter' },
    { id: 'fitness-studio', labelKey: 'subBusinessType.options.fitnessStudio', groupsKey: 'fitnessStudio' },
  ],
  professional: [
    { id: 'consultancy', labelKey: 'subBusinessType.options.consultancy', groupsKey: 'consultancy' },
    { id: 'cleaning', labelKey: 'subBusinessType.options.cleaning', groupsKey: 'cleaning' },
    { id: 'laundry', labelKey: 'subBusinessType.options.laundry', groupsKey: 'laundry' },
    { id: 'tailoring', labelKey: 'subBusinessType.options.tailoring', groupsKey: 'tailoring' },
    { id: 'printing', labelKey: 'subBusinessType.options.printing', groupsKey: 'printing' },
    { id: 'repair', labelKey: 'subBusinessType.options.repair', groupsKey: 'repair' },
    { id: 'maintenance', labelKey: 'subBusinessType.options.maintenance', groupsKey: 'maintenance' },
    { id: 'freelance-services', labelKey: 'subBusinessType.options.freelanceServices', groupsKey: 'freelanceServices' },
  ],
  healthcare: [
    { id: 'medical-clinic', labelKey: 'subBusinessType.options.medicalClinic', groupsKey: 'medicalClinic' },
    { id: 'dental-clinic', labelKey: 'subBusinessType.options.dentalClinic', groupsKey: 'dentalClinic' },
    { id: 'physiotherapy', labelKey: 'subBusinessType.options.physiotherapy', groupsKey: 'physiotherapy' },
    { id: 'laboratory', labelKey: 'subBusinessType.options.laboratory', groupsKey: 'laboratory' },
    { id: 'pharmacy', labelKey: 'subBusinessType.options.pharmacy', groupsKey: 'pharmacy' },
    { id: 'medical-supplies', labelKey: 'subBusinessType.options.medicalSupplies', groupsKey: 'medicalSupplies' },
  ],
  hospitality: [
    { id: 'hotel', labelKey: 'subBusinessType.options.hotel', groupsKey: 'hotel' },
    { id: 'resort', labelKey: 'subBusinessType.options.resort', groupsKey: 'resort' },
    { id: 'guest-house', labelKey: 'subBusinessType.options.guestHouse', groupsKey: 'guestHouse' },
    { id: 'travel-agency', labelKey: 'subBusinessType.options.travelAgency', groupsKey: 'travelAgency' },
    { id: 'tour-operator', labelKey: 'subBusinessType.options.tourOperator', groupsKey: 'tourOperator' },
    { id: 'car-rental', labelKey: 'subBusinessType.options.carRental', groupsKey: 'carRental' },
    { id: 'event-venue', labelKey: 'subBusinessType.options.eventVenue', groupsKey: 'eventVenue' },
  ],
  education: [
    { id: 'training-center', labelKey: 'subBusinessType.options.trainingCenter', groupsKey: 'trainingCenter' },
    { id: 'tuition-center', labelKey: 'subBusinessType.options.tuitionCenter', groupsKey: 'tuitionCenter' },
    { id: 'nursery', labelKey: 'subBusinessType.options.nursery', groupsKey: 'nursery' },
    { id: 'school', labelKey: 'subBusinessType.options.school', groupsKey: 'school' },
    { id: 'driving-school', labelKey: 'subBusinessType.options.drivingSchool', groupsKey: 'drivingSchool' },
    { id: 'online-academy', labelKey: 'subBusinessType.options.onlineAcademy', groupsKey: 'onlineAcademy' },
  ],
  automotive: [
    { id: 'garage', labelKey: 'subBusinessType.options.garage', groupsKey: 'garage' },
    { id: 'car-wash', labelKey: 'subBusinessType.options.carWash', groupsKey: 'carWash' },
    { id: 'detailing', labelKey: 'subBusinessType.options.detailing', groupsKey: 'detailing' },
    { id: 'tire-shop', labelKey: 'subBusinessType.options.tireShop', groupsKey: 'tireShop' },
    { id: 'spare-parts', labelKey: 'subBusinessType.options.spareParts', groupsKey: 'spareParts' },
    { id: 'battery-shop', labelKey: 'subBusinessType.options.batteryShop', groupsKey: 'batteryShop' },
    { id: 'vehicle-inspection', labelKey: 'subBusinessType.options.vehicleInspection', groupsKey: 'vehicleInspection' },
  ],
}

export function isBusinessTypeId(value: string | undefined): value is BusinessTypeId {
  return value != null && value in SUB_TYPES_BY_BUSINESS
}
