import type { AstroPlan } from '../types/database';
export declare const ASTRO_PLANS: Record<AstroPlan, {
    price: number;
    customers: number;
    label: string;
}>;
export declare const ASTRO_ADDONS: readonly [{
    readonly id: "addon_5";
    readonly price: 250;
    readonly customers: 5;
    readonly label: "+5 Customers";
    readonly badge: "Starter";
}, {
    readonly id: "addon_11";
    readonly price: 500;
    readonly customers: 11;
    readonly label: "+11 Customers";
    readonly badge: "Growth";
}, {
    readonly id: "addon_25";
    readonly price: 1000;
    readonly customers: 25;
    readonly label: "+25 Customers";
    readonly badge: "Pro";
}];
export type AstroAddonId = typeof ASTRO_ADDONS[number]['id'];
//# sourceMappingURL=astrologer-plans.d.ts.map