import type { BlockReason, ControlKind } from '../types/fields';
import { containsSequence } from './text-normalizer';

/**
 * Fields One-Fill must never fill, regardless of how well they match: passwords, one-time codes,
 * captchas, payment/bank details, search boxes and consent/marketing checkboxes.
 * Rules are token sequences over normalised label text.
 */

const RULES: Array<{ reason: BlockReason; patterns: string[][]; kinds?: ControlKind[] }> = [
  { reason: 'password', patterns: [['password'], ['passwd'], ['pwd'], ['passphrase'], ['secret'], ['security', 'answer'], ['security', 'question']] },
  {
    reason: 'otp',
    patterns: [['otp'], ['verification', 'code'], ['security', 'code'], ['auth', 'code'], ['authentication', 'code'], ['passcode'], ['2fa'], ['mfa'], ['totp']],
  },
  { reason: 'captcha', patterns: [['captcha'], ['recaptcha'], ['hcaptcha'], ['security', 'check'], ['human', 'verification'], ['characters', 'image']] },
  {
    reason: 'payment',
    patterns: [
      ['card', 'number'], ['credit', 'card'], ['debit', 'card'], ['cvv'], ['cvc'], ['cvv2'], ['card', 'expiry'], ['card', 'holder'],
      ['cardholder'], ['name', 'card'], ['expiry', 'month'], ['expiry', 'year'], ['iban'], ['ifsc'], ['swift'], ['bic'],
      ['routing', 'number'], ['account', 'number'], ['bank', 'account'], ['bank'], ['upi'], ['vpa'], ['ssn'],
      ['social', 'security'], ['sort', 'code'], ['atm'], ['micr'], ['tax', 'id'], ['tin'],
    ],
  },
  { reason: 'search', patterns: [['search'], ['query'], ['keyword'], ['keywords']] },
  {
    reason: 'consent',
    kinds: ['checkbox', 'radio-group'],
    patterns: [
      ['agree'], ['accept'], ['terms'], ['conditions'], ['consent'], ['privacy'], ['policy'], ['subscribe'], ['newsletter'],
      ['marketing'], ['declare'], ['declaration'], ['certify'], ['acknowledge'], ['authorize'], ['authorise'], ['remember'],
      ['updates'], ['notifications'], ['promotional'], ['offers'], ['opt'], ['keep', 'signed'], ['undertake'], ['truthful'],
      ['correct', 'best', 'knowledge'], ['whatsapp', 'updates'], ['sms', 'alerts'],
    ],
  },
];

/** Phrases that contain a blocked pattern but are legitimate profile fields. */
const EXCEPTIONS: string[][] = [
  ['permanent', 'account', 'number'], // PAN
  ['pan', 'card', 'number'],
  ['aadhaar', 'card', 'number'],
  ['voter', 'card'],
  ['board', 'roll'],
];

export function detectBlockReason(tokens: readonly string[], kind: ControlKind, inputType: string, extra: { name: string }): BlockReason | null {
  if (inputType === 'password') return 'password';
  if (inputType === 'search') return 'search';
  if (kind === 'checkbox' && tokens.length === 0) return 'consent';
  if (/^(q|s|query|search|keywords?)$/i.test(extra.name)) return 'search';

  const safeTokens = stripExceptions(tokens);
  for (const rule of RULES) {
    if (rule.kinds && !rule.kinds.includes(kind)) continue;
    if (rule.patterns.some((p) => containsSequence(safeTokens, p))) return rule.reason;
  }
  return null;
}

function stripExceptions(tokens: readonly string[]): string[] {
  let result = [...tokens];
  for (const exception of EXCEPTIONS) {
    for (let i = 0; i <= result.length - exception.length; i++) {
      if (exception.every((t, j) => result[i + j] === t)) {
        result = [...result.slice(0, i), 'exception', ...result.slice(i + exception.length)];
      }
    }
  }
  return result;
}
