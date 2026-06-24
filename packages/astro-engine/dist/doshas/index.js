"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectGuruChandalDosha = exports.detectGrahanDosha = exports.detectKemDrumaDosha = exports.detectPitraDosha = exports.detectSadeSati = exports.detectKaalSarpDosha = exports.detectMangalDosha = void 0;
exports.analyzeAllDoshas = analyzeAllDoshas;
var mangalDosha_1 = require("./mangalDosha");
Object.defineProperty(exports, "detectMangalDosha", { enumerable: true, get: function () { return mangalDosha_1.detectMangalDosha; } });
var kaalSarp_1 = require("./kaalSarp");
Object.defineProperty(exports, "detectKaalSarpDosha", { enumerable: true, get: function () { return kaalSarp_1.detectKaalSarpDosha; } });
var sadeSati_1 = require("./sadeSati");
Object.defineProperty(exports, "detectSadeSati", { enumerable: true, get: function () { return sadeSati_1.detectSadeSati; } });
var pitraDosha_1 = require("./pitraDosha");
Object.defineProperty(exports, "detectPitraDosha", { enumerable: true, get: function () { return pitraDosha_1.detectPitraDosha; } });
var kemDrumaDosha_1 = require("./kemDrumaDosha");
Object.defineProperty(exports, "detectKemDrumaDosha", { enumerable: true, get: function () { return kemDrumaDosha_1.detectKemDrumaDosha; } });
var grahanDosha_1 = require("./grahanDosha");
Object.defineProperty(exports, "detectGrahanDosha", { enumerable: true, get: function () { return grahanDosha_1.detectGrahanDosha; } });
var guruChandal_1 = require("./guruChandal");
Object.defineProperty(exports, "detectGuruChandalDosha", { enumerable: true, get: function () { return guruChandal_1.detectGuruChandalDosha; } });
const mangalDosha_2 = require("./mangalDosha");
const kaalSarp_2 = require("./kaalSarp");
const sadeSati_2 = require("./sadeSati");
const pitraDosha_2 = require("./pitraDosha");
const kemDrumaDosha_2 = require("./kemDrumaDosha");
const grahanDosha_2 = require("./grahanDosha");
const guruChandal_2 = require("./guruChandal");
/**
 * Analyze all doshas for a given chart.
 *
 * @param chartData - The natal chart data
 * @param saturnLongitude - Current transit Saturn longitude (sidereal, 0-360)
 *                          needed for Sade Sati calculation
 * @returns Complete dosha analysis
 */
function analyzeAllDoshas(chartData, saturnLongitude) {
    const moon = chartData.planets.find((p) => p.planet === 'Moon');
    const moonSign = moon ? moon.sign : 'Aries';
    return {
        mangal: (0, mangalDosha_2.detectMangalDosha)(chartData),
        kaalSarp: (0, kaalSarp_2.detectKaalSarpDosha)(chartData),
        sadeSati: (0, sadeSati_2.detectSadeSati)(moonSign, saturnLongitude),
        pitra: (0, pitraDosha_2.detectPitraDosha)(chartData),
        kemDruma: (0, kemDrumaDosha_2.detectKemDrumaDosha)(chartData),
        grahan: (0, grahanDosha_2.detectGrahanDosha)(chartData),
        guruChandal: (0, guruChandal_2.detectGuruChandalDosha)(chartData),
    };
}
//# sourceMappingURL=index.js.map