require('dotenv').config();
const { Client, GatewayIntentBits, Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { google } = require('googleapis');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const TOKEN = process.env.TOKEN;

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
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
  },
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
  ]
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

async function getEditorOptions(spreadsheetId, sheetName, column) {
  const range = `${sheetName}!${column}6:${column}1000`;
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = response.data.values || [];
  const names = [...new Set(rows.flat().filter(name => !!name))];
  return names.slice(0, 25).map(name => new StringSelectMenuOptionBuilder().setLabel(name).setValue(name));
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

client.once(Events.ClientReady, () => {
  console.log(`✅ ログイン成功：${client.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isModalSubmit() && interaction.customId === 'create_thread_modal') {
    try {
      const title = interaction.fields.getTextInputValue('title');
      const { type, config } = getCategoryAndType(interaction.channelId) || {};
      if (!type) return await interaction.reply({ content: '❌ チャンネルが未対応です', flags: 64 });

      const spreadsheetId = config.spreadsheetId;
      const sheetName = config.sheetNames[type];
      const overallSheet = config.sheetNames.overall;
      const numCol = type === 'short' ? 'E' : 'F';
      const titleCol = type === 'short' ? 'F' : 'G';

      const row = await getNextAvailableRow(spreadsheetId, sheetName, numCol);
      const num = await getNextSheetNumber(spreadsheetId, sheetName, numCol);
      const overallRow = config.hasOverallSheet ? await getNextAvailableRow(spreadsheetId, overallSheet, 'F') : null;
      const threadName = `#${num}_${title}`;

      const thread = await interaction.channel.threads.create({
        name: threadName,
        autoArchiveDuration: 10080,
        reason: '新規スレッド作成'
      });
      await thread.send(threadName);

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!${numCol}${row}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[`#${num}`]] }
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!${titleCol}${row}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[title]] }
      });

      if (config.hasOverallSheet) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${overallSheet}!F${overallRow}`,
          valueInputOption: 'USER_ENTERED',
          resource: { values: [[`#${num}`]] }
        });
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${overallSheet}!G${overallRow}`,
          valueInputOption: 'USER_ENTERED',
          resource: { values: [[title]] }
        });
      }

      const editorOptions = await getEditorOptions(spreadsheetId, sheetName, type === 'short' ? 'H' : 'I');
      const thumbOptions = type === 'short' ? [] : await getEditorOptions(spreadsheetId, sheetName, 'K');

      const selectMenus = [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`select_date|${spreadsheetId}|${sheetName}|${overallSheet}|${type}|${row}|${overallRow}`)
            .setPlaceholder('📅 初稿提出日を選んでください')
            .addOptions([
              { label: '今日', value: 'today' },
              { label: '明日', value: 'tomorrow' },
              { label: '明後日', value: 'dayAfterTomorrow' },
              { label: '来週', value: 'nextWeek' },
              { label: '入力しない（スキップ）', value: 'none' }
            ])
        ),
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`select_editor|${spreadsheetId}|${sheetName}|${overallSheet}|${type}|${row}|${overallRow}`)
            .setPlaceholder('👤 担当者を選んでください')
            .addOptions(editorOptions)
        )
      ];

      if (thumbOptions.length > 0) {
        selectMenus.push(
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`select_thumb|${spreadsheetId}|${sheetName}|${overallSheet}|${type}|${row}|${overallRow}`)
              .setPlaceholder('🖼 サムネイル担当を選んでください')
              .addOptions(thumbOptions)
          )
        );
      }

      await thread.send({
        content: '📅 初稿提出日を選択してください：\n👤 担当者を選んでください：' + (thumbOptions.length > 0 ? '\n🖼 サムネイル担当者を選んでください：' : ''),
        components: selectMenus
      });

      await interaction.reply({ content: `✅ スレッド ${threadName} を作成しました！`, flags: 64 });
    } catch (error) {
      console.error('❌ モーダル処理エラー:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ スレッド作成中にエラーが発生しました。', flags: 64 });
      }
    }
  }
});

client.login(TOKEN);
