const express = require('express');
const app = express();
app.use(express.json());

app.post('/webhook', (req, res) => {
  console.log('✅ LINE Webhook受信:', JSON.stringify(req.body, null, 2));
  const event = req.body.events?.[0];
  const source = event?.source;

  if (source?.type === 'group') {
    console.log('✅ LINEグループID:', source.groupId);
  }

  res.sendStatus(200);
});

app.get('/', (_, res) => {
  res.send('LINE Webhook サーバーが起動しています。');
});

app.listen(process.env.PORT || 3000, () => {
  console.log('✅ Webhookサーバー起動完了');
});
