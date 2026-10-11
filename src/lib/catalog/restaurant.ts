export function isRestaurantMenuAvailable(
  isAvailable: boolean | null | undefined,
  availableFrom?: string | null,
  availableUntil?: string | null,
  now = new Date(),
): boolean {
  if (!isAvailable) return false;
  if (!availableFrom || !availableUntil) return true;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Baghdad',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now).split(':');
  const current = Number(parts[0]) * 60 + Number(parts[1]);
  const parse = (value: string) => {
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
  };
  const from = parse(availableFrom);
  const until = parse(availableUntil);
  return from <= until
    ? current >= from && current < until
    : current >= from || current < until;
}

export const restaurantMenuCategoryLabels: Record<string, string> = {
  main_course: 'خواردنی سەرەکی',
  appetizer: 'پێشخواردن',
  dessert: 'شیرینی',
  beverage: 'خواردنەوە',
  salad: 'سالات',
  kids: 'خواردنی منداڵان',
  combo: 'کۆمبۆ / کۆمەڵەخواردن',
  other: 'جۆری تر',
};

export const restaurantDietaryLabels: Record<string, string> = {
  vegetarian: 'گیاخواردن',
  vegan: 'ڤیگان',
  contains_meat: 'گوشت تێدایە',
  spicy: 'توند',
  gluten_free: 'بێ گلوتین',
  dairy_free: 'بێ بەرهەمی شیر',
  halal: 'حەڵاڵ',
};
