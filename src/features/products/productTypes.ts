export const productTypes = [["pizza", "Pizza"], ["wings", "Alitas"], ["fries", "Papas"], ["nuggets", "Nuggets"], ["cone", "Cono"], ["beverage", "Bebida"], ["extra", "Extra"], ["other", "Otro"]] as const;
export type ProductType = typeof productTypes[number][0];
export const productTypeLabel = (type: string) => productTypes.find(([key]) => key === type)?.[1] ?? "Otro";
