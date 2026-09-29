/**
 * Reference vocabularies for dropdown / radio matching. Each entry is a list of equivalent
 * spellings; the first item is the canonical display form. All comparisons go through
 * `simplify()`, so casing and punctuation do not matter here.
 */

export type AliasGroup = readonly string[];

// [name, ISO-3166 alpha-2, alpha-3, …extra aliases]
const COUNTRY_ROWS: ReadonlyArray<readonly string[]> = [
  ['Afghanistan', 'AF', 'AFG'], ['Albania', 'AL', 'ALB'], ['Algeria', 'DZ', 'DZA'], ['Andorra', 'AD', 'AND'],
  ['Angola', 'AO', 'AGO'], ['Argentina', 'AR', 'ARG'], ['Armenia', 'AM', 'ARM'], ['Australia', 'AU', 'AUS'],
  ['Austria', 'AT', 'AUT'], ['Azerbaijan', 'AZ', 'AZE'], ['Bahamas', 'BS', 'BHS', 'The Bahamas'], ['Bahrain', 'BH', 'BHR'],
  ['Bangladesh', 'BD', 'BGD'], ['Barbados', 'BB', 'BRB'], ['Belarus', 'BY', 'BLR'], ['Belgium', 'BE', 'BEL'],
  ['Belize', 'BZ', 'BLZ'], ['Benin', 'BJ', 'BEN'], ['Bhutan', 'BT', 'BTN'], ['Bolivia', 'BO', 'BOL'],
  ['Bosnia and Herzegovina', 'BA', 'BIH', 'Bosnia'], ['Botswana', 'BW', 'BWA'], ['Brazil', 'BR', 'BRA', 'Brasil'],
  ['Brunei', 'BN', 'BRN', 'Brunei Darussalam'], ['Bulgaria', 'BG', 'BGR'], ['Burkina Faso', 'BF', 'BFA'],
  ['Burundi', 'BI', 'BDI'], ['Cambodia', 'KH', 'KHM'], ['Cameroon', 'CM', 'CMR'], ['Canada', 'CA', 'CAN'],
  ['Chad', 'TD', 'TCD'], ['Chile', 'CL', 'CHL'], ['China', 'CN', 'CHN', "People's Republic of China", 'PRC'],
  ['Colombia', 'CO', 'COL'], ['Costa Rica', 'CR', 'CRI'], ['Croatia', 'HR', 'HRV'], ['Cuba', 'CU', 'CUB'],
  ['Cyprus', 'CY', 'CYP'], ['Czechia', 'CZ', 'CZE', 'Czech Republic'], ['Denmark', 'DK', 'DNK'],
  ['Dominican Republic', 'DO', 'DOM'], ['Ecuador', 'EC', 'ECU'], ['Egypt', 'EG', 'EGY'], ['El Salvador', 'SV', 'SLV'],
  ['Estonia', 'EE', 'EST'], ['Ethiopia', 'ET', 'ETH'], ['Fiji', 'FJ', 'FJI'], ['Finland', 'FI', 'FIN'],
  ['France', 'FR', 'FRA'], ['Georgia', 'GE', 'GEO'], ['Germany', 'DE', 'DEU', 'Deutschland'], ['Ghana', 'GH', 'GHA'],
  ['Greece', 'GR', 'GRC'], ['Guatemala', 'GT', 'GTM'], ['Honduras', 'HN', 'HND'], ['Hong Kong', 'HK', 'HKG'],
  ['Hungary', 'HU', 'HUN'], ['Iceland', 'IS', 'ISL'], ['India', 'IN', 'IND', 'Bharat', 'Republic of India'],
  ['Indonesia', 'ID', 'IDN'], ['Iran', 'IR', 'IRN'], ['Iraq', 'IQ', 'IRQ'], ['Ireland', 'IE', 'IRL', 'Republic of Ireland'],
  ['Israel', 'IL', 'ISR'], ['Italy', 'IT', 'ITA'], ['Jamaica', 'JM', 'JAM'], ['Japan', 'JP', 'JPN'],
  ['Jordan', 'JO', 'JOR'], ['Kazakhstan', 'KZ', 'KAZ'], ['Kenya', 'KE', 'KEN'], ['Kuwait', 'KW', 'KWT'],
  ['Kyrgyzstan', 'KG', 'KGZ'], ['Laos', 'LA', 'LAO'], ['Latvia', 'LV', 'LVA'], ['Lebanon', 'LB', 'LBN'],
  ['Libya', 'LY', 'LBY'], ['Liechtenstein', 'LI', 'LIE'], ['Lithuania', 'LT', 'LTU'], ['Luxembourg', 'LU', 'LUX'],
  ['Madagascar', 'MG', 'MDG'], ['Malawi', 'MW', 'MWI'], ['Malaysia', 'MY', 'MYS'], ['Maldives', 'MV', 'MDV'],
  ['Mali', 'ML', 'MLI'], ['Malta', 'MT', 'MLT'], ['Mauritius', 'MU', 'MUS'], ['Mexico', 'MX', 'MEX'],
  ['Moldova', 'MD', 'MDA'], ['Monaco', 'MC', 'MCO'], ['Mongolia', 'MN', 'MNG'], ['Montenegro', 'ME', 'MNE'],
  ['Morocco', 'MA', 'MAR'], ['Mozambique', 'MZ', 'MOZ'], ['Myanmar', 'MM', 'MMR', 'Burma'], ['Namibia', 'NA', 'NAM'],
  ['Nepal', 'NP', 'NPL'], ['Netherlands', 'NL', 'NLD', 'Holland', 'The Netherlands'], ['New Zealand', 'NZ', 'NZL'],
  ['Nicaragua', 'NI', 'NIC'], ['Niger', 'NE', 'NER'], ['Nigeria', 'NG', 'NGA'], ['North Korea', 'KP', 'PRK'],
  ['North Macedonia', 'MK', 'MKD', 'Macedonia'], ['Norway', 'NO', 'NOR'], ['Oman', 'OM', 'OMN'], ['Pakistan', 'PK', 'PAK'],
  ['Panama', 'PA', 'PAN'], ['Papua New Guinea', 'PG', 'PNG'], ['Paraguay', 'PY', 'PRY'], ['Peru', 'PE', 'PER'],
  ['Philippines', 'PH', 'PHL'], ['Poland', 'PL', 'POL'], ['Portugal', 'PT', 'PRT'], ['Qatar', 'QA', 'QAT'],
  ['Romania', 'RO', 'ROU'], ['Russia', 'RU', 'RUS', 'Russian Federation'], ['Rwanda', 'RW', 'RWA'],
  ['Saudi Arabia', 'SA', 'SAU', 'KSA'], ['Senegal', 'SN', 'SEN'], ['Serbia', 'RS', 'SRB'], ['Seychelles', 'SC', 'SYC'],
  ['Singapore', 'SG', 'SGP'], ['Slovakia', 'SK', 'SVK'], ['Slovenia', 'SI', 'SVN'], ['Somalia', 'SO', 'SOM'],
  ['South Africa', 'ZA', 'ZAF'], ['South Korea', 'KR', 'KOR', 'Korea', 'Republic of Korea'], ['Spain', 'ES', 'ESP', 'España'],
  ['Sri Lanka', 'LK', 'LKA'], ['Sudan', 'SD', 'SDN'], ['Sweden', 'SE', 'SWE'], ['Switzerland', 'CH', 'CHE'],
  ['Syria', 'SY', 'SYR'], ['Taiwan', 'TW', 'TWN'], ['Tajikistan', 'TJ', 'TJK'], ['Tanzania', 'TZ', 'TZA'],
  ['Thailand', 'TH', 'THA'], ['Trinidad and Tobago', 'TT', 'TTO'], ['Tunisia', 'TN', 'TUN'], ['Turkey', 'TR', 'TUR', 'Türkiye', 'Turkiye'],
  ['Turkmenistan', 'TM', 'TKM'], ['Uganda', 'UG', 'UGA'], ['Ukraine', 'UA', 'UKR'],
  ['United Arab Emirates', 'AE', 'ARE', 'UAE', 'Emirates'],
  ['United Kingdom', 'GB', 'GBR', 'UK', 'Great Britain', 'Britain', 'England', 'United Kingdom of Great Britain and Northern Ireland'],
  ['United States', 'US', 'USA', 'United States of America', 'America', 'U.S.', 'U.S.A.'],
  ['Uruguay', 'UY', 'URY'], ['Uzbekistan', 'UZ', 'UZB'], ['Venezuela', 'VE', 'VEN'], ['Vietnam', 'VN', 'VNM', 'Viet Nam'],
  ['Yemen', 'YE', 'YEM'], ['Zambia', 'ZM', 'ZMB'], ['Zimbabwe', 'ZW', 'ZWE'],
];

export const COUNTRIES: readonly AliasGroup[] = COUNTRY_ROWS;

/** Nationality adjectives for common countries (country name → demonyms). */
export const DEMONYMS: Record<string, readonly string[]> = {
  India: ['Indian'],
  'United States': ['American', 'US citizen', 'USA citizen'],
  'United Kingdom': ['British', 'UK citizen'],
  Canada: ['Canadian'],
  Australia: ['Australian'],
  'New Zealand': ['New Zealander', 'Kiwi'],
  Germany: ['German'],
  France: ['French'],
  Italy: ['Italian'],
  Spain: ['Spanish'],
  Netherlands: ['Dutch'],
  China: ['Chinese'],
  Japan: ['Japanese'],
  'South Korea': ['Korean', 'South Korean'],
  Singapore: ['Singaporean'],
  Malaysia: ['Malaysian'],
  Indonesia: ['Indonesian'],
  Philippines: ['Filipino', 'Philippine'],
  Pakistan: ['Pakistani'],
  Bangladesh: ['Bangladeshi'],
  Nepal: ['Nepali', 'Nepalese'],
  'Sri Lanka': ['Sri Lankan'],
  Bhutan: ['Bhutanese'],
  'United Arab Emirates': ['Emirati'],
  'Saudi Arabia': ['Saudi', 'Saudi Arabian'],
  Brazil: ['Brazilian'],
  Mexico: ['Mexican'],
  Russia: ['Russian'],
  Ireland: ['Irish'],
  'South Africa': ['South African'],
  Nigeria: ['Nigerian'],
  Kenya: ['Kenyan'],
  Egypt: ['Egyptian'],
  Turkey: ['Turkish'],
  Israel: ['Israeli'],
  Sweden: ['Swedish'],
  Norway: ['Norwegian'],
  Denmark: ['Danish'],
  Finland: ['Finnish'],
  Poland: ['Polish'],
  Portugal: ['Portuguese'],
  Switzerland: ['Swiss'],
  Austria: ['Austrian'],
  Belgium: ['Belgian'],
  Greece: ['Greek'],
  Vietnam: ['Vietnamese'],
  Thailand: ['Thai'],
};

/** ITU calling codes for common countries. */
export const CALLING_CODES: Record<string, string> = {
  India: '+91', 'United States': '+1', Canada: '+1', 'United Kingdom': '+44', Australia: '+61', Germany: '+49',
  France: '+33', Singapore: '+65', 'United Arab Emirates': '+971', 'Saudi Arabia': '+966', Nepal: '+977',
  Bangladesh: '+880', 'Sri Lanka': '+94', Pakistan: '+92', China: '+86', Japan: '+81', 'South Korea': '+82',
  Malaysia: '+60', Indonesia: '+62', Philippines: '+63', Netherlands: '+31', Ireland: '+353', 'New Zealand': '+64',
  Italy: '+39', Spain: '+34', Brazil: '+55', Mexico: '+52', 'South Africa': '+27', Nigeria: '+234', Kenya: '+254',
  Qatar: '+974', Kuwait: '+965', Oman: '+968', Bahrain: '+973', Switzerland: '+41', Sweden: '+46', Russia: '+7',
};

// [name, abbreviation, …aliases]
export const INDIAN_STATES: readonly AliasGroup[] = [
  ['Andhra Pradesh', 'AP'], ['Arunachal Pradesh', 'AR'], ['Assam', 'AS'], ['Bihar', 'BR'], ['Chhattisgarh', 'CG', 'Chattisgarh'],
  ['Goa', 'GA'], ['Gujarat', 'GJ'], ['Haryana', 'HR'], ['Himachal Pradesh', 'HP'], ['Jharkhand', 'JH'],
  ['Karnataka', 'KA'], ['Kerala', 'KL'], ['Madhya Pradesh', 'MP'], ['Maharashtra', 'MH'], ['Manipur', 'MN'],
  ['Meghalaya', 'ML'], ['Mizoram', 'MZ'], ['Nagaland', 'NL'], ['Odisha', 'OD', 'Orissa', 'OR'], ['Punjab', 'PB'],
  ['Rajasthan', 'RJ'], ['Sikkim', 'SK'], ['Tamil Nadu', 'TN'], ['Telangana', 'TG', 'TS'], ['Tripura', 'TR'],
  ['Uttar Pradesh', 'UP'], ['Uttarakhand', 'UK', 'Uttaranchal'], ['West Bengal', 'WB'],
  ['Andaman and Nicobar Islands', 'AN'], ['Chandigarh', 'CH'],
  ['Dadra and Nagar Haveli and Daman and Diu', 'DH', 'DN', 'DD', 'Daman and Diu', 'Dadra and Nagar Haveli'],
  ['Delhi', 'DL', 'NCT of Delhi', 'New Delhi', 'National Capital Territory of Delhi'], ['Jammu and Kashmir', 'JK', 'J&K'],
  ['Ladakh', 'LA'], ['Lakshadweep', 'LD'], ['Puducherry', 'PY', 'Pondicherry'],
];

export const US_STATES: readonly AliasGroup[] = [
  ['Alabama', 'AL'], ['Alaska', 'AK'], ['Arizona', 'AZ'], ['Arkansas', 'AR'], ['California', 'CA'], ['Colorado', 'CO'],
  ['Connecticut', 'CT'], ['Delaware', 'DE'], ['Florida', 'FL'], ['Georgia', 'GA'], ['Hawaii', 'HI'], ['Idaho', 'ID'],
  ['Illinois', 'IL'], ['Indiana', 'IN'], ['Iowa', 'IA'], ['Kansas', 'KS'], ['Kentucky', 'KY'], ['Louisiana', 'LA'],
  ['Maine', 'ME'], ['Maryland', 'MD'], ['Massachusetts', 'MA'], ['Michigan', 'MI'], ['Minnesota', 'MN'],
  ['Mississippi', 'MS'], ['Missouri', 'MO'], ['Montana', 'MT'], ['Nebraska', 'NE'], ['Nevada', 'NV'],
  ['New Hampshire', 'NH'], ['New Jersey', 'NJ'], ['New Mexico', 'NM'], ['New York', 'NY'], ['North Carolina', 'NC'],
  ['North Dakota', 'ND'], ['Ohio', 'OH'], ['Oklahoma', 'OK'], ['Oregon', 'OR'], ['Pennsylvania', 'PA'],
  ['Rhode Island', 'RI'], ['South Carolina', 'SC'], ['South Dakota', 'SD'], ['Tennessee', 'TN'], ['Texas', 'TX'],
  ['Utah', 'UT'], ['Vermont', 'VT'], ['Virginia', 'VA'], ['Washington', 'WA'], ['West Virginia', 'WV'],
  ['Wisconsin', 'WI'], ['Wyoming', 'WY'], ['District of Columbia', 'DC', 'Washington DC'],
];

export const GENDERS: readonly AliasGroup[] = [
  ['male', 'm', 'man', 'boy', 'masculine', 'he/him'],
  ['female', 'f', 'woman', 'girl', 'feminine', 'she/her'],
  ['non-binary', 'nonbinary', 'non binary', 'nb', 'genderqueer', 'they/them'],
  ['other', 'others', 'o', 'transgender', 'third gender', 'third', 'another gender'],
  ['prefer-not-to-say', 'prefer not to say', 'prefer not to disclose', 'decline to self identify', 'decline to state', 'rather not say', 'not disclosed', 'undisclosed', 'i do not wish to answer', 'decline'],
];

export const MARITAL_STATUSES: readonly AliasGroup[] = [
  ['single', 'unmarried', 'never married', 'not married'],
  ['married', 'wed'],
  ['divorced'],
  ['widowed', 'widow', 'widower'],
  ['separated', 'legally separated'],
];

export const EMPLOYMENT_STATUSES: readonly AliasGroup[] = [
  ['employed', 'employed full time', 'full time', 'working', 'currently employed', 'yes employed', 'salaried'],
  ['self-employed', 'self employed', 'business', 'entrepreneur', 'own business'],
  ['unemployed', 'not employed', 'not working', 'looking for work', 'job seeker'],
  ['student', 'studying', 'fresher', 'currently studying', 'pursuing'],
  ['freelancer', 'freelance', 'contractor', 'consultant', 'independent'],
];

/** Education level → equivalent labels used by forms ("Graduate", "UG", "Bachelor's"…). */
export const EDUCATION_LEVELS: Record<string, readonly string[]> = {
  secondary: ['10th', 'secondary', 'ssc', 'sslc', 'matriculation', 'matric', 'class x', 'high school', 'secondary school'],
  'higher-secondary': ['12th', 'higher secondary', 'hsc', 'intermediate', 'class xii', 'senior secondary', 'puc', 'plus two'],
  diploma: ['diploma', 'polytechnic', 'advanced diploma'],
  bachelors: ['bachelors', "bachelor's", 'bachelor', 'bachelors degree', "bachelor's degree", 'graduate', 'graduation', 'undergraduate', 'under graduate', 'ug', 'bachelor degree'],
  masters: ['masters', "master's", 'master', 'masters degree', "master's degree", 'post graduate', 'postgraduate', 'post graduation', 'pg', 'master degree'],
  doctorate: ['doctorate', 'phd', 'ph d', 'doctoral', 'doctor of philosophy'],
  other: ['other', 'others'],
};

export const EDUCATION_LEVEL_LABELS: Record<string, string> = {
  secondary: '10th / Secondary',
  'higher-secondary': '12th / Higher secondary',
  diploma: 'Diploma',
  bachelors: "Bachelor's",
  masters: "Master's",
  doctorate: 'Doctorate',
  other: 'Other',
};

/** Common degree abbreviations. Matching is always on whole normalised words. */
export const DEGREES: readonly AliasGroup[] = [
  ['B.Tech', 'btech', 'b tech', 'bachelor of technology'],
  ['B.E.', 'be', 'b e', 'bachelor of engineering'],
  ['B.Sc', 'bsc', 'b sc', 'bachelor of science', 'bs'],
  ['B.Com', 'bcom', 'b com', 'bachelor of commerce'],
  ['B.A.', 'ba', 'b a', 'bachelor of arts'],
  ['BBA', 'bba', 'bachelor of business administration'],
  ['BCA', 'bca', 'bachelor of computer applications'],
  ['B.Arch', 'barch', 'b arch', 'bachelor of architecture'],
  ['B.Pharm', 'bpharm', 'b pharm', 'bachelor of pharmacy'],
  ['LLB', 'llb', 'bachelor of laws'],
  ['MBBS', 'mbbs', 'bachelor of medicine bachelor of surgery'],
  ['M.Tech', 'mtech', 'm tech', 'master of technology'],
  ['M.E.', 'me', 'm e', 'master of engineering'],
  ['M.Sc', 'msc', 'm sc', 'master of science', 'ms'],
  ['M.Com', 'mcom', 'm com', 'master of commerce'],
  ['M.A.', 'ma', 'm a', 'master of arts'],
  ['MBA', 'mba', 'master of business administration', 'pgdm'],
  ['MCA', 'mca', 'master of computer applications'],
  ['LLM', 'llm', 'master of laws'],
  ['Ph.D', 'phd', 'ph d', 'doctor of philosophy', 'doctorate'],
];

export const MONTHS: readonly AliasGroup[] = [
  ['January', 'jan', '1', '01'], ['February', 'feb', '2', '02'], ['March', 'mar', '3', '03'], ['April', 'apr', '4', '04'],
  ['May', 'may', '5', '05'], ['June', 'jun', '6', '06'], ['July', 'jul', '7', '07'], ['August', 'aug', '8', '08'],
  ['September', 'sep', 'sept', '9', '09'], ['October', 'oct', '10'], ['November', 'nov', '11'], ['December', 'dec', '12'],
];

export const SALUTATIONS = ['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'mx', 'shri', 'smt', 'kumari', 'sir', 'madam'];

export const YES_NO = ['yes', 'no', 'y', 'n', 'true', 'false'];
