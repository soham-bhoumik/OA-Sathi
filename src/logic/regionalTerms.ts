/**
 * OA-Sathi North Eastern Region (NER) Screening Terminology Dictionary
 *
 * Provides localized vocabulary for community health workers conducting joint-health
 * screenings across the North Eastern states (Meghalaya, Assam, Manipur, Mizoram, etc.).
 *
 * Design Guidelines:
 * 1. English is the default working language.
 * 2. Provides contextual clarification for medical concepts (e.g. stiffness, swelling).
 * 3. Does not infer ethnicity, tribal affiliation, or health status from language choice.
 * 4. Explicitly documented as a demonstration reference glossary, not full i18n localization.
 */

export type NERLanguageCode = "en" | "as" | "kha" | "mni" | "grt" | "lus";

export interface RegionalLanguageInfo {
  code: NERLanguageCode;
  name: string;
  nativeName: string;
  primaryRegions: string[];
}

export interface ScreeningTermGlossary {
  kneePain: string;
  morningStiffness: string;
  swelling: string;
  walkingDifficulty: string;
  restingRelief: string;
  screeningNotice: string;
}

export const SUPPORTED_REGIONAL_LANGUAGES: readonly RegionalLanguageInfo[] = [
  {
    code: "en",
    name: "English",
    nativeName: "English",
    primaryRegions: ["All North Eastern States"],
  },
  {
    code: "as",
    name: "Assamese",
    nativeName: "অসমীয়া",
    primaryRegions: ["Assam", "Dibrugarh", "Kamrup"],
  },
  {
    code: "kha",
    name: "Khasi",
    nativeName: "Ka Ktien Khasi",
    primaryRegions: ["Meghalaya", "East Khasi Hills", "West Khasi Hills", "Ri-Bhoi"],
  },
  {
    code: "mni",
    name: "Manipuri (Meitei)",
    nativeName: "মৈতৈলোন্",
    primaryRegions: ["Manipur", "Imphal West", "Imphal East"],
  },
  {
    code: "grt",
    name: "Garo (A'chik)",
    nativeName: "A'chik Ku'sik",
    primaryRegions: ["Meghalaya", "Garo Hills"],
  },
  {
    code: "lus",
    name: "Mizo",
    nativeName: "Mizo ṭawng",
    primaryRegions: ["Mizoram", "Aizawl"],
  },
] as const;

export const REGIONAL_GLOSSARY: Record<NERLanguageCode, ScreeningTermGlossary> = {
  en: {
    kneePain: "Knee discomfort or pain",
    morningStiffness: "Stiffness after resting or waking",
    swelling: "Visible joint swelling or puffiness",
    walkingDifficulty: "Difficulty with walking or slopes",
    restingRelief: "Discomfort eases with resting",
    screeningNotice: "Voluntary conversation aid, not a clinical diagnosis",
  },
  as: {
    kneePain: "আঁঠুৰ বিষ বা অস্বস্তি (Aathur bikh)",
    morningStiffness: "টোপনি বা জিৰণিৰ পিছত জঠৰতা (Stiffness after rest)",
    swelling: "গাঁথি ফুলা বা ওখহি যোৱা (Joint swelling)",
    walkingDifficulty: "খোজ কাঢ়িবলৈ বা খটখটী বগাবলৈ অসুবিধা (Walking difficulty)",
    restingRelief: "জিৰণি ল'লে কিছু আৰাম পোৱা যায় (Eases with rest)",
    screeningNotice: "ই এটা স্বৈচ্ছিক পৰীক্ষা সহায়িকা, কোনো নিশ্চিত ৰোগ নিৰ্ণয় নহয়",
  },
  kha: {
    kneePain: "Ka jingpang khohsiew (Knee pain)",
    morningStiffness: "Ka jingshong khrik hadien ba thiah lane shong (Morning stiffness)",
    swelling: "Ka jingat kynjrih ha ka mat (Joint swelling)",
    walkingDifficulty: "Ka jingeh ban iaid lane kiew riat (Difficulty walking/climbing)",
    restingRelief: "Ka jem haba shong thait (Relieved by resting)",
    screeningNotice: "Ka jingshem jingmut sngewbha, kam dei ka dawai lane ka jingbatai pang",
  },
  mni: {
    kneePain: "খুকুর লায়না নত্রগা নুংঙাইতবা (Khuk-ee leina)",
    morningStiffness: "পোথারবা মতুংদা নত্রগা নুমিৎ থোকপদা খোং শেম্বা ঙমদবা (Stiffness)",
    swelling: "খুকুর পোম্বা (Joint swelling)",
    walkingDifficulty: "খোং চৎপদা নত্রগা চীং কায়বদা খুদোংচাদবা (Walking trouble)",
    restingRelief: "পোথারবা মতমদা নুংঙাইবদা খরা ফবা (Improves with rest)",
    screeningNotice: "মসি মীয়াংদা পাউতাক পীনবগী খুৎলাইনি, অনাবা পুথোকপগী নত্তে",
  },
  grt: {
    kneePain: "Ja'sku saani (Knee pain)",
    morningStiffness: "Nengtakaniko ma'chote ba mego skani (Rest stiffness)",
    swelling: "Biring ripimani (Swelling around joint)",
    walkingDifficulty: "Re'rurana ba a'bri gadoani neng'ani (Difficulty walking)",
    restingRelief: "Nengtakahon kamo namani (Eases with rest)",
    screeningNotice: "Iaara an'tang namnike dingtang dakani chol, sam-sa'a nina ong'ja",
  },
  lus: {
    kneePain: "Khûp na (Knee pain)",
    morningStiffness: "Chawlh hahdam hnu leh thawh phat a khûp khawng (Stiffness)",
    swelling: "Ruh inzawmna vung (Joint swelling)",
    walkingDifficulty: "Kal leh kailawn zawh harsa (Difficulty walking/stairs)",
    restingRelief: "Chawlh hahdam hnu a ziaawm deuh (Eases with rest)",
    screeningNotice: "Mahni duhthlanna a endikna a ni a, damdawi lam thutlukna a ni lo",
  },
};

/**
 * Returns the regional glossary for the selected language code. Defaults to English.
 */
export function getRegionalGlossary(lang: string): ScreeningTermGlossary {
  const code = (lang in REGIONAL_GLOSSARY ? lang : "en") as NERLanguageCode;
  return REGIONAL_GLOSSARY[code];
}
