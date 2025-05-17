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
  keyFile: 'credentials.json',
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
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup-button') {
    await interaction.deferReply({ flags: 64 });

    const button = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('open_thread_modal')
        .setLabel('🆕 スレッドを新規作成する')
        .setStyle(1)
    );

    await interaction.channel.send({
      content: '✨ **新しい案件スレッドを作成したい方はこちら！** ✨',
      components: [button]
    });

    await interaction.editReply({ content: '✅ ボタンを設置しました！' });
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
    await interaction.deferReply({ flags: 64 });
    const title = interaction.fields.getTextInputValue('title');
    const { type, config } = getCategoryAndType(interaction.channelId) || {};
    if (!type) return await interaction.editReply('❌ チャンネルが未対応です');
    const spreadsheetId = config.spreadsheetId;
    const sheetName = config.sheetNames[type];
    const overallSheet = config.sheetNames.overall;
    const numCol = type === 'short' ? 'E' : 'F';
    const titleCol = type === 'short' ? 'F' : 'G';

    const row = await getNextAvailableRow(spreadsheetId, sheetName, numCol);
    const num = await getNextSheetNumber(spreadsheetId, sheetName, numCol);
    const overallRow = await getNextAvailableRow(spreadsheetId, overallSheet, 'F');
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

    await interaction.editReply(`✅ スレッド ${threadName} を作成しました！`);
  }

  if (interaction.isChatInputCommand() && interaction.commandName === '動画ステータス') {
    const status = interaction.options.getString('状態');
    const title = interaction.channel.name;
    const { type, config } = getCategoryAndType(interaction.channelId) || {};
    if (!type) return await interaction.reply({ content: '❌ チャンネルが未対応です', flags: 64 });
    const spreadsheetId = config.spreadsheetId;
    const sheetName = config.sheetNames[type];
    const overallSheet = config.sheetNames.overall;
    const rangeCol = status === '初稿' ? 'A' : status === '修正' ? 'B' : status === '納品' ? 'C' : status === '投稿' ? 'E' : null;
    const titleCol = type === 'short' ? 'F' : 'G';

    if (!rangeCol) return await interaction.reply({ content: '❌ 状態が不正です', flags: 64 });

    const range = `${sheetName}!${titleCol}6:${titleCol}1000`;
    const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const rows = response.data.values || [];
    let foundRow = null;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] && title.includes(rows[i][0])) {
        foundRow = 6 + i;
        break;
      }
    }
    if (!foundRow) return await interaction.reply({ content: '❌ スレッドに対応する行が見つかりません', flags: 64 });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!${rangeCol}${foundRow}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [['TRUE']] }
    });
    if (config.hasOverallSheet) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${overallSheet}!${rangeCol}${foundRow}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [['TRUE']] }
      });
    }

    await interaction.reply({ content: `✅ ステータス「${status}」を TRUE に設定しました`, flags: 64 });
  }
});

client.login(TOKEN);
