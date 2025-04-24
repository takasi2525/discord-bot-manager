require('dotenv').config(); // ← これを忘れずに！

const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const TOKEN = process.env.TOKEN;


const commands = [
  new SlashCommandBuilder()
    .setName('動画ステータス')
    .setDescription('動画の進行状況を更新')
    .addStringOption(option =>
      option.setName('状態')
        .setDescription('進行状態を選んでください')
        .setRequired(true)
        .addChoices(
          { name: '初稿', value: '初稿' },
          { name: '修正', value: '修正' },
          { name: '納品', value: '納品' }
        )
    ),
  new SlashCommandBuilder()
    .setName('サムネステータス')
    .setDescription('サムネイルの進行状況を更新')
    .addStringOption(option =>
      option.setName('状態')
        .setDescription('進行状態を選んでください')
        .setRequired(true)
        .addChoices(
          { name: '初稿', value: '初稿' },
          { name: '修正', value: '修正' },
          { name: '納品', value: '納品' }
        )
    ),
  new SlashCommandBuilder()
    .setName('通知一覧')
    .setDescription('通知対象スレッドの一覧を表示'),
  new SlashCommandBuilder()
    .setName('確認完了')
    .setDescription('このスレッドを投稿確認済みにする'),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('📡 スラッシュコマンドを登録中...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });
    console.log('✅ スラッシュコマンド登録完了！');
  } catch (error) {
    console.error('❌ スラッシュコマンド登録エラー:', error);
  }
})();
client.login(TOKEN);
