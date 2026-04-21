// POST /api/contact — lead intake for O'Neal Electric.
// Sends via Google Workspace SMTP (smtp.gmail.com) using an App Password.
//
// Env vars (set on Vercel → Project → Settings → Environment Variables):
//   GMAIL_USER          — Workspace address that sends the email
//                         (e.g. leads@onealelectriccompany.com or dan@...)
//   GMAIL_APP_PASSWORD  — 16-char App Password from
//                         https://myaccount.google.com/apppasswords
//                         (requires 2-Step Verification on the Google account)
//   CONTACT_TO_EMAIL    — inbox that receives leads (can equal GMAIL_USER)
//
// Until those are set, the endpoint returns {ok:false,error:"not_configured"}.
//
// Setup notes for the client:
//   1. Enable 2-Step Verification on the Workspace account.
//   2. Generate an App Password named "O'Neal Website" — copy the 16-char string.
//   3. Paste values into Vercel env vars (Production + Preview), redeploy.
//   4. Send a test from the live form and confirm the inbox.

import nodemailer from 'nodemailer';

export const config = { runtime: 'nodejs' };

const escape = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    const body =
      typeof req.body === 'string'
        ? JSON.parse(req.body || '{}')
        : (req.body || {});

    const {
      name = '',
      email = '',
      phone = '',
      projectType = '',
      message = '',
      website = '', // honeypot — real users leave this empty
    } = body;

    if (String(website).trim()) {
      // Honeypot tripped; pretend success so the bot moves on.
      return res.status(200).json({ ok: true });
    }

    const trim = (s) => String(s).trim();
    const n = trim(name);
    const e = trim(email);

    if (!n || !e) {
      return res.status(400).json({ ok: false, error: 'missing_required' });
    }
    if (n.length > 120 || e.length > 200 || String(message).length > 5000) {
      return res.status(400).json({ ok: false, error: 'too_long' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      return res.status(400).json({ ok: false, error: 'bad_email' });
    }

    const GMAIL_USER = process.env.GMAIL_USER;
    const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
    const CONTACT_TO = process.env.CONTACT_TO_EMAIL || GMAIL_USER;

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !CONTACT_TO) {
      return res.status(503).json({
        ok: false,
        error: 'not_configured',
        hint:
          'Set GMAIL_USER, GMAIL_APP_PASSWORD, and CONTACT_TO_EMAIL on Vercel, then redeploy.',
      });
    }

    const transport = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });

    const subject = `New Bid Request — ${projectType || 'General'} — ${n}`;
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;color:#070730">
        <h2 style="color:#070730;border-bottom:2px solid #B91806;padding-bottom:6px;margin:0 0 14px">
          New Bid Request
        </h2>
        <table style="line-height:1.6;border-collapse:collapse">
          <tr><td style="padding:4px 16px 4px 0;color:#666"><strong>Name</strong></td><td>${escape(n)}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;color:#666"><strong>Email</strong></td><td><a href="mailto:${escape(e)}" style="color:#B91806">${escape(e)}</a></td></tr>
          <tr><td style="padding:4px 16px 4px 0;color:#666"><strong>Phone</strong></td><td>${escape(phone) || '—'}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;color:#666"><strong>Project</strong></td><td>${escape(projectType) || '—'}</td></tr>
        </table>
        <h3 style="margin:20px 0 6px;color:#070730">Message</h3>
        <p style="white-space:pre-wrap;background:#F1ECE3;padding:12px 14px;border-left:3px solid #B91806;margin:0">
          ${escape(message) || '—'}
        </p>
        <hr style="border:0;border-top:1px solid #ddd;margin:20px 0"/>
        <p style="color:#888;font-size:12px;margin:0">
          Submitted via the O'Neal Electric Company website · reply directly to contact the requester.
        </p>
      </div>
    `;

    const text = [
      'New bid request',
      '',
      `Name:    ${n}`,
      `Email:   ${e}`,
      `Phone:   ${phone || '—'}`,
      `Project: ${projectType || '—'}`,
      '',
      'Message:',
      message || '—',
      '',
      '— reply directly to contact the requester',
    ].join('\n');

    await transport.sendMail({
      from: `"O'Neal Electric Website" <${GMAIL_USER}>`,
      to: CONTACT_TO,
      replyTo: `"${n}" <${e}>`,
      subject,
      html,
      text,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('contact handler error', err);
    const code =
      err && err.code === 'EAUTH' ? 'auth_failed' : 'server_error';
    return res.status(500).json({ ok: false, error: code });
  }
}
