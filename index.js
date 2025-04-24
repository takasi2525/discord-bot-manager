require('dotenv').config();

// 第1部：基本セットアップ＆Google Sheets連携
const { Client, GatewayIntentBits, Events, SlashCommandBuilder, REST, Routes } = require('discord.js');
const { google } = require('googleapis');
const fs = require('fs');
const cron = require('node-cron');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const TOKEN = process.env.TOKEN;

const CHANNEL_CONFIG = {
  martin: {
    short: '1364617144381210736',
    long: '1364617200039624806',
    bot: '1364661630717399072',
    sheetId: '12ZPp01vBjo2vlz56AD0au7m-_sNWNC-stuRxdiX3FxY',
    sheet: {
      short: 'short',
      long: 'long'
    }
  },
  neuroscience: {
    short: '1364617541829267587',
    long: '1364617674440577065',
    bot: '1364665812610322492',
    sheetId: '1UqzN_hqA8WDpmJX8OMNXnWE080oYdZnLPGVko86VPTo',
    sheet: {
      short: 'short',
      long: 'long'
    }
  },
  yokohama: {
    short: '1364621314081558569',
    long: '1364621198150996088',
    bot: '1364665830507286690',
    sheetId: '1KptzCfqhFIeVtKZRKMKBUIbWzI5uXCvJpMEaUARcKPU',
    sheet: {
      short: 'short',
      long: 'long'
    }
  }
};

let threadData = {}; // 通知対象、完了日、投稿日、ステータスなどを保持

const auth = new google.auth.GoogleAuth({
  keyFile: 'credentials.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });

function extractThreadNumber(threadName) {
  const match = threadName.match(/^#?\d{2,}/);
  return match ? match[0] : null;
}

async function fetchPostDate(spreadsheetId, sheetName, threadNumber) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A2:C1000`
    });
    const rows = response.data.values;
    if (!rows) return null;
    for (const row of rows) {
      if (row[0] === threadNumber) {
        return row[2];
      }
    }
    return null;
  } catch (error) {
    console.error('❌ Google Sheets 読み取りエラー:', error);
    return null;
  }
}

client.once(Events.ClientReady, () => {
  console.log(`✅ ログイン成功：${client.user.tag}`);
  console.log('📡 BOT は正常に起動中です（index.js）');
});

client.on(Events.ThreadCreate, async (thread) => {
  console.log('📥 新しいスレッド作成:', thread.name);
  console.log('📎 親チャンネルID:', thread.parentId);
  try {
    const parentId = thread.parentId;
    const categoryKey = Object.keys(CHANNEL_CONFIG).find(key => {
      return CHANNEL_CONFIG[key].short === parentId || CHANNEL_CONFIG[key].long === parentId;
    });
    if (!categoryKey) return;

    const config = CHANNEL_CONFIG[categoryKey];
    const type = (config.short === parentId) ? 'short' : 'long';
    const threadNum = extractThreadNumber(thread.name);
    if (!threadNum) return;

    const sheetName = config.sheet[type];
    const postDate = await fetchPostDate(config.sheetId, sheetName, threadNum);

    threadData[thread.id] = {
      category: categoryKey,
      type,
      threadNum,
      postDate,
      status: { video: { value: '', count: 0 }, thumb: { value: '', count: 0 } },
      lastNotify: null,
      completedAt: null
    };

    try {
      await thread.join();
      console.log('🤝 スレッドに参加しました:', thread.name);
    } catch (err) {
      console.error('❌ スレッド参加に失敗:', err);
    }

    await thread.send(`👋 スレッド作成＆管理開始：${threadNum}（${type}）\n📤 投稿日：${postDate || '未登録'}\n✅ ステータスコマンドは数秒後に使用可能です`);
    console.log('📌 登録スレッド一覧:', Object.keys(threadData));

  } catch (err) {
    console.error('❌ スレッド処理エラー:', err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  console.log(`💬 スラッシュコマンド受信: ${interaction.commandName}`);

  const threadId = interaction.channel.id;
  const data = threadData[threadId];

  if (!data) {
    console.warn(`⚠️ スレッド ${threadId} は管理対象外`);
    return interaction.reply({
      content: '⚠️ このスレッドは管理対象外です。',
      flags: 1 << 6
    });
  }

  const command = interaction.commandName;
  const option = interaction.options.getString('状態');
  console.log(`🧪 コマンド: ${command}, 状態: ${option}`);

  if (command === '確認完了') {
    data.completedAt = new Date().toLocaleDateString('ja-JP');
    return interaction.reply({ content: `✅ 投稿を確認完了として記録しました（${data.completedAt}）` });
  }

  if (command === '動画ステータス') {
    data.status.video.value = option;
    data.status.video.count++;
    return interaction.reply({ content: `🎥 動画ステータスを「${option}」に更新（${data.status.video.count}回目）` });
  }

  if (command === 'サムネステータス') {
    data.status.thumb.value = option;
    data.status.thumb.count++;
    return interaction.reply({ content: `🖼️ サムネイルステータスを「${option}」に更新（${data.status.thumb.count}回目）` });
  }

  if (command === '通知一覧') {
    let reply = `📋 通知一覧（カテゴリ: ${data.category}）\n\n`;
    for (const [id, t] of Object.entries(threadData)) {
      if (t.category !== data.category) continue;
      const link = `<#${id}>`;
      if (t.completedAt) {
        reply += `📭 ${link}\n├ ✅ 確認完了日：${t.completedAt}\n├ 🎥 動画：${t.status.video.value}（${t.status.video.count}回）\n├ 🖼️ サムネ：${t.status.thumb.value}（${t.status.thumb.count}回）\n└ 📤 投稿日：${t.postDate || '未登録'}\n\n`;
      } else {
        reply += `🔔 ${link}\n├ 🎥 動画：${t.status.video.value}（${t.status.video.count}回）\n├ 🖼️ サムネ：${t.status.thumb.value}（${t.status.thumb.count}回）\n└ 📤 投稿日：${t.postDate || '未登録'}\n\n`;
      }
    }
    return interaction.reply({ content: reply });
  }
});

client.login(TOKEN);
