// Optional SMS delivery for report receipts. Contact verification does not use SMS.
import { config } from '../env.js';

async function sendTwilio(phone, body) {
  const { sid, token, from } = config.twilio;
  if (!sid || !token || !from) throw new Error('Twilio keys missing in .env');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: `+91${phone}`, From: from, Body: body }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Twilio error ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function sendFast2Sms(phone, body) {
  if (!config.fast2smsKey) throw new Error('FAST2SMS_API_KEY missing in .env');
  const payload = { route: 'q', message: body, numbers: phone, flash: 0 };
  const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    headers: { authorization: config.fast2smsKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.return === false) throw new Error(`Fast2SMS error: ${JSON.stringify(data).slice(0, 200)}`);
}

/** Send an SMS. Returns { provider, delivery: 'demo' | 'sent' | 'failed', error? } */
export async function sendSms(phone, body) {
  const mode = config.smsMode;
  try {
    if (mode === 'twilio') {
      await sendTwilio(phone, body);
      return { provider: 'twilio', delivery: 'sent' };
    }
    if (mode === 'fast2sms') {
      await sendFast2Sms(phone, body);
      return { provider: 'fast2sms', delivery: 'sent' };
    }
  } catch (err) {
    console.error(`  ! SMS to ${phone.slice(0, 2)}******${phone.slice(-2)} failed: ${err.message}`);
    return { provider: mode, delivery: 'failed', error: err.message };
  }
  console.log(`  [demo SMS] to ${phone.slice(0, 2)}******${phone.slice(-2)}: ${body}`);
  return { provider: 'demo', delivery: 'demo' };
}
