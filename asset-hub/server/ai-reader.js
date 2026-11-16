// Reads PDF statements and screenshots (Maybank, DBS, any bank or broker) into rows with Claude.
// Optional: only used when ANTHROPIC_API_KEY (or another Anthropic credential) is configured.
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5-5';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'currency', 'closingBalance', 'transactions', 'holdings', 'notes'],
  properties: {
    kind: { type: 'string', enum: ['transactions', 'holdings'] },
    currency: { type: 'string', description: 'ISO code of the account currency' },
    closingBalance: { anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: false, required: ['amount', 'date'], properties: { amount: { type: 'number' }, date: { type: 'string' } } }] },
    transactions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['date', 'desc', 'amount'], properties: {
      date: { type: 'string', description: 'YYYY-MM-DD' }, desc: { type: 'string' }, amount: { type: 'number', description: 'Signed: money in positive, money out negative' } } } },
    holdings: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['symbol', 'name', 'cls', 'ccy', 'qty', 'price', 'value', 'cost'], properties: {
      symbol: { type: 'string' }, name: { type: 'string' },
      cls: { type: 'string', enum: ['cash', 'stock', 'etf', 'bond', 'crypto', 'staked', 'stable', 'other'] },
      ccy: { type: 'string' }, qty: { type: ['number', 'null'] }, price: { type: ['number', 'null'] }, value: { type: 'number' }, cost: { type: ['number', 'null'] } } } },
    notes: { type: 'string' },
  },
};

const PROMPT = account => `You are reading a financial document for a personal net-worth app.
Account: "${account.name}" at ${account.institution || 'unknown institution'} (${account.tier}), currency ${account.ccy}.

If it is a bank statement or transaction list, set kind "transactions": list every transaction with a signed amount (money in positive, money out negative), and the closing or latest balance. Dates as YYYY-MM-DD; Malaysian, Singaporean and Australian documents use day-first dates.
If it shows investment positions or balances (broker, exchange, wallet app), set kind "holdings": one row per position with market value in the row's currency, cost basis when shown, and cash as cls "cash".
Use only figures that appear in the document. Skip opening-balance, total and subtotal lines. Leave the other array empty.
Put anything unreadable or uncertain in notes, in one or two sentences.`;

export function aiAvailable(env) {
  return Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
}

/**
 * @param files [{ name, type, data: Buffer }]  PDF or images
 */
export async function readDocuments(account, files, { env, client } = {}) {
  if (!client && !aiAvailable(env)) throw new Error('Reading PDFs and screenshots needs ANTHROPIC_API_KEY in .env.');
  const anthropic = client || new Anthropic();
  const content = [];
  for (const f of files) {
    const data = f.data.toString('base64');
    if (f.type === 'application/pdf') content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } });
    else if (/^image\/(png|jpeg|gif|webp)$/.test(f.type)) content.push({ type: 'image', source: { type: 'base64', media_type: f.type, data } });
    else throw new Error(`Can't read ${f.name}: use a PDF, PNG or JPEG.`);
  }
  content.push({ type: 'text', text: PROMPT(account) });

  const message = await anthropic.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content }],
  }).finalMessage();

  if (message.stop_reason === 'refusal') throw new Error('Claude declined to read this document.');
  if (message.stop_reason === 'max_tokens') throw new Error('The document is too long to read in one go. Split it into fewer pages.');
  const text = message.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const out = JSON.parse(text);
  return out;
}
