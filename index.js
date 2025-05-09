require('dotenv').config();
const axios = require('axios');
const { Client, GatewayIntentBits, Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { google } = require('googleapis');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const TOKEN = process.env.TOKEN;
const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN;
const LINE_GROUP_ID = process.env.LINE_GROUP_ID;

const CATEGORY_CONFIG = {
  martin: {
    spreadsheetId: '1O0w6XW-YVawuqbbJE5lTcx3Mk5rsxH1FXDD88Zx8az0',
    sheetNames: { overall: '【全体】制作管理シート', short: 'ショート動画', long: '長尺動画' },
    channels: {
      short: '1364617144381210736',
      long: '1364617200039624806'
    },
    hasOverallSheet: true
  },
  neuroscience: {
    spreadsheetId: '1UqzN_hqA8WDpmJX8OMNXnWE080oYdZnLPGVko86VPTo',
    sheetNames: { overall: '【全体】制作管理シート', short: 'ショート動画', long: '長尺動画' },
    channels: {
      short: '1364617541829267587',
      long: '1364617674440577065'
    },
    hasOverallSheet: false
  },
  yokohama: {
    spreadsheetId: '1KptzCfqhFIeVtKZRKMKBUIbWzI5uXCvJpMEaUARcKPU',
    sheetNames: { overall: '【全体】制作管理シート', short: 'ショート動画', long: '長尺動画' },
    channels: {
      short: '1364621314081558569',
      long: '1364621198150996088'
    },
    hasOverallSheet: false
  }
};

function getCategoryAndType(channelId) {
  for (const [category, config] of Object.entries(CATEGORY_CONFIG)) {
    for (const [type, id] of Object.entries(config.channels)) {
      if (id === channelId) {
        return { category, type, config };
      }
    }
  }
  return null;
}

const auth = new google.auth.GoogleAuth({
  keyFile: 'credentials.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
});
const sheets = google.sheets({ version: 'v4', auth });

function formatDateFromOption(option) {
  const today = new Date();
  switch (option) {
    case 'today': return today.toISOString().split('T')[0];
    case 'tomorrow': today.setDate(today.getDate() + 1); break;
    case 'dayAfterTomorrow': today.setDate(today.getDate() + 2); break;
    case 'nextWeek': today.setDate(today.getDate() + 7); break;
    default: return '';
  }
  return today.toISOString().split('T')[0];
}

async function sendLineMessage(text) {
  try {
    await axios.post(
      'https://api.line.me/v2/bot/message/push',
      {
        to: LINE_GROUP_ID,
        messages: [{ type: 'text', text: text }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
        }
      }
    );
    console.log('✅ LINEメッセージ送信成功');
  } catch (error) {
    console.error('❌ LINEメッセージ送信エラー:', error.response?.data || error);
  }
}

async function getNextAvailableRow(spreadsheetId, sheetName, column) {
  const range = `${sheetName}!${column}6:${column}1000`;
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = response.data.values || [];
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i][0]) return 6 + i;
  }
  return 6 + rows.length;
}

async function getNextSheetNumber(spreadsheetId, sheetName, column) {
  const range = `${sheetName}!${column}6:${column}1000`;
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = response.data.values || [];
  let max = 0;
  for (let row of rows) {
    if (row[0] && row[0].startsWith('#')) {
      const num = parseInt(row[0].replace('#', ''));
      if (!isNaN(num) && num > max) max = num;
    }
  }
  return max + 1;
}

async function getEditorOptions(spreadsheetId, sheetName, column) {
  const range = `${sheetName}!${column}6:${column}1000`;
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = response.data.values || [];
  const names = [...new Set(rows.flat().filter(name => !!name))];
  return names.slice(0, 25).map(name => new StringSelectMenuOptionBuilder().setLabel(name).setValue(name));
}

client.once(Events.ClientReady, () => {
  console.log(`✅ ログイン成功：${client.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isStringSelectMenu()) {
    const [prefix, spreadsheetId, sheetName, overallSheet, type, row, overallRow] = interaction.customId.split('|');
    const selected = interaction.values[0];
    const config = Object.values(CATEGORY_CONFIG).find(cfg => cfg.spreadsheetId === spreadsheetId);

    if (prefix === 'select_date') {
      if (selected === 'none') {
        await interaction.reply({ content: '✅ 入力をスキップしました。', flags: 64 });
        return;
      }
      const date = formatDateFromOption(selected);
      const col = type === 'short' ? 'G' : 'H';

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!${col}${row}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[date]] }
      });

      if (config?.hasOverallSheet) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${overallSheet}!${col}${overallRow}`,
          valueInputOption: 'USER_ENTERED',
          resource: { values: [[date]] }
        });
      }

      await interaction.reply({ content: `📅 初稿提出日を ${date} に設定しました。`, flags: 64 });
    }

    if (prefix === 'select_editor') {
      const col = type === 'short' ? 'H' : 'I';

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!${col}${row}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[selected]] }
      });

      if (config?.hasOverallSheet) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${overallSheet}!${col}${overallRow}`,
          valueInputOption: 'USER_ENTERED',
          resource: { values: [[selected]] }
        });
      }

      await interaction.reply({ content: `🎬 担当者を「${selected}」に設定しました。`, flags: 64 });
    }

    if (prefix === 'select_thumb') {
      const col = 'K';

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!${col}${row}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[selected]] }
      });

      if (config?.hasOverallSheet) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${overallSheet}!${col}${overallRow}`,
          valueInputOption: 'USER_ENTERED',
          resource: { values: [[selected]] }
        });
      }

      await interaction.reply({ content: `🖼 サムネイル担当を「${selected}」に設定しました。`, flags: 64 });
    }
  }
});

client.login(TOKEN);
