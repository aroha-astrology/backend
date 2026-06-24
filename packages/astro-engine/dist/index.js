"use strict";
// =============================================================================
// @jyotish-ai/astro-engine - Vedic Astrology Calculation Engine
// =============================================================================
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLalKitabRemedies = exports.analyzeMobileNumber = exports.generateDeterministicVariants = exports.variantHitsTarget = exports.computeNameAlignment = exports.getKuaData = exports.getNamePlanes = exports.getZodiacSign = exports.generateMonthlyForecast = exports.calculatePersonalMonth = exports.calculatePersonalYear = exports.calculateChallengeNumbers = exports.calculateLoShuGrid = exports.calculateKuaNumber = exports.calculateBhagyank = exports.calculateMulank = exports.reduceToSingleDigit = exports.calculateFullNumerology = exports.analyzeNameNumerology = exports.calculateLuckyNumbers = exports.calculatePersonality = exports.calculateSoulUrge = exports.calculateExpression = exports.calculateLifePath = exports.findBestMuhurta = exports.calculateDashakoota = exports.calculateAshtakoota = exports.detectAllYogas = exports.evaluateSignStrength = exports.getBindusForPlanetInSign = exports.calculateAshtakavarga = exports.calculateSarvaAshtakavarga = exports.calculateBhinnaAshtakavarga = exports.calculateShadbala = exports.calculateChart = exports.calculateAscendant = exports.calculateHouses = exports.calculatePlanetPositions = exports.dateToJulianDay = void 0;
// Planet Position Calculations
var planetPositions_1 = require("./calculations/planetPositions");
Object.defineProperty(exports, "dateToJulianDay", { enumerable: true, get: function () { return planetPositions_1.dateToJulianDay; } });
Object.defineProperty(exports, "calculatePlanetPositions", { enumerable: true, get: function () { return planetPositions_1.calculatePlanetPositions; } });
Object.defineProperty(exports, "calculateHouses", { enumerable: true, get: function () { return planetPositions_1.calculateHouses; } });
Object.defineProperty(exports, "calculateAscendant", { enumerable: true, get: function () { return planetPositions_1.calculateAscendant; } });
Object.defineProperty(exports, "calculateChart", { enumerable: true, get: function () { return planetPositions_1.calculateChart; } });
// Shadbala (Six-fold Strength)
var shadbala_1 = require("./calculations/shadbala");
Object.defineProperty(exports, "calculateShadbala", { enumerable: true, get: function () { return shadbala_1.calculateShadbala; } });
// Ashtakavarga System
var ashtakavarga_1 = require("./calculations/ashtakavarga");
Object.defineProperty(exports, "calculateBhinnaAshtakavarga", { enumerable: true, get: function () { return ashtakavarga_1.calculateBhinnaAshtakavarga; } });
Object.defineProperty(exports, "calculateSarvaAshtakavarga", { enumerable: true, get: function () { return ashtakavarga_1.calculateSarvaAshtakavarga; } });
Object.defineProperty(exports, "calculateAshtakavarga", { enumerable: true, get: function () { return ashtakavarga_1.calculateAshtakavarga; } });
Object.defineProperty(exports, "getBindusForPlanetInSign", { enumerable: true, get: function () { return ashtakavarga_1.getBindusForPlanetInSign; } });
Object.defineProperty(exports, "evaluateSignStrength", { enumerable: true, get: function () { return ashtakavarga_1.evaluateSignStrength; } });
// Dasha Systems
__exportStar(require("./dashas/index"), exports);
// Dosha Analysis
__exportStar(require("./doshas/index"), exports);
// Divisional Charts
__exportStar(require("./charts/divisionalCharts"), exports);
// Yoga Detection
var index_1 = require("./yogas/index");
Object.defineProperty(exports, "detectAllYogas", { enumerable: true, get: function () { return index_1.detectAllYogas; } });
// Matching Systems
var ashtakoota_1 = require("./matching/ashtakoota");
Object.defineProperty(exports, "calculateAshtakoota", { enumerable: true, get: function () { return ashtakoota_1.calculateAshtakoota; } });
var dashakoota_1 = require("./matching/dashakoota");
Object.defineProperty(exports, "calculateDashakoota", { enumerable: true, get: function () { return dashakoota_1.calculateDashakoota; } });
// Panchang
__exportStar(require("./panchang/index"), exports);
// Muhurta
var index_2 = require("./muhurta/index");
Object.defineProperty(exports, "findBestMuhurta", { enumerable: true, get: function () { return index_2.findBestMuhurta; } });
// Numerology
var index_3 = require("./numerology/index");
Object.defineProperty(exports, "calculateLifePath", { enumerable: true, get: function () { return index_3.calculateLifePath; } });
Object.defineProperty(exports, "calculateExpression", { enumerable: true, get: function () { return index_3.calculateExpression; } });
Object.defineProperty(exports, "calculateSoulUrge", { enumerable: true, get: function () { return index_3.calculateSoulUrge; } });
Object.defineProperty(exports, "calculatePersonality", { enumerable: true, get: function () { return index_3.calculatePersonality; } });
Object.defineProperty(exports, "calculateLuckyNumbers", { enumerable: true, get: function () { return index_3.calculateLuckyNumbers; } });
Object.defineProperty(exports, "analyzeNameNumerology", { enumerable: true, get: function () { return index_3.analyzeNameNumerology; } });
Object.defineProperty(exports, "calculateFullNumerology", { enumerable: true, get: function () { return index_3.calculateFullNumerology; } });
// Vedic Numerology
var vedic_1 = require("./numerology/vedic");
Object.defineProperty(exports, "reduceToSingleDigit", { enumerable: true, get: function () { return vedic_1.reduceToSingleDigit; } });
Object.defineProperty(exports, "calculateMulank", { enumerable: true, get: function () { return vedic_1.calculateMulank; } });
Object.defineProperty(exports, "calculateBhagyank", { enumerable: true, get: function () { return vedic_1.calculateBhagyank; } });
Object.defineProperty(exports, "calculateKuaNumber", { enumerable: true, get: function () { return vedic_1.calculateKuaNumber; } });
Object.defineProperty(exports, "calculateLoShuGrid", { enumerable: true, get: function () { return vedic_1.calculateLoShuGrid; } });
Object.defineProperty(exports, "calculateChallengeNumbers", { enumerable: true, get: function () { return vedic_1.calculateChallengeNumbers; } });
Object.defineProperty(exports, "calculatePersonalYear", { enumerable: true, get: function () { return vedic_1.calculatePersonalYear; } });
Object.defineProperty(exports, "calculatePersonalMonth", { enumerable: true, get: function () { return vedic_1.calculatePersonalMonth; } });
Object.defineProperty(exports, "generateMonthlyForecast", { enumerable: true, get: function () { return vedic_1.generateMonthlyForecast; } });
Object.defineProperty(exports, "getZodiacSign", { enumerable: true, get: function () { return vedic_1.getZodiacSign; } });
Object.defineProperty(exports, "getNamePlanes", { enumerable: true, get: function () { return vedic_1.getNamePlanes; } });
Object.defineProperty(exports, "getKuaData", { enumerable: true, get: function () { return vedic_1.getKuaData; } });
// Name Correction
var nameCorrection_1 = require("./numerology/nameCorrection");
Object.defineProperty(exports, "computeNameAlignment", { enumerable: true, get: function () { return nameCorrection_1.computeNameAlignment; } });
Object.defineProperty(exports, "variantHitsTarget", { enumerable: true, get: function () { return nameCorrection_1.variantHitsTarget; } });
Object.defineProperty(exports, "generateDeterministicVariants", { enumerable: true, get: function () { return nameCorrection_1.generateDeterministicVariants; } });
// Mobile Number Numerology
var mobileNumber_1 = require("./numerology/mobileNumber");
Object.defineProperty(exports, "analyzeMobileNumber", { enumerable: true, get: function () { return mobileNumber_1.analyzeMobileNumber; } });
// Lal Kitab
__exportStar(require("./lalkitab/chart"), exports);
__exportStar(require("./lalkitab/pakkaghar"), exports);
__exportStar(require("./lalkitab/blindPlanets"), exports);
__exportStar(require("./lalkitab/debts"), exports);
var remedies_1 = require("./lalkitab/remedies");
Object.defineProperty(exports, "getLalKitabRemedies", { enumerable: true, get: function () { return remedies_1.getLalKitabRemedies; } });
//# sourceMappingURL=index.js.map