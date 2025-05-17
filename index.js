// ✅ 最新の index.js
require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder
} = require('discord.js');
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
      if (id === channelId) return { category, type, config };
    }
  }
  return null;
}

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
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

async function getNextAvailableRow(spreadsheetId, sheetName, column) {
  const range = `${sheetName}!${column}6:${column}1000`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = res.data.values || [];
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i][0]) return 6 + i;
  }
  return 6 + rows.length;
}

async function getNextOverallNumber(spreadsheetId, overallSheet, column = 'F') {
  const range = `${overallSheet}!${column}6:${column}1000`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = res.data.values || [];
  let max = 0;
  for (const row of rows) {
    const val = row[0];
    if (val && /^#\d+/.test(val)) {
      const num = parseInt(val.slice(1));
      if (!isNaN(num) && num > max) max = num;
    }
  }
  return max + 1;
}

client.once(Events.ClientReady, () => {
  console.log(`✅ ログイン成功：${client.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup-button') {
    const button = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('open_thread_modal').setLabel('🆕 スレッドを新規作成する').setStyle(1)
    );
    await interaction.reply({ content: '✨ 新しい案件スレッドを作成したい方はこちら！', components: [button], ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId === 'open_thread_modal') {
    const modal = new ModalBuilder()
      .setCustomId('create_thread_modal')
      .setTitle('スレッド作成')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('title')
            .setLabel('動画タイトル')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );
    await interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === 'create_thread_modal') {
    const title = interaction.fields.getTextInputValue('title');
    const { type, config } = getCategoryAndType(interaction.channelId) || {};
    if (!type) return await interaction.reply({ content: '❌ 未対応のチャンネルです', ephemeral: true });

    const spreadsheetId = config.spreadsheetId;
    const sheetName = config.sheetNames[type];
    const overallSheet = config.sheetNames.overall;
    const numCol = type === 'short' ? 'E' : 'F';
    const titleCol = type === 'short' ? 'F' : 'G';

    const row = await getNextAvailableRow(spreadsheetId, sheetName, numCol);
    const num = await getNextOverallNumber(spreadsheetId, sheetName, numCol);
    const overallRow = await getNextAvailableRow(spreadsheetId, overallSheet, 'F');
    const overallNum = config.hasOverallSheet
      ? await getNextOverallNumber(spreadsheetId, overallSheet, 'F')
      : null;

    const threadName = `#${num}_${title}`;
    const thread = await interaction.channel.threads.create({
      name: threadName,
      autoArchiveDuration: 10080,
      reason: 'スレッド自動作成'
    });

    await thread.send(`🧵 ${threadName}`);
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      resource: {
        data: [
          { range: `${sheetName}!${numCol}${row}`, values: [[`#${num}`]] },
          { range: `${sheetName}!${titleCol}${row}`, values: [[title]] }
        ],
        valueInputOption: 'USER_ENTERED'
      }
    });

    if (config.hasOverallSheet) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        resource: {
          data: [
            { range: `${overallSheet}!F${overallRow}`, values: [[`#${overallNum}`]] },
            { range: `${overallSheet}!G${overallRow}`, values: [[title]] }
          ],
          valueInputOption: 'USER_ENTERED'
        }
      });
    }

    await interaction.reply({ content: `✅ スレッド「${threadName}」を作成しました。`, ephemeral: true });
  }
});

client.login(TOKEN);
