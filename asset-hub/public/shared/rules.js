// Keyword rules for categorising bank transactions in AU, MY and SG.
// First match wins, so more specific rules come first. Extend freely.

export const CATEGORY_META = {
  Salary: { kind: 'income', color: '#1f9d74' },
  Interest: { kind: 'income', color: '#2bb38a' },
  Dividends: { kind: 'income', color: '#3aa0c8' },
  Refunds: { kind: 'income', color: '#6bbf9a' },
  'Other income': { kind: 'income', color: '#8fcfb4' },
  Investing: { kind: 'invest', color: '#5b6ee1' },
  Transfer: { kind: 'transfer', color: '#8a94a6' },
  Groceries: { kind: 'spend', color: '#e0913a' },
  Dining: { kind: 'spend', color: '#e46a4f' },
  Transport: { kind: 'spend', color: '#3d8bd9' },
  'Bills & utilities': { kind: 'spend', color: '#c9a227' },
  'Rent & housing': { kind: 'spend', color: '#9b6bd6' },
  Subscriptions: { kind: 'spend', color: '#d65c9a' },
  Shopping: { kind: 'spend', color: '#e6745e' },
  Health: { kind: 'spend', color: '#4fb0a5' },
  Travel: { kind: 'spend', color: '#2f9fd8' },
  Entertainment: { kind: 'spend', color: '#b46ad6' },
  Betting: { kind: 'spend', color: '#d64545' },
  'Fees & tax': { kind: 'spend', color: '#7a7f8c' },
  'Cash withdrawal': { kind: 'spend', color: '#9aa18a' },
  Other: { kind: 'spend', color: '#a0a7b4' },
};
export const CATEGORIES = Object.keys(CATEGORY_META);

// [category, regex, direction] direction: 'in' only credits, 'out' only debits, undefined both.
export const RULES = [
  ['Salary', /\b(SALARY|PAYROLL|PAY ?RUN|WAGES?|GAJI|SALARIES)\b/i, 'in'],
  ['Interest', /\b(INTEREST|BONUS INT|CREDIT INT|HIBAH|DIVIDEND ON SAVINGS)\b/i, 'in'],
  ['Dividends', /\b(DIVIDEND|DIV PAYMENT|DISTRIBUTION|DRP)\b/i, 'in'],
  ['Investing', /(INTERACTIVE ?BROKERS|\bIBKR\b|MOOMOO|FUTU|BINANCE|COINSPOT|SWYFTX|INDEPENDENT RESERVE|KRAKEN|COINBASE|STAKE ?TRADING|PEARLER|SELFWEALTH|COMMSEC|RAIZ|SPACESHIP|SYFE|ENDOWUS|STASHAWAY|TIGER BROKERS|LUNO|RAKUTEN TRADE)/i],
  ['Refunds', /\b(REFUND|REVERSAL|CASHBACK|RETURN)\b/i, 'in'],
  ['Transfer', /\b(TRANSFER (TO|FROM)|INTERNAL TRANSFER|OWN ACCOUNT|TFR|TRF|IBG TRANSFER|INSTANT TRANSFER|SAVINGS MAXIMISER|BPAY TO CREDIT CARD|CREDIT CARD PAYMENT|CARD REPAYMENT)\b/i],
  ['Betting', /(SPORTSBET|LADBROKES|POINTSBET|BET365|\bNEDS\b|\bTAB\b|BETFAIR|PALMERBET|BETR\b|UNIBET|TABCORP|POLYMARKET|KALSHI)/i, 'out'],
  ['Groceries', /(WOOLWORTHS|\bCOLES\b|ALDI|\bIGA\b|HARRIS FARM|COSTCO|FAIRPRICE|NTUC|COLD STORAGE|SHENG SIONG|GIANT|JAYA GROCER|LOTUS'?S|TESCO|AEON|MYDIN|VILLAGE GROCER|99 SPEEDMART|7-ELEVEN|FOODWORKS)/i, 'out'],
  ['Dining', /(UBER ?\*?EATS|DOORDASH|MENULOG|DELIVEROO|GRABFOOD|GRAB\*? ?FOOD|FOODPANDA|MCDONALD|\bKFC\b|HUNGRY JACK|STARBUCKS|GUZMAN|NANDO|SUBWAY|CAFE|COFFEE|RESTAURANT|BAKERY|SUSHI|RAMEN|PIZZA|BAR\b|PUB\b|KOPITIAM|MAMAK|TOAST BOX|YA KUN|CHATIME|GONG CHA|BOOST JUICE|DOMINO)/i, 'out'],
  ['Transport', /(\bUBER\b(?! ?\*?EATS)|\bDIDI\b|\bOLA\b|GRAB(?!\*? ?FOOD)|TRANSPORT ?FOR ?NSW|\bOPAL\b|MYKI|GO ?CARD|TRANSLINK|SHELL|\bBP\b|AMPOL|CALTEX|7-ELEVEN FUEL|PETRONAS|PETRON|ESSO|LINKT|E-?TOLL|EZ-?LINK|SIMPLYGO|TOUCH ?N ?GO|TNG|COMFORTDELGRO|GOJEK|CARPARK|PARKING|WILSON PARKING|SECURE PARKING)/i, 'out'],
  ['Subscriptions', /(NETFLIX|SPOTIFY|APPLE\.COM|ITUNES|ICLOUD|GOOGLE ?(STORAGE|ONE|PLAY|\*)|YOUTUBE|DISNEY|STAN\.COM|BINGE|KAYO|PARAMOUNT|AMAZON PRIME|PRIME VIDEO|AUDIBLE|CHATGPT|OPENAI|ANTHROPIC|CLAUDE\.AI|GITHUB|NOTION|DROPBOX|ADOBE|MICROSOFT|XBOX|PLAYSTATION PLUS|NINTENDO|RACKNERD|EVOXT|DIGITALOCEAN|TAILSCALE|CLOUDFLARE|NAMECHEAP|PATREON|ONLYFANS|DUOLINGO|STRAVA|TRADINGVIEW)/i, 'out'],
  ['Bills & utilities', /(\bAGL\b|ORIGIN ENERGY|ENERGYAUSTRALIA|RED ENERGY|ALINTA|SYDNEY WATER|TELSTRA|OPTUS|VODAFONE|\bTPG\b|AUSSIE BROADBAND|BELONG|AMAYSIM|SINGTEL|STARHUB|\bM1\b|CIRCLES|UNIFI|\bTM\b|MAXIS|CELCOM|DIGI|U MOBILE|\bTNB\b|TENAGA|SYABAS|\bSP SERVICES|SP GROUP|INSURANCE|MEDIBANK|\bBUPA\b|\bNIB\b|\bHCF\b|\bAHM\b|ALLIANZ|AAMI|NRMA|BUDGET DIRECT|GREAT EASTERN|PRUDENTIAL|\bAIA\b|COUNCIL RATES)/i, 'out'],
  ['Rent & housing', /(\bRENT\b|RENTAL|REAL ESTATE|STRATA|RAY WHITE|LJ HOOKER|MCGRATH|BELLE PROPERTY|HARCOURTS|BARRY PLANT|DEPOSIT\.COM|MORTGAGE|HOME LOAN|HDB|CONDO|MAINTENANCE FEE)/i, 'out'],
  ['Travel', /(QANTAS|JETSTAR|VIRGIN AUST|AIRASIA|SCOOT|SINGAPORE AIR|MALAYSIA AIRLINES|CATHAY|EMIRATES|BOOKING\.COM|AIRBNB|AGODA|EXPEDIA|TRIP\.COM|HOTEL|HOSTEL|KLOOK|TRAVELOKA|WEBJET)/i, 'out'],
  ['Health', /(CHEMIST|PHARMACY|PRICELINE|GUARDIAN|WATSONS|DOCTOR|MEDICAL|DENTAL|DENTIST|CLINIC|HOSPITAL|PHYSIO|OPTOMETR|SPECSAVERS|\bGYM\b|FITNESS|ANYTIME FIT|F45|VIRGIN ACTIVE|PURE FITNESS)/i, 'out'],
  ['Entertainment', /(CINEMA|HOYTS|EVENT CINEMA|GSC|GOLDEN VILLAGE|TICKETEK|TICKETMASTER|MOSHTIX|STEAM|EPIC GAMES|BOWLING|ZOO|MUSEUM|CONCERT|STADIUM)/i, 'out'],
  ['Shopping', /(AMAZON|EBAY|KMART|TARGET|BIG ?W|MYER|DAVID JONES|JB ?HI-?FI|HARVEY NORMAN|OFFICEWORKS|BUNNINGS|IKEA|UNIQLO|H&M|ZARA|COTTON ON|SHOPEE|LAZADA|ZALORA|TEMU|SHEIN|ALIEXPRESS|APPLE STORE|COURTS|MUJI|DAISO|DECATHLON|REBEL SPORT|NIKE|ADIDAS)/i, 'out'],
  ['Fees & tax', /(\bFEE\b|FEES|CHARGE|ANNUAL FEE|LATE PAYMENT|\bATO\b|TAX OFFICE|LHDN|\bIRAS\b|STAMP DUTY|FINE\b|PENALTY)/i, 'out'],
  ['Cash withdrawal', /(\bATM\b|CASH WITHDRAWAL|CASH OUT|WDL)/i, 'out'],
];

/** Normalise a description to a stable payee/merchant key. */
export function payeeKey(desc) {
  return String(desc || '').toUpperCase()
    .replace(/\b(CARD|VISA|DEBIT|PURCHASE|EFTPOS|POS|PAYMENT|DIRECT CREDIT|DIRECT DEBIT|VALUE DATE|REF(ERENCE)?|AUS|AU|SGP|SG|MYS|MY|NS|NSW|VIC|QLD|SYDNEY|MELBOURNE)\b/g, ' ')
    .replace(/X{2,}\d+/g, ' ')
    .replace(/\d{2}\/\d{2}(\/\d{2,4})?/g, ' ')
    .replace(/[0-9#*:.,\-_/\\()]+/g, ' ')
    .replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ') || 'UNKNOWN';
}

export function categorize(tx) {
  const d = String(tx.desc || '');
  const dir = tx.amount >= 0 ? 'in' : 'out';
  for (const [cat, re, only] of RULES) {
    if (only && only !== dir) continue;
    if (re.test(d)) return cat;
  }
  return dir === 'in' ? 'Other income' : 'Other';
}
