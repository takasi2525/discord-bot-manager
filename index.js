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
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
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

async function getNextOverallNumber(spreadsheetId, overallSheet) {
  const range = `${overallSheet}!F6:F1000`;
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
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup-button') {
    await interaction.reply({
      content: '✨ **新しい案件スレッドを作成したい方はこちら！** ✨',
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('open_thread_modal').setLabel('🆕 スレッド作成').setStyle(1)
        )
      ]
    });
  }

  if (interaction.isButton() && interaction.customId === 'open_thread_modal') {
    const modal = new ModalBuilder()
      .setCustomId('create_thread_modal')
      .setTitle('スレッド作成')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('title').setLabel('動画タイトル').setStyle(TextInputStyle.Short)
        )
      );
    await interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === 'create_thread_modal') {
    await interaction.deferReply({ ephemeral: true });
    const title = interaction.fields.getTextInputValue('title');
    const { type, config, category } = getCategoryAndType(interaction.channelId) || {};
    if (!type) return await interaction.editReply('❌ チャンネルが未対応です');

    const spreadsheetId = config.spreadsheetId;
    const sheetName = config.sheetNames[type];
    const overallSheet = config.sheetNames.overall;
    const numCol = type === 'short' ? 'E' : 'F';
    const titleCol = type === 'short' ? 'F' : 'G';

    const row = await getNextAvailableRow(spreadsheetId, sheetName, numCol);
    const num = await getNextSheetNumber(spreadsheetId, sheetName, numCol);
    const threadName = `#${num}_${title}`;

    const thread = await interaction.channel.threads.create({
      name: threadName,
      autoArchiveDuration: 10080,
      reason: '新規スレッド作成'
    });
    await thread.send(threadName);

    // ショート/長尺に書き込み
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

    // 全体シート（martinのみ）
    let overallRow = null;
    if (config.hasOverallSheet) {
      overallRow = await getNextAvailableRow(spreadsheetId, overallSheet, 'F');
      const overallNumber = await getNextOverallNumber(spreadsheetId, overallSheet);
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${overallSheet}!F${overallRow}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[`#${overallNumber}`]] }
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${overallSheet}!G${overallRow}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[title]] }
      });
    }

    await interaction.editReply(`✅ スレッド ${threadName} を作成しました！`);

    // 選択メニュー送信
    const dateMenu = new StringSelectMenuBuilder()
      .setCustomId(`select_date|${spreadsheetId}|${sheetName}|${overallSheet}|${type}|${row}|${overallRow}`)
      .setPlaceholder('初稿提出日を選んでください')
      .addOptions(
        { label: '今日', value: 'today' },
        { label: '明日', value: 'tomorrow' },
        { label: '明後日', value: 'dayAfterTomorrow' },
        { label: '来週', value: 'nextWeek' },
        { label: '入力しない', value: 'none' }
      );

    const editorOptions = await getEditorOptions(spreadsheetId, sheetName, type === 'short' ? 'H' : 'I');
    const editorMenu = new StringSelectMenuBuilder()
      .setCustomId(`select_editor|${spreadsheetId}|${sheetName}|${overallSheet}|${type}|${row}|${overallRow}`)
      .setPlaceholder('担当者を選んでください')
      .addOptions(editorOptions);

    const thumbOptions = await getEditorOptions(spreadsheetId, sheetName, 'K');
    const thumbMenu = new StringSelectMenuBuilder()
      .setCustomId(`select_thumb|${spreadsheetId}|${sheetName}|${overallSheet}|${type}|${row}|${overallRow}`)
      .setPlaceholder('サムネイル担当を選んでください')
      .addOptions(thumbOptions);

    await thread.send({
      content: '📅 初稿提出日を選択してください：',
      components: [new ActionRowBuilder().addComponents(dateMenu)]
    });

    await thread.send({
      content: '👤 担当者を選んでください：',
      components: [new ActionRowBuilder().addComponents(editorMenu)]
    });

    if (type !== 'short') {
      await thread.send({
        content: '🖼 サムネイル担当者を選んでください：',
        components: [new ActionRowBuilder().addComponents(thumbMenu)]
      });
    }
  }

  if (interaction.isStringSelectMenu()) {
    const [prefix, spreadsheetId, sheetName, overallSheet, type, row, overallRow] = interaction.customId.split('|');
    const selected = interaction.values[0];
    const config = Object.values(CATEGORY_CONFIG).find(cfg => cfg.spreadsheetId === spreadsheetId);

    if (prefix === 'select_date') {
      if (selected === 'none') {
        await interaction.reply({ content: '✅ 入力をスキップしました。', ephemeral: true });
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

      await interaction.reply({ content: `📅 初稿提出日を ${date} に設定しました。`, ephemeral: true });
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

      await interaction.reply({ content: `🎬 担当者を「${selected}」に設定しました。`, ephemeral: true });
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

      await interaction.reply({ content: `🖼 サムネイル担当を「${selected}」に設定しました。`, ephemeral: true });
    }
  }
});

client.login(TOKEN);
