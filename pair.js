// ==================== PAIR.JS (JAMALI MD - FIXED NOTIFICATION) ====================
const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const moment = require('moment-timezone');
const { default: makeWASocket, useMultiFileAuthState, delay, getContentType, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser, downloadContentFromMessage, DisconnectReason } = require('baileys');
const axios = require('axios');
const { MongoClient } = require('mongodb');

// ---------- CONFIG ----------
const BOT_NAME = '𝗝𝗔𝗠𝗔𝗟𝗜 𝗠𝗗';
const OWNER_NUMBER = '255784062158';
const CHANNEL_LINK = 'https://whatsapp.com/channel/0029VbC7AgJK5cD71vGIpO3h';
const LOGO_URL = 'https://files.catbox.moe/xney4v.jpg';
const GROUP_LINK = 'https://chat.whatsapp.com/IS276Wg9zcuCnJRiMDI64g';
const NEWSLETTER_JID = '120363425061263455@newsletter';
const PREFIX = '.';

// Mongo (same as before, keep your existing functions)
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://malvintech11_db_user:0SBgxRy7WsQZ1KTq@cluster0.xqgaovj.mongodb.net/?appName=Cluster0';
const MONGO_DB = 'Free_Mini';
let mongoClient, mongoDB, sessionsCol, numbersCol;

async function initMongo() { /* keep your existing init function */ }
async function saveCredsToMongo(number, creds, keys) { /* keep */ }
async function loadCredsFromMongo(number) { /* keep */ }
async function removeSessionFromMongo(number) { /* keep */ }
async function addNumberToMongo(number) { /* keep */ }
async function removeNumberFromMongo(number) { /* keep */ }
async function getAllNumbersFromMongo() { /* keep */ }

// ---------- HELPER ----------
function getTimestamp() { return moment().tz('Africa/Maputo').format('YYYY-MM-DD HH:mm:ss'); }

const activeSockets = new Map();
const socketCreationTime = new Map();

// ---------- EMPIRE PAIR (FIXED NOTIFICATION) ----------
async function EmpirePair(number, res) {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const sessionPath = path.join(os.tmpdir(), `session_${sanitizedNumber}`);
  await initMongo().catch(()=>{});
  
  // Restore from Mongo if exists
  try {
    const mongoDoc = await loadCredsFromMongo(sanitizedNumber);
    if (mongoDoc && mongoDoc.creds) {
      fs.ensureDirSync(sessionPath);
      fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(mongoDoc.creds, null, 2));
      if (mongoDoc.keys) fs.writeFileSync(path.join(sessionPath, 'keys.json'), JSON.stringify(mongoDoc.keys, null, 2));
    }
  } catch(e) {}

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const logger = pino({ level: 'fatal' });
  
  const socket = makeWASocket({
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    printQRInTerminal: false,
    logger,
    browser: Browsers.macOS('Safari')
  });

  socketCreationTime.set(sanitizedNumber, Date.now());
  
  // Pairing code generation
  if (!socket.authState.creds.registered) {
    let code;
    let retries = 3;
    while (retries > 0) {
      try {
        await delay(1500);
        code = await socket.requestPairingCode(sanitizedNumber);
        break;
      } catch (error) { retries--; await delay(2000); }
    }
    if (res && !res.headersSent) res.send({ code });
  }

  // Save creds to Mongo
  socket.ev.on('creds.update', async () => {
    await saveCreds();
    const credsObj = JSON.parse(await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8'));
    await saveCredsToMongo(sanitizedNumber, credsObj, state.keys);
  });

  // ---------- CONNECTION UPDATE (FIXED NOTIFICATION) ----------
  socket.ev.on('connection.update', async (update) => {
    const { connection } = update;
    if (connection === 'open') {
      try {
        await delay(2000);
        const userJid = jidNormalizedUser(socket.user.id);
        
        // Send confirmation message with logo
        const caption = `*✅ DEVICE LINKED SUCCESSFULLY!*\n\n` +
                        `*🤖 Bot:* ${BOT_NAME}\n` +
                        `*📱 Your Number:* ${sanitizedNumber}\n` +
                        `*🕒 Time:* ${getTimestamp()}\n\n` +
                        `*📌 Use ${PREFIX}menu to see all commands*\n` +
                        `*📢 Channel:* ${CHANNEL_LINK}\n\n` +
                        `> Developed by JAMALI TECH`;
        
        await socket.sendMessage(userJid, { image: { url: LOGO_URL }, caption });
        
        // Also try to join group (if configured)
        try {
          const inviteCode = GROUP_LINK.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/)?.[1];
          if (inviteCode) await socket.groupAcceptInvite(inviteCode);
        } catch(e) {}
        
        await addNumberToMongo(sanitizedNumber);
        activeSockets.set(sanitizedNumber, socket);
        
        console.log(`✅ ${sanitizedNumber} connected and notified.`);
      } catch (err) {
        console.error('Connection open error:', err);
        // Fallback text message
        try {
          const userJid = jidNormalizedUser(socket.user.id);
          await socket.sendMessage(userJid, { text: `✅ Connected! Bot is active. Use ${PREFIX}menu` });
        } catch(e) {}
      }
    }
    
    if (connection === 'close') {
      try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch(e){}
    }
  });

  // Handle status view/like (optional, keep your existing handlers)
  socket.ev.on('messages.upsert', async ({ messages }) => {
    // keep minimal to avoid breaking, but you can add your status handlers
  });
  
  activeSockets.set(sanitizedNumber, socket);
}

// ---------- EXPRESS ROUTES ----------
router.get('/', async (req, res) => {
  const { number } = req.query;
  if (!number) return res.status(400).json({ error: 'Number required' });
  const clean = number.replace(/[^0-9]/g, '');
  if (activeSockets.has(clean)) return res.json({ status: 'already_connected' });
  await EmpirePair(clean, res);
});

router.get('/active', (req, res) => {
  res.json({ count: activeSockets.size, numbers: Array.from(activeSockets.keys()) });
});

// Auto-reconnect all numbers from DB on startup
(async () => {
  await initMongo();
  const numbers = await getAllNumbersFromMongo();
  for (const num of numbers) {
    if (!activeSockets.has(num)) {
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      await EmpirePair(num, mockRes);
      await delay(1000);
    }
  }
})();

module.exports = router;
