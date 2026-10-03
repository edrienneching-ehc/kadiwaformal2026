import config from '../site-config.json';

const demoGuests = [
  { id: 'demo-1', name: 'Alex Santos', congregation: 'East', role: 'Attendee', table: 4, token: '1'.repeat(64), checkedInAt: null },
  { id: 'demo-2', name: 'Jamie Reyes', congregation: 'Midland', role: 'Attendee', table: 8, token: '2'.repeat(64), checkedInAt: '2026-10-04T08:45:00.000Z' },
  { id: 'demo-3', name: 'Sam Rivera', congregation: 'North', role: 'Performer', table: 0, token: '3'.repeat(64), checkedInAt: null },
  { id: 'demo-4', name: 'Taylor Cruz', congregation: 'West', role: 'District Officer', table: 0, token: '4'.repeat(64), checkedInAt: null },
  { id: 'demo-5', name: 'Casey Garcia', congregation: 'Northwest', role: 'Attendee', table: 15, token: '5'.repeat(64), checkedInAt: null },
  { id: 'demo-6', name: 'Jordan Lim', congregation: 'South', role: 'VIP', table: 1, token: '6'.repeat(64), checkedInAt: null }
];
const demo = new URLSearchParams(location.search).get('demo') === '1';
let bridge;
const pending = new Map();

export function isDemo() { return demo; }
export function isConfigured() { return Boolean(config.backendUrl); }

function connect() {
  if (bridge) return bridge;
  bridge = new Promise((resolve, reject) => {
    const nonce = crypto.randomUUID();
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.title = 'Guest pass connection';
    frame.referrerPolicy = 'no-referrer';
    const url = new URL(config.backendUrl);
    url.searchParams.set('bridge', nonce);
    frame.src = url.href;
    let source;
    let origin;
    const timeout = setTimeout(() => {
      if (source) return;
      window.removeEventListener('message', listener);
      frame.remove();
      bridge = null;
      reject(new Error('The guest list could not be reached. Please try again or approach the registration desk.'));
    }, 25000);
    const listener = event => {
      let trustedOrigin = false;
      try {
        const host = new URL(event.origin).hostname;
        trustedOrigin = event.origin.startsWith('https://') && (host === 'script.google.com' || host === 'script.googleusercontent.com' || host.endsWith('.googleusercontent.com'));
      } catch { return; }
      const message = event.data;
      if (!trustedOrigin || !message || message.bridge !== nonce || !event.source) return;
      if (message.type === 'kadiwa-ready' && !source) {
        source = event.source;
        origin = event.origin;
        clearTimeout(timeout);
        resolve({ send: data => source.postMessage({ ...data, bridge: nonce }, origin) });
      }
      if (event.source !== source || event.origin !== origin || message.type !== 'kadiwa-response') return;
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.ok) request.resolve(message.result);
      else request.reject(new Error(message.error || 'The request could not be completed.'));
    };
    window.addEventListener('message', listener);
    document.body.append(frame);
  });
  return bridge;
}

export async function call(method, args = {}) {
  if (demo) {
    await new Promise(resolve => setTimeout(resolve, 100));
    if (method === 'login') return { session: 'demo-session', name: args.name };
    if (method === 'logout') return true;
    if (method === 'list') return { guests: structuredClone(demoGuests) };
    if (method === 'guest' || method === 'checkIn') {
      const guest = demoGuests.find(g => g.token === args.token || g.id === args.id);
      if (!guest) throw new Error('Guest pass not found. Please approach the registration desk.');
      const alreadyCheckedIn = Boolean(guest.checkedInAt);
      if (method === 'checkIn' && !alreadyCheckedIn) guest.checkedInAt = new Date().toISOString();
      return { guest: structuredClone(guest), alreadyCheckedIn };
    }
    throw new Error('Unknown request.');
  }
  if (!config.backendUrl) throw new Error('Guest passes will be available soon. Please approach the registration desk for assistance.');
  const connection = await connect();
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(method === 'checkIn' ? 'The response timed out. Refresh the guest list to confirm attendance before trying again.' : 'The request timed out. Please try again.'));
    }, 30000);
    pending.set(id, { resolve, reject, timer });
    connection.send({ type: 'kadiwa-request', id, method, args });
  });
}
