import QRCode from 'qrcode';
import config from '../site-config.json';
import { tableText } from './domain.js';
const dateText = new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(config.startsAt));
const timeText = new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(config.startsAt));

export async function saveGuestPass(g, url, demo = false) {
    const canvas = document.createElement('canvas');
    canvas.width = 900; canvas.height = 1150;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 900, 1150);
    ctx.fillStyle = '#171717'; ctx.fillRect(0, 0, 900, 170);
    ctx.textAlign = 'center'; ctx.fillStyle = '#dfc77e'; ctx.font = '54px Georgia'; ctx.fillText('KADIWA FORMAL', 450, 92);
    ctx.font = '24px Arial'; ctx.fillStyle = '#fff'; ctx.fillText(config.district, 450, 136);
    ctx.fillStyle = '#171717';
    let size = 44; while (size > 14) { ctx.font = `${size}px Arial`; if (ctx.measureText(g.name).width < 800) break; size--; }
    ctx.fillText(g.name, 450, 258);
    ctx.font = '26px Arial'; ctx.fillStyle = '#555'; ctx.fillText(g.role, 450, 306);
    ctx.font = '52px Georgia'; ctx.fillStyle = '#8c6c21'; ctx.fillText(tableText(g.table), 450, 384);
    const image = new Image(); image.src = await QRCode.toDataURL(url, { width: 520, margin: 4, errorCorrectionLevel: 'M' });
    await image.decode(); ctx.drawImage(image, 190, 425, 520, 520);
    ctx.fillStyle = '#171717'; ctx.font = '27px Arial'; ctx.fillText(`${dateText} · ${timeText}`, 450, 1006);
    ctx.font = '27px Georgia'; ctx.fillText(config.venue, 450, 1050);
    if (demo) { ctx.font = '20px Arial'; ctx.fillStyle = '#777'; ctx.fillText('PREVIEW — SAMPLE PASS', 450, 1100); }
    const link = document.createElement('a'); link.href = canvas.toDataURL('image/png'); link.download = `kadiwa-pass-${g.name.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 70)}.png`; link.click();
}
