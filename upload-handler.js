// 第1部：基本セットアップ＆Google Sheets連携
require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const mime = require('mime-types');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const TOKEN = process.env.TOKEN;
const GIGAFILE_PATTERN = /https?:\/\/(\d+\.)?gigafile\.nu\/[\w\-]+/i;

const DRIVE_CONFIG = {
  martin: {
    short: '1uUzlXdg-ObN8o8SMXVtAS4CD8R802TIq',
    long: '1cKwNHwp7HXC17YrJdDr_kxSFAfRdw8xO'
  },
  neuroscience: {
    short: '1N3A6gJPD7upa-9ZQg2pIpEUUCU1Utixr',
    long: '11eYQCI3oD3N4B_dItPPUsE9D7_sCJ-Cx'
  },
  yokohama: {
    short: null,
    long: '1blymelW87jacRVA-xdwW124KJ4MzMs4h'
  }
};

const auth = new google.auth.GoogleAuth({
  keyFile: 'credentials.json',
  scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets']
});

const drive = google.drive({ version: 'v3', auth });
const sheets = google.sheets({ version: 'v4', auth });

async function getPostDateFromSheets(sheetId, sheetName, threadNumber) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${sheetName}!A2:C1000`
    });
    const rows = response.data.values;
    if (!rows) return null;
    for (const row of rows) {
      if (row[0] === threadNumber) return row[2];
    }
    return null;
  } catch (err) {
    console.error('❌ Sheets取得失敗:', err);
    return null;
  }
}

async function findOrCreateYearFolder(parentId, year) {
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name='${year}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
  });
  if (res.data.files.length > 0) return res.data.files[0].id;

  const folder = await drive.files.create({
    resource: {
      name: year,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });
  return folder.data.id;
}

async function downloadAndUpload(url, folderId, filename) {
  const res = await axios.get(url, { responseType: 'stream' });
  const mimeType = mime.lookup(filename) || 'application/octet-stream';
  const fileMetadata = { name: filename, parents: [folderId] };
  const media = { mimeType, body: res.data };
  const upload = await drive.files.create({ resource: fileMetadata, media, fields: 'id' });
  return upload.data.id;
}

client.on(Events.MessageCreate, async (message) => {
  console.log('📩 メッセージ受信:', message.content);
  if (message.author.bot) return;

  const urlMatch = message.content.match(GIGAFILE_PATTERN);
  if (!urlMatch) return;

  console.log('🔗 ギガファイルURL検出:', urlMatch[0]);
  await message.reply('📥 ダウンロード中...');

  const thread = message.channel;
  const threadName = thread.name;
  const threadNum = threadName.match(/^#\d{2,}/)?.[0];
  if (!threadNum) return;

  const parentId = thread.parentId;
  const categoryKey = Object.keys(DRIVE_CONFIG).find(key => {
    const config = DRIVE_CONFIG[key];
    return config.short === parentId || config.long === parentId;
  });
  if (!categoryKey) return;

  const type = DRIVE_CONFIG[categoryKey].short === parentId ? 'short' : 'long';
  const folderRoot = DRIVE_CONFIG[categoryKey][type];
  if (!folderRoot) return;

  const sheetName = type;
  const sheetId = categoryKey === 'martin' ? '12ZPp01vBjo2vlz56AD0au7m-_sNWNC-stuRxdiX3FxY'
    : categoryKey === 'neuroscience' ? '1UqzN_hqA8WDpmJX8OMNXnWE080oYdZnLPGVko86VPTo'
    : '1KptzCfqhFIeVtKZRKMKBUIbWzI5uXCvJpMEaUARcKPU';

  const postDate = await getPostDateFromSheets(sheetId, sheetName, threadNum);
  const year = postDate ? new Date(postDate).getFullYear().toString() : new Date().getFullYear().toString();
  const yearFolderId = await findOrCreateYearFolder(folderRoot, year);

  const folderRes = await drive.files.create({
    resource: {
      name: threadName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [yearFolderId],
    },
    fields: 'id',
  });
  const finalFolderId = folderRes.data.id;

  await message.reply('📤 アップロード中...');
  const fileId = await downloadAndUpload(urlMatch[0], finalFolderId, 'video_data.zip');

  message.reply(`✅ ファイルをアップロードしました（Drive ID: ${fileId}）`);
});

client.once('ready', () => {
  console.log(`✅ アップロードBOT 起動完了：${client.user.tag}`);
});

client.login(TOKEN);
