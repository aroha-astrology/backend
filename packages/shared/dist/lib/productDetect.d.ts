export type ProductCategory = 'gemstone' | 'rudraksha' | 'yantra' | 'mala' | 'idol' | 'puja-item';
export interface DetectedProduct {
    name: string;
    searchQuery: string;
    category: ProductCategory;
}
export declare function detectProducts(text: string): DetectedProduct[];
export declare function buildProductSearchUrl(query: string): string;
//# sourceMappingURL=productDetect.d.ts.map