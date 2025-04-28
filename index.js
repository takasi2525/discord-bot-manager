require('dotenv').config();

const axios = require('axios'); // LINE送信用
const { Client, GatewayIntentBits, Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder } = require('discord.js');
const { google } = require('googleapis');
const cron = require('node-cron');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const TOKEN = process.env.TOKEN;

// --- Google Sheets API設定
const auth = new google.auth.GoogleAuth({
  keyFile: 'credentials.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
});
const sheets = google.sheets({ version: 'v4', auth });

// --- LINE送信用設定
const LINE_ACCESS_TOKEN = 'h18nvKcJ5+xUCUZIZI4qjKkXCC91VKD4zdePmhWTgeAO+E/ajstOjp1pETQdlVNOCRcqhw/AMrsQXSchEIQ7o0YH7J7wCIL/Ns4qknWiEWtn04Ikhin2m7g2yuqMYTeg+6KcYDcZH8ny85Ug80bnbQdB04t89/1O/w1cDnyilFU='; // ←ここ！
const LINE_GROUP_ID = 'C2618eeda5e1c57abb89d62070049e1a4'; // ←グループID

async function sendLineMessage(text) {
  try {
    await axios.post(
      'https://api.line.me/v2/bot/message/push',
      {
        to: LINE_GROUP_ID,
        messages: [
          {
            type: 'text',
            text: text,
          },
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
        },
      }
    );
    console.log('✅ LINEメッセージ送信成功');
  } catch (error) {
    console.error('❌ LINEメッセージ送信エラー:', error.response?.data || error);
  }
}

const CHANNEL_CONFIG = {
  martin: {
    short: '1364617144381210736',
    long: '1364617200039624806',
    sheetId: '1O0w6XW-YVawuqbbJE5lTcx3Mk5rsxH1FXDD88Zx8az0',
    sheet: { short: '2025_production', long: '2025_production' }
  },
  neuroscience: {
    short: '1364617541829267587',
    long: '1364617674440577065',
    sheetId: '1I0WjPjYoHt1Z21gFuMcbn29b6z7dG9D7l2NcXzZCd5U',
    sheet: { short: '2025_neuroscience', long: '2025_neuroscience' }
  },
  yokohama: {
    short: '1364621198150996088',
    long: '1364621314081558569',
    sheetId: '1J9hDqJ8Fg2F7cGHV5chZoFTz8DrHjk3GhGiDqYj2DA',
    sheet: { short: '2025_yokohama', long: '2025_yokohama' }
  }
};

client.once(Events.ClientReady, () => {
  console.log(`✅ ログイン成功：${client.user.tag}`);

  cron.schedule('0 5 * * 1', async () => {
    console.log('🔄 毎週定期実行開始：スレッドアンアーカイブ処理');

    const TARGET_CHANNEL_IDS = [
      '1364617144381210736', // martin
      '1364617200039624806', // martin
      '1364617541829267587', // neuroscience
      '1364617674440577065', // neuroscience
      '1364621198150996088'  // yokohama
    ];

    for (const channelId of TARGET_CHANNEL_IDS) {
      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) continue;

        const archivedThreads = await channel.threads.fetchArchived();

        for (const [id, thread] of archivedThreads.threads) {
          if (thread.locked) {
            console.log(`🔒 ロックされているスレッド（${thread.name}）はスキップ`);
            continue;
          }
          await thread.setArchived(false);
          console.log(`✅ スレッド復活：${thread.name}`);
        }
      } catch (error) {
        console.error(`❌ チャンネルID ${channelId} の処理エラー:`, error);
      }
    }

    console.log('✅ 全チャンネルのスレッドアンアーカイブ完了');
  });
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'スレッド作成') {
      // ここはモーダルを出す処理なのでそのまま
      const modal = new ModalBuilder()
        .setCustomId('create_thread_modal')
        .setTitle('スレッド作成：タイトル＆種別')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('title')
              .setLabel('案件タイトルを入力')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('type')
              .setLabel('ショート or 長尺を入力')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
      await interaction.showModal(modal);
    }
    if (interaction.commandName === 'setup-button') {
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
  } else if (interaction.isModalSubmit()) {
    if (interaction.customId === 'create_thread_modal') {
      const title = interaction.fields.getTextInputValue('title');
      const type = interaction.fields.getTextInputValue('type');
      const typeKey = type.includes('ショート') ? 'short' : 'long';
      const categoryKey = 'martin';
      const config = CHANNEL_CONFIG[categoryKey];
      const parentChannelId = config[typeKey];
      const sheetId = config.sheetId;
      const sheetName = config.sheet[typeKey];

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `${sheetName}!F6:F1000`
      });
      const rows = response.data.values || [];
      let targetRow = 6;
      for (let i = 0; i < rows.length; i++) {
        if (!rows[i][0]) {
          targetRow = 6 + i;
          break;
        }
      }
      const nextNumber = targetRow - 5;
      const threadNumber = nextNumber < 10 ? `0${nextNumber}` : `${nextNumber}`;
      const threadName = `#${threadNumber}_${title}`;
      const parentChannel = await client.channels.fetch(parentChannelId);
      const thread = await parentChannel.threads.create({
        name: threadName,
        autoArchiveDuration: 10080,
        reason: '新しい案件スレッド作成'
      });
      const firstMessage = await thread.send(threadName);
      await firstMessage.pin();
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${sheetName}!F${targetRow}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [[threadName]] }
      });

      // Discord内の返信
      await interaction.reply({ content: `✅ スレッド **${threadName}** を作成しました！`, flags: 64 });

      // ★ LINE通知送信！！
      await sendLineMessage(`🆕 新しいスレッドが作成されました！\n${threadName}`);
    }
  }
});

client.login(TOKEN);
